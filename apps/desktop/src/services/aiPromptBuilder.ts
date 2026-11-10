import { FocusSession, NormalizedActivityEvent, BlockAttempt } from '@focuswatch/shared-types';
import { activeElapsedMinutes, pausedMs } from './sessionTime';

export interface AISessionPayload {
  task: string;
  expectedOutput?: string;
  plannedMinutes: number;
  actualElapsedMinutes: number;
  outcome?: 'yes' | 'partial' | 'no';
  completionNote?: string;
  strictness: 'soft' | 'standard' | 'strict';
  topAppsUsed: { name: string; minutes: number }[];
  distractionsBlocked: number;
  contextSwitches: number;
  pausedMinutes?: number;
  // The founder's own reflection, when they gave one
  difficulty?: number;
  estimateAccuracy?: string;
  wouldDoDifferently?: string;
  workedOnOtherTasks?: string;
}

export class AIPromptBuilder {
  /**
   * Strip sensitive query parameters from URLs
   * e.g. https://google.com/search?q=secret -> https://google.com/search
   */
  public sanitizeUrl(rawUrl?: string): string {
    if (!rawUrl) return '';
    try {
      const urlObj = new URL(rawUrl);
      return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
    } catch {
      return rawUrl.split('?')[0];
    }
  }

  /**
   * Filter noise and construct structured JSON session retrospective
   */
  public buildStructuredPayload(
    session: FocusSession,
    rawTimeline: NormalizedActivityEvent[] = [],
    blockAttempts: BlockAttempt[] = []
  ): AISessionPayload {
    const startMs = new Date(session.startedAt).getTime();
    const actualElapsedMinutes = Math.max(1, activeElapsedMinutes(session));
    const pausedMinutes = Math.round(pausedMs(session) / 60000);

    // Filter out AFK and micro-events (< 3s)
    const validEvents = rawTimeline.filter(
      (evt) => !evt.isAfk && evt.durationSeconds >= 3
    );

    // Aggregate app & domain usage
    const appMap = new Map<string, number>();
    let contextSwitches = 0;
    let lastApp = '';

    validEvents.forEach((evt) => {
      const appName = evt.domain || evt.appOrBrowser || 'Unknown App';
      appMap.set(appName, (appMap.get(appName) || 0) + evt.durationSeconds);

      if (lastApp && lastApp !== appName) {
        contextSwitches++;
      }
      lastApp = appName;
    });

    const topAppsUsed = Array.from(appMap.entries())
      .map(([name, secs]) => ({ name, minutes: Math.round(secs / 60) }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 5);

    const sessionAttempts = blockAttempts.filter(
      (b) => b.sessionId === session.id || new Date(b.timestamp).getTime() >= startMs
    );

    return {
      task: session.task,
      expectedOutput: session.expectedOutput,
      plannedMinutes: session.plannedMinutes,
      actualElapsedMinutes,
      outcome: session.completedOutcome,
      completionNote: session.completionNote,
      strictness: session.strictness,
      topAppsUsed,
      distractionsBlocked: sessionAttempts.length,
      contextSwitches,
      pausedMinutes: pausedMinutes > 0 ? pausedMinutes : undefined,
      difficulty: session.difficulty,
      estimateAccuracy:
        session.estimateAccuracy === 'under'
          ? 'underestimated (took longer than planned)'
          : session.estimateAccuracy === 'over'
          ? 'overestimated (finished faster than planned)'
          : session.estimateAccuracy === 'about_right'
          ? 'about right'
          : undefined,
      wouldDoDifferently: session.wouldDoDifferently,
      workedOnOtherTasks: session.didOtherTasks
        ? session.otherTasksNote || 'yes, unspecified'
        : session.didOtherTasks === false
        ? 'no'
        : undefined,
    };
  }

  /**
   * Generate clean Markdown Prompt for copy-paste or AI API call
   */
  public generateRetrospectivePrompt(payload: AISessionPayload): string {
    const jsonStr = JSON.stringify(payload, null, 2);

    return `You are an executive performance analyst and high-performance focus coach.
Analyze this founder's deep work session log below and deliver an incisive operational retrospective.

### SESSION_DATA_PAYLOAD:
\`\`\`json
${jsonStr}
\`\`\`

### REQUIRED_FORMAT:
1. **Execution Summary** (2 concise sentences evaluating focus quality, plan-vs-actual output, and execution discipline).
2. **Key Accomplishments & Focus Highlights** (3 bullet points celebrating deep work throughput).
3. **Distraction & Friction Leaks** (2 actionable observations regarding app switching, blocked domains, or time leaks).
4. **Behavior Pattern** (1 observation connecting the reflection fields, if present, to the numbers: estimate accuracy, difficulty, interruptions, and what they would do differently).`;
  }
}

export const aiPromptBuilder = new AIPromptBuilder();
