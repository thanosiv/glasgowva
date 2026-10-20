const managerMinutesPublicState = {
  entries: [],
  currentPage: 1,
  pageSize: 10
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

function normalizeManagerMinutes(items) {
  return (Array.isArray(items) ? items : [])
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      id: String(entry.id || '').trim(),
      title: String(entry.title || '').trim(),
      content: String(entry.content || entry.summary || '').trim(),
      summary: String(entry.summary || entry.content || '').trim(),
      links: Array.isArray(entry.links) ? entry.links.map((url) => toSafeUrl(url)).filter(Boolean) : [],
      images: Array.isArray(entry.images) ? entry.images.map((url) => toSafeUrl(url)).filter(Boolean) : [],
      status: String(entry.status || '').trim().toLowerCase(),
      liveAt: String(entry.liveAt || '').trim(),
      createdAt: String(entry.createdAt || '').trim(),
      updatedAt: String(entry.updatedAt || '').trim(),
    }))
    .filter((entry) => entry.title)
    .sort((left, right) => {
      const leftTime = Date.parse(left.liveAt || left.updatedAt || left.createdAt || 0);
      const rightTime = Date.parse(right.liveAt || right.updatedAt || right.createdAt || 0);
      return rightTime - leftTime;
    });
}

function isManagerMinuteVisible(entry) {
  if (entry.status === 'draft') {
    return false;
  }

  const liveAtMs = entry.liveAt ? Date.parse(entry.liveAt) : NaN;
  if (!Number.isNaN(liveAtMs) && liveAtMs > Date.now()) {
    return false;
  }

  return true;
}

function formatDateTime(value) {
  const text = String(value || '').trim();
  if (!text) return 'Not set';

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return text;
  }

  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function getOverviewText(value, maxLength = 180) {
  const text = String(value || '')
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/(^|\s)(https?:\/\/|www\.)[^\s]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return 'No description provided.';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

function renderSimpleMarkdown(value) {
  const text = String(value || '').trim();
  if (!text) return '<p>No description provided.</p>';

  const renderInline = (input) => {
    let html = escapeHtml(input);

    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    html = html.replace(/\+\+(.+?)\+\+/g, '<u>$1</u>');

    html = html.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi, (full, altText, rawUrl) => {
      const safe = toSafeUrl(rawUrl);
      if (!safe) return escapeHtml(full);
      return `<img class="manager-minute-inline-image" src="${escapeHtml(safe)}" alt="${escapeHtml(altText || '')}" loading="lazy" />`;
    });

    html = html.replace(/\[([^\]]+)\]\(((?:https?:\/\/|www\.)[^\s)]+)\)/gi, (full, label, rawUrl) => {
      const safe = toSafeUrl(rawUrl);
      if (!safe) return escapeHtml(full);
      return `<a href="${escapeHtml(safe)}" target="_blank" rel="noreferrer noopener">${escapeHtml(label)}</a>`;
    });

    html = html.replace(/(^|\s)((?:https?:\/\/|www\.)[^\s<]+)/gi, (full, prefix, rawUrl) => {
      const safe = toSafeUrl(rawUrl);
      if (!safe) return full;
      return `${prefix}<a href="${escapeHtml(safe)}" target="_blank" rel="noreferrer noopener">${escapeHtml(rawUrl)}</a>`;
    });

    return html;
  };

  const lines = text.replace(/\r/g, '').split('\n');
  const chunks = [];
  let paragraphLines = [];
  let listItems = [];

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    const paragraphHtml = paragraphLines.map((line) => renderInline(line)).join('<br>');
    chunks.push(`<p>${paragraphHtml}</p>`);
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    const listHtml = listItems.map((item) => `<li>${renderInline(item)}</li>`).join('');
    chunks.push(`<ul>${listHtml}</ul>`);
    listItems = [];
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      return;
    }

    const headingMatch = line.match(/^(#{1,6})\s*(.+)$/);
    if (headingMatch && headingMatch[2]?.trim()) {
      flushParagraph();
      flushList();
      const level = Math.min(headingMatch[1].length, 6);
      chunks.push(`<h${level}>${renderInline(headingMatch[2].trim())}</h${level}>`);
      return;
    }

    const listMatch = line.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[1].trim());
      return;
    }

    flushList();

    const imageOnly = line.match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/i);
    if (imageOnly) {
      flushParagraph();
      const alt = escapeHtml(imageOnly[1] || '');
      const url = toSafeUrl(imageOnly[2]);
      if (!url) {
        chunks.push(`<p>${escapeHtml(line)}</p>`);
      } else {
        chunks.push(`<p><img class="manager-minute-inline-image" src="${escapeHtml(url)}" alt="${alt}" loading="lazy" /></p>`);
      }
      return;
    }

    paragraphLines.push(line);
  });

  flushParagraph();
  flushList();

  return chunks.join('');
}

function openManagerMinutePublicModal(entry) {
  const modal = document.getElementById('manager-minute-public-modal');
  const title = document.getElementById('manager-minute-public-modal-title');
  const meta = document.getElementById('manager-minute-public-modal-meta');
  const summary = document.getElementById('manager-minute-public-modal-summary');

  if (!modal || !title || !meta || !summary) return;

  title.textContent = entry.title || 'Glasgow In Fact';
  meta.textContent = `Published: ${formatDateTime(entry.liveAt || entry.updatedAt || entry.createdAt)}`;
  summary.innerHTML = renderSimpleMarkdown(entry.content || entry.summary);

  modal.classList.remove('hidden');
}

function closeManagerMinutePublicModal() {
  const modal = document.getElementById('manager-minute-public-modal');
  if (!modal) return;
  modal.classList.add('hidden');
}

function attachManagerMinutePublicModalEvents() {
  const modal = document.getElementById('manager-minute-public-modal');
  const closeButton = document.getElementById('manager-minute-public-modal-close');

  closeButton?.addEventListener('click', () => {
    closeManagerMinutePublicModal();
  });

  modal?.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeManagerMinutePublicModal();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
      closeManagerMinutePublicModal();
    }
  });
}

function renderManagerMinutesPublicPagination(totalPages, totalEntries) {
  const pagination = document.getElementById('manager-minutes-public-pagination');
  if (!pagination) return;

  if (totalPages <= 1) {
    pagination.innerHTML = `<p class="pagination-status">Showing ${totalEntries} entry${totalEntries === 1 ? '' : 'ies'}.</p>`;
    return;
  }

  const currentPage = managerMinutesPublicState.currentPage;
  const previousDisabled = currentPage <= 1 ? 'disabled' : '';
  const nextDisabled = currentPage >= totalPages ? 'disabled' : '';

  pagination.innerHTML = `
    <button type="button" class="button pagination-button" data-public-minute-page="prev" ${previousDisabled}>Previous</button>
    <p class="pagination-status">Page ${currentPage} of ${totalPages} · ${totalEntries} entries</p>
    <button type="button" class="button pagination-button" data-public-minute-page="next" ${nextDisabled}>Next</button>
  `;

  pagination.querySelector('[data-public-minute-page="prev"]')?.addEventListener('click', () => {
    if (managerMinutesPublicState.currentPage <= 1) return;
    managerMinutesPublicState.currentPage -= 1;
    renderManagerMinutes();
  });

  pagination.querySelector('[data-public-minute-page="next"]')?.addEventListener('click', () => {
    if (managerMinutesPublicState.currentPage >= totalPages) return;
    managerMinutesPublicState.currentPage += 1;
    renderManagerMinutes();
  });
}

function renderManagerMinutes() {
  const container = document.getElementById('manager-minutes-public-list');
  const pagination = document.getElementById('manager-minutes-public-pagination');
  if (!container) return;

  const visibleEntries = managerMinutesPublicState.entries.filter(isManagerMinuteVisible);

  if (!visibleEntries.length) {
    container.innerHTML = '<article class="card"><p>No Glasgow In Fact entries are currently live.</p></article>';
    if (pagination) pagination.innerHTML = '';
    managerMinutesPublicState.currentPage = 1;
    return;
  }

  const totalEntries = visibleEntries.length;
  const pageSize = managerMinutesPublicState.pageSize;
  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));
  if (managerMinutesPublicState.currentPage > totalPages) {
    managerMinutesPublicState.currentPage = totalPages;
  }

  const startIndex = (managerMinutesPublicState.currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pageEntries = visibleEntries.slice(startIndex, endIndex);

  container.innerHTML = pageEntries.map((entry) => {
    return `
      <article class="card manager-minute-public-card">
        <p class="eyebrow">Glasgow In Fact</p>
        <h2>${escapeHtml(entry.title)}</h2>
        <p class="manager-minute-public-meta">Published: ${escapeHtml(formatDateTime(entry.liveAt || entry.updatedAt || entry.createdAt))}</p>
        <p>${escapeHtml(getOverviewText(entry.content || entry.summary))}</p>
        <button type="button" class="button manager-minute-more-button" data-manager-minute-id="${escapeHtml(entry.id)}">Click here for more</button>
      </article>
    `;
  }).join('');

  renderManagerMinutesPublicPagination(totalPages, totalEntries);

  container.querySelectorAll('[data-manager-minute-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const entryId = String(button.getAttribute('data-manager-minute-id') || '').trim();
      const entry = pageEntries.find((candidate) => candidate.id === entryId);
      if (!entry) return;
      openManagerMinutePublicModal(entry);
    });
  });
}

async function loadManagerMinutes() {
  const endpoint = String(window.siteConfig?.managerMinutesEndpoint || '').trim();
  const dataUrl = String(window.siteConfig?.managerMinutesDataUrl || '').trim();

  if (endpoint) {
    try {
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`Unable to load Glasgow In Fact entries (${response.status}).`);
      }

      const payload = await response.json();
      managerMinutesPublicState.entries = normalizeManagerMinutes(payload?.entries || payload?.minutes);
      managerMinutesPublicState.currentPage = 1;
      renderManagerMinutes();
      return;
    } catch (error) {
      console.warn(error);
    }
  }

  if (!dataUrl) {
    managerMinutesPublicState.entries = [];
    renderManagerMinutes();
    return;
  }

  try {
    const response = await fetch(dataUrl);
    if (!response.ok) {
      throw new Error(`Unable to load Glasgow In Fact data (${response.status}).`);
    }

    const payload = await response.json();
    managerMinutesPublicState.entries = normalizeManagerMinutes(payload?.entries || payload?.minutes);
    managerMinutesPublicState.currentPage = 1;
    renderManagerMinutes();
  } catch (error) {
    console.warn(error);
    managerMinutesPublicState.entries = [];
    renderManagerMinutes();
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  await loadIncludes();
  attachSiteNavToggle();
  attachManagerMinutePublicModalEvents();
  await loadDevNotification();
  await loadManagerMinutes();
});
