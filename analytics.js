(function initAnalyticsTracker() {
  const documentExtensions = new Set([
    'pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'zip'
  ]);
  const videoExtensions = new Set([
    'mp4', 'webm', 'mov', 'm4v', 'avi', 'ogv'
  ]);

  function getAnalyticsEndpoint() {
    return String(window.siteConfig?.analyticsEndpoint || '').trim();
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
    const pageUrl = window.location.href;
    const pagePath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    return {
      kind,
      href,
      label,
      pageUrl,
      pagePath,
      referrer: document.referrer || '',
      timestamp: new Date().toISOString()
    };
  }

  function buildPageViewPayload() {
    const pageUrl = window.location.href;
    const pagePath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    return {
      kind: 'page',
      href: pageUrl,
      label: String(document.title || '').trim(),
      pageUrl,
      pagePath,
      referrer: document.referrer || '',
      timestamp: new Date().toISOString()
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