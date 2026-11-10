import { describe, expect, it } from 'vitest';
import { calculateFocusScore, analyzeContextSwitches } from '../packages/score-engine/src/index';
import { NormalizedActivityEvent } from '../packages/shared-types/src/index';

describe('score-engine', () => {
  it('calculates perfect 100 focus score for pure deep work day', () => {
    const score = calculateFocusScore({
      activeSeconds: 14400, // 4 hours
      productiveSeconds: 14400,
      distractingSeconds: 0,
      sessionsStarted: 3,
      sessionsCompleted: 3,
      outputsPromised: 3,
      outputsCompleted: 3,
      contextSwitches: 10,
      blockAttempts: 5,
      unlocks: 0,
    });

    expect(score).toBe(100);
  });

  it('penalizes score when distracting time and unlocks increase', () => {
    const score = calculateFocusScore({
      activeSeconds: 14400,
      productiveSeconds: 7200, // 50% productive
      distractingSeconds: 3600, // 25% distracting
      sessionsStarted: 4,
      sessionsCompleted: 2, // 50% session completion
      outputsPromised: 4,
      outputsCompleted: 2,
      contextSwitches: 120, // High context switching
      blockAttempts: 10,
      unlocks: 4,
    });

    expect(score).toBeLessThan(60);
  });

  it('analyzes context switching transitions correctly', () => {
    const now = new Date().toISOString();
    const events: NormalizedActivityEvent[] = [
      {
        id: '1',
        timestamp: now,
        durationSeconds: 10,
        type: 'desktop',
        appOrBrowser: 'Code.exe',
        title: 'main.ts',
        categoryId: 'deep_work',
        categoryName: 'Deep Work',
        productivityScore: 1.0,
        isAfk: false,
      },
      {
        id: '2',
        timestamp: now,
        durationSeconds: 15,
        type: 'browser',
        appOrBrowser: 'chrome',
        title: 'Instagram',
        domain: 'instagram.com',
        categoryId: 'highly_distracting',
        categoryName: 'Highly Distracting',
        productivityScore: -1.0,
        isAfk: false,
      },
    ];

    const result = analyzeContextSwitches(events, 3);
    expect(result.contextSwitches).toBe(1);
  });
});
