import { z } from 'zod';

// Date Range
export interface DateRange {
  start: Date;
  end: Date;
}

// ActivityWatch Health
export interface ActivityHealth {
  connected: boolean;
  version?: string;
  serverUrl: string;
  bucketsCount: number;
  windowBucketFound: boolean;
  afkBucketFound: boolean;
  webBucketFound: boolean;
  windowBucketId?: string;
  afkBucketId?: string;
  webBucketId?: string;
  lastWindowTimestamp?: string;
  lastAfkTimestamp?: string;
  lastWebTimestamp?: string;
  errorMessage?: string;
}

// Activity Bucket
export interface ActivityBucket {
  id: string;
  type: string;
  client: string;
  hostname: string;
  created: string;
  last_updated?: string;
}

// Raw AW Event Schema (for Zod validation)
export const AwEventSchema = z.object({
  id: z.number().optional(),
  timestamp: z.string(),
  duration: z.number(),
  data: z.record(z.string(), z.any()),
});

export type AwEvent = z.infer<typeof AwEventSchema>;

// Desktop Event
export interface DesktopActivityEvent {
  source: 'activitywatch';
  sourceBucketId: string;
  timestamp: string;
  durationSeconds: number;
  app: string;
  title: string;
  isAfk: boolean;
}

// Browser Event
export interface BrowserActivityEvent {
  source: 'activitywatch' | 'focuswatch-extension';
  sourceBucketId?: string;
  timestamp: string;
  durationSeconds: number;
  title: string;
  url: string;
  domain: string;
  path: string;
  audible: boolean;
  incognito: boolean;
  browser: 'chrome' | 'edge' | 'firefox' | 'unknown';
}

// AFK Event
export interface AfkEvent {
  timestamp: string;
  durationSeconds: number;
  status: 'not-afk' | 'afk';
}

// Normalized Activity Event
export interface NormalizedActivityEvent {
  id: string;
  timestamp: string;
  durationSeconds: number;
  type: 'desktop' | 'browser';
  appOrBrowser: string;
  title: string;
  url?: string;
  domain?: string;
  categoryId: string;
  categoryName: string;
  productivityScore: number; // -1.0 to +1.0
  isAfk: boolean;
}

// Task Types
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type TaskStatus = 'backlog' | 'in_progress' | 'completed' | 'archived';

export interface SubTask {
  id: string;
  text: string;
  completed: boolean;
}

export type TaskEffort = 'low' | 'high';
export type TaskImpact = 'low' | 'high';

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  expectedOutput?: string;
  estimatedMinutes: number;
  priority: TaskPriority;
  status: TaskStatus;
  effort?: TaskEffort;
  impact?: TaskImpact;
  dueDate?: string; // YYYY-MM-DD or ISO string
  tags: string[];
  subtasks: SubTask[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  linkedSessionId?: string;
  categoryId?: string; // The kind of work this is (coding, sales, ...). See TaskCategory.
}

// What kind of work a task or session is. Editable by the user.
export interface TaskCategory {
  id: string;
  name: string;
  color: string; // hex, e.g. '#10b981'
  isWaste?: boolean; // time here is shown as waste and left out of productive totals
  archived?: boolean; // hidden from pickers but kept so old tasks and sessions still resolve
  builtIn?: boolean;
}

// Focus Session
export interface FocusSession {
  id: string;
  taskId?: string; // Foreign key reference to TaskItem
  task: string;
  expectedOutput?: string;
  categoryId?: string; // copied from the task when the session starts
  plannedMinutes: number;
  startedAt: string;
  plannedEndAt: string;
  endedAt?: string;
  status: 'active' | 'completed' | 'stopped' | 'abandoned';
  strictness: 'soft' | 'standard' | 'strict';
  blockRuleSetId: string;
  blockWebsites?: boolean; // Toggle to enable or disable DNR website domain blocking during session
  completedOutcome?: 'yes' | 'partial' | 'no';
  completionNote?: string;
  // Pause support. The session stays status 'active' while paused. Active time is
  // (now - startedAt) minus totalPausedMs minus the current pause, if any.
  pausedAt?: string; // set only while currently paused
  totalPausedMs?: number; // accumulated length of all finished pauses
  pauseUpdatedAt?: string; // last time pause state changed, used to reconcile desktop and extension
  // Optional reflection captured on completion
  difficulty?: 1 | 2 | 3 | 4 | 5;
  estimateAccuracy?: 'under' | 'about_right' | 'over'; // under = took longer than planned
  wouldDoDifferently?: string;
  didOtherTasks?: boolean;
  otherTasksNote?: string;
  // AI Retrospective Fields
  aiSummary?: string;
  aiKeyHighlights?: string[];
  aiProductivityRating?: number;
}

// Block Attempt
export interface BlockAttempt {
  id: string;
  sessionId?: string;
  timestamp: string;
  url: string;
  domain: string;
  ruleId: string;
  action: 'blocked' | 'warned' | 'unlocked';
  unlockReason?: string;
  unlockMinutes?: number;
}

// Category
export interface Category {
  id: string;
  name: string;
  productivityWeight: number; // e.g. Deep Work = +1.0, Distracting = -0.7
  type: 'deep_work' | 'productive' | 'communication' | 'neutral' | 'distracting' | 'highly_distracting' | 'unknown';
}

// Classification Rule
export interface ClassificationRule {
  id: string;
  name: string;
  target: 'app' | 'title' | 'domain' | 'url';
  matchType: 'exact' | 'contains' | 'wildcard' | 'regex';
  pattern: string;
  categoryId: string;
  priority: number;
  enabled: boolean;
}

// Daily Summary
export interface DailySummary {
  date: string; // YYYY-MM-DD
  activeSeconds: number;
  focusedSeconds: number;
  productiveSeconds: number;
  distractingSeconds: number;
  neutralSeconds: number;
  contextSwitches: number;
  blockAttempts: number;
  unlocks: number;
  sessionsStarted: number;
  sessionsCompleted: number;
  outputsCompleted: number;
  focusScore: number; // 0 - 100
  generatedAt: string;
}

// ActivityProvider interface (Section 11)
export interface ActivityProvider {
  healthCheck(): Promise<ActivityHealth>;
  listBuckets(): Promise<ActivityBucket[]>;
  getDesktopEvents(range: DateRange): Promise<DesktopActivityEvent[]>;
  getBrowserEvents(range: DateRange): Promise<BrowserActivityEvent[]>;
  getAfkEvents(range: DateRange): Promise<AfkEvent[]>;
}

// Local Extension Bridge Types
export interface BridgeSessionResponse {
  active: boolean;
  session?: {
    id: string;
    task: string;
    startedAt: string;
    endsAt: string;
    strictness: 'soft' | 'standard' | 'strict';
  };
  rulesVersion: number;
  blockedDomains: string[];
  allowedExceptions: string[];
}

export interface UnlockRequestPayload {
  reason: string;
  minutes: number;
  sessionId?: string;
}

export interface BlockAttemptPayload {
  url: string;
  domain: string;
  ruleId: string;
  timestamp?: string;
  sessionId?: string;
}
