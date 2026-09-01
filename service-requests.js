const SERVICE_REQUESTS_KEY = 'town-of-glasgow-service-requests-fallback';
const SERVICE_REQUEST_STATUS_VALUES = ['New', 'In Progress', 'Completed', 'Closed'];

function getServiceRequestsEndpoint() {
  return window.siteConfig && String(window.siteConfig.serviceRequestsEndpoint || '').trim();
}

function generateTicketId() {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SR-${stamp}-${random}`;
}

function getFallbackRequests() {
  try {
    const raw = localStorage.getItem(SERVICE_REQUESTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Unable to read service requests from local storage', error);
    return [];
  }
}

function saveFallbackRequests(requests) {
  localStorage.setItem(SERVICE_REQUESTS_KEY, JSON.stringify(requests));
}

function normalizeStatusHistory(entries) {
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const status = SERVICE_REQUEST_STATUS_VALUES.includes(entry.status) ? entry.status : 'New';
      const changedAt = entry.changedAt || entry.timestamp || new Date().toISOString();
      return {
        status,
        changedAt,
        notes: String(entry.notes || '').trim(),
      };
    })
    .filter(Boolean);
}

function normalizeRequest(record) {
  if (!record || typeof record !== 'object') return null;

  const status = SERVICE_REQUEST_STATUS_VALUES.includes(record.status) ? record.status : 'New';
  const createdAt = record.createdAt || new Date().toISOString();
  const history = normalizeStatusHistory(record.statusHistory);
  return {
    id: String(record.id || generateTicketId()),
    name: String(record.name || '').trim(),
    email: String(record.email || '').trim(),
    phone: String(record.phone || '').trim(),
    address: String(record.address || '').trim(),
    category: String(record.category || '').trim(),
    urgency: String(record.urgency || 'Routine').trim(),
    description: String(record.description || '').trim(),
    status,
    notes: String(record.notes || 'Submitted to town staff for review.'),
    createdAt,
    updatedAt: record.updatedAt || record.createdAt || createdAt,
    imageUrl: String(record.imageUrl || '').trim(),
    statusHistory: history.length ? history : [{ status, changedAt: createdAt, notes: 'Request created.' }],
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read the selected image.'));
    reader.readAsDataURL(file);
  });
}

function sanitizeFileName(fileName, fallback = 'service-request-image.jpg') {
  const safeName = String(fileName || fallback).replace(/[^a-zA-Z0-9._-]/g, '_');
  return safeName || fallback;
}

function getOptionalBearerAuthHeaders(extraHeaders = {}) {
  const token = String(sessionStorage.getItem('dashboard_token') || '').trim();
  return {
    ...extraHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function submitRequestToApi(payload, file = null) {
  const endpoint = getServiceRequestsEndpoint();
  if (!endpoint) return null;

  const requestPayload = { ...payload };
  if (file) {
    requestPayload.imageDataUrl = await readFileAsDataUrl(file);
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: getOptionalBearerAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ action: 'create', request: requestPayload })
  });

  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to save your request.');
  return result.request || result.ticket || null;
}

function fallbackAddRequest(payload) {
  const requests = getFallbackRequests();
  const normalized = normalizeRequest(payload);
  if (!normalized) return null;

  requests.unshift(normalized);
  saveFallbackRequests(requests);
  return normalized;
}

async function saveRequest(payload, file = null) {
  const endpoint = getServiceRequestsEndpoint();

  if (endpoint) {
    const result = await submitRequestToApi(payload, file);
    if (result) {
      return result;
    }

    throw new Error('The service request service is unavailable right now. Please try again in a moment.');
  }

  if (file) {
    try {
      payload.imageUrl = await readFileAsDataUrl(file);
    } catch (error) {
      console.warn('Unable to store image in fallback storage', error);
    }
  }

  return fallbackAddRequest(payload);
}

async function lookupRequest(ticketId, email) {
  const endpoint = getServiceRequestsEndpoint();
  if (endpoint) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: getOptionalBearerAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action: 'lookup', ticketId, email })
    });

    const result = await response.json();
    if (response.ok && result && result.request) {
      return normalizeRequest(result.request) || null;
    }

    if (response.status === 404) {
      return null;
    }

    throw new Error(result?.error || 'Unable to look up that ticket right now.');
  }

  const requests = getFallbackRequests();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const found = requests.find((request) => {
    const candidate = normalizeRequest(request);
    return candidate
      && candidate.id.toLowerCase() === String(ticketId || '').trim().toLowerCase()
      && candidate.email.toLowerCase() === normalizedEmail;
  });

  return found ? normalizeRequest(found) : null;
}

function updateServiceRequestStatus(message, type = 'info') {
  const status = document.getElementById('service-request-status');
  if (!status) return;
  status.textContent = message;
  status.className = `status-text status-${type}`;
}

function renderLookupResult(request) {
  const statusCard = document.getElementById('service-request-status-card');
  if (!statusCard) return;

  const fields = {
    id: document.getElementById('lookup-id'),
    status: document.getElementById('lookup-status'),
    category: document.getElementById('lookup-category'),
    address: document.getElementById('lookup-address'),
    updated: document.getElementById('lookup-updated'),
    notes: document.getElementById('lookup-notes'),
  };

  if (!request) {
    statusCard.classList.add('hidden');
    return;
  }

  if (fields.id) fields.id.textContent = request.id;
  if (fields.status) fields.status.textContent = request.status;
  if (fields.category) fields.category.textContent = request.category;
  if (fields.address) fields.address.textContent = request.address;
  if (fields.updated) fields.updated.textContent = new Date(request.updatedAt).toLocaleString();
  if (fields.notes) fields.notes.textContent = request.notes;
  statusCard.classList.remove('hidden');
}

function setFormStatus(message, type = 'info') {
  const status = document.getElementById('service-request-status');
  if (!status) return;
  status.textContent = message;
  status.className = `status-text status-${type}`;
}

function attachServiceRequestHandlers() {
  const form = document.getElementById('service-request-form');
  const lookupForm = document.getElementById('service-request-lookup-form');

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const fileInput = document.getElementById('service-photo');
      const selectedFile = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
      const createdAt = new Date().toISOString();
      const payload = {
        id: generateTicketId(),
        name: document.getElementById('service-name')?.value || '',
        email: document.getElementById('service-email')?.value || '',
        phone: document.getElementById('service-phone')?.value || '',
        address: document.getElementById('service-address')?.value || '',
        category: document.getElementById('service-category')?.value || '',
        urgency: document.getElementById('service-urgency')?.value || 'Routine',
        description: document.getElementById('service-description')?.value || '',
        status: 'New',
        notes: 'Submitted to town staff for review.',
        createdAt,
        updatedAt: createdAt,
        statusHistory: [{ status: 'New', changedAt: createdAt, notes: 'Request created.' }],
      };

      if (!payload.name || !payload.email || !payload.phone || !payload.address || !payload.category || !payload.description) {
        setFormStatus('Please complete all required fields before submitting.', 'error');
        return;
      }

      try {
        const saved = await saveRequest(payload, selectedFile);
        if (!saved) {
          throw new Error('Unable to save the request.');
        }

        setFormStatus(`Your request was submitted. Ticket ID: ${saved.id}`, 'success');
        form.reset();
      } catch (error) {
        setFormStatus(error.message, 'error');
      }
    });
  }

  if (lookupForm) {
    lookupForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const ticketId = document.getElementById('lookup-ticket-id')?.value || '';
      const email = document.getElementById('lookup-email')?.value || '';

      if (!ticketId || !email) {
        renderLookupResult(null);
        return;
      }

      try {
        const found = await lookupRequest(ticketId, email);
        if (!found) {
          renderLookupResult(null);
          setFormStatus('No matching ticket was found for that email and ticket ID.', 'error');
          return;
        }

        renderLookupResult(found);
        setFormStatus('Ticket found.', 'success');
      } catch (error) {
        setFormStatus(error.message, 'error');
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  attachServiceRequestHandlers();

  const yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
});

window.serviceRequests = {
  generateTicketId,
  getFallbackRequests,
  saveFallbackRequests,
  normalizeRequest,
  lookupRequest,
  saveRequest,
};
