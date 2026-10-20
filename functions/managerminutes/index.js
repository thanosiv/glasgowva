const crypto = require('crypto');
const { Storage } = require('@google-cloud/storage');

const BUCKET_NAME = process.env.BUCKET_NAME || process.env.GCS_BUCKET || 'glasgow-va';
const MANAGER_MINUTES_PREFIX = process.env.MANAGER_MINUTES_PREFIX || 'manager-minutes/';
const MANAGER_MINUTES_FILE = process.env.MANAGER_MINUTES_FILE || 'minutes.json';
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || process.env.SESSION_SECRET || '';

function createStorageFromEnv() {
  const serviceAccountJson = process.env.GCS_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    return new Storage();
  }

  let credentials;
  try {
    credentials = JSON.parse(serviceAccountJson);
  } catch {
    throw new Error('Storage is not configured: invalid GCS_SERVICE_ACCOUNT_JSON');
  }

  return new Storage({ credentials });
}

function setCorsHeaders(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function normalizePrefix(prefix) {
  const cleaned = String(prefix || '').trim().replace(/^\/+/, '');
  if (!cleaned) return '';
  return cleaned.endsWith('/') ? cleaned : `${cleaned}/`;
}

function getStorageObjectPath() {
  return `${normalizePrefix(MANAGER_MINUTES_PREFIX)}${String(MANAGER_MINUTES_FILE || 'minutes.json').replace(/^\/+/, '')}`;
}

function parseRequestBody(req) {
  const raw = req?.rawBody ?? req?.body;
  if (!raw) return {};

  if (Buffer.isBuffer(raw)) {
    const text = raw.toString('utf8').trim();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }

  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }

  if (typeof raw === 'object') {
    return raw;
  }

  return {};
}

function decodeBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function isHex(value) {
  return /^[0-9a-f]+$/i.test(String(value || ''));
}

function timingSafeHexEqual(leftHex, rightHex) {
  if (!isHex(leftHex) || !isHex(rightHex)) return false;
  const left = Buffer.from(String(leftHex), 'hex');
  const right = Buffer.from(String(rightHex), 'hex');
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

function getBearerToken(req) {
  const authHeader = String(req?.headers?.authorization || '').trim();
  if (!authHeader) return '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? String(match[1] || '').trim() : '';
}

function verifySessionToken(token) {
  if (!SESSION_SECRET) {
    return { ok: false, reason: 'Missing SESSION_SECRET/ADMIN_SESSION_SECRET' };
  }

  const raw = String(token || '').trim();
  if (!raw || !raw.includes('.')) {
    return { ok: false, reason: 'Invalid token format' };
  }

  const [encodedPayload, providedSignature] = raw.split('.');
  if (!encodedPayload || !providedSignature) {
    return { ok: false, reason: 'Invalid token shape' };
  }

  const expectedSignature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('hex');

  if (!timingSafeHexEqual(expectedSignature, providedSignature)) {
    return { ok: false, reason: 'Invalid token signature' };
  }

  let payload;
  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload).toString('utf8'));
  } catch {
    return { ok: false, reason: 'Invalid token payload' };
  }

  const expMs = Number(payload?.exp || 0);
  if (!Number.isFinite(expMs) || expMs <= Date.now()) {
    return { ok: false, reason: 'Token expired' };
  }

  return { ok: true, payload };
}

function toSafeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withProtocol = /^www\./i.test(raw) ? `https://${raw}` : raw;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.href;
  } catch {
    return '';
  }
}

function normalizeStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'draft' || normalized === 'scheduled' || normalized === 'live') {
    return normalized;
  }
  return 'draft';
}

function normalizeEntry(entry) {
  const raw = entry && typeof entry === 'object' ? entry : {};

  return {
    id: String(raw.id || '').trim(),
    title: String(raw.title || '').trim(),
    summary: String(raw.summary || '').trim(),
    links: Array.isArray(raw.links) ? raw.links.map((url) => toSafeUrl(url)).filter(Boolean) : [],
    images: Array.isArray(raw.images) ? raw.images.map((url) => toSafeUrl(url)).filter(Boolean) : [],
    status: normalizeStatus(raw.status),
    liveAt: String(raw.liveAt || '').trim(),
    createdAt: String(raw.createdAt || '').trim(),
    updatedAt: String(raw.updatedAt || '').trim(),
  };
}

function normalizeEntries(items) {
  return (Array.isArray(items) ? items : [])
    .filter((entry) => entry && typeof entry === 'object')
    .map(normalizeEntry)
    .filter((entry) => entry.title)
    .sort((left, right) => {
      const leftTime = Date.parse(left.liveAt || left.updatedAt || left.createdAt || 0);
      const rightTime = Date.parse(right.liveAt || right.updatedAt || right.createdAt || 0);
      return rightTime - leftTime;
    });
}

async function readEntriesFromStorage(storage, bucketName, objectName) {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  const [exists] = await file.exists();

  if (!exists) {
    return [];
  }

  const [buffer] = await file.download();
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return normalizeEntries(parsed);
    }
    return normalizeEntries(parsed?.entries || parsed?.minutes || []);
  } catch {
    return [];
  }
}

async function writeEntriesToStorage(storage, bucketName, objectName, entries) {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);

  const payload = JSON.stringify({ entries: normalizeEntries(entries) }, null, 2);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const [exists] = await file.exists();
    let generation = 0;

    if (exists) {
      const [metadata] = await file.getMetadata();
      generation = Number(metadata?.generation || 0) || 0;
    }

    try {
      await file.save(payload, {
        resumable: false,
        contentType: 'application/json; charset=utf-8',
        preconditionOpts: {
          ifGenerationMatch: exists ? generation : 0
        }
      });
      return;
    } catch (error) {
      const isConflict = error && (error.code === 409 || error.code === 412);
      if (!isConflict || attempt === 4) {
        throw error;
      }
    }
  }
}

function saveSingleEntry(existingEntries, incomingEntry) {
  const normalized = normalizeEntry(incomingEntry);
  if (!normalized.title) {
    throw new Error('title is required');
  }

  const nowIso = new Date().toISOString();
  const nextId = normalized.id || `manager-minute-${Date.now()}`;
  const existing = existingEntries.find((entry) => entry.id === nextId);

  const nextEntry = {
    ...normalized,
    id: nextId,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
  };

  return normalizeEntries([
    nextEntry,
    ...existingEntries.filter((entry) => entry.id !== nextId)
  ]);
}

exports.managerMinutes = async function managerMinutes(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  if (!BUCKET_NAME) {
    return res.status(500).json({ error: 'Storage is not configured' });
  }

  const objectName = getStorageObjectPath();

  try {
    const storage = createStorageFromEnv();

    if (req.method === 'GET') {
      const entries = await readEntriesFromStorage(storage, BUCKET_NAME, objectName);
      return res.status(200).json({ entries });
    }

    if (req.method === 'POST') {
      const token = getBearerToken(req);
      const authCheck = verifySessionToken(token);
      if (!authCheck.ok) {
        return res.status(401).json({
          error: 'Unauthorized',
          reason: authCheck.reason,
          hasAuthorizationHeader: Boolean(String(req?.headers?.authorization || '').trim())
        });
      }

      const body = parseRequestBody(req);
      const action = String(body?.action || 'save').trim().toLowerCase();
      if (action !== 'save') {
        return res.status(400).json({ error: 'Unsupported action' });
      }

      const existingEntries = await readEntriesFromStorage(storage, BUCKET_NAME, objectName);
      const nextEntries = saveSingleEntry(existingEntries, body?.entry);
      await writeEntriesToStorage(storage, BUCKET_NAME, objectName, nextEntries);

      return res.status(200).json({ entries: nextEntries });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('managerMinutes error', {
      method: req.method,
      message: error?.message,
      code: error?.code,
      details: error?.details,
      errors: error?.errors
    });

    return res.status(500).json({
      error: req.method === 'GET'
        ? 'Failed to read Town Manager minutes'
        : 'Failed to save Town Manager minute',
      details: error?.message || 'Unknown error',
      code: error?.code || null,
      reason: error?.errors?.[0]?.reason || null
    });
  }
};
