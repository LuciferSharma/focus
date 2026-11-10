import {
  AfkEvent,
  AwEvent,
  BrowserActivityEvent,
  Category,
  ClassificationRule,
  DesktopActivityEvent,
  NormalizedActivityEvent,
} from '@focuswatch/shared-types';
import { classifyEvent, sanitizeUrl } from '@focuswatch/domain-rules';

/**
 * Normalizes raw ActivityWatch window events into DesktopActivityEvent array.
 */
export function normalizeDesktopEvents(
  rawEvents: AwEvent[],
  bucketId: string,
  afkEvents: AfkEvent[] = []
): DesktopActivityEvent[] {
  return rawEvents.map((event) => {
    const app = (event.data?.app || 'Unknown').toString();
    const title = (event.data?.title || '').toString();
    const timestamp = event.timestamp;
    const durationSeconds = event.duration;

    const isAfk = isTimestampAfk(timestamp, afkEvents);

    return {
      source: 'activitywatch',
      sourceBucketId: bucketId,
      timestamp,
      durationSeconds,
      app,
      title,
      isAfk,
    };
  });
}

/**
 * Normalizes raw ActivityWatch web watcher events into BrowserActivityEvent array.
 */
export function normalizeBrowserEvents(
  rawEvents: AwEvent[],
  bucketId?: string
): BrowserActivityEvent[] {
  return rawEvents.map((event) => {
    const title = (event.data?.title || '').toString();
    const rawUrl = (event.data?.url || '').toString();
    const audible = Boolean(event.data?.audible);
    const incognito = Boolean(event.data?.incognito);
    const timestamp = event.timestamp;
    const durationSeconds = event.duration;

    const { url, domain, path } = sanitizeUrl(rawUrl, 'domain_and_path');

    let browser: 'chrome' | 'edge' | 'firefox' | 'unknown' = 'unknown';
    if (bucketId?.includes('chrome')) browser = 'chrome';
    else if (bucketId?.includes('edge')) browser = 'edge';
    else if (bucketId?.includes('firefox')) browser = 'firefox';

    return {
      source: 'activitywatch',
      sourceBucketId: bucketId,
      timestamp,
      durationSeconds,
      title,
      url,
      domain,
      path,
      audible,
      incognito,
      browser,
    };
  });
}

/**
 * Intersects desktop/browser events with AFK events to check if user was AFK at event timestamp.
 */
export function isTimestampAfk(timestampIso: string, afkEvents: AfkEvent[]): boolean {
  if (!afkEvents || afkEvents.length === 0) return false;

  const eventTime = new Date(timestampIso).getTime();

  for (const afk of afkEvents) {
    const afkStart = new Date(afk.timestamp).getTime();
    const afkEnd = afkStart + afk.durationSeconds * 1000;

    if (eventTime >= afkStart && eventTime <= afkEnd) {
      return afk.status === 'afk';
    }
  }

  return false;
}

/**
 * Merges desktop and browser events into a unified, deduplicated list of NormalizedActivityEvents.
 * Adjacent/consecutive events with identical app/domain and title are merged together.
 */
export function buildUnifiedTimeline(
  desktopEvents: DesktopActivityEvent[],
  browserEvents: BrowserActivityEvent[],
  rules?: ClassificationRule[],
  categories?: Category[]
): NormalizedActivityEvent[] {
  const rawList: NormalizedActivityEvent[] = [];

  // Desktop events
  desktopEvents.forEach((d, idx) => {
    const { category } = classifyEvent({ app: d.app, title: d.title }, rules, categories);
    rawList.push({
      id: `desktop_${idx}_${d.timestamp}`,
      timestamp: d.timestamp,
      durationSeconds: Math.round(d.durationSeconds),
      type: 'desktop',
      appOrBrowser: d.app,
      title: d.title,
      categoryId: category.id,
      categoryName: category.name,
      productivityScore: category.productivityWeight,
      isAfk: d.isAfk,
    });
  });

  // Browser events
  browserEvents.forEach((b, idx) => {
    const { category } = classifyEvent({ domain: b.domain, url: b.url, title: b.title }, rules, categories);
    rawList.push({
      id: `browser_${idx}_${b.timestamp}`,
      timestamp: b.timestamp,
      durationSeconds: Math.round(b.durationSeconds),
      type: 'browser',
      appOrBrowser: b.browser,
      title: b.title,
      url: b.url,
      domain: b.domain,
      categoryId: category.id,
      categoryName: category.name,
      productivityScore: category.productivityWeight,
      isAfk: false,
    });
  });

  // 1. Sort raw list chronologically (oldest to newest) to merge consecutive blocks
  rawList.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // 2. Merge consecutive identical events
  const merged: NormalizedActivityEvent[] = [];

  for (const event of rawList) {
    if (merged.length === 0) {
      merged.push({ ...event });
      continue;
    }

    const last = merged[merged.length - 1];

    const isSameTarget =
      last.type === event.type &&
      last.appOrBrowser === event.appOrBrowser &&
      last.title === event.title &&
      last.domain === event.domain;

    if (isSameTarget) {
      // Merge durations and update latest timestamp
      last.durationSeconds += event.durationSeconds;
      last.timestamp = event.timestamp;
    } else {
      merged.push({ ...event });
    }
  }

  // 3. Filter out zero-duration events unless it's the only record
  const filtered = merged.filter((e) => e.durationSeconds > 0 || merged.length === 1);

  // 4. Return sorted by timestamp descending (newest first) for UI display
  return filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
