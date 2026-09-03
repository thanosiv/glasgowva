const documentsState = {
  items: [],
  type: "all",
  from: null,
  to: null
};

function labelizeSegment(segment) {
  return String(segment || "")
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function isJsonFile(name) {
  return String(name || "").toLowerCase().trim().endsWith('.json');
}

function isImageFile(name) {
  return /\.(png|jpe?g|gif|svg|webp|bmp|tiff?)$/i.test(String(name || '').trim());
}

function isImagePath(name) {
  return String(name || '').toLowerCase().trim().startsWith('images/');
}

async function fetchGcsDocumentList(bucketName, prefix = "", apiKey, retryWithoutKey = false) {
  const params = new URLSearchParams();
  if (prefix) params.set("prefix", prefix);
  params.set("fields", "items(name,updated)");
  if (apiKey && !retryWithoutKey) params.set("key", apiKey);

  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/o?${params}`;
  console.log('fetchGcsDocumentList URL:', url, { retryWithoutKey });
  const response = await fetch(url);

  if ((response.status === 401 || response.status === 403) && apiKey && !retryWithoutKey) {
    console.warn('GCS API key unauthorized or forbidden; retrying without API key');
    return fetchGcsDocumentList(bucketName, prefix, "", true);
  }

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Unable to list bucket ${bucketName}: ${response.status} ${details}`);
  }

  const data = await response.json();
  if (!Array.isArray(data.items)) return [];

  return data.items
    .filter((item) => item.name && !item.name.endsWith("/") && !isJsonFile(item.name) && !isImageFile(item.name) && !isImagePath(item.name))
    .map((item) => {
      const pathParts = String(item.name).split("/").filter(Boolean);
      const rawName = pathParts[pathParts.length - 1] || item.name;
      const name = rawName.replace(/\.[^.]+$/, "");
      const typePath = pathParts.length > 1 ? pathParts.slice(0, -1).map(labelizeSegment).join(" > ") : "General";
      const parsedDate = parseDocumentDate(name) || parseDocumentDate(item.name) || null;
      const url = `https://storage.googleapis.com/${encodeURIComponent(bucketName)}/${pathParts.map(encodeURIComponent).join("/")}`;

      return {
        name: labelizeSegment(name),
        url,
        typePath,
        typeLabel: typePath,
        date: parsedDate,
        dateLabel: parsedDate ? parsedDate.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "Unknown"
      };
    });
}

async function fetchDocumentsFromApi(apiEndpoint, prefix = "") {
  const endpoint = String(apiEndpoint || "").trim();
  if (!endpoint) return [];

  const params = new URLSearchParams();
  params.set("action", "list");
  if (prefix) params.set("prefix", prefix);

  const connector = endpoint.includes("?") ? "&" : "?";
  const response = await fetch(`${endpoint}${connector}${params.toString()}`);
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Unable to load documents API: ${response.status} ${details}`);
  }

  const payload = await response.json();
  return Array.isArray(payload.documents)
    ? payload.documents.map((item) => {
        const parsedDate = parseDocumentDate(item.date) || parseDocumentDate(item.name) || null;
        const hasUsableDateLabel = String(item.dateLabel || "").trim() && String(item.dateLabel || "").trim().toLowerCase() !== "unknown";
        return {
          ...item,
          date: parsedDate,
          typePath: item.typePath || item.typeLabel || "General",
          typeLabel: item.typeLabel || item.typePath || "General",
          dateLabel: hasUsableDateLabel
            ? item.dateLabel
            : parsedDate?.toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric"
              }) || "Unknown"
        };
      })
    : [];
}

const manifestUrl = "assets/documents/document-index.json";

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
      <a href="index.html#events">Events</a>
      <a href="council.html">Council</a>
      <a href="index.html#contact">Contact</a>
      <a href="https://glasgowutilities.qpaybill.com/Start.aspx" target="_blank" rel="noopener noreferrer">Pay Bill</a>
      <a href="dashboard.html">Admin</a>
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

document.addEventListener("DOMContentLoaded", async () => {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  await loadIncludes();
  await loadDevNotification();
  attachNavToggle();
  applyCurrentYearDefaults();
  await loadDocumentManifest();
  attachDocumentFilters();
  renderDocumentList();
});

function getCurrentYearRange() {
  const year = new Date().getFullYear();
  const pad = (value) => String(value).padStart(2, "0");
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`
  };
}

function applyCurrentYearDefaults() {
  const { from, to } = getCurrentYearRange();
  const fromInput = document.getElementById("from-date");
  const toInput = document.getElementById("to-date");
  if (fromInput) fromInput.value = from;
  if (toInput) toInput.value = to;
  documentsState.from = from;
  documentsState.to = to;
}

function attachNavToggle() {
  const navToggle = document.querySelector(".nav-toggle");
  const siteNav = document.getElementById("site-nav");
  if (!navToggle || !siteNav) return;

  navToggle.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  siteNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      siteNav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

function normalizeDevNotification(payload) {
  const source = payload && typeof payload === "object" && payload.notification && typeof payload.notification === "object"
    ? payload.notification
    : payload;

  return {
    enabled: source?.enabled !== false,
    message: String(source?.message || "").trim(),
    startsAt: String(source?.startsAt || "").trim(),
    endsAt: String(source?.endsAt || "").trim()
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
  const wrapper = document.getElementById("site-dev-notification");
  const message = document.getElementById("site-dev-notification-message");
  if (!wrapper || !message) return;

  if (!isDevNotificationActive(notification)) {
    wrapper.classList.add("hidden");
    message.textContent = "";
    return;
  }

  message.textContent = notification.message;
  wrapper.classList.remove("hidden");
}

async function loadDevNotification() {
  const endpoint = String(window.siteConfig?.devNotificationEndpoint || "").trim();
  const dataUrl = String(window.siteConfig?.devNotificationDataUrl || "").trim();
  const source = endpoint || dataUrl;

  if (!source) {
    renderDevNotification({ enabled: false, message: "" });
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
    console.warn("Unable to load dev notification:", error.message);
    renderDevNotification({ enabled: false, message: "" });
  }
}

async function loadDocumentManifest() {
  const documentsApiEndpoint = String(window.siteConfig?.documentsApiEndpoint || "").trim();
  const gcsBucket = window.siteConfig?.googleStorageBucket;
  const gcsPrefix = window.siteConfig?.googleStoragePrefix || "";
  const apiKey = window.siteConfig?.googleApiKey;
  const manifestUrl = window.siteConfig?.documentIndexUrl || "assets/documents/document-index.json";

  try {
    let items = [];
    if (documentsApiEndpoint) {
      items = await fetchDocumentsFromApi(documentsApiEndpoint, gcsPrefix);
    } else if (gcsBucket) {
      items = await fetchGcsDocumentList(gcsBucket, gcsPrefix, apiKey);
    } else {
      const response = await fetch(manifestUrl);
      if (!response.ok) throw new Error("Unable to load document manifest");
      const data = await response.json();
      items = normalizeDocumentItems(data.documents || []);
    }
    documentsState.items = items;
    populateTypeFilter();
  } catch (error) {
    const list = document.getElementById("document-list");
    const summary = document.getElementById("document-summary");
    if (summary) summary.textContent = "Unable to load documents.";
    if (list) list.innerHTML = `<li>${escapeHtml(error.message)}</li>`;
  }
}

function normalizeDocumentItems(items) {
  const labelize = (segment) =>
    String(segment || "")
      .trim()
      .replace(/[-_]+/g, " ")
      .replace(/\b([a-z])/g, (match) => match.toUpperCase());

  return items
    .filter((item) => {
      const fileKey = item.path || item.name;
      return !isJsonFile(fileKey) && !isImageFile(fileKey) && !isImagePath(fileKey);
    })
    .map((item) => {
      let parsedDate = parseDocumentDate(item.date);
      if (!parsedDate) {
        parsedDate = parseDocumentDate(item.name) || parseDocumentDate(item.path);
      }
    const rawType = String(item.type || "").trim();
    const pathSegments = String(item.path || "")
      .split("/")
      .map(labelize)
      .filter(Boolean);
    const typeSegments = rawType
      .replace(/\\/g, "/")
      .split("/")
      .map(labelize)
      .filter(Boolean);

    let typeLabel = "General";
    if (typeSegments.length > 1) {
      typeLabel = typeSegments.join(" > ");
    } else if (typeSegments.length === 1) {
      const typeName = typeSegments[0];
      if (pathSegments.length > 1 && pathSegments[0].toLowerCase() === typeName.toLowerCase()) {
        typeLabel = [typeName, pathSegments[1]].join(" > ");
      } else {
        typeLabel = typeName;
      }
    } else if (pathSegments.length > 1) {
      typeLabel = pathSegments.slice(0, 2).join(" > ");
    }

    return {
      name: item.name,
      url: `assets/documents/${item.path}`,
      typePath: typeLabel,
      typeLabel,
      date: parsedDate || null,
      dateLabel: parsedDate ? parsedDate.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "Unknown"
    };
  });
}

function parseDocumentDate(value) {
  if (!value) return null;
  const text = String(value).trim();

  // Prefer explicit full dates like 2024-07-15, 2024_07_15, 2024.07.15
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

  // Handle US-style dates like 10/17/2019 or 10.17.2019 or 10-17-2019
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

  // Handle textual dates like April 10 2018 or 10 April 2018
  const monthNames = "January|February|March|April|May|June|July|August|September|October|November|December";
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

  // Fallback to year-only strings, defaulting to January 1 of that year.
  const yearMatch = text.match(/(?:^|[^0-9])((?:19|20)\d{2})(?:$|[^0-9])/);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    if (year) {
      const januaryFirst = new Date(year, 0, 1);
      if (!Number.isNaN(januaryFirst.getTime())) return januaryFirst;
    }
  }

  // Browser parse fallback.
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseLocalDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function populateTypeFilter() {
  const typeSelect = document.getElementById("document-type");
  if (!typeSelect) return;
  // Only include type paths that actually have files (i.e. exact typePath values)
  const types = [...new Set(documentsState.items.map((item) => item.typePath))].sort();

  // Reset the select but keep the default "all" option if present in markup
  typeSelect.innerHTML = '<option value="all">All document types</option>';

  types.forEach((type) => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type;
    typeSelect.appendChild(option);
  });
}

function attachDocumentFilters() {
  const typeSelect = document.getElementById("document-type");
  const fromInput = document.getElementById("from-date");
  const toInput = document.getElementById("to-date");
  const applyButton = document.getElementById("apply-filters");
  const clearButton = document.getElementById("clear-filters");

  if (typeSelect) {
    typeSelect.addEventListener("change", () => {
      documentsState.type = typeSelect.value;
      renderDocumentList();
    });
  }

  if (fromInput) {
    fromInput.addEventListener("change", () => {
      documentsState.from = fromInput.value || null;
      renderDocumentList();
    });
  }

  if (toInput) {
    toInput.addEventListener("change", () => {
      documentsState.to = toInput.value || null;
      renderDocumentList();
    });
  }

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      if (typeSelect) typeSelect.value = "all";
      if (fromInput) fromInput.value = "";
      if (toInput) toInput.value = "";
      documentsState.type = "all";
      documentsState.from = null;
      documentsState.to = null;
      renderDocumentList();
    });
  }
}

function renderDocumentList() {
  const list = document.getElementById("document-list");
  const summary = document.getElementById("document-summary");
  if (!list || !summary) return;

  const filtered = documentsState.items.filter((item) => {
    if (documentsState.type !== "all" && item.typePath !== documentsState.type) return false;
    if (documentsState.from) {
      const fromDate = parseLocalDate(documentsState.from);
      if (!item.date || item.date < fromDate) return false;
    }
    if (documentsState.to) {
      const toDate = parseLocalDate(documentsState.to);
      if (!item.date || item.date > toDate) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    const aTime = a.date instanceof Date ? a.date.getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.date instanceof Date ? b.date.getTime() : Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime - bTime;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  summary.textContent = `${filtered.length} document${filtered.length === 1 ? "" : "s"} found`;

  if (filtered.length === 0) {
    list.innerHTML = `<li>No documents match the selected filters.</li>`;
    return;
  }

  list.innerHTML = filtered
    .map((item) => {
      return `
        <li class="document-row">
          <a href="${item.url}" target="_blank" rel="noreferrer noopener">${escapeHtml(item.name)}</a>
          <div class="document-meta">
            <span class="document-type">${escapeHtml(item.typeLabel)}</span>
            <span class="document-date">${escapeHtml(item.dateLabel)}</span>
          </div>
        </li>
      `;
    })
    .join("");
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
