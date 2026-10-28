(function (globalScope) {
  function decodeRepeatedly(value) {
    let text = String(value ?? '').trim();
    let previous = '';

    for (let i = 0; i < 5; i += 1) {
      const next = decodeURIComponent(text);
      if (next === text || next === previous) {
        return next;
      }
      previous = text;
      text = next;
    }

    return text;
  }

  function stripFileExtension(value) {
    return String(value || '').replace(/\.[^./]+$/, '');
  }

  function formatMeetingTitleAndDate(title, date) {
    const cleanedTitle = decodeRepeatedly(String(title || '').trim())
      .replace(/\+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const cleanedDate = String(date || '').trim();
    if (!cleanedTitle) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanedDate)) return cleanedTitle;
    return `${cleanedTitle} ${cleanedDate}`;
  }

  function getYouTubeDisplayName(urlText) {
    try {
      const parsed = new URL(urlText, 'https://example.com');
      const host = String(parsed.hostname || '').toLowerCase();
      const path = String(parsed.pathname || '').replace(/^\/+/, '');

      if (!host.includes('youtube.com') && !host.includes('youtube-nocookie.com') && !host.includes('youtu.be')) {
        return '';
      }

      if (host.includes('youtu.be')) {
        const [videoId] = path.split('/');
        return videoId ? `YouTube ${videoId}` : 'YouTube video';
      }

      const watchId = String(parsed.searchParams.get('v') || '').trim();
      if (watchId) {
        return `YouTube ${watchId}`;
      }

      const match = path.match(/^(?:live|embed|shorts)\/([\w-]{6,})/i);
      if (match && match[1]) {
        return `YouTube ${match[1]}`;
      }

      return 'YouTube video';
    } catch {
      return '';
    }
  }

  function getVideoDisplayName(href) {
    if (!href) return '';

    let target = String(href).trim();

    try {
      const parsed = new URL(target, 'https://example.com');

      const titleFromViewer = formatMeetingTitleAndDate(
        parsed.searchParams.get('title'),
        parsed.searchParams.get('date')
      );
      if (titleFromViewer) {
        return titleFromViewer;
      }

      const srcParam = parsed.searchParams.get('src');
      if (srcParam) {
        target = srcParam;
      } else if (parsed.pathname) {
        target = parsed.pathname;
      }
    } catch {
      // Fall back to the raw href value when parsing fails.
    }

    const cleaned = decodeRepeatedly(target)
      .split('?')[0]
      .split('#')[0]
      .replace(/^\/+/, '')
      .split('/')
      .pop() || '';

    const youtubeName = getYouTubeDisplayName(target);
    if (youtubeName) {
      return youtubeName;
    }

    if (!cleaned) return '';

    return stripFileExtension(cleaned)
      .replace(/\+/g, ' ')
      .replace(/%20/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeAnalyticsFilterValue(kind, href, label) {
    const normalizedKind = String(kind || '').trim().toLowerCase();
    const normalizedLabel = String(label || '').trim();

    if (normalizedKind === 'page') {
      const cleanedHref = String(href || '').trim();
      if (normalizedLabel) return normalizedLabel;
      if (cleanedHref) {
        try {
          const parsed = new URL(cleanedHref, 'https://example.com');
          return parsed.pathname || cleanedHref;
        } catch {
          return cleanedHref;
        }
      }
      return 'Unknown page';
    }

    if (normalizedKind === 'document') {
      return normalizedLabel || getVideoDisplayName(href) || 'Untitled document';
    }

    if (normalizedKind === 'video') {
      return getVideoDisplayName(href) || normalizedLabel || 'Untitled video';
    }

    return normalizedLabel || getVideoDisplayName(href) || '';
  }

  function getAnalyticsEventFilterValue(event) {
    if (!event || typeof event !== 'object') return '';
    return normalizeAnalyticsFilterValue(event.kind, event.href, event.label);
  }

  function buildAnalyticsDailyCounts(events, selectedFilter = 'all') {
    const countsByDate = new Map();
    const normalizedSelection = String(selectedFilter || 'all').trim();

    for (const event of Array.isArray(events) ? events : []) {
      const kind = String(event?.kind || '').trim().toLowerCase();
      if (kind !== 'document' && kind !== 'video' && kind !== 'page') continue;

      const normalizedLabel = getAnalyticsEventFilterValue(event);
      if (normalizedSelection !== 'all' && normalizedLabel !== normalizedSelection) {
        continue;
      }

      const timestamp = event?.timestamp ? new Date(event.timestamp) : null;
      if (!timestamp || Number.isNaN(timestamp.getTime())) continue;

      const dateKey = timestamp.toISOString().slice(0, 10);
      countsByDate.set(dateKey, (countsByDate.get(dateKey) || 0) + 1);
    }

    return Array.from(countsByDate.entries())
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, count]) => ({ date, count }));
  }

  function getAnalyticsFilterOptions(events) {
    const options = new Map();

    for (const event of Array.isArray(events) ? events : []) {
      const value = getAnalyticsEventFilterValue(event);
      if (!value) continue;
      if (!options.has(value)) {
        options.set(value, { value, label: value });
      }
    }

    return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  const api = {
    decodeRepeatedly,
    getVideoDisplayName,
    normalizeAnalyticsFilterValue,
    buildAnalyticsDailyCounts,
    getAnalyticsFilterOptions,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalScope.AnalyticsDashboardUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
