(function initAnalyticsTracker() {
  const SESSION_STORAGE_KEY = 'analyticsSessionContextV1';
  const VISITOR_STORAGE_KEY = 'analyticsVisitorFirstSeenAt';
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

  const documentExtensions = new Set([
    'pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'zip'
  ]);
  const videoExtensions = new Set([
    'mp4', 'webm', 'mov', 'm4v', 'avi', 'ogv'
  ]);

  function getAnalyticsEndpoint() {
    return String(window.siteConfig?.analyticsEndpoint || '').trim();
  }

  function parseJsonSafely(value) {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function createSessionId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }

    if (window.crypto?.getRandomValues) {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    }

    return `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function getCurrentPagePath() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  function getUtmValues() {
    try {
      const params = new URL(window.location.href).searchParams;
      return {
        utmSource: String(params.get('utm_source') || '').trim(),
        utmMedium: String(params.get('utm_medium') || '').trim(),
        utmCampaign: String(params.get('utm_campaign') || '').trim(),
        utmTerm: String(params.get('utm_term') || '').trim(),
        utmContent: String(params.get('utm_content') || '').trim(),
      };
    } catch {
      return {
        utmSource: '',
        utmMedium: '',
        utmCampaign: '',
        utmTerm: '',
        utmContent: '',
      };
    }
  }

  function getSessionContext() {
    const now = Date.now();
    const landingPagePath = getCurrentPagePath();
    const utmValues = getUtmValues();

    let existing = null;
    try {
      existing = parseJsonSafely(window.sessionStorage.getItem(SESSION_STORAGE_KEY));
    } catch {
      existing = null;
    }

    const hasValidSession = existing
      && typeof existing === 'object'
      && typeof existing.id === 'string'
      && existing.id.trim()
      && Number.isFinite(existing.lastActivityAt)
      && (now - existing.lastActivityAt) < SESSION_TIMEOUT_MS;

    const nextSession = hasValidSession
      ? {
        ...existing,
        lastActivityAt: now,
      }
      : {
        id: createSessionId(),
        startedAt: now,
        lastActivityAt: now,
        landingPagePath,
        ...utmValues,
      };

    try {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    } catch {
      // Ignore storage failures in strict browser modes.
    }

    let isReturningVisitor = true;
    try {
      const firstSeenRaw = String(window.localStorage.getItem(VISITOR_STORAGE_KEY) || '').trim();
      if (!firstSeenRaw) {
        isReturningVisitor = false;
        window.localStorage.setItem(VISITOR_STORAGE_KEY, String(now));
      }
    } catch {
      isReturningVisitor = false;
    }

    return {
      sessionId: String(nextSession.id || '').trim(),
      isReturningVisitor,
      landingPagePath: String(nextSession.landingPagePath || landingPagePath).trim(),
      utmSource: String(nextSession.utmSource || '').trim(),
      utmMedium: String(nextSession.utmMedium || '').trim(),
      utmCampaign: String(nextSession.utmCampaign || '').trim(),
      utmTerm: String(nextSession.utmTerm || '').trim(),
      utmContent: String(nextSession.utmContent || '').trim(),
    };
  }

  function detectDoNotTrack() {
    const value = String(
      navigator.doNotTrack
      ?? window.doNotTrack
      ?? navigator.msDoNotTrack
      ?? ''
    ).trim().toLowerCase();

    return value === '1' || value === 'yes' || value === 'true';
  }

  function buildSharedPayloadFields() {
    const pageUrl = window.location.href;
    const pagePath = getCurrentPagePath();
    const sessionContext = getSessionContext();

    return {
      pageUrl,
      pagePath,
      referrer: document.referrer || '',
      timestamp: new Date().toISOString(),
      language: String(navigator.language || '').trim(),
      dntEnabled: detectDoNotTrack(),
      gpcEnabled: navigator.globalPrivacyControl === true,
      ...sessionContext,
    };
  }

  function getFileExtension(href) {
    try {
      const url = new URL(href, window.location.href);
      const pathname = url.pathname.toLowerCase();
      const lastSegment = pathname.split('/').pop() || '';
      const dotIndex = lastSegment.lastIndexOf('.');
      if (dotIndex < 0) return '';
      return lastSegment.slice(dotIndex + 1).split('?')[0].split('#')[0];
    } catch {
      return '';
    }
  }

  function classifyLink(anchor) {
    const href = String(anchor.getAttribute('href') || '').trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return null;
    }

    const explicitKind = String(anchor.dataset.analyticsKind || '').trim().toLowerCase();
    if (explicitKind === 'document' || explicitKind === 'video') {
      return explicitKind;
    }

    const extension = getFileExtension(href);
    if (documentExtensions.has(extension)) return 'document';
    if (videoExtensions.has(extension)) return 'video';

    return null;
  }

  function buildPayload(anchor, kind) {
    const href = String(anchor.getAttribute('href') || '').trim();
    const label = String(anchor.dataset.analyticsLabel || anchor.textContent || '').trim();

    return {
      kind,
      href,
      label,
      ...buildSharedPayloadFields()
    };
  }

  function buildPageViewPayload() {
    const pageUrl = window.location.href;

    return {
      kind: 'page',
      href: pageUrl,
      label: String(document.title || '').trim(),
      ...buildSharedPayloadFields()
    };
  }

  function sendEvent(payload) {
    const endpoint = getAnalyticsEndpoint();
    if (!endpoint) return false;

    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      if (navigator.sendBeacon(endpoint, body)) return true;
    }

    fetch(endpoint, {
      method: 'POST',
      body,
      mode: 'no-cors',
      keepalive: true
    }).catch(() => {});

    return true;
  }

  function onDocumentClick(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const anchor = path.find((node) => node && node.tagName === 'A') || event.target?.closest?.('a[href]');
    if (!anchor) return;

    const kind = classifyLink(anchor);
    if (!kind) return;

    sendEvent(buildPayload(anchor, kind));
  }

  function recordPageViewWithRetry() {
    if (window.__analyticsPageViewSent) {
      return;
    }

    const maxAttempts = 8;
    const attemptDelayMs = 400;
    let attempt = 0;

    const trySend = () => {
      if (window.__analyticsPageViewSent) {
        return;
      }

      attempt += 1;
      const sent = sendEvent(buildPageViewPayload());
      if (sent) {
        window.__analyticsPageViewSent = true;
        return;
      }

      if (attempt < maxAttempts) {
        window.setTimeout(trySend, attemptDelayMs);
      }
    };

    trySend();
  }

  // Record one page-view event whenever the tracker initializes on a page.
  recordPageViewWithRetry();

  document.addEventListener('click', onDocumentClick, true);
})();