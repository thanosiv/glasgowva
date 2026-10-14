const { Storage } = require('@google-cloud/storage');

const BUCKET_NAME = process.env.BUCKET_NAME || process.env.GCS_BUCKET || 'glasgow-va';
const DOCUMENTS_PREFIX = process.env.DOCUMENTS_PREFIX || '';
const AGENDA_PREFIX = process.env.AGENDA_PREFIX || 'council/agendas/';
const MINUTES_PREFIX = process.env.MINUTES_PREFIX || 'council/minutes/';

function createStorageFromEnv() {
  const serviceAccountJson = process.env.GCS_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error('Storage is not configured: missing GCS_SERVICE_ACCOUNT_JSON');
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
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function normalizePrefix(prefix) {
  const cleaned = String(prefix || '').trim().replace(/^\/+/, '');
  if (!cleaned) return '';
  return cleaned.endsWith('/') ? cleaned : `${cleaned}/`;
}

function labelizeSegment(segment) {
  return String(segment || '')
    .trim()
    .replace(/[-_]+/g, ' ')
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function isJsonFile(name) {
  return String(name || '').toLowerCase().trim().endsWith('.json');
}

function isImageFile(name) {
  return /\.(png|jpe?g|gif|svg|webp|bmp|tiff?)$/i.test(String(name || '').trim());
}

function isImagePath(name) {
  return String(name || '').toLowerCase().trim().startsWith('images/');
}

function parseDocumentDate(value) {
  if (!value) return null;
  const text = String(value).trim();

  const yearFirstMatch = text.match(/(\d{4})[-_.]?(\d{2})[-_.]?(\d{2})/);
  if (yearFirstMatch) {
    const year = Number(yearFirstMatch[1]);
    const month = Number(yearFirstMatch[2]);
    const day = Number(yearFirstMatch[3]);
    if (year && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const parsed = new Date(year, month - 1, day);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }

  const monthDayYearMatch = text.match(/\b(\d{1,2})[\/_.-](\d{1,2})[\/_.-](\d{4})\b/);
  if (monthDayYearMatch) {
    const month = Number(monthDayYearMatch[1]);
    const day = Number(monthDayYearMatch[2]);
    const year = Number(monthDayYearMatch[3]);
    if (year && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const parsed = new Date(year, month - 1, day);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }

  const monthNames = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";
  const textMonthDayYearMatch = text.match(new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?[,\\s]+(\\d{4})`, 'i'));
  if (textMonthDayYearMatch) {
    const month = new Date(`${textMonthDayYearMatch[1]} 1, ${textMonthDayYearMatch[3]}`).getMonth();
    const day = Number(textMonthDayYearMatch[2]);
    const year = Number(textMonthDayYearMatch[3]);
    if (year && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const parsed = new Date(year, month, day);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }

  const dayTextMonthYearMatch = text.match(new RegExp(`\\b(\\d{1,2})\\s+(${monthNames})[,\\s]+(\\d{4})`, 'i'));
  if (dayTextMonthYearMatch) {
    const day = Number(dayTextMonthYearMatch[1]);
    const month = new Date(`${dayTextMonthYearMatch[2]} 1, ${dayTextMonthYearMatch[3]}`).getMonth();
    const year = Number(dayTextMonthYearMatch[3]);
    if (year && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const parsed = new Date(year, month, day);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }

  return null;
}

function toPublicUrl(bucketName, objectName) {
  const encodedPath = String(objectName || '')
    .replace(/^\/+/, '')
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  return `https://storage.googleapis.com/${encodeURIComponent(bucketName)}/${encodedPath}`;
}

function toNormalizedDate(yearValue, monthValue, dayValue) {
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return null;
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function extractNormalizedDatesFromText(value) {
  const text = String(value || '');
  const matches = new Set();

  const yearFirstPattern = /(\d{4})[._-](\d{1,2})[._-](\d{1,2})/g;
  let yearFirstMatch;
  while ((yearFirstMatch = yearFirstPattern.exec(text)) !== null) {
    const normalized = toNormalizedDate(yearFirstMatch[1], yearFirstMatch[2], yearFirstMatch[3]);
    if (normalized) matches.add(normalized);
  }

  const monthFirstPattern = /(\d{1,2})[._-](\d{1,2})[._-](\d{4})/g;
  let monthFirstMatch;
  while ((monthFirstMatch = monthFirstPattern.exec(text)) !== null) {
    const normalized = toNormalizedDate(monthFirstMatch[3], monthFirstMatch[1], monthFirstMatch[2]);
    if (normalized) matches.add(normalized);
  }

  return Array.from(matches);
}

function mapStorageFilesToDocuments(bucketName, files) {
  return files
    .map((file) => String(file?.name || '').replace(/^\/+/, ''))
    .filter((name) => name && !name.endsWith('/') && !isJsonFile(name) && !isImageFile(name) && !isImagePath(name))
    .map((name) => {
      const pathParts = name.split('/').filter(Boolean);
      const rawName = pathParts[pathParts.length - 1] || name;
      const stemName = rawName.replace(/\.[^.]+$/, '');
      const typePath = pathParts.length > 1 ? pathParts.slice(0, -1).map(labelizeSegment).join(' > ') : 'General';
      const parsedDate = parseDocumentDate(stemName) || parseDocumentDate(name) || null;

      return {
        name: labelizeSegment(stemName),
        url: toPublicUrl(bucketName, name),
        typePath,
        typeLabel: typePath,
        date: parsedDate ? parsedDate.toISOString() : null,
        dateLabel: parsedDate
          ? parsedDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
          : 'Unknown'
      };
    });
}

async function readDocuments(storage, bucketName, prefix) {
  const bucket = storage.bucket(bucketName);
  const [files] = await bucket.getFiles({ prefix: normalizePrefix(prefix) });
  return mapStorageFilesToDocuments(bucketName, files);
}

async function resolveAgendaUrl(storage, bucketName, normalizedDate) {
  const agendaPrefix = normalizePrefix(AGENDA_PREFIX);
  const baseFileName = `agenda_${normalizedDate}`;
  const objectPrefix = `${agendaPrefix}${baseFileName}`;

  const bucket = storage.bucket(bucketName);
  const [files] = await bucket.getFiles({ prefix: objectPrefix });
  const names = files
    .map((file) => String(file?.name || '').replace(/^\/+/, ''))
    .filter((name) => name && !name.endsWith('/'));

  const exactStemPattern = new RegExp(`(^|/)${baseFileName}(?:[._-]|\\.|$)`, 'i');
  const matchedName = names.find((name) => exactStemPattern.test(name));

  return matchedName ? toPublicUrl(bucketName, matchedName) : null;
}

async function resolveMinutesUrl(storage, bucketName, normalizedDate) {
  const minutesPrefix = normalizePrefix(MINUTES_PREFIX);

  const bucket = storage.bucket(bucketName);
  const [files] = await bucket.getFiles({ prefix: minutesPrefix });
  const names = files
    .map((file) => String(file?.name || '').replace(/^\/+/, ''))
    .filter((name) => name && !name.endsWith('/') && name.startsWith(minutesPrefix));

  const matchedName = names.find((name) => {
    const dates = extractNormalizedDatesFromText(name);
    return dates.includes(normalizedDate);
  });

  return matchedName ? toPublicUrl(bucketName, matchedName) : null;
}

exports.readDocuments = async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const bucketName = String(req.query?.bucket || BUCKET_NAME || '').trim();
  if (!bucketName) {
    return res.status(500).json({ error: 'Storage is not configured' });
  }

  const action = String(req.query?.action || 'list').trim().toLowerCase();

  try {
    const storage = createStorageFromEnv();

    if (action === 'agenda') {
      const date = String(req.query?.date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
      }

      const url = await resolveAgendaUrl(storage, bucketName, date);
      return res.status(200).json({ url });
    }

    if (action === 'minutes') {
      const date = String(req.query?.date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
      }

      const url = await resolveMinutesUrl(storage, bucketName, date);
      return res.status(200).json({ url });
    }

    const prefix = String(req.query?.prefix || DOCUMENTS_PREFIX || '').trim();
    const documents = await readDocuments(storage, bucketName, prefix);

    return res.status(200).json({
      bucket: bucketName,
      prefix: normalizePrefix(prefix),
      count: documents.length,
      documents
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to read documents',
      details: error.message
    });
  }
};
