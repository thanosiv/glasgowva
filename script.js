const calendarState = {
  events: [],
  filter: "all",
  from: null,
  to: null,
  activeMonth: null,
  requestId: 0
};

const publicNoticesState = {
  notices: [],
  activeIndex: 0
};

let googleTokenClient = null;
let googleAccessToken = null;

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

function ensureGoogleTokenClient() {
  return new Promise((resolve, reject) => {
    if (!window.google || !google.accounts || !google.accounts.oauth2 || !window.siteConfig?.googleClientId) {
      return resolve(false);
    }

    if (!googleTokenClient) {
      googleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: window.siteConfig.googleClientId,
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
        callback: (resp) => {
          if (resp && !resp.error) {
            googleAccessToken = resp.access_token;
          }
        }
      });
    }

    resolve(true);
  });
}

function requestGoogleAccessToken() {
  return new Promise(async (resolve, reject) => {
    const ok = await ensureGoogleTokenClient();
    if (!ok) return reject(new Error('Google Identity Services not available'));

    // attach a one-time callback to resolve the promise
    googleTokenClient.callback = (resp) => {
      if (resp.error) return reject(resp);
      googleAccessToken = resp.access_token;
      resolve(resp);
    };

    try {
      googleTokenClient.requestAccessToken({ prompt: '' });
    } catch (e) {
      reject(e);
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  await loadIncludes();
  await loadDevNotification();

  const navToggle = document.querySelector(".nav-toggle");
  const siteNav = document.getElementById("site-nav");

  if (navToggle && siteNav) {
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

  attachCalendarControls();
  initializeCalendarDefaults();
  attachMonthPickerControl();
  attachEventModalHandlers();
  populateDocuments();
  populateCalendar();
  populateVideos();
  loadPublicNotices();
});

function initializeCalendarDefaults() {
  const today = new Date();
  calendarState.activeMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const { fromDate, toDate } = getActiveMonthRange();

  calendarState.from = fromDate;
  calendarState.to = toDate;

  const fromInput = document.getElementById("from-date");
  const toInput = document.getElementById("to-date");
  const monthPicker = document.getElementById("events-month-picker");
  if (fromInput) fromInput.value = calendarState.from;
  if (toInput) toInput.value = calendarState.to;
  if (monthPicker) monthPicker.value = calendarState.activeMonth;
}

function attachMonthPickerControl() {
  const monthPicker = document.getElementById("events-month-picker");
  if (!monthPicker) return;

  monthPicker.addEventListener("change", async () => {
    if (!monthPicker.value) return;
    calendarState.activeMonth = monthPicker.value;
    await populateCalendar();
  });
}

function attachEventModalHandlers() {
  const modal = document.getElementById("event-details-modal");
  const closeButton = document.getElementById("event-modal-close");
  if (!modal || !closeButton) return;

  closeButton.addEventListener("click", closeEventModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeEventModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) {
      closeEventModal();
    }
  });
}

function formatDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function populateDocuments() {
  const docList = document.getElementById("doc-list");
  if (!docList) return;

  const docs = [
    { name: "FY 26-27 Adopted Budget", href: "./assets/documents/fy-26-27-adopted-budget.txt" },
    { name: "Town Council Minutes", href: "./assets/documents/town-council-minutes.txt" },
    { name: "Annual Water Quality Report", href: "./assets/documents/annual-water-quality-report.txt" }
  ];

  docList.innerHTML = docs
    .map((doc) => `<li><a href="${doc.href}" target="_blank" rel="noreferrer">${doc.name}</a></li>`)
    .join("");
}

function attachCalendarControls() {
  document.querySelectorAll("[data-calendar-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.calendarFilter || "all";
      if (filter === "clear") {
        clearCalendarFilters();
        return;
      }
      calendarState.filter = filter;
      updateCalendarFilterButtons();
      renderCalendar();
    });
  });

  const applyButton = document.getElementById("calendar-apply");
  const fromInput = document.getElementById("from-date");
  const toInput = document.getElementById("to-date");

  if (applyButton) {
    applyButton.addEventListener("click", () => {
      calendarState.from = fromInput?.value || null;
      calendarState.to = toInput?.value || null;
      renderCalendar();
    });
  }
}

function clearCalendarFilters() {
  calendarState.filter = "all";
  calendarState.from = null;
  calendarState.to = null;
  const fromInput = document.getElementById("from-date");
  const toInput = document.getElementById("to-date");
  if (fromInput) fromInput.value = "";
  if (toInput) toInput.value = "";
  updateCalendarFilterButtons();
  renderCalendar();
}

async function populateCalendar() {
  const currentRequestId = ++calendarState.requestId;
  const monthStatus = document.getElementById("events-calendar-status");
  const monthPicker = document.getElementById("events-month-picker");
  const { fromDate, toDate } = getActiveMonthRange();

  calendarState.from = fromDate;
  calendarState.to = toDate;

  if (monthStatus) {
    monthStatus.textContent = "Loading events for selected month...";
  }
  if (monthPicker) {
    monthPicker.disabled = true;
  }

  try {
    const normalized = await loadCalendarItemsForMonth(fromDate, toDate);
    if (currentRequestId !== calendarState.requestId) return;

    calendarState.events = normalized;
    if (currentRequestId !== calendarState.requestId) return;
    renderCalendar();
  } catch (err) {
    if (currentRequestId !== calendarState.requestId) return;
    console.error('Failed to load calendar events:', err.message);
    calendarState.events = [];
    renderCalendar();
  } finally {
    if (currentRequestId === calendarState.requestId && monthPicker) {
      monthPicker.disabled = false;
    }
  }
}

async function loadCalendarItemsForMonth(fromDate, toDate) {
  const apiUrl = window.siteConfig?.eventsApiUrl;
  if (!apiUrl) {
    throw new Error("Google events endpoint is not configured.");
  }

  const requestUrl = new URL(apiUrl, window.location.origin);
  if (calendarState.activeMonth) {
    requestUrl.searchParams.set("month", calendarState.activeMonth);
  }
  if (fromDate) {
    requestUrl.searchParams.set("from", fromDate);
    requestUrl.searchParams.set("timeMin", `${fromDate}T00:00:00Z`);
  }
  if (toDate) {
    requestUrl.searchParams.set("to", toDate);
    requestUrl.searchParams.set("timeMax", `${toDate}T23:59:59Z`);
  }

  const response = await fetch(requestUrl.toString());
  if (!response.ok) throw new Error(`Events fetch failed: ${response.status}`);
  const data = await response.json();
  const items = Array.isArray(data.items) ? data.items : [];

  return items.map((item, index) => normalizeCalendarItem({
    id: item.id,
    title: item.summary,
    startDateTime: item.start?.dateTime,
    startDate: item.start?.date,
    location: item.location,
    description: item.description,
    eventLabelId: item.eventLabelId,
    videoUrl: item.videoUrl,
    agendaUrl: item.agendaUrl || null
  }, index));
}

function renderCalendar() {
  if (document.getElementById("events-calendar-grid")) {
    renderMonthCalendar();
    return;
  }

  renderLegacyCalendarLists();
}

function getActiveMonthRange() {
  if (!calendarState.activeMonth) {
    const today = new Date();
    const fallback = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    calendarState.activeMonth = fallback;
  }

  const [yearString, monthString] = calendarState.activeMonth.split("-");
  const year = Number(yearString);
  const monthIndex = Number(monthString) - 1;
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);

  return {
    fromDate: formatDateInputValue(firstDay),
    toDate: formatDateInputValue(lastDay)
  };
}

function normalizeCalendarItem(item, index) {
  const MEETING_LABEL_ID = 'f1aaf7fe-fcf4-498d-b190-0546d65dbf5a';
  const EVENT_LABEL_ID = '2957bade-5f88-438b-905f-f11a0d9e60c8';

  const startDateValue = extractDatePortion(item.startDateTime || item.startDate || "");
  const date = normalizeDateString(startDateValue);

  let time = item.time || "";
  if (!time) {
    if (item.startDateTime) {
      try {
        time = new Date(item.startDateTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      } catch {
        time = "";
      }
    } else {
      time = "All day";
    }
  }

  const title = item.title || "Event";
  const location = item.location || "";
  const rawDescription = item.description || "";
  const videoUrl = item.videoUrl || extractVideoUrl(rawDescription) || null;
  const description = cleanEventDescription(rawDescription, videoUrl);
  const agendaUrl = item.agendaUrl || null;

  let type = item.type;
  if (!type) {
    if (item.eventLabelId === MEETING_LABEL_ID) {
      type = "meeting";
    } else if (item.eventLabelId === EVENT_LABEL_ID) {
      type = "event";
    } else {
      const searchText = `${title} ${description}`.toLowerCase();
      type = /\b(meeting|council|session|commission)\b/.test(searchText) ? "meeting" : "event";
    }
  }

  type = String(type).toLowerCase() === "meeting" ? "meeting" : "event";

  return {
    id: item.id || `${date || "event"}-${index}`,
    title,
    date,
    time,
    location,
    description,
    type,
    videoUrl,
    agendaUrl
  };
}

function extractDatePortion(dateValue) {
  const value = String(dateValue || "").trim();
  if (!value) return "";
  if (value.length >= 10 && value[4] === "-" && value[7] === "-") {
    return value.slice(0, 10);
  }
  return value;
}

function extractVideoUrl(text) {
  if (!text) return null;
  const explicitPattern = /(?:^|\n)\s*(?:video|recording|watch)\s*:\s*(https?:\/\/\S+)/i;
  const explicitMatch = String(text).match(explicitPattern);
  if (explicitMatch && explicitMatch[1]) {
    return explicitMatch[1].trim();
  }

  const patterns = [
    /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[\w-]+(?:[&?][^\s]*)?/i,
    /https?:\/\/youtu\.be\/[\w-]+(?:[?][^\s]*)?/i,
    /https?:\/\/(?:www\.)?facebook\.com\/reel\/\d+(?:[?][^\s]*)?/i,
    /https?:\/\/(?:www\.)?facebook\.com\/watch\/\?v=\d+(?:[&][^\s]*)?/i,
    /https?:\/\/(?:www\.)?facebook\.com\/[^\s]+\/videos\/\d+(?:[?][^\s]*)?/i
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

function cleanEventDescription(text, videoUrl) {
  if (!text) return "";

  const cleanedText = String(text)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ");

  const lines = cleanedText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !isVideoReferenceLine(line, videoUrl));

  return lines.join("\n").trim();
}

function isVideoReferenceLine(line, videoUrl) {
  const explicitVideoLabel = /^(video|recording|watch)\s*:/i;
  const mediaLinkPattern = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|facebook\.com\/(?:reel\/\d+|watch\/\?v=\d+|[^\s]+\/videos\/\d+))/i;

  if (explicitVideoLabel.test(line)) return true;
  if (mediaLinkPattern.test(line)) return true;

  if (videoUrl) {
    const normalizedLine = normalizeUrlForCompare(line);
    const normalizedVideoUrl = normalizeUrlForCompare(videoUrl);
    if (normalizedLine && normalizedLine === normalizedVideoUrl) {
      return true;
    }
  }

  return false;
}

function normalizeUrlForCompare(value) {
  return String(value || "")
    .trim()
    .replace(/^<+|>+$/g, "")
    .replace(/[),.;!?]+$/g, "")
    .replace(/\/+$/g, "")
    .toLowerCase();
}

function renderMonthCalendar() {
  const grid = document.getElementById("events-calendar-grid");
  const monthTitle = document.getElementById("events-calendar-title");
  const monthStatus = document.getElementById("events-calendar-status");
  if (!grid || !calendarState.activeMonth) return;

  const [yearString, monthString] = calendarState.activeMonth.split("-");
  const year = Number(yearString);
  const monthIndex = Number(monthString) - 1;
  if (Number.isNaN(year) || Number.isNaN(monthIndex)) return;

  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingDays = firstDay.getDay();
  const totalCells = Math.ceil((leadingDays + daysInMonth) / 7) * 7;
  const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}-`;
  const monthEvents = calendarState.events.filter((item) => normalizeDateString(item.date).startsWith(monthPrefix));

  if (monthTitle) {
    monthTitle.textContent = firstDay.toLocaleDateString([], { month: "long", year: "numeric" });
  }

  if (monthStatus) {
    if (monthEvents.length > 0) {
      const noun = monthEvents.length === 1 ? "item" : "items";
      monthStatus.textContent = `${monthEvents.length} ${noun} scheduled this month.`;
    } else {
      const upcoming = getNextUpcomingEventFromDate(new Date(year, monthIndex, 1));
      monthStatus.textContent = upcoming
        ? `No items scheduled this month. Next: ${upcoming.title} on ${formatDisplayDate(upcoming.date)}.`
        : "No items scheduled this month.";
    }
  }

  let html = "";
  for (let cellIndex = 0; cellIndex < totalCells; cellIndex += 1) {
    const dayNumber = cellIndex - leadingDays + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      html += '<div class="calendar-day calendar-day--outside" aria-hidden="true"></div>';
      continue;
    }

    const dateKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
    const dayEvents = calendarState.events
      .filter((item) => normalizeDateString(item.date) === dateKey)
      .sort((a, b) => compareEventTimes(a.time, b.time));

    const itemsHtml = dayEvents.length
      ? dayEvents
        .map((item) => {
          const itemType = item.type === "meeting" ? "meeting" : "event";
          return `<button type="button" class="calendar-item calendar-item--${itemType}" data-event-id="${escapeHtml(item.id)}">${escapeHtml(item.title)}</button>`;
        })
        .join("")
      : "";

    html += `<div class="calendar-day" role="listitem"><p class="calendar-date-label">${dayNumber}</p><div class="calendar-day-items">${itemsHtml}</div></div>`;
  }

  grid.innerHTML = html;
  grid.querySelectorAll(".calendar-item").forEach((button) => {
    button.addEventListener("click", () => {
      const eventId = button.getAttribute("data-event-id");
      const selected = calendarState.events.find((item) => item.id === eventId);
      if (!selected) return;
      openEventModal(selected);
    });
  });
}

function getNextUpcomingEventFromDate(startDate) {
  const normalizedStart = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const sorted = [...calendarState.events]
    .map((item) => ({ ...item, normalizedDate: normalizeDateString(item.date) }))
    .filter((item) => item.normalizedDate)
    .sort((a, b) => a.normalizedDate.localeCompare(b.normalizedDate));

  for (const eventItem of sorted) {
    const [year, month, day] = eventItem.normalizedDate.split("-").map(Number);
    const eventDate = new Date(year, month - 1, day);
    if (eventDate >= normalizedStart) {
      return eventItem;
    }
  }

  return null;
}

async function openEventModal(eventItem) {
  const modal = document.getElementById("event-details-modal");
  const title = document.getElementById("event-modal-title");
  const date = document.getElementById("event-modal-date");
  const time = document.getElementById("event-modal-time");
  const type = document.getElementById("event-modal-type");
  const location = document.getElementById("event-modal-location");
  const description = document.getElementById("event-modal-description");
  const agendaWrap = document.getElementById("event-modal-agenda-wrap");
  const agenda = document.getElementById("event-modal-agenda");
  const videoWrap = document.getElementById("event-modal-video-wrap");
  const video = document.getElementById("event-modal-video");

  if (!modal || !title || !date || !time || !type || !location || !description || !agendaWrap || !agenda || !videoWrap || !video) return;

  title.textContent = eventItem.title || "Untitled event";
  date.textContent = formatDisplayDate(eventItem.date);
  time.textContent = eventItem.time || "Not provided";
  type.textContent = eventItem.type === "meeting" ? "Meeting" : "Event";
  location.textContent = eventItem.location || "Not provided";
  const descriptionText = String(eventItem.description || "").trim();
  const descriptionRow = description.parentElement;
  if (descriptionText) {
    description.textContent = descriptionText;
    descriptionRow?.classList.remove("hidden");
  } else {
    description.textContent = "";
    descriptionRow?.classList.add("hidden");
  }

  agendaWrap.classList.add("hidden");
  const agendaUrl = await loadAgendaUrlForModal(eventItem);
  if (agendaUrl) {
    agenda.href = agendaUrl;
    agendaWrap.classList.remove("hidden");
  }

  if (eventItem.videoUrl) {
    video.href = eventItem.videoUrl;
    videoWrap.classList.remove("hidden");
  } else {
    videoWrap.classList.add("hidden");
  }

  modal.classList.remove("hidden");
}

function closeEventModal() {
  const modal = document.getElementById("event-details-modal");
  if (!modal) return;
  modal.classList.add("hidden");
}

function formatDisplayDate(dateString) {
  const normalized = normalizeDateString(dateString);
  if (!normalized) return "Not provided";
  const [year, month, day] = normalized.split("-").map((part) => Number(part));
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function normalizeDateString(dateString) {
  if (!dateString) return "";
  const value = String(dateString).trim();

  const plainDate = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (plainDate) {
    return `${plainDate[1]}-${plainDate[2].padStart(2, "0")}-${plainDate[3].padStart(2, "0")}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

const agendaLookupCache = new Map();

async function loadAgendaUrlForModal(eventItem) {
  if (!eventItem) return null;

  const normalizedDate = normalizeDateString(eventItem.date);
  if (!normalizedDate) return null;

  const cacheKey = `${eventItem.id || "unknown"}:${normalizedDate}`;
  if (agendaLookupCache.has(cacheKey)) {
    return agendaLookupCache.get(cacheKey);
  }

  const resolvedUrl = await fetchAgendaUrlFromDocumentsApi(normalizedDate);
  agendaLookupCache.set(cacheKey, resolvedUrl);
  return resolvedUrl;
}

function normalizeStoragePrefix(prefix) {
  const cleaned = String(prefix || "").trim().replace(/^\/+/, "");
  if (!cleaned) return "";
  return cleaned.endsWith("/") ? cleaned : `${cleaned}/`;
}

async function fetchAgendaUrlFromDocumentsApi(normalizedDate, retryWithoutKey = false) {
  const documentsApiEndpoint = String(window.siteConfig?.documentsApiEndpoint || "").trim();
  if (documentsApiEndpoint) {
    try {
      const params = new URLSearchParams();
      params.set("action", "agenda");
      params.set("date", normalizedDate);
      const connector = documentsApiEndpoint.includes("?") ? "&" : "?";
      const response = await fetch(`${documentsApiEndpoint}${connector}${params.toString()}`);
      if (response.ok) {
        const payload = await response.json();
        return payload?.url ? String(payload.url) : null;
      }
    } catch {
      // Fall through to legacy direct GCS listing path.
    }
  }

  const bucketName = window.siteConfig?.googleAgendaStorageBucket
    || window.siteConfig?.googleStorageBucket
    || "glasgow-va";
  const agendaPrefix = normalizeStoragePrefix(
    window.siteConfig?.googleAgendaStoragePrefix
      || "council/agendas/"
  );
  const apiKey = window.siteConfig?.googleApiKey || "";

  const baseFileName = `agenda_${normalizedDate}`;
  const objectPrefix = `${agendaPrefix}${baseFileName}`;

  const params = new URLSearchParams();
  params.set("prefix", objectPrefix);
  params.set("fields", "items(name)");
  if (apiKey && !retryWithoutKey) params.set("key", apiKey);

  const requestUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/o?${params}`;

  try {
    const response = await fetch(requestUrl);
    if ((response.status === 401 || response.status === 403) && apiKey && !retryWithoutKey) {
      return fetchAgendaUrlFromDocumentsApi(normalizedDate, true);
    }

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];

    // Prefer exact date stem matches and allow any extension/suffix.
    const exactStemPattern = new RegExp(`(^|/)${baseFileName}(?:[._-]|\\.|$)`, "i");
    const matched = items.find((item) => {
      const name = String(item?.name || "");
      if (!name || name.endsWith("/")) return false;
      return exactStemPattern.test(name);
    });

    if (!matched) return null;

    const matchedPath = String(matched.name || "").replace(/^\/+/, "");
    const encodedPath = matchedPath.split("/").map(encodeURIComponent).join("/");
    return `https://storage.googleapis.com/${encodeURIComponent(bucketName)}/${encodedPath}`;
  } catch {
    return null;
  }
}

function compareEventTimes(firstTime, secondTime) {
  const firstDate = parseTimeString(firstTime);
  const secondDate = parseTimeString(secondTime);
  if (!firstDate && !secondDate) return 0;
  if (!firstDate) return 1;
  if (!secondDate) return -1;
  return firstDate - secondDate;
}

function parseTimeString(value) {
  if (!value || String(value).toLowerCase() === "all day") return null;
  const baseDate = new Date();
  const parsed = new Date(`${baseDate.toDateString()} ${value}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function filterCalendarItems(type) {
  const fromDate = calendarState.from ? new Date(calendarState.from) : null;
  const toDate = calendarState.to ? new Date(calendarState.to) : null;

  return calendarState.events.filter((item) => {
    const itemType = item.type || "event";
    if (calendarState.filter === "meeting" && itemType !== "meeting") return false;
    if (calendarState.filter === "event" && itemType !== "event") return false;
    if (type && itemType !== type) return false;

    if (fromDate || toDate) {
      const itemDate = new Date(item.date);
      if (fromDate && itemDate < fromDate) return false;
      if (toDate && itemDate > toDate) return false;
    }

    return true;
  });
}

function fillList(elementId, items, emptyText) {
  const list = document.getElementById(elementId);
  if (!list) return;

  if (!items || items.length === 0) {
    list.innerHTML = `<li>${emptyText}</li>`;
    return;
  }

  const today = new Date();
  list.innerHTML = items
    .map((event) => {
      const itemDate = new Date(event.date);
      const isPast = itemDate < today;
      const hasVideo = event.videoUrl && event.videoUrl.trim().length > 0;
      const title = hasVideo && isPast ? `<a href="${event.videoUrl}" target="_blank" rel="noreferrer">${escapeHtml(event.title)}</a>` : escapeHtml(event.title);
      const agendaLink = event.agendaUrl ? `<br /><a href="${event.agendaUrl}" target="_blank" rel="noreferrer noopener">View agenda document</a>` : "";
      return `<li><strong>${title}</strong><br />${event.date} • ${event.time}<br />${escapeHtml(event.location)}${agendaLink}${isPast && hasVideo ? '<br /><small>Recording available</small>' : ""}</li>`;
    })
    .join("");
}

function updateCalendarFilterBadgeCounts() {
  const allCount = calendarState.events.filter(filterByDateRange).length;
  const meetingCount = calendarState.events.filter((item) => item.type === "meeting" && filterByDateRange(item)).length;
  const eventCount = calendarState.events.filter((item) => item.type === "event" && filterByDateRange(item)).length;

  document.querySelectorAll("[data-calendar-filter]").forEach((button) => {
    const filter = button.dataset.calendarFilter;
    if (!filter || filter === "clear") return;
    const label = button.dataset.label || button.textContent.trim();
    let count = 0;

    switch (filter) {
      case "meeting":
        count = meetingCount;
        break;
      case "event":
        count = eventCount;
        break;
      case "all":
        count = allCount;
        break;
    }

    button.innerHTML = `${label} <span class="filter-badge">${count}</span>`;
    button.classList.toggle("has-count", true);
  });
}

function filterByDateRange(item) {
  const fromDate = calendarState.from ? new Date(calendarState.from) : null;
  const toDate = calendarState.to ? new Date(calendarState.to) : null;
  const itemDate = new Date(item.date);

  if (fromDate && itemDate < fromDate) return false;
  if (toDate && itemDate > toDate) return false;
  return true;
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function updateCalendarFilterButtons() {
  document.querySelectorAll("[data-calendar-filter]").forEach((button) => {
    const isActive = button.dataset.calendarFilter === calendarState.filter;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

async function populateVideos() {
  const container = document.getElementById("video-list");
  if (!container) return;

  try {
    const response = await fetch(window.siteConfig?.videoDataUrl || "./assets/videos/videos.json");
    if (!response.ok) throw new Error("Unable to load video data");
    const videos = await response.json();

    if (!videos || videos.length === 0) {
      container.innerHTML = `<div class="video-card"><p>No videos available yet.</p></div>`;
      return;
    }

    container.innerHTML = videos
      .map((video) => {
        const url = video.videoId ? `https://www.youtube.com/watch?v=${video.videoId}` : "#";
        return `<div class="video-card"><strong>${video.title}</strong><p>${video.description}</p><p><a href="${url}" target="_blank" rel="noreferrer">Watch on YouTube</a></p></div>`;
      })
      .join("");
  } catch (error) {
    container.innerHTML = `<div class="video-card"><p>${error.message}</p></div>`;
  }
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

function normalizePublicNoticeStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "draft" || normalized === "scheduled" || normalized === "published") {
    return normalized;
  }
  return "draft";
}

function normalizePublicNotices(payload) {
  const items = Array.isArray(payload?.notices)
    ? payload.notices
    : Array.isArray(payload)
      ? payload
      : [];

  return items
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: String(item.id || "").trim(),
      title: String(item.title || "").trim(),
      summary: String(item.summary || "").trim(),
      body: String(item.body || "").trim(),
      category: String(item.category || "General Notice").trim(),
      status: normalizePublicNoticeStatus(item.status),
      publishAt: String(item.publishAt || "").trim(),
      expiresAt: String(item.expiresAt || "").trim(),
      createdAt: String(item.createdAt || "").trim(),
      updatedAt: String(item.updatedAt || "").trim()
    }))
    .filter((item) => item.title)
    .sort((left, right) => {
      const leftTime = Date.parse(left.publishAt || left.updatedAt || left.createdAt || 0);
      const rightTime = Date.parse(right.publishAt || right.updatedAt || right.createdAt || 0);
      return rightTime - leftTime;
    });
}

function isPublicNoticeVisible(notice) {
  const now = Date.now();

  if (notice.status === "draft") return false;

  if (notice.publishAt) {
    const publishAt = Date.parse(notice.publishAt);
    if (!Number.isNaN(publishAt) && publishAt > now) return false;
  }

  if (notice.expiresAt) {
    const expiresAt = Date.parse(notice.expiresAt);
    if (!Number.isNaN(expiresAt) && expiresAt <= now) return false;
  }

  return true;
}

function formatNoticeDate(value) {
  const text = String(value || "").trim();
  if (!text) return "Not scheduled";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function renderNoticeSummary(value) {
  const text = String(value || "").trim();
  if (!text) return "No summary provided.";
  return escapeHtml(text)
    .replace(/\r\n/g, "\n")
    .replace(/\n\n+/g, "<br><br>")
    .replace(/\n/g, "<br>");
}

function renderPublicNoticeCarousel() {
  const slide = document.getElementById("public-notice-slide");
  const meta = document.getElementById("public-notices-meta");
  const dots = document.getElementById("public-notices-dots");
  const prevButton = document.getElementById("public-notices-prev");
  const nextButton = document.getElementById("public-notices-next");

  if (!slide || !meta || !dots || !prevButton || !nextButton) return;

  const visibleNotices = publicNoticesState.notices.filter(isPublicNoticeVisible);

  if (!visibleNotices.length) {
    slide.innerHTML = "<h3>No active public notices</h3><p>There are no currently published notices.</p>";
    meta.textContent = "No current notices";
    dots.innerHTML = "";
    prevButton.disabled = true;
    nextButton.disabled = true;
    return;
  }

  if (publicNoticesState.activeIndex >= visibleNotices.length) {
    publicNoticesState.activeIndex = 0;
  }

  const activeNotice = visibleNotices[publicNoticesState.activeIndex];
  const details = activeNotice.summary || activeNotice.body || "No summary provided.";

  slide.innerHTML = `
    <p class="public-notice-category">${escapeHtml(activeNotice.category)}</p>
    <h3>${escapeHtml(activeNotice.title)}</h3>
    <p>${renderNoticeSummary(details)}</p>
    <p class="public-notice-time">Published: ${escapeHtml(formatNoticeDate(activeNotice.publishAt || activeNotice.updatedAt || activeNotice.createdAt))}</p>
  `;

  meta.textContent = `Notice ${publicNoticesState.activeIndex + 1} of ${visibleNotices.length}`;
  prevButton.disabled = visibleNotices.length === 1;
  nextButton.disabled = visibleNotices.length === 1;

  dots.innerHTML = visibleNotices
    .map((_notice, index) => `<button type="button" class="public-notice-dot${index === publicNoticesState.activeIndex ? " is-active" : ""}" data-public-notice-index="${index}" aria-label="View notice ${index + 1}"></button>`)
    .join("");

  dots.querySelectorAll("[data-public-notice-index]").forEach((dot) => {
    dot.addEventListener("click", () => {
      const nextIndex = Number(dot.getAttribute("data-public-notice-index"));
      if (Number.isNaN(nextIndex)) return;
      publicNoticesState.activeIndex = nextIndex;
      renderPublicNoticeCarousel();
    });
  });
}

function attachPublicNoticesControls() {
  const prevButton = document.getElementById("public-notices-prev");
  const nextButton = document.getElementById("public-notices-next");

  prevButton?.addEventListener("click", () => {
    const visibleCount = publicNoticesState.notices.filter(isPublicNoticeVisible).length;
    if (!visibleCount) return;
    publicNoticesState.activeIndex = (publicNoticesState.activeIndex - 1 + visibleCount) % visibleCount;
    renderPublicNoticeCarousel();
  });

  nextButton?.addEventListener("click", () => {
    const visibleCount = publicNoticesState.notices.filter(isPublicNoticeVisible).length;
    if (!visibleCount) return;
    publicNoticesState.activeIndex = (publicNoticesState.activeIndex + 1) % visibleCount;
    renderPublicNoticeCarousel();
  });
}

async function loadPublicNotices() {
  const endpoint = String(window.siteConfig?.publicNoticesEndpoint || "").trim();
  if (!endpoint) {
    console.warn("Public notices endpoint is not configured.");
    publicNoticesState.notices = [];
    publicNoticesState.activeIndex = 0;
    attachPublicNoticesControls();
    renderPublicNoticeCarousel();
    return;
  }

  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Public notices fetch failed: ${response.status}`);
    }

    const payload = await response.json();
    publicNoticesState.notices = normalizePublicNotices(payload);
  } catch (error) {
    console.warn("Unable to load public notices:", error.message);
    publicNoticesState.notices = [];
  }

  publicNoticesState.activeIndex = 0;
  attachPublicNoticesControls();
  renderPublicNoticeCarousel();
}
