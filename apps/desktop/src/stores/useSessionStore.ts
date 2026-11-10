import { create } from 'zustand';
import { FocusSession } from '@focuswatch/shared-types';
import { dbService } from '../services/db';
import { useTaskStore } from './useTaskStore';
import { activeElapsedSeconds } from '../services/sessionTime';
import { attachmentStore } from '../services/attachmentStore';

const BRIDGE_URL = 'http://127.0.0.1:47777';
const TIME_UP_STORAGE_KEY = 'focuswatch_timeup_fired_for';

type Outcome = 'yes' | 'partial' | 'no';

/** Optional reflection captured when a session ends. Everything here may be omitted. */
export interface SessionReflection {
  difficulty?: 1 | 2 | 3 | 4 | 5;
  estimateAccuracy?: 'under' | 'about_right' | 'over';
  wouldDoDifferently?: string;
  didOtherTasks?: boolean;
  otherTasksNote?: string;
  /** Authoritative paused total supplied by the bridge when the extension ended the session. */
  totalPausedMs?: number;
}

const collectedArtifactIds = new Set<string>();

// Started-at of the session this window most recently ended. Prevents a late bridge
// poll from resurrecting a session that was just finished here.
let lastEndedStartedAt: string | null = null;
let bridgePollInFlight = false;
let lastBridgeSyncAt = 0;

async function syncBridgeSession(active: boolean, session?: FocusSession | null) {
  try {
    const blocked = await dbService.getBlockedDomains();
    const allowed = await dbService.getAllowedExceptions();
    const startedAtIso = session?.startedAt || null;
    const plannedMins = session?.plannedMinutes || 25;
    const strictnessVal = session?.strictness || 'standard';
    const isBlockingActive = active && (session?.blockWebsites !== false);

    await fetch(`${BRIDGE_URL}/session/active`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        active,
        session_id: session?.id || null,
        task_id: session?.taskId || null,
        expected_output: session?.expectedOutput || null,
        category_id: session?.categoryId || null,
        task: session?.task || 'Focus Session',
        started_at: startedAtIso,
        startedAt: startedAtIso,
        planned_minutes: plannedMins,
        plannedMinutes: plannedMins,
        strictness_mode: strictnessVal,
        strictness: strictnessVal,
        block_websites: session?.blockWebsites !== false,
        blockWebsites: session?.blockWebsites !== false,
        paused: Boolean(session?.pausedAt),
        paused_at: session?.pausedAt || null,
        total_paused_ms: session?.totalPausedMs || 0,
        pause_updated_at: session?.pauseUpdatedAt || null,
        rules_version: Date.now(),
        blocked_domains: isBlockingActive ? blocked : [],
        allowed_exceptions: allowed,
      }),
    });
  } catch {}
}

// ---------------------------------------------------------------------------
// Time-up alerts
// ---------------------------------------------------------------------------

export function requestNotificationPermission() {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  } catch {}
}

function showDesktopNotification(title: string, body: string) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const n = new Notification(title, { body, requireInteraction: true, tag: 'focuswatch-time-up' });
    n.onclick = () => {
      try { window.focus(); } catch {}
      n.close();
    };
  } catch {}
}

function playChime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.28, 0.56].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t0 = ctx.currentTime + offset;
      osc.frequency.value = i === 2 ? 1040 : 780;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.24);
    });
    setTimeout(() => { void ctx.close(); }, 1500);
  } catch {}
}

// ---------------------------------------------------------------------------
// Inter-window broadcast channel for HUD widget sync
// ---------------------------------------------------------------------------

const stateBus = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('focuswatch_state_bus')
  : null;

if (stateBus) {
  stateBus.onmessage = (event) => {
    if (event.data?.type === 'TRIGGER_FINISH_SESSION') {
      useSessionStore.getState().openOutcomeModal();
    }
  };
}

function broadcastState(activeSession: FocusSession | null, elapsedSeconds: number) {
  if (stateBus) {
    stateBus.postMessage({
      type: 'SESSION_STATE_UPDATE',
      activeSession,
      elapsedSeconds,
      timestamp: Date.now(),
    });
  }
}

async function setWidgetVisibility(visible: boolean) {
  try {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const widget = await WebviewWindow.getByLabel('widget');
      if (widget) {
        if (visible) {
          await widget.show();
        } else {
          await widget.hide();
        }
      }
    }
  } catch (err) {
    console.warn('Tauri widget window control not available:', err);
  }
}

/** Keeps the linked task status in step with how the session ended. */
async function applyOutcomeToTask(taskId: string | undefined, outcome: Outcome) {
  if (!taskId) return;
  const taskStore = useTaskStore.getState();
  if (outcome === 'yes') {
    await taskStore.completeTask(taskId);
  } else if (outcome === 'partial') {
    await taskStore.updateTask(taskId, { status: 'in_progress' });
  } else {
    await taskStore.updateTask(taskId, { status: 'backlog' });
  }
}

/**
 * Rebuilds a local active session from what the bridge reports. This lets a freshly
 * opened or reloaded desktop window pick up a session that is already running (and that
 * the extension is already showing) instead of looking idle.
 */
async function sessionFromBridge(data: any): Promise<FocusSession | null> {
  if (!data || !data.active || !data.started_at || !data.task) return null;
  if (data.started_at === lastEndedStartedAt) return null;

  const startedMs = Date.parse(data.started_at);
  if (isNaN(startedMs)) return null;

  // Already finished in the local database? Then the bridge is just stale.
  const all = await dbService.getAllFocusSessions();
  if (all.some((s) => s.startedAt === data.started_at && s.status !== 'active')) {
    void syncBridgeSession(false);
    return null;
  }

  const planned = Number(data.planned_minutes) || 25;

  let taskId: string | undefined = data.task_id || undefined;
  if (!taskId) {
    const tasks = await dbService.getAllTasks();
    taskId = tasks.find(
      (t) => t.title === data.task && (t.status === 'in_progress' || t.status === 'backlog')
    )?.id;
  }

  const strictness = ['soft', 'standard', 'strict'].includes(data.strictness_mode)
    ? data.strictness_mode
    : 'standard';

  return {
    id: data.session_id || `session_${startedMs}`,
    taskId,
    task: data.task,
    expectedOutput: data.expected_output || undefined,
    categoryId: data.category_id || undefined,
    plannedMinutes: planned,
    startedAt: data.started_at,
    plannedEndAt: new Date(startedMs + planned * 60 * 1000).toISOString(),
    status: 'active',
    strictness,
    blockRuleSetId: 'default_v1',
    blockWebsites: data.block_websites !== false,
    pausedAt: data.paused ? data.paused_at || new Date().toISOString() : undefined,
    totalPausedMs: Number(data.total_paused_ms) || 0,
    pauseUpdatedAt: data.pause_updated_at || undefined,
  };
}

/** Pulls proof screenshots captured by the extension into local attachment storage. */
async function collectArtifacts(getActive: () => FocusSession | null) {
  const res = await fetch(`${BRIDGE_URL}/session/artifacts`);
  if (!res.ok) return;
  const { artifacts } = await res.json();
  if (!Array.isArray(artifacts) || artifacts.length === 0) return;

  const ack = (id: string) =>
    fetch(`${BRIDGE_URL}/session/artifacts/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {});

  let history: FocusSession[] | null = null;
  for (const a of artifacts) {
    if (collectedArtifactIds.has(a.id)) {
      await ack(a.id);
      continue;
    }

    const active = getActive();
    let sessionId: string | undefined;
    if (active && (!a.session_started_at || a.session_started_at === active.startedAt)) {
      sessionId = active.id;
    } else if (a.session_started_at) {
      history = history || (await dbService.getAllFocusSessions());
      sessionId = history.find((x) => x.startedAt === a.session_started_at)?.id;
    }

    if (!sessionId) {
      // No session to attach to yet. Keep it for an hour, then give up.
      if (Date.now() - Date.parse(a.timestamp) > 3600_000) await ack(a.id);
      continue;
    }

    try {
      const imgRes = await fetch(`${BRIDGE_URL}/artifacts/${a.id}`);
      if (!imgRes.ok) continue;
      const blob = await imgRes.blob();
      const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      const stamp = new Date(a.timestamp).toTimeString().slice(0, 8).replace(/:/g, '');
      await attachmentStore.add(sessionId, blob, {
        name: `proof-${stamp}.${ext}`,
        source: 'extension',
        note: a.title || a.url || undefined,
      });
      collectedArtifactIds.add(a.id);
      useSessionStore.setState((st) => ({ attachmentsVersion: st.attachmentsVersion + 1 }));
    } catch (err: any) {
      // Hitting the per-session cap or size limit is permanent, so drop it. Anything
      // else (storage hiccup) is retried on the next poll.
      if (!/at most|larger than|Only image/.test(String(err?.message || err))) continue;
    }
    await ack(a.id);
  }
}

export interface StartModalPrefill {
  task: string;
  expectedOutput?: string;
  plannedMinutes?: number;
  taskId?: string;
  categoryId?: string;
}

interface SessionState {
  activeSession: FocusSession | null;
  isStartModalOpen: boolean;
  startModalPrefill: StartModalPrefill | null;
  isOutcomeModalOpen: boolean;
  elapsedSeconds: number;
  /** Bumped whenever an attachment is added in the background, so open panels refresh. */
  attachmentsVersion: number;

  pauseSession: () => Promise<void>;
  resumeSession: () => Promise<void>;
  openStartModal: (prefill?: StartModalPrefill) => void;
  closeStartModal: () => void;
  openOutcomeModal: () => void;
  closeOutcomeModal: () => void;
  startSession: (params: {
    task: string;
    expectedOutput?: string;
    plannedMinutes: number;
    strictness: 'soft' | 'standard' | 'strict';
    blockWebsites?: boolean;
    taskId?: string;
    categoryId?: string;
  }) => Promise<void>;
  endSession: (
    outcome: Outcome,
    note?: string,
    endedAtIso?: string,
    extras?: SessionReflection
  ) => Promise<void>;
  loadActiveSession: () => Promise<void>;
  pollBridge: () => Promise<void>;
  tickTimer: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  activeSession: null,
  isStartModalOpen: false,
  startModalPrefill: null,
  isOutcomeModalOpen: false,
  elapsedSeconds: 0,
  attachmentsVersion: 0,

  openStartModal: (prefill) => set({ isStartModalOpen: true, startModalPrefill: prefill || null }),
  closeStartModal: () => set({ isStartModalOpen: false, startModalPrefill: null }),
  openOutcomeModal: () => set({ isOutcomeModalOpen: true }),
  closeOutcomeModal: () => set({ isOutcomeModalOpen: false }),

  loadActiveSession: async () => {
    const session = await dbService.getActiveSession();
    if (session) {
      const start = new Date(session.startedAt).getTime();
      const elapsed = activeElapsedSeconds(session);
      const maxAllowedElapsedSec = Math.max((session.plannedMinutes || 25) * 60 * 2.5, 8 * 3600);

      if (elapsed > maxAllowedElapsedSec) {
        console.warn(`[SessionStore] Auto-capping runaway session ${session.id} (elapsed: ${elapsed}s)`);
        const autoEndedAt = new Date(start + (session.plannedMinutes || 25) * 60 * 1000).toISOString();
        const endedSession: FocusSession = {
          ...session,
          endedAt: autoEndedAt,
          status: 'completed',
          completedOutcome: session.completedOutcome || 'yes',
          completionNote: session.completionNote || 'Auto-completed runaway session',
        };
        await dbService.saveFocusSession(endedSession);
        lastEndedStartedAt = session.startedAt;
        set({ activeSession: null, elapsedSeconds: 0 });
        syncBridgeSession(false);
        broadcastState(null, 0);
        setWidgetVisibility(false);
        return;
      }

      set({ activeSession: session, elapsedSeconds: elapsed });
      syncBridgeSession(true, session);
      broadcastState(session, elapsed);
      return;
    }

    // Nothing running locally. Before telling the bridge it is idle (which would wipe a
    // session the extension is showing), see whether the bridge has one we should adopt.
    try {
      const res = await fetch(`${BRIDGE_URL}/session/active`);
      if (res.ok) {
        const adopted = await sessionFromBridge(await res.json());
        if (adopted) {
          await dbService.saveFocusSession(adopted);
          const elapsed = activeElapsedSeconds(adopted);
          set({ activeSession: adopted, elapsedSeconds: elapsed });
          syncBridgeSession(true, adopted);
          broadcastState(adopted, elapsed);
          setWidgetVisibility(true);
          return;
        }
      }
    } catch {}

    syncBridgeSession(false);
    broadcastState(null, 0);
  },

  startSession: async ({ task, expectedOutput, plannedMinutes, strictness, blockWebsites = true, taskId, categoryId }) => {
    const now = new Date();

    // A session inherits its task's category unless one was chosen explicitly.
    let sessionCategoryId = categoryId;
    if (!sessionCategoryId && taskId) {
      sessionCategoryId = useTaskStore.getState().tasks.find((t) => t.id === taskId)?.categoryId;
    }
    const plannedEnd = new Date(now.getTime() + plannedMinutes * 60 * 1000);

    const newSession: FocusSession = {
      id: `session_${Date.now()}`,
      taskId,
      task,
      expectedOutput,
      categoryId: sessionCategoryId,
      plannedMinutes,
      startedAt: now.toISOString(),
      plannedEndAt: plannedEnd.toISOString(),
      status: 'active',
      strictness,
      blockRuleSetId: 'default_v1',
      blockWebsites,
    };

    // Starting a session is a user gesture, the only moment the browser lets us ask
    // for permission to show the time-up notification.
    requestNotificationPermission();

    await dbService.saveFocusSession(newSession);
    set({
      activeSession: newSession,
      isStartModalOpen: false,
      startModalPrefill: null,
      elapsedSeconds: 0,
    });

    syncBridgeSession(true, newSession);
    broadcastState(newSession, 0);
    setWidgetVisibility(true);
  },

  pauseSession: async () => {
    const { activeSession } = get();
    if (!activeSession || activeSession.pausedAt) return;
    const nowIso = new Date().toISOString();
    const paused: FocusSession = { ...activeSession, pausedAt: nowIso, pauseUpdatedAt: nowIso };
    await dbService.saveFocusSession(paused);
    set({ activeSession: paused, elapsedSeconds: activeElapsedSeconds(paused) });
    await syncBridgeSession(true, paused);
    broadcastState(paused, activeElapsedSeconds(paused));
  },

  resumeSession: async () => {
    const { activeSession } = get();
    if (!activeSession || !activeSession.pausedAt) return;
    const now = Date.now();
    const pausedFor = Math.max(0, now - Date.parse(activeSession.pausedAt));
    const resumed: FocusSession = {
      ...activeSession,
      pausedAt: undefined,
      totalPausedMs: (activeSession.totalPausedMs || 0) + pausedFor,
      pauseUpdatedAt: new Date(now).toISOString(),
    };
    await dbService.saveFocusSession(resumed);
    set({ activeSession: resumed, elapsedSeconds: activeElapsedSeconds(resumed) });
    await syncBridgeSession(true, resumed);
    broadcastState(resumed, activeElapsedSeconds(resumed));
  },

  endSession: async (outcome, note, endedAtIso, extras) => {
    const { activeSession } = get();
    if (!activeSession) return;

    lastEndedStartedAt = activeSession.startedAt;

    const endedAt = endedAtIso || new Date().toISOString();
    // Fold a pause that is still open into the total, unless the bridge already did.
    let totalPausedMs = activeSession.totalPausedMs || 0;
    if (activeSession.pausedAt) {
      totalPausedMs += Math.max(0, Date.parse(endedAt) - Date.parse(activeSession.pausedAt));
    }
    if (extras?.totalPausedMs !== undefined) totalPausedMs = extras.totalPausedMs;

    const { totalPausedMs: _bridgeTotal, ...reflection } = extras || {};
    const trimmed = (v?: string) => (v && v.trim() ? v.trim() : undefined);

    const endedSession: FocusSession = {
      ...activeSession,
      pausedAt: undefined,
      pauseUpdatedAt: undefined,
      totalPausedMs,
      difficulty: reflection.difficulty,
      estimateAccuracy: reflection.estimateAccuracy,
      wouldDoDifferently: trimmed(reflection.wouldDoDifferently),
      didOtherTasks: reflection.didOtherTasks,
      otherTasksNote: reflection.didOtherTasks ? trimmed(reflection.otherTasksNote) : undefined,
      endedAt,
      status: 'completed',
      completedOutcome: outcome,
      completionNote: note,
    };

    await dbService.saveFocusSession(endedSession);
    await applyOutcomeToTask(activeSession.taskId, outcome);

    set({
      activeSession: null,
      isOutcomeModalOpen: false,
      elapsedSeconds: 0,
    });

    await syncBridgeSession(false);
    broadcastState(null, 0);
    setWidgetVisibility(false);
  },

  /**
   * Runs every few seconds to keep this window and the bridge in agreement:
   *  1. Record a result submitted from the extension.
   *  2. Adopt a session the bridge is running that this window does not know about.
   *  3. Follow a pause or resume done from the extension.
   *  4. Collect proof screenshots the extension captured.
   */
  pollBridge: async () => {
    if (bridgePollInFlight) return;
    bridgePollInFlight = true;
    try {
      const finishRes = await fetch(`${BRIDGE_URL}/session/finish`);
      if (finishRes.ok) {
        const { pending } = await finishRes.json();
        if (pending) {
          const { activeSession } = get();
          const matchesActive =
            activeSession &&
            (activeSession.startedAt === pending.started_at ||
              (pending.session_id && activeSession.id === pending.session_id));

          if (matchesActive) {
            await get().endSession(pending.outcome, pending.note || undefined, pending.ended_at, {
              difficulty: pending.difficulty || undefined,
              totalPausedMs: typeof pending.total_paused_ms === 'number' ? pending.total_paused_ms : undefined,
            });
          } else if (pending.started_at) {
            // Not the session running in this window: record it from the bridge snapshot
            // so the result is not lost, unless it is already in the history.
            const all = await dbService.getAllFocusSessions();
            const known = all.some((x) => x.startedAt === pending.started_at && x.status !== 'active');
            if (!known) {
              const startedMs = Date.parse(pending.started_at);
              const planned = Number(pending.planned_minutes) || 25;
              await dbService.saveFocusSession({
                id: pending.session_id || `session_${startedMs}`,
                taskId: pending.task_id || undefined,
                task: pending.task,
                expectedOutput: pending.expected_output || undefined,
                categoryId: pending.category_id || undefined,
                plannedMinutes: planned,
                startedAt: pending.started_at,
                plannedEndAt: new Date(startedMs + planned * 60 * 1000).toISOString(),
                endedAt: pending.ended_at,
                status: 'completed',
                strictness: pending.strictness_mode || 'standard',
                blockRuleSetId: 'default_v1',
                blockWebsites: pending.block_websites !== false,
                completedOutcome: pending.outcome,
                completionNote: pending.note || undefined,
                totalPausedMs: Number(pending.total_paused_ms) || 0,
                difficulty: pending.difficulty || undefined,
              });
              await applyOutcomeToTask(pending.task_id || undefined, pending.outcome);
            }
          }

          await fetch(`${BRIDGE_URL}/session/finish/ack`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ started_at: pending.started_at }),
          });
          return;
        }
      }

      const res = await fetch(`${BRIDGE_URL}/session/active`);
      if (res.ok) {
        const data = await res.json();
        const local = get().activeSession;

        if (!local) {
          const adopted = await sessionFromBridge(data);
          if (adopted && !get().activeSession) {
            await dbService.saveFocusSession(adopted);
            const elapsed = activeElapsedSeconds(adopted);
            set({ activeSession: adopted, elapsedSeconds: elapsed });
            broadcastState(adopted, elapsed);
            setWidgetVisibility(true);
          }
        } else if (data.active && data.started_at === local.startedAt) {
          // Same session on both sides: follow whichever side changed pause state last.
          const bridgeStamp = data.pause_updated_at ? Date.parse(data.pause_updated_at) : 0;
          const localStamp = local.pauseUpdatedAt ? Date.parse(local.pauseUpdatedAt) : 0;
          if (bridgeStamp > localStamp && get().activeSession?.startedAt === local.startedAt) {
            const updated: FocusSession = {
              ...local,
              pausedAt: data.paused ? data.paused_at || new Date().toISOString() : undefined,
              totalPausedMs: Number(data.total_paused_ms) || 0,
              pauseUpdatedAt: data.pause_updated_at,
            };
            await dbService.saveFocusSession(updated);
            const elapsed = activeElapsedSeconds(updated);
            set({ activeSession: updated, elapsedSeconds: elapsed });
            broadcastState(updated, elapsed);
          }
        }
      }

      await collectArtifacts(() => get().activeSession);
    } catch {
      // Bridge offline: nothing to do, the next poll retries.
    } finally {
      bridgePollInFlight = false;
    }
  },

  tickTimer: () => {
    const { activeSession, elapsedSeconds } = get();
    if (!activeSession) return;
    const now = Date.now();
    // Active time only: paused time does not count toward the timer or the planned end.
    const elapsed = activeElapsedSeconds(activeSession, now);
    if (elapsed !== elapsedSeconds) set({ elapsedSeconds: elapsed });

    // Re-announce the session to the bridge at least every 5s. This is based on wall-clock
    // time, not on elapsed seconds, because browsers throttle timers in background windows
    // to about one tick a minute and a modulo check would then almost never fire.
    if (now - lastBridgeSyncAt >= 5000) {
      lastBridgeSyncAt = now;
      syncBridgeSession(true, activeSession);
    }

    if (elapsed !== elapsedSeconds) {
      broadcastState(activeSession, elapsed);
    }

    // A paused session cannot run out of time.
    if (activeSession.pausedAt) return;

    // Time is up: alert once per session and bring up the submit-your-results prompt.
    const plannedSeconds = (activeSession.plannedMinutes || 25) * 60;
    if (elapsed >= plannedSeconds) {
      let alreadyAlerted = false;
      try { alreadyAlerted = localStorage.getItem(TIME_UP_STORAGE_KEY) === activeSession.id; } catch {}
      if (!alreadyAlerted) {
        try { localStorage.setItem(TIME_UP_STORAGE_KEY, activeSession.id); } catch {}
        playChime();
        if (document.hidden || !document.hasFocus()) {
          showDesktopNotification(
            'Time is up: submit your results',
            `${activeSession.task}\nOpen FocusWatch and record the outcome.`
          );
        }
        set({ isOutcomeModalOpen: true });
      }
    }
  },
}));
