/**
 * Integration test: the real desktop session store talking to the real standalone bridge.
 *
 * Covers the "I ran a task, time ran out, and I could not stop or submit it" bug:
 *  - results submitted from the extension are recorded by the desktop and clear the bridge
 *  - a fresh desktop window adopts a session that is already running
 *  - the time-up prompt opens once per session
 */
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_PORT = 47998;
const REAL_BRIDGE = 'http://127.0.0.1:47777';
const TEST_BRIDGE = `http://127.0.0.1:${TEST_PORT}`;

let bridge: ChildProcess;
let stateDir: string;
const realFetch = globalThis.fetch;

class MemoryStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return Array.from(this.m.keys())[i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

async function waitForBridge() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await realFetch(`${TEST_BRIDGE}/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('test bridge did not start');
}

async function bridgeGet(path: string) {
  return (await realFetch(`${TEST_BRIDGE}${path}`)).json() as Promise<any>;
}
async function bridgePost(path: string, body: unknown) {
  return realFetch(`${TEST_BRIDGE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** A fresh module graph = a freshly opened desktop window (same storage unless cleared). */
async function openWindow() {
  vi.resetModules();
  const store = (await import('../apps/desktop/src/stores/useSessionStore')).useSessionStore;
  const tasks = (await import('../apps/desktop/src/stores/useTaskStore')).useTaskStore;
  const db = (await import('../apps/desktop/src/services/db')).dbService;
  return { store, tasks, db };
}

beforeAll(async () => {
  stateDir = mkdtempSync(join(tmpdir(), 'fw-bridge-'));
  bridge = spawn(process.execPath, [join(__dirname, '..', 'apps', 'desktop', 'bridge-standalone.cjs')], {
    env: {
      ...process.env,
      FOCUSWATCH_BRIDGE_PORT: String(TEST_PORT),
      FOCUSWATCH_STATE_FILE: join(stateDir, 'state.json'),
    },
    stdio: 'ignore',
  });
  await waitForBridge();

  // Point the store (hardcoded to :47777) at the scratch bridge.
  (globalThis as any).fetch = (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    return realFetch(url.replace(REAL_BRIDGE, TEST_BRIDGE), init);
  };
});

afterAll(() => {
  (globalThis as any).fetch = realFetch;
  bridge?.kill();
  rmSync(stateDir, { recursive: true, force: true });
});

beforeEach(async () => {
  (globalThis as any).localStorage = new MemoryStorage();
  (globalThis as any).document = { hidden: false, hasFocus: () => true };
  await bridgePost('/session/active', { active: false, started_at: null, session_id: null });
  await bridgePost('/session/finish/ack', {});
});

async function startLinkedSession(w: Awaited<ReturnType<typeof openWindow>>, minutes = 60) {
  const task = await w.tasks.getState().createTask({
    title: 'Assess phone-farm costs',
    estimatedMinutes: minutes,
    priority: 'medium',
    status: 'backlog',
    tags: [],
    subtasks: [],
  } as any);
  await w.store.getState().startSession({
    task: task.title,
    expectedOutput: 'Where to buy',
    plannedMinutes: minutes,
    strictness: 'soft',
    blockWebsites: true,
    taskId: task.id,
  });
  await w.tasks.getState().updateTask(task.id, { status: 'in_progress' });
  return task;
}

describe('submitting a session result from the extension', () => {
  it('announces the session identity to the bridge when it starts', async () => {
    const w = await openWindow();
    const task = await startLinkedSession(w);
    await new Promise((r) => setTimeout(r, 100));

    const s = await bridgeGet('/session/active');
    expect(s.active).toBe(true);
    expect(s.task_id).toBe(task.id);
    expect(s.session_id).toBe(w.store.getState().activeSession!.id);
    expect(s.expected_output).toBe('Where to buy');
  });

  it('records the result, updates the task, and clears the bridge', async () => {
    const w = await openWindow();
    const task = await startLinkedSession(w);
    await new Promise((r) => setTimeout(r, 100));
    const startedAt = (await bridgeGet('/session/active')).started_at;

    // Extension: stop and submit.
    const res = await bridgePost('/session/finish', {
      outcome: 'partial', note: 'got halfway', started_at: startedAt, source: 'extension',
    });
    expect(res.status).toBe(200);
    expect((await bridgeGet('/session/active')).active).toBe(false);

    // Desktop: next poll picks it up.
    await w.store.getState().pollBridge();

    expect(w.store.getState().activeSession).toBeNull();
    const saved = (await w.db.getAllFocusSessions()).find((s) => s.startedAt === startedAt)!;
    expect(saved.status).toBe('completed');
    expect(saved.completedOutcome).toBe('partial');
    expect(saved.completionNote).toBe('got halfway');
    expect(w.tasks.getState().tasks.find((t) => t.id === task.id)!.status).toBe('in_progress');
    expect((await bridgeGet('/session/finish')).pending).toBeNull();
  });

  it('marks the linked task completed on a "yes"', async () => {
    const w = await openWindow();
    const task = await startLinkedSession(w);
    await new Promise((r) => setTimeout(r, 100));
    const startedAt = (await bridgeGet('/session/active')).started_at;

    await bridgePost('/session/finish', { outcome: 'yes', started_at: startedAt });
    await w.store.getState().pollBridge();

    expect(w.tasks.getState().tasks.find((t) => t.id === task.id)!.status).toBe('completed');
  });

  it('does not let the ticking timer revive a session that was finished remotely', async () => {
    const w = await openWindow();
    await startLinkedSession(w);
    await new Promise((r) => setTimeout(r, 100));
    const startedAt = (await bridgeGet('/session/active')).started_at;

    await bridgePost('/session/finish', { outcome: 'no', started_at: startedAt });
    // Before the desktop has polled, its timer fires again and re-announces the session.
    w.store.getState().tickTimer();
    await new Promise((r) => setTimeout(r, 150));

    expect((await bridgeGet('/session/active')).active).toBe(false);
  });
});

describe('a freshly opened desktop window', () => {
  it('adopts a session the bridge is already running and links its task', async () => {
    const first = await openWindow();
    const task = await startLinkedSession(first);
    await new Promise((r) => setTimeout(r, 100));

    // Brand-new window with its own empty storage, but the task has synced across.
    (globalThis as any).localStorage = new MemoryStorage();
    const second = await openWindow();
    await second.db.saveTask({ ...task, status: 'in_progress' } as any);
    await second.store.getState().loadActiveSession();

    const adopted = second.store.getState().activeSession;
    expect(adopted).not.toBeNull();
    expect(adopted!.task).toBe('Assess phone-farm costs');
    expect(adopted!.taskId).toBe(task.id);
    expect((await bridgeGet('/session/active')).active).toBe(true);
  });

  it('does not resurrect a session it already finished', async () => {
    const w = await openWindow();
    await startLinkedSession(w);
    await new Promise((r) => setTimeout(r, 100));
    await w.store.getState().endSession('yes');
    await new Promise((r) => setTimeout(r, 100));

    await w.store.getState().pollBridge();
    expect(w.store.getState().activeSession).toBeNull();
  });
});

describe('time-up prompt', () => {
  it('opens the outcome prompt once when planned time has elapsed', async () => {
    const w = await openWindow();
    await w.store.getState().startSession({
      task: 'Overrun', plannedMinutes: 30, strictness: 'soft', blockWebsites: false,
    });
    const s = w.store.getState().activeSession!;
    // Pretend it started 31 minutes ago.
    w.store.setState({ activeSession: { ...s, startedAt: new Date(Date.now() - 31 * 60_000).toISOString() } });

    expect(w.store.getState().isOutcomeModalOpen).toBe(false);
    w.store.getState().tickTimer();
    expect(w.store.getState().isOutcomeModalOpen).toBe(true);

    // User dismisses it to keep working: it must not nag again every second.
    w.store.getState().closeOutcomeModal();
    w.store.getState().tickTimer();
    expect(w.store.getState().isOutcomeModalOpen).toBe(false);
  });

  it('stays quiet while time remains', async () => {
    const w = await openWindow();
    await w.store.getState().startSession({
      task: 'Plenty of time', plannedMinutes: 60, strictness: 'soft', blockWebsites: false,
    });
    w.store.getState().tickTimer();
    expect(w.store.getState().isOutcomeModalOpen).toBe(false);
  });
});
