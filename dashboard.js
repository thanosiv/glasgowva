const governmentState = {
  councilData: null,
  images: [],
  selectedType: '',
  showInactive: false,
};

const noticesState = {
  notices: [],
};

const serviceRequestsStorageKey = 'town-of-glasgow-service-requests-fallback';
const serviceRequestStatusOptions = ['New', 'In Progress', 'Completed', 'Closed'];
const userManagementState = {
  users: [],
  showInactive: false,
};

const dashboardSessionState = {
  payload: null,
};

const HEADER_INCLUDE_FALLBACK = `
<section id="site-dev-notification" class="site-dev-notification hidden" aria-live="polite" role="status">
  <div class="container">
    <p id="site-dev-notification-message"></p>
  </div>
</section>

<header class="site-header">
  <div class="container nav-shell">
    <a class="brand" href="index.html#top" aria-label="Town of Glasgow home">
      <span class="brand-mark">
        <img src="assets/images/us-vaglg.gif" alt="Town of Glasgow emblem" />
      </span>
      <span class="brand-text">
        <strong>Town of Glasgow</strong>
        <small>Virginia</small>
      </span>
    </a>

    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">
      <span class="sr-only">Toggle navigation</span>
      <span></span>
      <span></span>
      <span></span>
    </button>

    <nav id="site-nav" class="site-nav" aria-label="Primary navigation">
      <a href="index.html#about">About</a>
      <a href="index.html#government">Government</a>
      <a href="index.html#services">Services</a>
      <a href="index.html#public-notices">Public Notices</a>
      <a href="index.html#events">Events</a>
      <a href="index.html#contact">Contact</a>
      <a href="https://glasgowutilities.qpaybill.com/Start.aspx" target="_blank" rel="noopener noreferrer">Pay Bill</a>
      <a href="dashboard.html" target="_blank">Admin</a>
    </nav>
  </div>
</header>`;

async function loadIncludes() {
  const includes = document.querySelectorAll('[data-include]');
  await Promise.all(Array.from(includes).map(async (placeholder) => {
    const src = placeholder.getAttribute('data-include');
    if (!src) return;
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`Unable to load include: ${src}`);
      const html = await response.text();
      placeholder.insertAdjacentHTML('afterend', html);
      placeholder.remove();
    } catch (error) {
      console.warn(error);
      const isFileProtocol = window.location.protocol === 'file:';
      if (isFileProtocol && src === 'header.html') {
        placeholder.insertAdjacentHTML('afterend', HEADER_INCLUDE_FALLBACK);
        placeholder.remove();
        return;
      }

      placeholder.textContent = 'Unable to load include.';
    }
  }));
}

function attachSiteNavToggle() {
  const navToggle = document.querySelector('.nav-toggle');
  const siteNav = document.getElementById('site-nav');
  if (!navToggle || !siteNav) return;

  navToggle.addEventListener('click', () => {
    const isOpen = siteNav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  siteNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      siteNav.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

function normalizeDevNotification(payload) {
  const source = payload && typeof payload === 'object' && payload.notification && typeof payload.notification === 'object'
    ? payload.notification
    : payload;

  return {
    enabled: source?.enabled !== false,
    message: String(source?.message || '').trim(),
    startsAt: String(source?.startsAt || '').trim(),
    endsAt: String(source?.endsAt || '').trim()
  };
}

function isDevNotificationActive(notification) {
  if (!notification.enabled || !notification.message) return false;

  const now = Date.now();

  if (notification.startsAt) {
    const startsAt = Date.parse(notification.startsAt);
    if (!Number.isNaN(startsAt) && now < startsAt) return false;
  }

  if (notification.endsAt) {
    const endsAt = Date.parse(notification.endsAt);
    if (!Number.isNaN(endsAt) && now >= endsAt) return false;
  }

  return true;
}

function renderDevNotification(notification) {
  const wrapper = document.getElementById('site-dev-notification');
  const message = document.getElementById('site-dev-notification-message');
  if (!wrapper || !message) return;

  if (!isDevNotificationActive(notification)) {
    wrapper.classList.add('hidden');
    message.textContent = '';
    return;
  }

  message.textContent = notification.message;
  wrapper.classList.remove('hidden');
}

async function loadDevNotification() {
  const endpoint = String(window.siteConfig?.devNotificationEndpoint || '').trim();
  const dataUrl = String(window.siteConfig?.devNotificationDataUrl || '').trim();
  const source = endpoint || dataUrl;

  if (!source) {
    renderDevNotification({ enabled: false, message: '' });
    return;
  }

  try {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Dev notification fetch failed: ${response.status}`);
    }

    const payload = await response.json();
    renderDevNotification(normalizeDevNotification(payload));
  } catch (error) {
    console.warn('Unable to load dev notification:', error.message);
    renderDevNotification({ enabled: false, message: '' });
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getDashboardToken() {
  return String(sessionStorage.getItem('dashboard_token') || '').trim();
}

function getDashboardSession() {
  return getDashboardToken();
}

function getDashboardAuthHeaders(extraHeaders = {}) {
  const token = getDashboardToken();
  return {
    ...extraHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function setLoginStatus(message, type = 'info') {
  const status = document.getElementById('login-status');
  if (!status) return;
  status.textContent = message;
  status.className = `status-text status-${type}`;
}

function decodeDashboardTokenPayload(token) {
  const raw = String(token || '').trim();
  if (!raw) return null;

  const [encoded] = raw.split('.');
  if (!encoded || typeof atob !== 'function') return null;

  try {
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const text = typeof TextDecoder !== 'undefined' ? new TextDecoder().decode(bytes) : decodeURIComponent(escape(binary));
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function isDashboardTokenExpired(token) {
  const payload = decodeDashboardTokenPayload(token);
  if (!payload || typeof payload.exp === 'undefined') {
    return true;
  }

  const expMs = Number(payload.exp);
  if (!Number.isFinite(expMs)) {
    return true;
  }

  return expMs <= Date.now();
}

function getDashboardSessionPayload() {
  return dashboardSessionState.payload;
}

function isDashboardAdmin() {
  const payload = getDashboardSessionPayload();
  return payload?.admin === true || String(payload?.role || '').toLowerCase() === 'admin';
}

function getDashboardUsername() {
  return String(getDashboardSessionPayload()?.username || '').trim().toLowerCase();
}

function canManageTargetUser(user) {
  if (!user || typeof user !== 'object') return false;
  if (isDashboardAdmin()) return true;
  return String(user.username || '').trim().toLowerCase() === getDashboardUsername();
}

function syncUserManagementAccess() {
  const addButton = document.getElementById('user-add-button');
  const showInactiveLabel = document.getElementById('user-show-inactive')?.closest('label');
  const panelCopy = document.querySelector('#users-panel .panel-copy p');

  if (addButton) {
    addButton.classList.toggle('hidden', !isDashboardAdmin());
  }

  if (showInactiveLabel) {
    showInactiveLabel.classList.toggle('hidden', !isDashboardAdmin());
  }

  if (panelCopy) {
    panelCopy.textContent = isDashboardAdmin()
      ? 'Manage dashboard access for staff users, including admin status and inactive accounts.'
      : 'Review and update your account details, including your password.';
  }
}

function ensureDashboardAuth() {
  const token = getDashboardToken();
  if (!token || isDashboardTokenExpired(token)) {
    sessionStorage.removeItem('dashboard_token');
    document.getElementById('dashboard-screen')?.classList.add('hidden');
    document.getElementById('login-screen')?.classList.remove('hidden');
    setLoginStatus('Session expired. Please sign in again.', 'error');
    return false;
  }
  return true;
}

function getServiceRequestsEndpoint() {
  return window.siteConfig && String(window.siteConfig.serviceRequestsEndpoint || '').trim();
}

function getFallbackServiceRequests() {
  try {
    const raw = localStorage.getItem(serviceRequestsStorageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Unable to read service requests from local storage', error);
    return [];
  }
}

function saveFallbackServiceRequests(requests) {
  localStorage.setItem(serviceRequestsStorageKey, JSON.stringify(requests));
}

async function fetchServiceRequests() {
  const endpoint = getServiceRequestsEndpoint();
  if (endpoint) {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: getDashboardAuthHeaders({ 'Content-Type': 'application/json' })
    });

    const result = await response.json();
    if (response.ok && Array.isArray(result.requests)) {
      return result.requests;
    }

    throw new Error(result?.error || 'Unable to load service requests from the live data source.');
  }

  return getFallbackServiceRequests();
}

function getServiceRequestStatusFilterValue() {
  const filter = document.getElementById('service-request-status-filter');
  if (!filter) return 'New';
  return filter.value || 'New';
}

function normalizeStatusHistory(entries) {
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const status = serviceRequestStatusOptions.includes(entry?.status) ? entry.status : 'New';
      const changedAt = new Date(entry?.changedAt || entry?.timestamp || Date.now()).toISOString();
      if (Number.isNaN(Date.parse(changedAt))) return null;
      return {
        status,
        changedAt,
        notes: String(entry?.notes || '').trim(),
      };
    })
    .filter(Boolean);
}

function getServiceRequestDisplayDescription(request) {
  const description = String(request?.description || '').trim();
  if (description) return description;
  return String(request?.notes || 'No description provided.').trim() || 'No description provided.';
}

function openServiceRequestDetailsModal(request) {
  const modal = document.getElementById('service-request-details-modal');
  const title = document.getElementById('service-request-details-title');
  const id = document.getElementById('service-request-details-id');
  const email = document.getElementById('service-request-details-email');
  const phone = document.getElementById('service-request-details-phone');
  const address = document.getElementById('service-request-details-address');
  const category = document.getElementById('service-request-details-category');
  const status = document.getElementById('service-request-detail-status');
  const description = document.getElementById('service-request-details-description');
  const notes = document.getElementById('service-request-detail-notes');
  const saveButton = document.getElementById('service-request-detail-status-save');
  const imageWrapper = document.getElementById('service-request-image-wrapper');
  const imageElement = document.getElementById('service-request-image');

  if (!modal || !title || !id || !email || !phone || !address || !category || !status || !description || !notes || !saveButton) {
    return;
  }

  const normalized = {
    id: String(request?.id || 'UNKNOWN'),
    name: String(request?.name || 'Resident'),
    email: String(request?.email || 'Not provided'),
    phone: String(request?.phone || 'Not provided'),
    address: String(request?.address || 'Not provided'),
    category: String(request?.category || 'General'),
    status: serviceRequestStatusOptions.includes(request?.status) ? request.status : 'New',
    description: getServiceRequestDisplayDescription(request),
    notes: String(request?.notes || '').trim(),
    updatedAt: request?.updatedAt || request?.createdAt || new Date().toISOString(),
    imageUrl: String(request?.imageUrl || '').trim(),
  };

  title.textContent = `${normalized.id} • ${normalized.name}`;
  id.textContent = normalized.id;
  email.textContent = normalized.email;
  phone.textContent = normalized.phone;
  address.textContent = normalized.address;
  category.textContent = normalized.category;
  status.value = normalized.status;
  status.dataset.ticketId = normalized.id;
  saveButton.dataset.ticketId = normalized.id;
  notes.value = normalized.notes;
  description.textContent = normalized.description;

  if (imageWrapper && imageElement) {
    if (normalized.imageUrl) {
      imageElement.src = normalized.imageUrl;
      imageElement.alt = `${normalized.id} service request attachment`;
      imageWrapper.classList.remove('hidden');
    } else {
      imageElement.removeAttribute('src');
      imageElement.alt = '';
      imageWrapper.classList.add('hidden');
    }
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeServiceRequestDetailsModal() {
  const modal = document.getElementById('service-request-details-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function renderServiceRequestsLog(requests = []) {
  const list = document.getElementById('service-requests-log');
  const statusFilter = getServiceRequestStatusFilterValue();
  if (!list) return;

  const filteredRequests = requests.filter((request) => {
    const requestStatus = serviceRequestStatusOptions.includes(request?.status) ? request.status : 'New';
    return statusFilter === 'All' || requestStatus === statusFilter;
  });

  if (!filteredRequests.length) {
    const emptyMessage = statusFilter === 'All'
      ? 'No service requests have been submitted yet.'
      : `No ${statusFilter.toLowerCase()} service requests found.`;
    list.innerHTML = `<article class="card"><p>${emptyMessage}</p></article>`;
    return;
  }

  const headerRow = `
    <div class="ticket-log-header-row">
      <span>Ticket ID</span>
      <span>Resident</span>
      <span>Category</span>
      <span>Date</span>
      <span>Status</span>
    </div>
  `;

  const rows = filteredRequests.map((request, index) => {
    const normalized = {
      id: String(request?.id || 'UNKNOWN'),
      name: String(request?.name || 'Resident'),
      category: String(request?.category || 'General'),
      status: serviceRequestStatusOptions.includes(request?.status) ? request.status : 'New',
      updatedAt: request?.updatedAt || request?.createdAt || new Date().toISOString(),
    };

    return `
      <button type="button" class="ticket-log-row ${index % 2 === 1 ? 'ticket-log-row-alt' : ''}" data-service-request-id="${escapeHtml(normalized.id)}">
        <span class="ticket-log-id">${escapeHtml(normalized.id)}</span>
        <span class="ticket-log-name">${escapeHtml(normalized.name)}</span>
        <span class="ticket-log-category">${escapeHtml(normalized.category)}</span>
        <span class="ticket-log-date">${escapeHtml(new Date(normalized.updatedAt).toLocaleDateString())}</span>
        <span class="ticket-inline-status">${escapeHtml(normalized.status)}</span>
      </button>
    `;
  }).join('');

  list.innerHTML = `${headerRow}${rows}`;

  list.querySelectorAll('.ticket-log-row').forEach((button) => {
    button.addEventListener('click', () => {
      const ticketId = button.getAttribute('data-service-request-id');
      const matched = requests.find((request) => String(request?.id || '') === String(ticketId || ''));
      if (matched) {
        openServiceRequestDetailsModal(matched);
      }
    });
  });
}

async function refreshServiceRequestsLog() {
  const requests = await fetchServiceRequests();
  renderServiceRequestsLog(requests);
}

function attachServiceRequestFilter() {
  const filter = document.getElementById('service-request-status-filter');
  if (!filter) return;

  filter.addEventListener('change', async () => {
    await refreshServiceRequestsLog();
  });
}

async function updateServiceRequestStatusInStorage(ticketId, nextStatus, notes = '') {
  const endpoint = getServiceRequestsEndpoint();
  const normalizedNotes = String(notes || '').trim();

  if (endpoint) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: getDashboardAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action: 'update-status', ticketId, status: nextStatus, notes: normalizedNotes })
    });

    const result = await response.json();
    if (response.ok && result && result.request) {
      await refreshServiceRequestsLog();
      return;
    }

    throw new Error(result?.error || 'Unable to update status.');
  }

  const requests = getFallbackServiceRequests();
  const nextRequests = requests.map((request) => {
    if (String(request?.id || '') !== String(ticketId || '')) {
      return request;
    }

    const noteText = normalizedNotes || (request?.notes && String(request.notes).trim() ? request.notes : 'Status updated by town staff.');
    const currentStatus = serviceRequestStatusOptions.includes(request?.status) ? request.status : 'New';
    const history = normalizeStatusHistory(request?.statusHistory);
    const nextHistory = currentStatus === nextStatus ? history : [
      ...history,
      {
        status: nextStatus,
        changedAt: new Date().toISOString(),
        notes: noteText,
      }
    ];

    return {
      ...request,
      status: serviceRequestStatusOptions.includes(nextStatus) ? nextStatus : 'New',
      updatedAt: new Date().toISOString(),
      notes: noteText,
      statusHistory: nextHistory.length ? nextHistory : [{ status: nextStatus, changedAt: new Date().toISOString(), notes: noteText }],
    };
  });

  saveFallbackServiceRequests(nextRequests);
  await refreshServiceRequestsLog();
}

function selectTab(tabId) {
  if (!ensureDashboardAuth()) {
    return;
  }

  const tabs = document.querySelectorAll('.tab-button');
  const panels = document.querySelectorAll('.tab-panel');

  tabs.forEach((button) => {
    const selected = button.id === tabId;
    button.setAttribute('aria-selected', String(selected));
    if (selected) {
      button.classList.add('active-tab');
    } else {
      button.classList.remove('active-tab');
    }
  });

  panels.forEach((panel) => {
    panel.classList.toggle('hidden', panel.id !== `${tabId.replace('-tab', '')}-panel`);
  });
}

async function populatePrefixSelect() {
  const prefixSelect = document.getElementById('upload-prefix');
  if (!prefixSelect) return;

  const bucket = window.siteConfig?.uploadBucket;
  if (!bucket) {
    prefixSelect.innerHTML = '<option value="documents/">documents/</option>';
    return;
  }

  try {
    const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o?fields=items(name)&maxResults=1000`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to list bucket');
    const data = await response.json();

    const folders = new Set();
    (data.items || []).forEach(({ name }) => {
      const parts = name.split('/');
      for (let i = 1; i < parts.length; i++) {
        const prefix = parts.slice(0, i).join('/') + '/';
        if (prefix.startsWith('images/')) continue;
        if (/deleted/i.test(prefix)) continue;
        folders.add(prefix);
      }
    });

    const sorted = [...folders].sort();
    prefixSelect.innerHTML = sorted.length
      ? sorted.map(p => `<option value="${p}">${p}</option>`).join('')
      : '<option value="documents/">documents/</option>';
  } catch {
    prefixSelect.innerHTML = '<option value="documents/">documents/</option>';
  }
}

function updateUploadStatus(message, type = 'info') {
  const status = document.getElementById('upload-status');
  if (!status) return;
  status.textContent = message;
  status.className = `status-text status-${type}`;
}

function updateSmsStatus(message, type = 'info') {
  const status = document.getElementById('sms-status');
  if (!status) return;
  status.textContent = message;
  status.className = `status-text status-${type}`;
}

function updateGovernmentStatus(message, type = 'info') {
  const status = document.getElementById('government-status');
  if (!status) return;
  status.textContent = message;
  status.className = `status-text status-${type}`;
}

function updateGovernmentModalStatus(message, type = 'info') {
  const status = document.getElementById('government-member-modal-status');
  if (!status) return;
  status.textContent = message;
  status.className = `status-text status-${type}`;
}

function updateGovernmentDescriptionStatus(message, type = 'info') {
  const status = document.getElementById('government-description-status');
  if (!status) return;
  status.textContent = message;
  status.className = `status-text status-${type}`;
}

function updateGovernmentTypeStatus(message, type = 'info') {
  const status = document.getElementById('government-type-status');
  if (!status) return;
  status.textContent = message;
  status.className = `status-text status-${type}`;
}

function updateEventStatus(message, type = 'info') {
  const status = document.getElementById('event-status');
  if (!status) return;
  status.textContent = message;
  status.className = `status-text status-${type}`;
}

function updatePublicNoticeStatus(message, type = 'info') {
  const status = document.getElementById('public-notice-status-text');
  if (!status) return;
  status.textContent = message;
  status.className = `status-text status-${type}`;
}

function updatePublicNoticeListStatus(message, type = 'info') {
  const status = document.getElementById('public-notice-list-status');
  if (!status) return;
  status.textContent = message;
  status.className = `status-text status-${type}`;
}

function updateUserStatus(message, type = 'info') {
  const status = document.getElementById('user-status');
  if (!status) return;
  status.textContent = message;
  status.className = `status-text status-${type}`;
}

function getRequiredEndpoint(configKey, label) {
  const endpoint = window.siteConfig?.[configKey];
  if (!endpoint || !String(endpoint).trim()) {
    throw new Error(`${label} endpoint is not configured.`);
  }
  return endpoint;
}

function openUserModal(user = null) {
  const modal = document.getElementById('user-modal');
  const form = document.getElementById('user-form');
  if (!modal || !form) return;

  if (!isDashboardAdmin()) {
    if (!user) return;
    if (!canManageTargetUser(user)) return;
  }

  form.reset();
  const userIdInput = document.getElementById('user-id');
  const firstNameInput = document.getElementById('user-first-name');
  const lastNameInput = document.getElementById('user-last-name');
  const usernameInput = document.getElementById('user-username');
  const passwordInput = document.getElementById('user-password');
  const passwordConfirmInput = document.getElementById('user-password-confirm');
  const roleInput = document.getElementById('user-role');
  const activeInput = document.getElementById('user-active');
  const modalTitle = document.getElementById('user-modal-title');
  const roleGroup = roleInput?.closest('.form-group');
  const activeGroup = activeInput?.closest('.form-group');
  const isAdmin = isDashboardAdmin();

  if (user) {
    userIdInput.value = String(user.id || '');
    firstNameInput.value = String(user.firstName || '');
    lastNameInput.value = String(user.lastName || '');
    usernameInput.value = String(user.username || '');
    roleInput.value = user.role === 'admin' ? 'admin' : 'staff';
    activeInput.checked = user.active !== false;
    passwordInput.value = '';
    passwordConfirmInput.value = '';
    passwordInput.placeholder = 'Leave blank to keep current password';
    passwordConfirmInput.placeholder = 'Leave blank to keep current password';
    passwordInput.required = false;
    passwordConfirmInput.required = false;
    modalTitle.textContent = isAdmin ? 'Edit user' : 'My account';
  } else {
    if (!isAdmin) return;

    userIdInput.value = '';
    firstNameInput.value = '';
    lastNameInput.value = '';
    usernameInput.value = '';
    roleInput.value = 'staff';
    activeInput.checked = true;
    passwordInput.value = '';
    passwordConfirmInput.value = '';
    passwordInput.placeholder = 'Enter a new password';
    passwordConfirmInput.placeholder = 'Re-enter password';
    passwordInput.required = true;
    passwordConfirmInput.required = true;
    modalTitle.textContent = 'Add user';
  }

  if (roleInput) {
    roleInput.disabled = !isAdmin;
  }

  if (activeInput) {
    activeInput.disabled = !isAdmin;
  }

  roleGroup?.classList.toggle('hidden', !isAdmin);
  activeGroup?.classList.toggle('hidden', !isAdmin);

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeUserModal() {
  const modal = document.getElementById('user-modal');
  const form = document.getElementById('user-form');
  if (!modal || !form) return;
  form.reset();
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  updateUserStatus('', 'info');
}

async function saveUser() {
  const userId = document.getElementById('user-id')?.value.trim();
  const firstName = document.getElementById('user-first-name')?.value.trim();
  const lastName = document.getElementById('user-last-name')?.value.trim();
  const username = document.getElementById('user-username')?.value.trim();
  const password = document.getElementById('user-password')?.value || '';
  const confirmPassword = document.getElementById('user-password-confirm')?.value || '';
  const role = document.getElementById('user-role')?.value || 'staff';
  const active = document.getElementById('user-active')?.checked !== false;
  const isAdmin = isDashboardAdmin();

  if (!username) {
    updateUserStatus('Username is required.', 'error');
    return;
  }

  const isEditing = Boolean(userId);
  if (!isEditing && (!password || !confirmPassword)) {
    updateUserStatus('Username and password are required.', 'error');
    return;
  }

  if (password || confirmPassword) {
    if (password !== confirmPassword) {
      updateUserStatus('Passwords do not match.', 'error');
      return;
    }
  }

  const endpoint = getRequiredEndpoint('adminUsersEndpoint', 'User management');
  try {
    const payload = {
      action: isEditing ? 'update' : 'create',
      user: {
        id: userId || undefined,
        firstName,
        lastName,
        username,
        ...(password ? { password } : {}),
        ...(isAdmin ? { role, active } : {}),
      },
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionStorage.getItem('dashboard_token') || ''}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || (isEditing ? 'Unable to update user.' : 'Unable to create user.'));
    }

    userManagementState.users = Array.isArray(result.users) ? result.users : userManagementState.users;
    renderUsersList();
    closeUserModal();
    updateUserStatus(isEditing ? 'User updated successfully.' : 'User added successfully.', 'success');
  } catch (error) {
    updateUserStatus(error.message, 'error');
  }
}

function renderUsersList() {
  const list = document.getElementById('users-list');
  const showInactive = document.getElementById('user-show-inactive')?.checked;
  const isAdmin = isDashboardAdmin();
  if (!list) return;

  const visibleUsers = userManagementState.users.filter((user) => showInactive || user.active !== false);

  if (!visibleUsers.length) {
    list.innerHTML = '<article class="card"><p>No active users found.</p></article>';
    return;
  }

  const rows = visibleUsers.map((user) => {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Unknown user';
    const role = user.role === 'admin' ? 'Admin' : 'Staff';
    const activeLabel = user.active === false ? 'Inactive' : 'Active';
    const actionButton = isAdmin
      ? `<button type="button" class="button small-button" data-user-toggle="${escapeHtml(user.id || '')}">${user.active === false ? 'Activate' : 'Deactivate'}</button>`
      : '';
    return `
      <article class="card user-row-card" data-user-edit="${escapeHtml(user.id || '')}" tabindex="0" role="button" aria-label="Edit user ${escapeHtml(user.username || 'user')}">
        <div class="user-row">
          <div>
            <strong>${escapeHtml(fullName)}</strong>
            <div class="user-meta">${escapeHtml(user.username || 'Unknown')} • ${escapeHtml(role)} • ${escapeHtml(activeLabel)}</div>
          </div>
          <div class="user-actions">
            ${actionButton}
          </div>
        </div>
      </article>
    `;
  }).join('');

  list.innerHTML = rows;

  list.querySelectorAll('[data-user-edit]').forEach((card) => {
    const userId = card.getAttribute('data-user-edit');
    const target = userManagementState.users.find((user) => String(user.id || '') === String(userId || ''));
    if (!target || !canManageTargetUser(target)) return;

    card.addEventListener('click', () => {
      openUserModal(target);
    });

    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openUserModal(target);
      }
    });
  });

  list.querySelectorAll('[data-user-toggle]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      const userId = button.getAttribute('data-user-toggle');
      const target = userManagementState.users.find((user) => String(user.id || '') === String(userId || ''));
      if (!target) return;
      await toggleUserActive(target);
    });
  });
}

async function toggleUserActive(user) {
  if (!user || !user.id) return;

  const endpoint = getRequiredEndpoint('adminUsersEndpoint', 'User management');
  const nextActive = user.active === false;

  try {
    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionStorage.getItem('dashboard_token') || ''}`,
      },
      body: JSON.stringify({ action: 'toggle-active', userId: user.id, active: nextActive }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Unable to update user status.');
    }

    userManagementState.users = Array.isArray(result.users) ? result.users : userManagementState.users;
    renderUsersList();
    updateUserStatus(`User ${nextActive ? 'activated' : 'deactivated'}.`, 'success');
  } catch (error) {
    updateUserStatus(error.message, 'error');
  }
}

async function loadUsers() {
  const endpoint = getRequiredEndpoint('adminUsersEndpoint', 'User management');

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sessionStorage.getItem('dashboard_token') || ''}`,
      },
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Unable to load users.');
    }

    userManagementState.users = Array.isArray(result.users) ? result.users : [];
    renderUsersList();
  } catch (error) {
    updateUserStatus(error.message, 'error');
    const list = document.getElementById('users-list');
    if (list) {
      list.innerHTML = `<article class="card"><p>${escapeHtml(error.message || 'Unable to load users.')}</p></article>`;
    }
  }
}

function attachDashboardEvents() {
  const uploadForm = document.getElementById('upload-form');
  const governmentForm = document.getElementById('government-form');
  const smsForm = document.getElementById('sms-form');
  const eventForm = document.getElementById('event-form');
  const eventModal = document.getElementById('event-modal');
  const userShowInactive = document.getElementById('user-show-inactive');
  const userAddButton = document.getElementById('user-add-button');
  const userModal = document.getElementById('user-modal');
  const userClose = document.getElementById('user-modal-close');
  const userForm = document.getElementById('user-form');
  const userSubmitButton = userForm?.querySelector('button[type="submit"]');
  const eventModalCloseButton = document.getElementById('event-modal-close');

  userShowInactive?.addEventListener('change', () => {
    renderUsersList();
  });

  userAddButton?.addEventListener('click', () => {
    if (!isDashboardAdmin()) return;
    openUserModal();
  });

  userClose?.addEventListener('click', () => {
    closeUserModal();
  });

  userSubmitButton?.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await saveUser();
  });

  userForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveUser();
  });

  userModal?.addEventListener('click', (event) => {
    if (event.target === userModal) {
      closeUserModal();
    }
  });
  const eventCreateNewButton = document.getElementById('event-create-new');
  const eventDateFrom = document.getElementById('event-date-from');
  const eventDateTo = document.getElementById('event-date-to');
  const publicNoticeForm = document.getElementById('public-notice-form');
  const publicNoticeNewButton = document.getElementById('public-notice-new');
  const publicNoticeOpenCreateButton = document.getElementById('public-notice-open-create');
  const publicNoticeModal = document.getElementById('public-notice-modal');
  const publicNoticeModalCloseButton = document.getElementById('public-notice-modal-close');
  const publicNoticeStatus = document.getElementById('public-notice-status');
  const serviceRequestDetailsModal = document.getElementById('service-request-details-modal');
  const serviceRequestDetailsModalCloseButton = document.getElementById('service-request-details-modal-close');
  const serviceRequestDetailSaveButton = document.getElementById('service-request-detail-status-save');

  serviceRequestDetailsModalCloseButton?.addEventListener('click', closeServiceRequestDetailsModal);

  serviceRequestDetailSaveButton?.addEventListener('click', async () => {
    const ticketId = serviceRequestDetailSaveButton.dataset.ticketId || document.getElementById('service-request-detail-status')?.dataset.ticketId;
    const statusSelect = document.getElementById('service-request-detail-status');
    const notesInput = document.getElementById('service-request-detail-notes');
    const nextStatus = statusSelect?.value || 'New';
    const notes = notesInput?.value?.trim() || '';

    if (!ticketId) {
      return;
    }

    await updateServiceRequestStatusInStorage(ticketId, nextStatus, notes);
    closeServiceRequestDetailsModal();
  });

  document.querySelectorAll('.tab-button').forEach((button) => {
    button.addEventListener('click', () => selectTab(button.id));
  });

  if (uploadForm) {
    uploadForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const fileInput = document.getElementById('upload-file');
      const prefix = document.getElementById('upload-prefix')?.value || 'documents/';
      const file = fileInput?.files?.[0];

      if (!file) {
        updateUploadStatus('Please select a file to upload.', 'error');
        return;
      }

      updateUploadStatus('Uploading…', 'info');

      const token = window.siteConfig?.uploadToken;

      try {
        const endpoint = getRequiredEndpoint('uploadEndpoint', 'Upload');
        const fileBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getDashboardToken()}`,
          },
          body: JSON.stringify({
            fileName: file.name,
            prefix,
            contentType: file.type || 'application/octet-stream',
            fileBase64,
          }),
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || 'Upload failed');
        }

        updateUploadStatus(`Uploaded successfully: ${result.url}`, 'success');
        uploadForm.reset();
        await populatePrefixSelect();
      } catch (error) {
        updateUploadStatus(error.message, 'error');
      }
    });
  }

  if (governmentForm) {
    const typeSelect = document.getElementById('government-type-select');
    const addTypeButton = document.getElementById('government-add-type');
    const addButton = document.getElementById('government-add-member');
    const showInactiveWrap = document.getElementById('government-show-inactive-wrap');
    const showInactiveInput = document.getElementById('government-show-inactive');
    const memberForm = document.getElementById('government-member-form');
    const closeButton = document.getElementById('government-member-modal-close');
    const modal = document.getElementById('government-member-modal');
    const descriptionForm = document.getElementById('government-description-form');
    const descriptionCloseButton = document.getElementById('government-description-modal-close');
    const descriptionModal = document.getElementById('government-description-modal');
    const typeForm = document.getElementById('government-type-form');
    const typeCloseButton = document.getElementById('government-type-modal-close');
    const typeModal = document.getElementById('government-type-modal');

    typeSelect?.addEventListener('change', () => {
      governmentState.selectedType = typeSelect.value;
      governmentState.showInactive = false;
      if (showInactiveInput) showInactiveInput.checked = false;
      addButton.disabled = !governmentState.selectedType;
      showInactiveWrap?.classList.toggle('hidden', !governmentState.selectedType);
      renderGovernmentMembers();
    });

    showInactiveInput?.addEventListener('change', () => {
      governmentState.showInactive = showInactiveInput.checked;
      renderGovernmentMembers();
    });

    addTypeButton?.addEventListener('click', openGovernmentTypeModal);
    addButton?.addEventListener('click', () => openGovernmentMemberModal('create'));
    closeButton?.addEventListener('click', closeGovernmentMemberModal);

    memberForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveGovernmentMember();
    });

    descriptionCloseButton?.addEventListener('click', closeGovernmentDescriptionModal);

    descriptionForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveGovernmentDescription();
    });

    typeCloseButton?.addEventListener('click', closeGovernmentTypeModal);

    typeForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveGovernmentType();
    });
  }

  if (smsForm) {
    smsForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      updateSmsStatus('Sending sample message…', 'info');

      const to = document.getElementById('sms-to')?.value.trim();
      const message = document.getElementById('sms-message')?.value.trim();

      if (!to || !message) {
        updateSmsStatus('Please provide both a phone number and a message.', 'error');
        return;
      }

      try {
        const endpoint = getRequiredEndpoint('smsEndpoint', 'SMS');
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ to, message })
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || 'Unable to send SMS');
        }

        updateSmsStatus(`Sample message sent: ${result.sid}`, 'success');
      } catch (error) {
        updateSmsStatus(error.message, 'error');
      }
    });
  }

  if (eventForm) {
    eventForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const eventId = document.getElementById('event-id')?.value || '';
      const title = document.getElementById('event-title')?.value.trim();
      const date = document.getElementById('event-date')?.value;
      const type = document.getElementById('event-type')?.value;
      const start = document.getElementById('event-start')?.value;
      const end = document.getElementById('event-end')?.value;
      const location = document.getElementById('event-location')?.value.trim();
      const description = document.getElementById('event-description')?.value.trim();

      if (!title || !date || !start) {
        updateEventStatus('Title, date, and start time are required.', 'error');
        return;
      }

      const action = eventId ? 'update' : 'create';
      updateEventStatus(action === 'update' ? 'Updating event…' : 'Creating event…', 'info');

      try {
        const endpoint = getRequiredEndpoint('calendarEndpoint', 'Calendar');
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getDashboardToken()}`,
          },
          body: JSON.stringify({ action, eventId, title, date, type, start, end, location, description }),
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || 'Failed to save event');
        }

        updateEventStatus(action === 'update' ? 'Event updated successfully.' : 'Event created successfully.', 'success');
        closeEventModal();
        eventForm.reset();
        await loadEventRange();
      } catch (error) {
        updateEventStatus(error.message, 'error');
      }
    });
  }

  eventCreateNewButton?.addEventListener('click', () => openEventModal('create'));
  eventModalCloseButton?.addEventListener('click', closeEventModal);

  const refreshEventRange = () => {
    if (!eventDateFrom || !eventDateTo) return;

    const fromValue = eventDateFrom.value;
    const toValue = eventDateTo.value;

    if (!fromValue || !toValue) {
      return;
    }

    if (fromValue > toValue) {
      eventDateFrom.value = toValue;
      eventDateTo.value = fromValue;
    }

    loadEventRange();
  };

  eventDateFrom?.addEventListener('change', refreshEventRange);
  eventDateTo?.addEventListener('change', refreshEventRange);

  if (eventDateFrom && eventDateTo) {
    const { from, to } = getCurrentMonthRange();
    eventDateFrom.value = from;
    eventDateTo.value = to;
  }

  loadEventRange();

  if (publicNoticeForm) {
    publicNoticeForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await savePublicNotice();
    });
  }

  publicNoticeOpenCreateButton?.addEventListener('click', () => {
    openPublicNoticeModal('create');
  });

  publicNoticeModalCloseButton?.addEventListener('click', () => {
    closePublicNoticeModal();
  });

  publicNoticeNewButton?.addEventListener('click', () => {
    resetPublicNoticeForm();
    updatePublicNoticeStatus('Ready for a new notice.', 'info');
  });

  publicNoticeStatus?.addEventListener('change', () => {
    updatePublicNoticeScheduleRequirement();
  });
}

function formatDateValue(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeEventType(rawValue, fallbackEvent = null) {
  const meetingLabelId = 'f1aaf7fe-fcf4-498d-b190-0546d65dbf5a';
  const eventLabelId = '2957bade-5f88-438b-905f-f11a0d9e60c8';
  const raw = String(rawValue || fallbackEvent?.eventType || fallbackEvent?.type || '').trim().toLowerCase();

  if (raw === 'meeting' || raw === 'event') {
    return raw;
  }

  const labelId = fallbackEvent?.eventLabelId || fallbackEvent?.labelId || '';
  if (String(labelId) === meetingLabelId) return 'meeting';
  if (String(labelId) === eventLabelId) return 'event';

  const searchText = `${fallbackEvent?.summary || ''} ${fallbackEvent?.description || ''}`.toLowerCase();
  if (/\b(meeting|council|session|commission)\b/.test(searchText)) {
    return 'meeting';
  }

  return 'event';
}

function getCurrentMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: formatDateValue(from),
    to: formatDateValue(to),
  };
}

function getEventDateParts(value) {
  const raw = String(value || '').trim();
  if (!raw) return { date: '', start: '', end: '' };

  const dateText = raw.includes('T') ? raw.split('T')[0] : raw;
  const timeText = raw.includes('T') ? raw.split('T')[1].slice(0, 5) : '';

  return {
    date: dateText,
    start: timeText,
    end: '',
  };
}

function openEventModal(mode, eventRecord = null) {
  const modal = document.getElementById('event-modal');
  const title = document.getElementById('event-modal-title');
  const eventForm = document.getElementById('event-form');
  const eventId = document.getElementById('event-id');
  const eventTitle = document.getElementById('event-title');
  const eventDate = document.getElementById('event-date');
  const eventType = document.getElementById('event-type');
  const eventStart = document.getElementById('event-start');
  const eventEnd = document.getElementById('event-end');
  const eventLocation = document.getElementById('event-location');
  const eventDescription = document.getElementById('event-description');
  const eventDateFrom = document.getElementById('event-date-from');

  if (!modal || !title || !eventForm || !eventId || !eventTitle || !eventDate || !eventType || !eventStart || !eventEnd || !eventLocation || !eventDescription) {
    return;
  }

  if (mode === 'edit' && eventRecord) {
    const dateParts = getEventDateParts(eventRecord.start?.dateTime || eventRecord.start?.date || '');
    const endParts = getEventDateParts(eventRecord.end?.dateTime || eventRecord.end?.date || '');
    const resolvedType = normalizeEventType(eventRecord.eventType || eventRecord.type, eventRecord);
    title.textContent = 'Edit event';
    eventId.value = String(eventRecord.id || '');
    eventTitle.value = String(eventRecord.summary || '');
    eventDate.value = dateParts.date;
    eventType.value = resolvedType;
    eventStart.value = dateParts.start;
    eventEnd.value = endParts.start;
    eventLocation.value = String(eventRecord.location || '');
    eventDescription.value = String(eventRecord.description || '');
  } else {
    title.textContent = 'Create event';
    eventForm.reset();
    eventId.value = '';
    eventType.value = 'event';
    eventDate.value = eventDateFrom?.value || '';
    eventStart.value = '';
    eventEnd.value = '';
    eventLocation.value = '';
    eventDescription.value = '';
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeEventModal() {
  const modal = document.getElementById('event-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

async function loadEventRange() {
  const fromInput = document.getElementById('event-date-from');
  const toInput = document.getElementById('event-date-to');
  const list = document.getElementById('event-list');
  if (!fromInput || !toInput || !list) return;

  let from = fromInput.value || getCurrentMonthRange().from;
  let to = toInput.value || getCurrentMonthRange().to;
  if (from && to && from > to) {
    [from, to] = [to, from];
    fromInput.value = from;
    toInput.value = to;
  }
  if (!from || !to) return;

  list.innerHTML = '<article class="card"><p>Loading events…</p></article>';

  try {
    const endpoint = getRequiredEndpoint('eventsEndpoint', 'Calendar events');
    const response = await fetch(`${endpoint}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Unable to load events.');
    }

    const events = Array.isArray(payload.items) ? payload.items : [];
    if (!events.length) {
      list.innerHTML = '<article class="card"><p>No events found for the selected date range.</p></article>';
      return;
    }

    list.innerHTML = events.map((eventItem) => {
      const eventDate = eventItem.start?.dateTime ? new Date(eventItem.start.dateTime) : new Date(`${eventItem.start?.date || from}T00:00:00`);
      const startTime = eventItem.start?.dateTime ? new Date(eventItem.start.dateTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'All day';
      const endTime = eventItem.end?.dateTime ? new Date(eventItem.end.dateTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
      const eventTypeText = normalizeEventType(eventItem.eventType || eventItem.type, eventItem) === 'meeting' ? 'Meeting' : 'Event';
      return `
        <button type="button" class="event-list-row" data-event-id="${escapeHtml(eventItem.id || '')}">
          <span class="event-list-date">${escapeHtml(formatDateValue(eventDate))}</span>
          <span class="event-list-time">${escapeHtml(startTime)}${endTime ? ` – ${escapeHtml(endTime)}` : ''}</span>
          <span class="event-list-name">${escapeHtml(eventItem.summary || 'Untitled event')}</span>
          <span class="event-list-type">${escapeHtml(eventTypeText)}</span>
        </button>
      `;
    }).join('');

    list.querySelectorAll('[data-event-id]').forEach((button) => {
      button.addEventListener('click', async () => {
        const eventId = button.getAttribute('data-event-id');
        if (!eventId) return;

        const eventRecord = events.find((entry) => String(entry.id || '') === String(eventId));
        if (eventRecord) {
          openEventModal('edit', eventRecord);
        }
      });
    });
  } catch (error) {
    list.innerHTML = `<article class="card"><p>${escapeHtml(error.message)}</p></article>`;
  }
}

function normalizeNoticeStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'published' || normalized === 'scheduled' || normalized === 'draft') {
    return normalized;
  }
  return 'draft';
}

function toLocalDateTimeInputValue(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toIsoStringOrEmpty(localValue) {
  const text = String(localValue || '').trim();
  if (!text) return '';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function normalizePublicNotices(items) {
  const notices = Array.isArray(items) ? items : [];
  return notices
    .filter((notice) => notice && typeof notice === 'object')
    .map((notice) => ({
      id: String(notice.id || '').trim(),
      title: String(notice.title || '').trim(),
      summary: String(notice.summary || '').trim(),
      body: String(notice.body || '').trim(),
      category: String(notice.category || 'General Notice').trim(),
      status: normalizeNoticeStatus(notice.status),
      publishAt: String(notice.publishAt || '').trim(),
      expiresAt: String(notice.expiresAt || '').trim(),
      createdAt: String(notice.createdAt || '').trim(),
      updatedAt: String(notice.updatedAt || '').trim(),
    }))
    .filter((notice) => notice.title)
    .sort((left, right) => {
      const leftTime = Date.parse(left.publishAt || left.updatedAt || left.createdAt || 0);
      const rightTime = Date.parse(right.publishAt || right.updatedAt || right.createdAt || 0);
      return rightTime - leftTime;
    });
}

function formatNoticeDateTime(value) {
  const text = String(value || '').trim();
  if (!text) return 'Not set';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function renderNoticeSummary(value) {
  const text = String(value || '').trim();
  if (!text) return 'No summary provided.';
  return escapeHtml(text)
    .replace(/\r\n/g, '\n')
    .replace(/\n\n+/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function openPublicNoticeModal(mode, notice = null) {
  const modal = document.getElementById('public-notice-modal');
  const title = document.getElementById('public-notice-modal-title');
  if (!modal || !title) return;

  if (mode === 'edit' && notice) {
    populatePublicNoticeForm(notice);
    title.textContent = 'Edit public notice';
    updatePublicNoticeStatus(`Editing notice: ${notice.title}`, 'info');
  } else {
    resetPublicNoticeForm();
    title.textContent = 'Create public notice';
    updatePublicNoticeStatus('', 'info');
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closePublicNoticeModal() {
  const modal = document.getElementById('public-notice-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function getNoticeDisplayState(notice) {
  const now = Date.now();
  const publishAt = notice.publishAt ? Date.parse(notice.publishAt) : NaN;
  const expiresAt = notice.expiresAt ? Date.parse(notice.expiresAt) : NaN;

  if (!Number.isNaN(expiresAt) && expiresAt <= now) {
    return 'Expired';
  }

  if (notice.status === 'draft') {
    return 'Draft';
  }

  if (!Number.isNaN(publishAt) && publishAt > now) {
    return 'Scheduled';
  }

  return 'Published';
}

function renderPublicNoticeList() {
  const container = document.getElementById('public-notice-list');
  if (!container) return;

  if (!noticesState.notices.length) {
    container.innerHTML = '<article class="card"><p>No notices yet. Create one to get started.</p></article>';
    return;
  }

  container.innerHTML = noticesState.notices.map((notice) => {
    const displayState = getNoticeDisplayState(notice);
    const summary = notice.summary || notice.body || 'No summary provided.';
    return `
      <article class="card public-notice-row">
        <div class="public-notice-row-header">
          <h3>${escapeHtml(notice.title)}</h3>
          <span class="public-notice-pill public-notice-pill-${displayState.toLowerCase()}">${escapeHtml(displayState)}</span>
        </div>
        <p class="public-notice-row-meta">
          <strong>${escapeHtml(notice.category)}</strong> · Publish: ${escapeHtml(formatNoticeDateTime(notice.publishAt))} · Expires: ${escapeHtml(formatNoticeDateTime(notice.expiresAt))}
        </p>
        <p>${renderNoticeSummary(summary)}</p>
        <div class="form-actions">
          <button type="button" class="button" data-public-notice-edit-id="${escapeHtml(notice.id)}">Edit notice</button>
        </div>
      </article>
    `;
  }).join('');

  container.querySelectorAll('[data-public-notice-edit-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const noticeId = button.getAttribute('data-public-notice-edit-id') || '';
      const notice = noticesState.notices.find((entry) => entry.id === noticeId);
      if (!notice) return;
      openPublicNoticeModal('edit', notice);
    });
  });
}

function populatePublicNoticeForm(notice) {
  const idInput = document.getElementById('public-notice-id');
  const titleInput = document.getElementById('public-notice-title');
  const summaryInput = document.getElementById('public-notice-summary');
  const bodyInput = document.getElementById('public-notice-body');
  const categoryInput = document.getElementById('public-notice-category');
  const statusInput = document.getElementById('public-notice-status');
  const publishAtInput = document.getElementById('public-notice-publish-at');
  const expiresAtInput = document.getElementById('public-notice-expires-at');

  if (!idInput || !titleInput || !summaryInput || !bodyInput || !categoryInput || !statusInput || !publishAtInput || !expiresAtInput) return;

  idInput.value = notice.id || '';
  titleInput.value = notice.title || '';
  summaryInput.value = notice.summary || '';
  bodyInput.value = notice.body || '';
  categoryInput.value = notice.category || 'General Notice';
  statusInput.value = normalizeNoticeStatus(notice.status);
  publishAtInput.value = toLocalDateTimeInputValue(notice.publishAt);
  expiresAtInput.value = toLocalDateTimeInputValue(notice.expiresAt);
  updatePublicNoticeScheduleRequirement();
}

function resetPublicNoticeForm() {
  const form = document.getElementById('public-notice-form');
  const idInput = document.getElementById('public-notice-id');
  const statusInput = document.getElementById('public-notice-status');
  const publishAtInput = document.getElementById('public-notice-publish-at');

  form?.reset();
  if (idInput) idInput.value = '';
  if (statusInput) statusInput.value = 'draft';
  if (publishAtInput) publishAtInput.required = false;
}

function updatePublicNoticeScheduleRequirement() {
  const statusInput = document.getElementById('public-notice-status');
  const publishAtInput = document.getElementById('public-notice-publish-at');
  if (!statusInput || !publishAtInput) return;
  publishAtInput.required = statusInput.value === 'scheduled';
}

async function loadPublicNotices() {
  const list = document.getElementById('public-notice-list');
  if (list) {
    list.innerHTML = '<article class="card"><p>Loading notices…</p></article>';
  }

  try {
    const endpoint = getRequiredEndpoint('publicNoticesEndpoint', 'Public Notices');
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: getDashboardAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Unable to load public notices (${response.status}).`);
    }

    const payload = await response.json();
    noticesState.notices = normalizePublicNotices(payload?.notices);
    renderPublicNoticeList();
    updatePublicNoticeListStatus('Notices loaded.', 'info');
  } catch (error) {
    if (list) {
      list.innerHTML = `<article class="card"><p>${escapeHtml(error.message)}</p></article>`;
    }
    updatePublicNoticeListStatus(error.message, 'error');
  }
}

async function savePublicNotice() {
  const id = String(document.getElementById('public-notice-id')?.value || '').trim();
  const title = String(document.getElementById('public-notice-title')?.value || '').trim();
  const summary = String(document.getElementById('public-notice-summary')?.value || '').trim();
  const body = String(document.getElementById('public-notice-body')?.value || '').trim();
  const category = String(document.getElementById('public-notice-category')?.value || 'General Notice').trim();
  const status = normalizeNoticeStatus(document.getElementById('public-notice-status')?.value || 'draft');
  const publishAt = toIsoStringOrEmpty(document.getElementById('public-notice-publish-at')?.value || '');
  const expiresAt = toIsoStringOrEmpty(document.getElementById('public-notice-expires-at')?.value || '');

  if (!title) {
    updatePublicNoticeStatus('Notice title is required.', 'error');
    return;
  }

  if (status === 'scheduled' && !publishAt) {
    updatePublicNoticeStatus('Scheduled notices require a publish date/time.', 'error');
    return;
  }

  if (publishAt && expiresAt && Date.parse(expiresAt) <= Date.parse(publishAt)) {
    updatePublicNoticeStatus('Expiration must be after publish date/time.', 'error');
    return;
  }

  updatePublicNoticeStatus('Saving notice…', 'info');

  try {
    const endpoint = getRequiredEndpoint('publicNoticesEndpoint', 'Public Notices');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: getDashboardAuthHeaders({
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({
        action: 'save',
        notice: {
          id,
          title,
          summary,
          body,
          category,
          status,
          publishAt,
          expiresAt
        }
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || payload.details || 'Failed to save public notice.');
    }

    noticesState.notices = normalizePublicNotices(payload?.notices);
    renderPublicNoticeList();
    updatePublicNoticeStatus('Notice saved successfully.', 'success');
    updatePublicNoticeListStatus('Notice saved successfully.', 'success');
    closePublicNoticeModal();
    resetPublicNoticeForm();
  } catch (error) {
    if (error instanceof TypeError && /fetch/i.test(error.message || '')) {
      updatePublicNoticeStatus('Unable to reach the Public Notices service.', 'error');
      return;
    }
    updatePublicNoticeStatus(error.message, 'error');
  }
}

async function loadGovernmentData() {
  if (!ensureDashboardAuth()) {
    return;
  }

  const endpoint = getRequiredEndpoint('councilApiEndpoint', 'Council API');
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getDashboardToken()}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Unable to load government data (${response.status})`);
  }

  const payload = await response.json();
  governmentState.councilData = payload?.councilData || {};
  governmentState.images = Array.isArray(payload?.images) ? payload.images : [];
  populateGovernmentTypeSelect();
  renderGovernmentMembers();
}

function populateGovernmentTypeSelect() {
  const typeSelect = document.getElementById('government-type-select');
  if (!typeSelect) return;

  const typeNames = Object.keys(governmentState.councilData || {});
  typeSelect.innerHTML = '';

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = typeNames.length ? 'Select a government entity' : 'No government entities found';
  typeSelect.append(defaultOption);

  typeNames.forEach((typeName) => {
    const option = document.createElement('option');
    option.value = typeName;
    option.textContent = typeName;
    typeSelect.append(option);
  });

  if (governmentState.selectedType && typeNames.includes(governmentState.selectedType)) {
    typeSelect.value = governmentState.selectedType;
  } else {
    governmentState.selectedType = '';
    typeSelect.value = '';
  }

  const addButton = document.getElementById('government-add-member');
  const showInactiveWrap = document.getElementById('government-show-inactive-wrap');
  if (addButton) {
    addButton.disabled = !governmentState.selectedType;
  }
  showInactiveWrap?.classList.toggle('hidden', !governmentState.selectedType);
}

function getSelectedGovernmentTypeRecord() {
  if (!governmentState.selectedType) return null;
  const record = governmentState.councilData?.[governmentState.selectedType];
  return record && typeof record === 'object' ? record : null;
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeGovernmentMembers(record) {
  const rawMembers = record?.members?.member;
  const members = Array.isArray(rawMembers)
    ? rawMembers
    : rawMembers && typeof rawMembers === 'object'
      ? [rawMembers]
      : [];

  return members.map((member) => ({
    title: String(member?.title || '').trim(),
    name: String(member?.name || '').trim(),
    phoneNumber: String(member?.phoneNumber || '').trim(),
    email: String(member?.email || '').trim(),
    termDate: String(member?.termDate || '').trim(),
    active: typeof member?.active === 'boolean' ? member.active : true,
  }));
}

function renderGovernmentMembers() {
  const container = document.getElementById('government-members-list');
  if (!container) return;

  if (!governmentState.selectedType) {
    container.innerHTML = '<article class="card"><p>Select a government entity to manage its members.</p></article>';
    return;
  }

  const record = getSelectedGovernmentTypeRecord();
  if (!record) {
    container.innerHTML = '<article class="card"><p>Unable to load the selected government type.</p></article>';
    return;
  }

  const members = normalizeGovernmentMembers(record);
  const visibleMembers = governmentState.showInactive
    ? members
    : members.filter((member) => member.active !== false);
  const headerHtml = `
    <article class="card government-type-summary">
      <div class="government-type-summary-header">
        <h3>${escapeHtml(governmentState.selectedType)}</h3>
        <a href="#" class="government-edit-link" id="government-description-edit-link">Edit</a>
      </div>
      <p class="government-description-display">${escapeHtml(record.description || 'No description provided.')}</p>
    </article>
  `;

  if (!visibleMembers.length) {
    container.innerHTML = `${headerHtml}<article class="card"><p>No members listed yet.</p></article>`;
    return;
  }

  const listHtml = visibleMembers.map((member) => {
    const index = members.findIndex((candidate) => candidate.name === member.name && candidate.title === member.title && candidate.termDate === member.termDate);
    return `
    <article class="card government-member-row">
      <div>
        <h3>${escapeHtml(member.name || 'Unnamed member')}</h3>
        <p><strong>${escapeHtml(member.title || 'Member')}</strong></p>
        <p>${member.phoneNumber ? `Phone: ${escapeHtml(member.phoneNumber)}` : ''}${member.phoneNumber && member.email ? '<br />' : ''}${member.email ? `Email: ${escapeHtml(member.email)}` : ''}${(member.phoneNumber || member.email) && member.termDate ? '<br />' : ''}${member.termDate ? `Term date: ${escapeHtml(member.termDate)}` : ''}${(member.phoneNumber || member.email || member.termDate) ? '<br />' : ''}Status: ${member.active === false ? 'Inactive' : 'Active'}</p>
      </div>
      <div class="government-member-actions">
        <button type="button" class="button" data-government-edit-index="${index}">Edit member</button>
      </div>
    </article>
  `;
  }).join('');

  container.innerHTML = `${headerHtml}<div class="government-member-list-grid">${listHtml}</div>`;
  const descriptionEditLink = document.getElementById('government-description-edit-link');
  descriptionEditLink?.addEventListener('click', (event) => {
    event.preventDefault();
    openGovernmentDescriptionModal();
  });
  container.querySelectorAll('[data-government-edit-index]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.getAttribute('data-government-edit-index'));
      openGovernmentMemberModal('edit', index);
    });
  });
}

function openGovernmentMemberModal(mode, memberIndex = -1) {
  const modal = document.getElementById('government-member-modal');
  const modeInput = document.getElementById('government-member-mode');
  const indexInput = document.getElementById('government-member-index');
  const titleInput = document.getElementById('government-member-title');
  const nameInput = document.getElementById('government-member-name');
  const phoneInput = document.getElementById('government-member-phone');
  const emailInput = document.getElementById('government-member-email');
  const termDateInput = document.getElementById('government-member-term-date');
  const activeInput = document.getElementById('government-member-active');
  const imageFileInput = document.getElementById('government-member-image-file');
  const heading = document.getElementById('government-member-modal-title');

  if (!modal || !modeInput || !indexInput || !titleInput || !nameInput || !phoneInput || !emailInput || !termDateInput || !activeInput || !imageFileInput || !heading) return;

  modeInput.value = mode;
  indexInput.value = String(memberIndex);
  titleInput.value = '';
  nameInput.value = '';
  phoneInput.value = '';
  emailInput.value = '';
  termDateInput.value = '';
  activeInput.checked = true;
  imageFileInput.value = '';
  updateGovernmentModalStatus('', 'info');

  if (mode === 'edit' && memberIndex >= 0) {
    const record = getSelectedGovernmentTypeRecord();
    const members = normalizeGovernmentMembers(record);
    const member = members[memberIndex];
    if (member) {
      titleInput.value = member.title;
      nameInput.value = member.name;
      phoneInput.value = member.phoneNumber;
      emailInput.value = member.email;
      termDateInput.value = member.termDate;
      activeInput.checked = member.active !== false;
    }
  }

  if (mode === 'create') {
    heading.textContent = 'Add government member';
  } else {
    heading.textContent = 'Edit government member';
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeGovernmentMemberModal() {
  const modal = document.getElementById('government-member-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function openGovernmentDescriptionModal() {
  const modal = document.getElementById('government-description-modal');
  const descriptionInput = document.getElementById('government-description-text');
  const record = getSelectedGovernmentTypeRecord();
  if (!modal || !descriptionInput || !record) return;

  descriptionInput.value = String(record.description || '');
  updateGovernmentDescriptionStatus('', 'info');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeGovernmentDescriptionModal() {
  const modal = document.getElementById('government-description-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function openGovernmentTypeModal() {
  const modal = document.getElementById('government-type-modal');
  const nameInput = document.getElementById('government-type-name');
  const descriptionInput = document.getElementById('government-type-description');
  if (!modal || !nameInput || !descriptionInput) return;

  nameInput.value = '';
  descriptionInput.value = '';
  updateGovernmentTypeStatus('', 'info');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeGovernmentTypeModal() {
  const modal = document.getElementById('government-type-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function normalizeGovernmentImageBaseName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function buildSuggestedImageName(name, originalFileName = '') {
  const normalized = normalizeGovernmentImageBaseName(name);
  if (!normalized) return '';

  const extensionMatch = String(originalFileName || '').trim().match(/(\.[a-z0-9]+)$/i);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : '.jpg';
  return `${normalized}${extension}`;
}

async function saveGovernmentMember() {
  if (!ensureDashboardAuth()) {
    updateGovernmentModalStatus('Session expired. Please sign in again.', 'error');
    return;
  }

  const selectedType = governmentState.selectedType;
  if (!selectedType) {
    updateGovernmentModalStatus('Select a government type before saving.', 'error');
    return;
  }

  const mode = document.getElementById('government-member-mode')?.value || 'create';
  const memberIndex = Number(document.getElementById('government-member-index')?.value || '-1');
  const title = document.getElementById('government-member-title')?.value.trim() || '';
  const name = document.getElementById('government-member-name')?.value.trim() || '';
  const phoneNumber = document.getElementById('government-member-phone')?.value.trim() || '';
  const email = document.getElementById('government-member-email')?.value.trim() || '';
  const termDate = document.getElementById('government-member-term-date')?.value || '';
  const active = !!document.getElementById('government-member-active')?.checked;
  const imageFile = document.getElementById('government-member-image-file')?.files?.[0] || null;

  if (!title || !name) {
    updateGovernmentModalStatus('Title and name are required.', 'error');
    return;
  }

  updateGovernmentModalStatus('Saving member…', 'info');

  try {
    const endpoint = getRequiredEndpoint('governmentEndpoint', 'Government');
    const formData = new FormData();
    const imageFileName = buildSuggestedImageName(name, imageFile?.name || '');
    formData.append('governmentType', selectedType);
    formData.append('mode', mode);
    formData.append('memberIndex', String(memberIndex));
    formData.append('title', title);
    formData.append('name', name);
    formData.append('phoneNumber', phoneNumber);
    formData.append('email', email);
    formData.append('termDate', termDate);
    formData.append('active', String(active));
    if (imageFileName) {
      formData.append('imageFileName', imageFileName);
    }

    if (mode === 'edit' && memberIndex >= 0) {
      const record = getSelectedGovernmentTypeRecord();
      const members = normalizeGovernmentMembers(record);
      const originalMember = members[memberIndex];
      if (originalMember?.name) {
        formData.append('originalName', originalMember.name);
      }
    }

    if (imageFile) {
      const uploadName = imageFileName || imageFile.name;
      formData.append('file', imageFile, uploadName);
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getDashboardToken()}`,
      },
      body: formData,
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || result.details || 'Failed to save government member');
    }

    if (result.councilData && typeof result.councilData === 'object') {
      governmentState.councilData = result.councilData;
    }
    if (Array.isArray(result.images)) {
      governmentState.images = result.images;
    }

    updateGovernmentStatus('Government member saved successfully.', 'success');
    closeGovernmentMemberModal();
    renderGovernmentMembers();
  } catch (error) {
    if (error instanceof TypeError && /fetch/i.test(error.message || '')) {
      updateGovernmentModalStatus('Unable to reach the government management service.', 'error');
      return;
    }
    updateGovernmentModalStatus(error.message, 'error');
  }
}

async function saveGovernmentDescription() {
  if (!ensureDashboardAuth()) {
    updateGovernmentDescriptionStatus('Session expired. Please sign in again.', 'error');
    return;
  }

  const selectedType = governmentState.selectedType;
  const description = document.getElementById('government-description-text')?.value.trim() || '';

  if (!selectedType) {
    updateGovernmentDescriptionStatus('Select a government type before saving.', 'error');
    return;
  }

  updateGovernmentDescriptionStatus('Saving description…', 'info');

  try {
    const endpoint = getRequiredEndpoint('governmentEndpoint', 'Government');
    const formData = new FormData();
    formData.append('governmentType', selectedType);
    formData.append('mode', 'description');
    formData.append('description', description);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getDashboardToken()}`,
      },
      body: formData,
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || result.details || 'Failed to save government description');
    }

    if (result.councilData && typeof result.councilData === 'object') {
      governmentState.councilData = result.councilData;
    }
    if (Array.isArray(result.images)) {
      governmentState.images = result.images;
    }

    updateGovernmentStatus('Government description saved successfully.', 'success');
    closeGovernmentDescriptionModal();
    renderGovernmentMembers();
  } catch (error) {
    if (error instanceof TypeError && /fetch/i.test(error.message || '')) {
      updateGovernmentDescriptionStatus('Unable to reach the government management service.', 'error');
      return;
    }
    updateGovernmentDescriptionStatus(error.message, 'error');
  }
}

async function saveGovernmentType() {
  if (!ensureDashboardAuth()) {
    updateGovernmentTypeStatus('Session expired. Please sign in again.', 'error');
    return;
  }

  const typeName = document.getElementById('government-type-name')?.value.trim() || '';
  const description = document.getElementById('government-type-description')?.value.trim() || '';

  if (!typeName) {
    updateGovernmentTypeStatus('Entity name is required.', 'error');
    return;
  }

  updateGovernmentTypeStatus('Saving entity…', 'info');

  try {
    const endpoint = getRequiredEndpoint('governmentEndpoint', 'Government');
    const formData = new FormData();
    formData.append('governmentType', typeName);
    formData.append('mode', 'type');
    formData.append('description', description);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getDashboardToken()}`,
      },
      body: formData,
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || result.details || 'Failed to save government entity');
    }

    if (result.councilData && typeof result.councilData === 'object') {
      governmentState.councilData = result.councilData;
    }
    if (Array.isArray(result.images)) {
      governmentState.images = result.images;
    }

    governmentState.selectedType = typeName;
    governmentState.showInactive = false;
    populateGovernmentTypeSelect();
    renderGovernmentMembers();
    updateGovernmentStatus('Government entity saved successfully.', 'success');
    closeGovernmentTypeModal();
  } catch (error) {
    if (error instanceof TypeError && /fetch/i.test(error.message || '')) {
      updateGovernmentTypeStatus('Unable to reach the government management service.', 'error');
      return;
    }
    updateGovernmentTypeStatus(error.message, 'error');
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  await loadIncludes();
  attachSiteNavToggle();
  await loadDevNotification();

  const token = getDashboardToken();
  if (token && !isDashboardTokenExpired(token)) {
    showDashboard(token);
  } else {
    sessionStorage.removeItem('dashboard_token');
    document.getElementById('dashboard-screen')?.classList.add('hidden');
    document.getElementById('login-screen')?.classList.remove('hidden');
    if (token) {
      setLoginStatus('Session expired. Please sign in again.', 'error');
    }
  }

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username')?.value.trim();
      const password = document.getElementById('login-password')?.value;
      const status = document.getElementById('login-status');

      if (status) { status.textContent = 'Signing in…'; status.className = 'status-text status-info'; }

      try {
        const endpoint = getRequiredEndpoint('loginEndpoint', 'Login');
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const result = await resp.json();
        if (!resp.ok) throw new Error(result.error || 'Sign in failed');

        sessionStorage.setItem('dashboard_token', result.token);
        showDashboard(result.token);
      } catch (err) {
        if (status) { status.textContent = err.message; status.className = 'status-text status-error'; }
      }
    });
  }
});

function showDashboard(token) {
  const trimmedToken = String(token || '').trim();
  if (!trimmedToken || isDashboardTokenExpired(trimmedToken)) {
    ensureDashboardAuth();
    return;
  }

  sessionStorage.setItem('dashboard_token', trimmedToken);
  dashboardSessionState.payload = decodeDashboardTokenPayload(trimmedToken);
  document.getElementById('login-screen')?.classList.add('hidden');
  const dash = document.getElementById('dashboard-screen');
  if (dash) dash.classList.remove('hidden');

  // Inject token into siteConfig for upload auth
  if (window.siteConfig) window.siteConfig.uploadToken = token;

  syncUserManagementAccess();
  populatePrefixSelect();
  attachDashboardEvents();
  attachServiceRequestFilter();
  refreshServiceRequestsLog();
  loadUsers();
  loadPublicNotices();
  updatePublicNoticeScheduleRequirement();
  loadGovernmentData().catch((error) => {
    updateGovernmentStatus(error.message, 'error');
  });
  selectTab('event-tab');
}
