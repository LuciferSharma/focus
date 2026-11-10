import { NormalizedActivityEvent } from '@focuswatch/shared-types';

export interface ScoreInputs {
  activeSeconds: number;
  productiveSeconds: number;
  distractingSeconds: number;
  sessionsStarted: number;
  sessionsCompleted: number;
  outputsPromised: number;
  outputsCompleted: number;
  contextSwitches: number;
  blockAttempts: number;
  unlocks: number;
}

/**
 * Calculates Focus Score (0 - 100) based on Build Spec Section 20.
 */
export function calculateFocusScore(inputs: ScoreInputs): number {
  const activeSec = Math.max(inputs.activeSeconds, 1);

  // 1. Productive Ratio (0 to 1) -> Up to 50 points
  const productiveRatio = Math.min(1, Math.max(0, inputs.productiveSeconds / activeSec));
  const productivePoints = productiveRatio * 50;

  // 2. Session Completion Rate (0 to 1) -> Up to 20 points
  const sessionCompletionRate =
    inputs.sessionsStarted > 0
      ? Math.min(1, Math.max(0, inputs.sessionsCompleted / inputs.sessionsStarted))
      : 1.0;
  const sessionPoints = sessionCompletionRate * 20;

  // 3. Output Completion Rate (0 to 1) -> Up to 15 points
  const outputCompletionRate =
    inputs.outputsPromised > 0
      ? Math.min(1, Math.max(0, inputs.outputsCompleted / inputs.outputsPromised))
      : 1.0;
  const outputPoints = outputCompletionRate * 15;

  // 4. Low Distraction Penalty (Up to 10 points)
  const distractionRatio = Math.min(1, Math.max(0, inputs.distractingSeconds / activeSec));
  const distractionPoints = Math.max(0, 1 - distractionRatio * 4) * 10;

  // 5. Context Switch & Unlock Penalty Quality (Up to 5 points)
  const activeHours = Math.max(0.25, activeSec / 3600);
  const switchesPerHour = inputs.contextSwitches / activeHours;
  let contextSwitchQuality = 1.0;
  if (switchesPerHour > 30) contextSwitchQuality = 0.0;
  else if (switchesPerHour > 15) contextSwitchQuality = 0.5;

  // Deduct for manual unlocks heavier than blocked attempts
  const unlockPenalty = Math.min(0.5, inputs.unlocks * 0.1);
  const finalContextQuality = Math.max(0, contextSwitchQuality - unlockPenalty);
  const contextPoints = finalContextQuality * 5;

  const totalScore = Math.round(
    productivePoints + sessionPoints + outputPoints + distractionPoints + contextPoints
  );

  return Math.min(100, Math.max(0, totalScore));
}

/**
 * Groups raw activity events into work contexts to calculate context switches.
 */
export function analyzeContextSwitches(
  events: NormalizedActivityEvent[],
  minThresholdSeconds: number = 3
): { contextSwitches: number; alertsTriggered: boolean } {
  if (events.length <= 1) {
    return { contextSwitches: 0, alertsTriggered: false };
  }

  // Filter out microscopic events (< minThresholdSeconds)
  const validEvents = events.filter((e) => e.durationSeconds >= minThresholdSeconds && !e.isAfk);

  let switches = 0;
  let lastContext = '';
  const recentSwitchesWindow: number[] = []; // Timestamps of recent unrelated switches

  for (const event of validEvents) {
    // Context is defined by category + app/domain
    const currentContext = `${event.categoryId}:${event.appOrBrowser}:${event.domain || ''}`;

    if (lastContext && currentContext !== lastContext) {
      switches++;
      const eventTime = new Date(event.timestamp).getTime();
      recentSwitchesWindow.push(eventTime);
    }

    lastContext = currentContext;
  }

  // Check alert condition: e.g. >= 12 switches in a 10-minute (600,000ms) sliding window
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  const recentSwitchesInWindow = recentSwitchesWindow.filter((t) => t >= tenMinutesAgo).length;
  const alertsTriggered = recentSwitchesInWindow >= 12;

  return {
    contextSwitches: switches,
    alertsTriggered,
  };
}
