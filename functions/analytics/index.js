const { Storage } = require('@google-cloud/storage');

const BUCKET_NAME = process.env.BUCKET_NAME || process.env.GCS_BUCKET || 'glasgow-va';
const ANALYTICS_PREFIX = process.env.ANALYTICS_PREFIX || 'analytics/';

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

function parseRequestBody(req) {
  const raw = req?.rawBody ?? req?.body;
  if (!raw) return {};

  if (Buffer.isBuffer(raw)) {
    const text = raw.toString('utf8').trim();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { _raw: text };
    }
  }

  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { _raw: text };
    }
  }

  if (typeof raw === 'object') {
    return raw;
  }

  return {};
}

function toAnalyticsMonthPath(timestamp) {
  const date = timestamp ? new Date(timestamp) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid timestamp');
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${normalizePrefix(ANALYTICS_PREFIX)}${year}-${month}.ndjson`;
}

function normalizeEvent(body) {
  const kind = String(body?.kind || '').trim().toLowerCase();
  if (kind !== 'document' && kind !== 'video') {
    throw new Error('kind must be document or video');
  }

  const href = String(body?.href || '').trim();
  if (!href) {
    throw new Error('href is required');
  }

  return {
    kind,
    href,
    label: String(body?.label || '').trim(),
    pageUrl: String(body?.pageUrl || '').trim(),
    pagePath: String(body?.pagePath || '').trim(),
    referrer: String(body?.referrer || '').trim(),
    timestamp: String(body?.timestamp || '').trim() || new Date().toISOString()
  };
}

async function readMonthlyAnalyticsFile(storage, bucketName, objectName) {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  const [buffer] = await file.download();
  const text = buffer.toString('utf8');
  const events = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed);
      const kind = String(parsed?.kind || '').trim().toLowerCase();
      if (kind !== 'document' && kind !== 'video') continue;
      if (!parsed?.timestamp) continue;
      events.push(parsed);
    } catch {
      // Ignore malformed analytics lines.
    }
  }

  return events;
}

async function readAnalyticsEvents(storage, bucketName, prefix) {
  const bucket = storage.bucket(bucketName);
  const [files] = await bucket.getFiles({ prefix: normalizePrefix(prefix), autoPaginate: true });
  const events = [];

  for (const file of files) {
    if (!file.name.endsWith('.ndjson')) continue;
    const fileEvents = await readMonthlyAnalyticsFile(storage, bucketName, file.name);
    events.push(...fileEvents);
  }

  return events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

async function appendMonthlyEvent(storage, bucketName, objectName, eventRecord) {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  const line = `${JSON.stringify(eventRecord)}\n`;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const [exists] = await file.exists();
    let currentContent = '';
    let generation = 0;

    if (exists) {
      const [metadata] = await file.getMetadata();
      generation = Number(metadata?.generation || 0) || 0;
      const [buffer] = await file.download();
      currentContent = buffer.toString('utf8');
    }

    const nextContent = currentContent
      ? `${currentContent.replace(/\n*$/, '\n')}${line}`
      : line;

    try {
      await file.save(nextContent, {
        resumable: false,
        contentType: 'application/x-ndjson; charset=utf-8',
        preconditionOpts: {
          ifGenerationMatch: exists ? generation : 0
        }
      });
      return;
    } catch (error) {
      const isConflict = error && (error.code === 412 || error.code === 409);
      if (!isConflict || attempt === 4) {
        throw error;
      }
    }
  }
}

exports.analytics = async function analytics(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  if (!BUCKET_NAME) {
    return res.status(500).json({ error: 'Storage is not configured' });
  }

  try {
    if (req.method === 'GET') {
      const storage = createStorageFromEnv();
      const events = await readAnalyticsEvents(storage, BUCKET_NAME, ANALYTICS_PREFIX);
      return res.status(200).json({ events });
    }

    if (req.method === 'POST') {
      const storage = createStorageFromEnv();
      const eventRecord = normalizeEvent(parseRequestBody(req));
      const objectName = toAnalyticsMonthPath(eventRecord.timestamp);

      await appendMonthlyEvent(storage, BUCKET_NAME, objectName, eventRecord);
      return res.status(202).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({
      error: req.method === 'GET' ? 'Failed to read analytics events' : 'Failed to record analytics event',
      details: error.message
    });
  }
};