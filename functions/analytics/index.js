const { Storage } = require('@google-cloud/storage');
const crypto = require('node:crypto');

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

function getHeaderValue(req, headerName) {
  const key = String(headerName || '').trim().toLowerCase();
  if (!key) return '';

  if (typeof req?.get === 'function') {
    const value = req.get(key);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  const headers = req?.headers || {};
  const value = headers[key] ?? headers[headerName];
  if (Array.isArray(value)) {
    return String(value[0] || '').trim();
  }
  return String(value || '').trim();
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no') return false;
  return fallback;
}

function createRequestId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

function normalizeIpCandidate(value) {
  let candidate = String(value || '').trim();
  if (!candidate) return '';

  if (candidate.includes(',')) {
    [candidate] = candidate.split(',');
    candidate = candidate.trim();
  }

  candidate = candidate.replace(/^\[|\]$/g, '');
  candidate = candidate.replace(/^::ffff:/i, '');
  candidate = candidate.replace(/%.+$/, '');

  const ipv4WithPortMatch = candidate.match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/);
  if (ipv4WithPortMatch) {
    return ipv4WithPortMatch[1];
  }

  return candidate;
}

function extractClientIp(req) {
  const candidates = [
    getHeaderValue(req, 'x-forwarded-for'),
    getHeaderValue(req, 'x-real-ip'),
    getHeaderValue(req, 'cf-connecting-ip'),
    getHeaderValue(req, 'fastly-client-ip'),
    req?.ip,
    req?.socket?.remoteAddress,
    req?.connection?.remoteAddress
  ];

  for (const candidate of candidates) {
    const normalized = normalizeIpCandidate(candidate);
    if (normalized) return normalized;
  }

  return '';
}

function anonymizeIp(ipAddress) {
  const value = String(ipAddress || '').trim();
  if (!value) return '';

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) {
    const parts = value.split('.');
    parts[3] = '0';
    return parts.join('.');
  }

  if (value.includes(':')) {
    const parts = value.split(':').filter(Boolean);
    if (!parts.length) return '';
    return `${parts.slice(0, 3).join(':')}::`;
  }

  return '';
}

function buildVisitorHash(ipAddress) {
  const ip = String(ipAddress || '').trim();
  const salt = String(process.env.ANALYTICS_HASH_SALT || '').trim();
  if (!ip || !salt) return '';
  return crypto.createHmac('sha256', salt).update(ip).digest('hex');
}

function extractDomain(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    return String(new URL(text).hostname || '').trim().toLowerCase();
  } catch {
    return '';
  }
}

function parseUserAgent(userAgent) {
  const ua = String(userAgent || '').trim();
  const lower = ua.toLowerCase();

  let browserFamily = '';
  if (lower.includes('edg/')) {
    browserFamily = 'Edge';
  } else if (lower.includes('opr/') || lower.includes('opera')) {
    browserFamily = 'Opera';
  } else if (lower.includes('firefox/')) {
    browserFamily = 'Firefox';
  } else if (lower.includes('chrome/') && !lower.includes('edg/')) {
    browserFamily = 'Chrome';
  } else if (lower.includes('safari/') && !lower.includes('chrome/')) {
    browserFamily = 'Safari';
  }

  let osFamily = '';
  if (lower.includes('windows nt')) {
    osFamily = 'Windows';
  } else if (lower.includes('android')) {
    osFamily = 'Android';
  } else if (lower.includes('iphone') || lower.includes('ipad') || lower.includes('ios')) {
    osFamily = 'iOS';
  } else if (lower.includes('mac os x') || lower.includes('macintosh')) {
    osFamily = 'macOS';
  } else if (lower.includes('linux')) {
    osFamily = 'Linux';
  }

  let deviceType = 'desktop';
  if (/(ipad|tablet|kindle|silk)/i.test(ua)) {
    deviceType = 'tablet';
  } else if (/(mobi|android|iphone|ipod|phone)/i.test(ua)) {
    deviceType = 'mobile';
  }

  return { browserFamily, osFamily, deviceType };
}

function detectBot(userAgent) {
  return /(bot|spider|crawl|slurp|preview|headless|lighthouse|monitor)/i.test(String(userAgent || ''));
}

function extractLanguage(req, eventLanguage) {
  const normalizedEventLanguage = String(eventLanguage || '').trim();
  if (normalizedEventLanguage) return normalizedEventLanguage;

  const acceptLanguage = getHeaderValue(req, 'accept-language');
  if (!acceptLanguage) return '';
  const [primary] = acceptLanguage.split(',');
  return String(primary || '').trim();
}

function extractGeoHeaders(req) {
  const geoCountry = getHeaderValue(req, 'x-appengine-country')
    || getHeaderValue(req, 'cf-ipcountry')
    || getHeaderValue(req, 'x-vercel-ip-country');

  const geoRegion = getHeaderValue(req, 'x-appengine-region')
    || getHeaderValue(req, 'x-vercel-ip-country-region');

  const geoCity = getHeaderValue(req, 'x-appengine-city')
    || getHeaderValue(req, 'x-vercel-ip-city');

  return {
    geoCountry: String(geoCountry || '').trim(),
    geoRegion: String(geoRegion || '').trim(),
    geoCity: String(geoCity || '').trim(),
  };
}

function extractUtmValues(eventRecord) {
  const fromEvent = {
    utmSource: String(eventRecord?.utmSource || '').trim(),
    utmMedium: String(eventRecord?.utmMedium || '').trim(),
    utmCampaign: String(eventRecord?.utmCampaign || '').trim(),
    utmTerm: String(eventRecord?.utmTerm || '').trim(),
    utmContent: String(eventRecord?.utmContent || '').trim(),
  };

  if (fromEvent.utmSource || fromEvent.utmMedium || fromEvent.utmCampaign || fromEvent.utmTerm || fromEvent.utmContent) {
    return fromEvent;
  }

  const candidateUrl = String(eventRecord?.pageUrl || eventRecord?.href || '').trim();
  if (!candidateUrl) return fromEvent;

  try {
    const parsed = new URL(candidateUrl);
    return {
      utmSource: String(parsed.searchParams.get('utm_source') || '').trim(),
      utmMedium: String(parsed.searchParams.get('utm_medium') || '').trim(),
      utmCampaign: String(parsed.searchParams.get('utm_campaign') || '').trim(),
      utmTerm: String(parsed.searchParams.get('utm_term') || '').trim(),
      utmContent: String(parsed.searchParams.get('utm_content') || '').trim(),
    };
  } catch {
    return fromEvent;
  }
}

function enrichEvent(eventRecord, req) {
  const ipAddress = extractClientIp(req);
  const ipAnonymized = anonymizeIp(ipAddress);
  const visitorHash = buildVisitorHash(ipAddress);
  const userAgent = getHeaderValue(req, 'user-agent');
  const { browserFamily, osFamily, deviceType } = parseUserAgent(userAgent);
  const { geoCountry, geoRegion, geoCity } = extractGeoHeaders(req);
  const utmValues = extractUtmValues(eventRecord);

  return {
    ...eventRecord,
    ...utmValues,
    requestId: createRequestId(),
    schemaVersion: 2,
    ingestedAt: new Date().toISOString(),
    sessionId: String(eventRecord?.sessionId || '').trim(),
    isReturningVisitor: parseBoolean(eventRecord?.isReturningVisitor, false),
    landingPagePath: String(eventRecord?.landingPagePath || '').trim(),
    language: extractLanguage(req, eventRecord?.language),
    dntEnabled: parseBoolean(eventRecord?.dntEnabled, parseBoolean(getHeaderValue(req, 'dnt'), false)),
    gpcEnabled: parseBoolean(eventRecord?.gpcEnabled, parseBoolean(getHeaderValue(req, 'sec-gpc'), false)),
    ipAddress,
    ipAnonymized,
    visitorHash,
    geoCountry,
    geoRegion,
    geoCity,
    userAgent,
    browserFamily,
    osFamily,
    deviceType,
    referrerDomain: extractDomain(eventRecord?.referrer),
    isBot: detectBot(userAgent),
  };
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
  if (kind !== 'document' && kind !== 'video' && kind !== 'page') {
    throw new Error('kind must be document, video, or page');
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
    timestamp: String(body?.timestamp || '').trim() || new Date().toISOString(),
    sessionId: String(body?.sessionId || '').trim(),
    isReturningVisitor: parseBoolean(body?.isReturningVisitor, false),
    landingPagePath: String(body?.landingPagePath || '').trim(),
    language: String(body?.language || '').trim(),
    dntEnabled: parseBoolean(body?.dntEnabled, false),
    gpcEnabled: parseBoolean(body?.gpcEnabled, false),
    utmSource: String(body?.utmSource || '').trim(),
    utmMedium: String(body?.utmMedium || '').trim(),
    utmCampaign: String(body?.utmCampaign || '').trim(),
    utmTerm: String(body?.utmTerm || '').trim(),
    utmContent: String(body?.utmContent || '').trim()
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
      if (kind !== 'document' && kind !== 'video' && kind !== 'page') continue;
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
      const eventRecord = enrichEvent(normalizeEvent(parseRequestBody(req)), req);
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