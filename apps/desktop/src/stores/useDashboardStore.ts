import { create } from 'zustand';
import { ActivityHealth, ClassificationRule, DailySummary, NormalizedActivityEvent } from '@focuswatch/shared-types';
import { ActivityWatchProvider } from '../adapters/activitywatch';
import { buildUnifiedTimeline } from '@focuswatch/activity-normalizer';
import { analyzeContextSwitches, calculateFocusScore } from '@focuswatch/score-engine';
import { dbService } from '../services/db';

const awProvider = new ActivityWatchProvider();

interface DashboardState {
  health: ActivityHealth | null;
  loading: boolean;
  rawTimeline: NormalizedActivityEvent[];
  todaySummary: DailySummary;
  refreshDashboard: () => Promise<void>;
  reclassifyItem: (target: 'app' | 'domain', pattern: string, categoryId: string) => Promise<void>;
}

const initialSummary: DailySummary = {
  date: new Date().toISOString().split('T')[0],
  activeSeconds: 0,
  focusedSeconds: 0,
  productiveSeconds: 0,
  distractingSeconds: 0,
  neutralSeconds: 0,
  contextSwitches: 0,
  blockAttempts: 0,
  unlocks: 0,
  sessionsStarted: 0,
  sessionsCompleted: 0,
  outputsCompleted: 0,
  focusScore: 0,
  generatedAt: new Date().toISOString(),
};

export const useDashboardStore = create<DashboardState>((set, get) => ({
  health: null,
  loading: false,
  rawTimeline: [],
  todaySummary: initialSummary,

  refreshDashboard: async () => {
    set({ loading: true });

    const health = await awProvider.healthCheck();

    // Query today range (00:00:00 to now)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();

    const range = { start: todayStart, end: todayEnd };

    let desktopEvents: any[] = [];
    let browserEvents: any[] = [];

    if (health.connected) {
      desktopEvents = await awProvider.getDesktopEvents(range);
      browserEvents = await awProvider.getBrowserEvents(range);
    }

    // Load active classification rules from DB
    const rules = await dbService.getClassificationRules();

    const unifiedTimeline = buildUnifiedTimeline(desktopEvents, browserEvents, rules);

    // Calculate aggregated metrics
    let activeSec = 0;
    let productiveSec = 0;
    let distractingSec = 0;
    let neutralSec = 0;

    for (const event of unifiedTimeline) {
      if (event.isAfk) continue;
      activeSec += event.durationSeconds;

      if (event.productivityScore > 0) {
        productiveSec += event.durationSeconds;
      } else if (event.productivityScore < 0) {
        distractingSec += event.durationSeconds;
      } else {
        neutralSec += event.durationSeconds;
      }
    }

    const { contextSwitches } = analyzeContextSwitches(unifiedTimeline);

    const focusScore = calculateFocusScore({
      activeSeconds: activeSec,
      productiveSeconds: productiveSec,
      distractingSeconds: distractingSec,
      sessionsStarted: 1,
      sessionsCompleted: 1,
      outputsPromised: 1,
      outputsCompleted: 1,
      contextSwitches,
      blockAttempts: 0,
      unlocks: 0,
    });

    const todaySummary: DailySummary = {
      date: new Date().toISOString().split('T')[0],
      activeSeconds: activeSec,
      focusedSeconds: productiveSec,
      productiveSeconds: productiveSec,
      distractingSeconds: distractingSec,
      neutralSeconds: neutralSec,
      contextSwitches,
      blockAttempts: 0,
      unlocks: 0,
      sessionsStarted: 1,
      sessionsCompleted: 1,
      outputsCompleted: 1,
      focusScore,
      generatedAt: new Date().toISOString(),
    };

    set({
      health,
      loading: false,
      rawTimeline: unifiedTimeline,
      todaySummary,
    });
  },

  reclassifyItem: async (target, pattern, categoryId) => {
    const cleanPattern = pattern.toLowerCase().trim();
    if (!cleanPattern) return;

    const newRule: ClassificationRule = {
      id: `user_rule_${target}_${cleanPattern}`,
      name: `User Rule: ${cleanPattern}`,
      target,
      matchType: target === 'domain' ? 'contains' : 'contains',
      pattern: cleanPattern,
      categoryId,
      priority: 200, // High priority to override defaults
      enabled: true,
    };

    await dbService.saveRule(newRule);

    // Synchronize extension blocklist & exceptions for domain reclassifications
    if (target === 'domain') {
      const isHostile = categoryId === 'distracting' || categoryId === 'highly_distracting';
      const currentBlocked = await dbService.getBlockedDomains();
      const currentAllowed = await dbService.getAllowedExceptions();

      let newBlocked = [...currentBlocked];
      let newAllowed = [...currentAllowed];

      if (isHostile) {
        if (!newBlocked.includes(cleanPattern)) newBlocked.push(cleanPattern);
        newAllowed = newAllowed.filter((d) => d !== cleanPattern);
      } else {
        newBlocked = newBlocked.filter((d) => d !== cleanPattern);
        if (!newAllowed.includes(cleanPattern) && (categoryId === 'productive' || categoryId === 'deep_work')) {
          newAllowed.push(cleanPattern);
        }
      }

      await dbService.saveBlockedDomains(newBlocked);
      await dbService.saveAllowedExceptions(newAllowed);

      try {
        await fetch('http://127.0.0.1:47777/session/active', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            active: true,
            rules_version: Date.now(),
            blocked_domains: newBlocked,
            allowed_exceptions: newAllowed,
          }),
        });
      } catch {}
    }

    await get().refreshDashboard();
  },
}));
