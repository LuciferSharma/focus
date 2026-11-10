import { describe, expect, it } from 'vitest';
import type { FocusSession } from '@focuswatch/shared-types';
import { computeBehaviorInsights } from '../apps/desktop/src/services/behaviorInsights';

const MIN = 60_000;
let n = 0;

/** A finished session that really ran `activeMin` active minutes against `plannedMin`. */
function session(plannedMin: number, activeMin: number, extra: Partial<FocusSession> = {}): FocusSession {
  n += 1;
  const start = Date.parse('2026-02-01T09:00:00Z') + n * 24 * 60 * MIN;
  const paused = extra.totalPausedMs || 0;
  return {
    id: `s${n}`,
    task: `Task ${n}`,
    plannedMinutes: plannedMin,
    startedAt: new Date(start).toISOString(),
    plannedEndAt: new Date(start + plannedMin * MIN).toISOString(),
    endedAt: new Date(start + activeMin * MIN + paused).toISOString(),
    status: 'completed',
    strictness: 'standard',
    blockRuleSetId: 'default_v1',
    completedOutcome: 'yes',
    ...extra,
  };
}

describe('computeBehaviorInsights', () => {
  it('handles no sessions and sessions with no reflection at all', () => {
    const empty = computeBehaviorInsights([]);
    expect(empty.sessionCount).toBe(0);
    expect(empty.headlines).toEqual([]);

    const bare = computeBehaviorInsights([session(30, 30), session(30, 31), session(30, 29)]);
    expect(bare.reflectionCount).toBe(0);
    expect(bare.difficulty.average).toBeNull();
    expect(bare.estimate.answered).toBe(0);
    expect(bare.headlines).toEqual([]);
  });

  it('measures planning reality from real times, ignoring paused time', () => {
    const r = computeBehaviorInsights([
      session(30, 45), // ran long
      session(30, 50, { totalPausedMs: 20 * MIN }), // 50 active even though 70 wall clock
      session(30, 30), // on target
      session(60, 40), // ran short
    ]);
    expect(r.planning.ranLong).toBe(2);
    expect(r.planning.onTarget).toBe(1);
    expect(r.planning.ranShort).toBe(1);
    expect(r.planning.avgDeltaMinutes).toBe(Math.round((15 + 20 + 0 - 20) / 4));
  });

  it('counts self-assessed estimates and says so only with enough answers', () => {
    const two = computeBehaviorInsights([
      session(30, 40, { estimateAccuracy: 'under' }),
      session(30, 40, { estimateAccuracy: 'under' }),
    ]);
    expect(two.headlines.some((h) => h.includes('underestimated'))).toBe(false);

    const four = computeBehaviorInsights([
      session(30, 40, { estimateAccuracy: 'under' }),
      session(30, 41, { estimateAccuracy: 'under' }),
      session(30, 42, { estimateAccuracy: 'under' }),
      session(30, 30, { estimateAccuracy: 'about_right' }),
    ]);
    expect(four.estimate).toMatchObject({ answered: 4, under: 3, aboutRight: 1, over: 0 });
    expect(four.headlines.join(' ')).toContain('underestimated 3 of 4 sessions (75%)');
  });

  it('averages difficulty and compares how often hard sessions are fulfilled', () => {
    const r = computeBehaviorInsights([
      session(30, 30, { difficulty: 1 }),
      session(30, 30, { difficulty: 2 }),
      session(30, 30, { difficulty: 3 }),
      session(30, 30, { difficulty: 4, completedOutcome: 'partial' }),
      session(30, 30, { difficulty: 5, completedOutcome: 'no' }),
      session(30, 30, { difficulty: 4, completedOutcome: 'yes' }),
    ]);
    expect(r.difficulty.counts).toEqual([1, 1, 1, 2, 1]);
    expect(r.difficulty.average).toBe(3.2);
    const [easy, medium, hard] = r.difficulty.byBucket;
    expect([easy.fulfilledRate, medium.fulfilledRate, hard.fulfilledRate]).toEqual([100, 100, 33]);
    expect(r.headlines.join(' ')).toContain('Hard sessions (4-5) were fulfilled 33%');
  });

  it('finds how often other tasks interrupt, and which ones', () => {
    const r = computeBehaviorInsights([
      session(30, 30, { didOtherTasks: true, otherTasksNote: 'Support emails, Slack replies' }),
      session(30, 30, { didOtherTasks: true, otherTasksNote: 'support emails and a bug' }),
      session(30, 30, { didOtherTasks: true, otherTasksNote: 'Support Emails' }),
      session(30, 30, { didOtherTasks: false }),
      session(30, 30),
    ]);
    expect(r.interruptions.answered).toBe(4);
    expect(r.interruptions.yes).toBe(3);
    expect(r.interruptions.topOtherTasks[0]).toEqual({ name: 'Support emails', count: 3 });
    expect(r.headlines.join(' ')).toContain('3 of 4 sessions (75%), most often: Support emails');
  });

  it('summarises pauses', () => {
    const r = computeBehaviorInsights([
      session(30, 30, { totalPausedMs: 10 * MIN }),
      session(30, 30, { totalPausedMs: 20 * MIN }),
      session(30, 30),
    ]);
    expect(r.interruptions.pausedSessions).toBe(2);
    expect(r.interruptions.avgPausedMinutes).toBe(15);
  });

  it('spots phrases that recur across would-do-differently notes, once per session', () => {
    const r = computeBehaviorInsights([
      session(30, 30, { wouldDoDifferently: 'Start earlier. Start earlier next time, and turn off Slack.' }),
      session(30, 30, { wouldDoDifferently: 'I should start earlier and silence notifications' }),
      session(30, 30, { wouldDoDifferently: 'Break it into smaller pieces first' }),
      session(30, 30, { wouldDoDifferently: 'Break it down, then start earlier' }),
    ]);
    const phrases = r.themes.map((t) => t.phrase);
    expect(phrases).toContain('start earlier');
    const top = r.themes.find((t) => t.phrase === 'start earlier')!;
    expect(top.count).toBe(3); // three sessions, even though the first said it twice
    expect(r.themes.every((t) => t.count >= 2)).toBe(true);
    expect(r.recentLessons).toHaveLength(4);
    expect(r.headlines.join(' ')).toContain('"start earlier" came up in 3');
  });

  it('joins overlapping fragments and shows the wording actually used', () => {
    const r = computeBehaviorInsights([
      session(30, 30, { wouldDoDifferently: 'Break it into smaller pieces and ask for help sooner' }),
      session(30, 30, { wouldDoDifferently: 'I should break it into smaller pieces' }),
      session(30, 30, { wouldDoDifferently: 'Ask for help sooner, honestly' }),
    ]);
    const phrases = r.themes.map((t) => t.phrase);
    expect(phrases).toContain('break it into smaller pieces');
    expect(phrases).toContain('ask for help sooner');
    // The fragments of those phrases are not listed again on their own.
    expect(phrases).not.toContain('break smaller');
    expect(phrases).not.toContain('smaller pieces');
    expect(phrases).not.toContain('help sooner');
    expect(r.themes.find((t) => t.phrase === 'break it into smaller pieces')!.count).toBe(2);
    expect(r.themes.find((t) => t.phrase === 'ask for help sooner')!.count).toBe(2);
  });

  it('does not invent a theme from a single note or from filler words', () => {
    const r = computeBehaviorInsights([
      session(30, 30, { wouldDoDifferently: 'It would have been better to plan the night before' }),
      session(30, 30, { wouldDoDifferently: 'Just do it all again, more or less' }),
    ]);
    expect(r.themes).toEqual([]);
  });

  it('flags tasks that keep needing more sessions', () => {
    const a = (extra: Partial<FocusSession> = {}) => session(30, 30, { taskId: 'task_a', task: 'Write report', ...extra });
    const r = computeBehaviorInsights([a({ completedOutcome: 'partial' }), a({ completedOutcome: 'partial' }), a(), session(30, 30)]);
    expect(r.repeatedTasks).toEqual([{ task: 'Write report', sessions: 3, notFulfilled: 2 }]);
  });

  it('ignores a session that is still running', () => {
    const running = session(30, 30, { status: 'active', endedAt: undefined, difficulty: 5 });
    expect(computeBehaviorInsights([running]).sessionCount).toBe(0);
  });
});
