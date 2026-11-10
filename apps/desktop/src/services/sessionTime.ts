import { FocusSession } from '@focuswatch/shared-types';

type TimedSession = Pick<FocusSession, 'startedAt' | 'endedAt' | 'pausedAt' | 'totalPausedMs'>;

/** Total time spent paused as of `nowMs` (or as of the end, for a finished session). */
export function pausedMs(session: TimedSession, nowMs: number = Date.now()): number {
  const base = session.totalPausedMs || 0;
  if (session.endedAt || !session.pausedAt) return base;
  const since = Date.parse(session.pausedAt);
  return base + (isNaN(since) ? 0 : Math.max(0, nowMs - since));
}

/**
 * Time actually spent working: wall-clock span minus every pause. For a finished session
 * the span ends at endedAt, otherwise at `nowMs`.
 */
export function activeElapsedMs(session: TimedSession, nowMs: number = Date.now()): number {
  const start = Date.parse(session.startedAt);
  if (isNaN(start)) return 0;
  const end = session.endedAt ? Date.parse(session.endedAt) : nowMs;
  return Math.max(0, end - start - pausedMs(session, end));
}

export function activeElapsedSeconds(session: TimedSession, nowMs: number = Date.now()): number {
  return Math.floor(activeElapsedMs(session, nowMs) / 1000);
}

export function activeElapsedMinutes(session: TimedSession, nowMs: number = Date.now()): number {
  return Math.round(activeElapsedMs(session, nowMs) / 60000);
}
