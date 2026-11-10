import {
  ActivityBucket,
  ActivityHealth,
  ActivityProvider,
  AfkEvent,
  AwEvent,
  AwEventSchema,
  BrowserActivityEvent,
  DateRange,
  DesktopActivityEvent,
} from '@focuswatch/shared-types';
import { normalizeBrowserEvents, normalizeDesktopEvents } from '@focuswatch/activity-normalizer';

export class ActivityWatchProvider implements ActivityProvider {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    if (baseUrl) {
      this.baseUrl = baseUrl;
    } else if (typeof window !== 'undefined' && !('__TAURI__' in window)) {
      // In web dev mode, use Vite proxy to bypass browser CORS
      this.baseUrl = '/aw-api';
    } else {
      this.baseUrl = 'http://127.0.0.1:5600';
    }
  }

  public async healthCheck(): Promise<ActivityHealth> {
    try {
      const response = await fetch(`${this.baseUrl}/api/0/buckets/`, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        return {
          connected: false,
          serverUrl: 'http://127.0.0.1:5600',
          bucketsCount: 0,
          windowBucketFound: false,
          afkBucketFound: false,
          webBucketFound: false,
          errorMessage: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const bucketsObj: Record<string, ActivityBucket> = await response.json();
      const bucketList = Object.values(bucketsObj);

      const windowBucket = bucketList.find((b) => b.type === 'currentwindow' || b.id.startsWith('aw-watcher-window'));
      const afkBucket = bucketList.find((b) => b.type === 'afkstatus' || b.id.startsWith('aw-watcher-afk'));
      const webBucket = bucketList.find((b) => b.type === 'web.tab.current' || b.id.startsWith('aw-watcher-web'));

      return {
        connected: true,
        serverUrl: 'http://127.0.0.1:5600',
        bucketsCount: bucketList.length,
        windowBucketFound: Boolean(windowBucket),
        afkBucketFound: Boolean(afkBucket),
        webBucketFound: Boolean(webBucket),
        windowBucketId: windowBucket?.id,
        afkBucketId: afkBucket?.id,
        webBucketId: webBucket?.id,
        lastWindowTimestamp: windowBucket?.last_updated,
        lastAfkTimestamp: afkBucket?.last_updated,
        lastWebTimestamp: webBucket?.last_updated,
      };
    } catch (err: any) {
      return {
        connected: false,
        serverUrl: 'http://127.0.0.1:5600',
        bucketsCount: 0,
        windowBucketFound: false,
        afkBucketFound: false,
        webBucketFound: false,
        errorMessage: err?.message || 'Failed to connect to local ActivityWatch server',
      };
    }
  }

  public async listBuckets(): Promise<ActivityBucket[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/0/buckets/`);
      if (!res.ok) return [];
      const data: Record<string, ActivityBucket> = await res.json();
      return Object.values(data);
    } catch {
      return [];
    }
  }

  public async getDesktopEvents(range: DateRange): Promise<DesktopActivityEvent[]> {
    const health = await this.healthCheck();
    if (!health.connected || !health.windowBucketId) return [];

    const rawEvents = await this.fetchBucketEvents(health.windowBucketId, range);
    const afkEvents = await this.getAfkEvents(range);

    return normalizeDesktopEvents(rawEvents, health.windowBucketId, afkEvents);
  }

  public async getBrowserEvents(range: DateRange): Promise<BrowserActivityEvent[]> {
    const health = await this.healthCheck();
    if (!health.connected || !health.webBucketId) return [];

    const rawEvents = await this.fetchBucketEvents(health.webBucketId, range);
    return normalizeBrowserEvents(rawEvents, health.webBucketId);
  }

  public async getAfkEvents(range: DateRange): Promise<AfkEvent[]> {
    const health = await this.healthCheck();
    if (!health.connected || !health.afkBucketId) return [];

    const rawEvents = await this.fetchBucketEvents(health.afkBucketId, range);
    return rawEvents.map((e) => ({
      timestamp: e.timestamp,
      durationSeconds: e.duration,
      status: e.data?.status === 'afk' ? 'afk' : 'not-afk',
    }));
  }

  private async fetchBucketEvents(bucketId: string, range: DateRange): Promise<AwEvent[]> {
    try {
      const startIso = range.start.toISOString();
      const endIso = range.end.toISOString();

      const url = `${this.baseUrl}/api/0/buckets/${encodeURIComponent(
        bucketId
      )}/events?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&limit=2000`;

      const res = await fetch(url);
      if (!res.ok) return [];

      const rawJson = await res.json();
      if (!Array.isArray(rawJson)) return [];

      // Validate events using Zod
      const validatedEvents: AwEvent[] = [];
      for (const item of rawJson) {
        const parsed = AwEventSchema.safeParse(item);
        if (parsed.success) {
          validatedEvents.push(parsed.data);
        }
      }

      return validatedEvents;
    } catch {
      return [];
    }
  }
}
