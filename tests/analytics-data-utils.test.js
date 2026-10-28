const assert = require('node:assert/strict');
const { normalizeAnalyticsFilterValue, buildAnalyticsDailyCounts, getAnalyticsFilterOptions } = require('../analytics-data-utils.js');

const records = [
  { kind: 'document', label: 'Town Charter', timestamp: '2026-10-01T12:00:00Z' },
  { kind: 'page', href: 'https://glasgowva.org/documents.html', label: 'Documents | Town of Glasgow', timestamp: '2026-10-01T16:00:00Z' },
  { kind: 'video', href: 'https://example.com/meeting-video.html?src=https%3A%2F%2Fstorage.googleapis.com%2Fglasgow-va%2Fmeetingvideos%2FTown%2520Hall%2520Meeting%25202026-10-13.mp4', timestamp: '2026-10-02T10:00:00Z' },
  { kind: 'document', label: 'Town Charter', timestamp: '2026-10-02T08:00:00Z' },
  { kind: 'video', href: 'https://example.com/meeting-video.html?src=https%3A%2F%2Fstorage.googleapis.com%2Fglasgow-va%2Fmeetingvideos%2FTown%2520Hall%2520Meeting%25202026-10-13.mp4', timestamp: '2026-10-02T14:00:00Z' },
  { kind: 'video', href: 'https://example.com/meeting-video.html?src=https%3A%2F%2Fstorage.googleapis.com%2Fglasgow-va%2Fmeetingvideos%2FOther%2520Meeting%25202026-10-14.mp4', timestamp: '2026-10-03T09:00:00Z' },
];

assert.equal(normalizeAnalyticsFilterValue('document', 'https://example.com/doc.pdf', 'Town Charter'), 'Town Charter');
assert.equal(normalizeAnalyticsFilterValue('video', 'https://example.com/meeting-video.html?src=https%3A%2F%2Fstorage.googleapis.com%2Fglasgow-va%2Fmeetingvideos%2FTown%2520Hall%2520Meeting%25202026-10-13.mp4', ''), 'Town Hall Meeting 2026-10-13');
assert.equal(normalizeAnalyticsFilterValue('video', 'https://example.com/meeting-video.html?src=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ', ''), 'YouTube dQw4w9WgXcQ');
assert.equal(normalizeAnalyticsFilterValue('video', 'https://example.com/meeting-video.html?src=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ&title=Town%20Council%20Meeting&date=2026-10-28', ''), 'Town Council Meeting 2026-10-28');
assert.equal(normalizeAnalyticsFilterValue('page', 'https://glasgowva.org/documents.html', 'Documents | Town of Glasgow'), 'Documents | Town of Glasgow');

const dailyCounts = buildAnalyticsDailyCounts(records, 'all');
assert.deepEqual(dailyCounts, [
  { date: '2026-10-01', count: 2 },
  { date: '2026-10-02', count: 3 },
  { date: '2026-10-03', count: 1 }
]);

const filteredCounts = buildAnalyticsDailyCounts(records, 'Town Hall Meeting 2026-10-13');
assert.deepEqual(filteredCounts, [
  { date: '2026-10-02', count: 2 }
]);

const filterOptions = getAnalyticsFilterOptions(records);
assert.equal(filterOptions.length, 4);
assert.deepEqual(filterOptions.map((option) => option.label), ['Documents | Town of Glasgow', 'Other Meeting 2026-10-14', 'Town Charter', 'Town Hall Meeting 2026-10-13']);

console.log('analytics utils tests passed');
