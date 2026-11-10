/**
 * Temporary unlocks granted from the block page ("I really need this site for 10 minutes").
 *
 * An unlock is tied to the session it was granted in and expires on its own. Active unlocks
 * are treated like allowed exceptions, so both the blocking rules and the navigation
 * fallbacks let the site through until the unlock runs out.
 */

export interface TempUnlock {
  domain: string;
  expiresAt: number;
  sessionKey: string;
  reason: string;
}

export const MIN_UNLOCK_MINUTES = 1;
export const MAX_UNLOCK_MINUTES = 60;

/** Identifies a session, so unlocks from an earlier session never carry over. */
export function sessionKeyOf(session: any): string {
  return String(session?.session_id || session?.started_at || '');
}

/**
 * The entry on the block list that a URL matched, e.g. "youtube.com" for
 * https://www.youtube.com/watch. Unlocking that entry covers all of its subdomains.
 * Falls back to the URL's own hostname if nothing on the list matches.
 */
export function matchBlockedDomain(url: string, blockedDomains: string[]): string | null {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!hostname) return null;
  const match = blockedDomains
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
    .find((d) => hostname === d || hostname.endsWith(`.${d}`));
  return match || hostname;
}

/** Unlocks that belong to this session and haven't expired yet. */
export function activeUnlocks(list: unknown, sessionKey: string, now: number): TempUnlock[] {
  if (!Array.isArray(list) || !sessionKey) return [];
  return list.filter(
    (u): u is TempUnlock =>
      !!u &&
      typeof u.domain === 'string' &&
      typeof u.expiresAt === 'number' &&
      u.sessionKey === sessionKey &&
      u.expiresAt > now
  );
}

/**
 * Returns the new unlock list with this unlock added. Drops expired unlocks, unlocks from
 * other sessions, and any earlier unlock for the same domain.
 */
export function addUnlock(
  list: unknown,
  unlock: { domain: string; minutes: number; reason: string; sessionKey: string },
  now: number
): { list: TempUnlock[]; added: TempUnlock } {
  const minutes = Math.min(
    MAX_UNLOCK_MINUTES,
    Math.max(MIN_UNLOCK_MINUTES, Math.round(Number(unlock.minutes) || MIN_UNLOCK_MINUTES))
  );
  const added: TempUnlock = {
    domain: unlock.domain,
    expiresAt: now + minutes * 60_000,
    sessionKey: unlock.sessionKey,
    reason: unlock.reason,
  };
  const kept = activeUnlocks(list, unlock.sessionKey, now).filter((u) => u.domain !== unlock.domain);
  return { list: [...kept, added], added };
}

/** Allowed exceptions for the session plus every site that is currently unlocked. */
export function effectiveExceptions(allowedExceptions: string[] = [], unlocks: TempUnlock[] = []): string[] {
  return [...new Set([...allowedExceptions, ...unlocks.map((u) => u.domain)])];
}
