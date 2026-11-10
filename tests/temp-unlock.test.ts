/**
 * Temporary unlocks from the block page.
 *
 * Covers the "I asked for 10 minutes on a blocked site and got sent straight back to the
 * block page" bug: an unlock must turn into an allowed exception for that site, cover its
 * subdomains, run out on time, and never carry over into another session.
 */
import { describe, expect, it } from 'vitest';
import {
  activeUnlocks,
  addUnlock,
  effectiveExceptions,
  matchBlockedDomain,
  MAX_UNLOCK_MINUTES,
  sessionKeyOf,
} from '../apps/extension/src/background/tempUnlock';

const BLOCKED = ['youtube.com', 'instagram.com', 'x.com'];
const NOW = 1_800_000_000_000;

describe('matchBlockedDomain', () => {
  it('maps a subdomain URL to the block-list entry, so the unlock covers the whole site', () => {
    expect(matchBlockedDomain('https://www.youtube.com/watch?v=abc', BLOCKED)).toBe('youtube.com');
    expect(matchBlockedDomain('https://m.youtube.com/', BLOCKED)).toBe('youtube.com');
    expect(matchBlockedDomain('https://instagram.com/reels', BLOCKED)).toBe('instagram.com');
  });

  it('does not confuse look-alike domains', () => {
    expect(matchBlockedDomain('https://notx.com/', BLOCKED)).toBe('notx.com');
  });

  it('returns null for something that is not a URL', () => {
    expect(matchBlockedDomain('', BLOCKED)).toBeNull();
    expect(matchBlockedDomain('not a url', BLOCKED)).toBeNull();
  });
});

describe('addUnlock / activeUnlocks', () => {
  const session = 'session_1';

  it('an unlock lasts the chosen minutes and then expires', () => {
    const { list, added } = addUnlock([], { domain: 'youtube.com', minutes: 10, reason: 'tutorial', sessionKey: session }, NOW);
    expect(added.expiresAt).toBe(NOW + 10 * 60_000);
    expect(activeUnlocks(list, session, NOW + 9 * 60_000)).toHaveLength(1);
    expect(activeUnlocks(list, session, NOW + 10 * 60_000)).toHaveLength(0);
  });

  it('unlocks from a previous session do not carry over', () => {
    const { list } = addUnlock([], { domain: 'youtube.com', minutes: 10, reason: 'r', sessionKey: 'old' }, NOW);
    expect(activeUnlocks(list, 'new', NOW + 1000)).toHaveLength(0);
  });

  it('unlocking the same site again replaces the earlier unlock instead of stacking', () => {
    const first = addUnlock([], { domain: 'youtube.com', minutes: 5, reason: 'a', sessionKey: session }, NOW);
    const second = addUnlock(first.list, { domain: 'youtube.com', minutes: 15, reason: 'b', sessionKey: session }, NOW + 60_000);
    expect(second.list).toHaveLength(1);
    expect(second.list[0].reason).toBe('b');
    expect(second.list[0].expiresAt).toBe(NOW + 60_000 + 15 * 60_000);
  });

  it('keeps unlocks for other sites and drops expired ones', () => {
    const a = addUnlock([], { domain: 'youtube.com', minutes: 1, reason: '', sessionKey: session }, NOW);
    const b = addUnlock(a.list, { domain: 'x.com', minutes: 10, reason: '', sessionKey: session }, NOW + 30_000);
    expect(b.list.map((u) => u.domain).sort()).toEqual(['x.com', 'youtube.com']);
    const c = addUnlock(b.list, { domain: 'instagram.com', minutes: 10, reason: '', sessionKey: session }, NOW + 2 * 60_000);
    expect(c.list.map((u) => u.domain).sort()).toEqual(['instagram.com', 'x.com']);
  });

  it('clamps silly durations', () => {
    expect(addUnlock([], { domain: 'x.com', minutes: 0, reason: '', sessionKey: session }, NOW).added.expiresAt).toBe(NOW + 60_000);
    expect(addUnlock([], { domain: 'x.com', minutes: 9999, reason: '', sessionKey: session }, NOW).added.expiresAt).toBe(
      NOW + MAX_UNLOCK_MINUTES * 60_000
    );
  });

  it('ignores corrupted storage', () => {
    expect(activeUnlocks(undefined, session, NOW)).toEqual([]);
    expect(activeUnlocks([null, { domain: 1 }, 'x'], session, NOW)).toEqual([]);
  });
});

describe('effectiveExceptions', () => {
  it('adds unlocked sites to the allowed exceptions without duplicates', () => {
    const { list } = addUnlock([], { domain: 'youtube.com', minutes: 5, reason: '', sessionKey: 's' }, NOW);
    expect(effectiveExceptions(['music.youtube.com', 'studio.youtube.com'], list)).toEqual([
      'music.youtube.com',
      'studio.youtube.com',
      'youtube.com',
    ]);
    expect(effectiveExceptions(['youtube.com'], list)).toEqual(['youtube.com']);
  });
});

describe('sessionKeyOf', () => {
  it('uses the session id, falling back to the start time', () => {
    expect(sessionKeyOf({ session_id: 'session_9', started_at: '2026-01-01' })).toBe('session_9');
    expect(sessionKeyOf({ started_at: '2026-01-01T10:00:00Z' })).toBe('2026-01-01T10:00:00Z');
    expect(sessionKeyOf(null)).toBe('');
  });
});
