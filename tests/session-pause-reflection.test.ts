/**
 * Pause/resume, reflection, and proof-screenshot behavior, using the real desktop session
 * store against a real scratch copy of the standalone bridge.
 */
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { activeElapsedMs, pausedMs } from '../apps/desktop/src/services/sessionTime';

const TEST_PORT = 47997;
const REAL_BRIDGE = 'http://127.0.0.1:47777';
const TEST_BRIDGE = `http://127.0.0.1:${TEST_PORT}`;

// IndexedDB does not exist in Node, so image storage is replaced with an in-memory fake.
const fakeAttachments: any[] = [];
vi.mock('../apps/desktop/src/services/attachmentStore', () => ({
  attachmentStore: {
    MAX_IMAGES_PER_SESSION: 12,
    add: async (sessionId: string, blob: Blob, meta: any) => {
      fakeAttachments.push({ sessionId, size: blob.size, type: blob.type, ...meta });
      return { id: `att_${fakeAttachments.length}` };
    },
    listForSession: async (id: string) => fakeAttachments.filter((a) => a.sessionId === id),
    countForSession: async () => 0,
    remove: async () => {},
    removeAllForSession: async () => {},
  },
}));

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

const post = (path: string, body: unknown = {}) =>
  realFetch(`${TEST_BRIDGE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const get = async (path: string) => (await realFetch(`${TEST_BRIDGE}${path}`)).json() as Promise<any>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function openWindow() {
  vi.resetModules();
  const store = (await import('../apps/desktop/src/stores/useSessionStore')).useSessionStore;
  const tasks = (await import('../apps/desktop/src/stores/useTaskStore')).useTaskStore;
  const db = (await import('../apps/desktop/src/services/db')).dbService;
  return { store, tasks, db };
}

type Win = Awaited<ReturnType<typeof openWindow>>;

async function startSession(w: Win, minutes = 60) {
  await w.store.getState().startSession({
    task: 'Write the report', expectedOutput: 'A draft', plannedMinutes: minutes,
    strictness: 'soft', blockWebsites: true,
  });
  await sleep(100);
  return w.store.getState().activeSession!;
}

beforeAll(async () => {
  stateDir = mkdtempSync(join(tmpdir(), 'fw-bridge2-'));
  bridge = spawn(process.execPath, [join(__dirname, '..', 'apps', 'desktop', 'bridge-standalone.cjs')], {
    env: {
      ...process.env,
      FOCUSWATCH_BRIDGE_PORT: String(TEST_PORT),
      FOCUSWATCH_STATE_FILE: join(stateDir, 'state.json'),
      FOCUSWATCH_ARTIFACT_DIR: join(stateDir, 'artifacts'),
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 40; i++) {
    try { if ((await realFetch(`${TEST_BRIDGE}/health`)).ok) break; } catch {}
    await sleep(150);
  }
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
  fakeAttachments.length = 0;
  (globalThis as any).localStorage = new MemoryStorage();
  (globalThis as any).document = { hidden: false, hasFocus: () => true };
  await post('/session/active', { active: false, started_at: null });
  await post('/session/finish/ack', {});
  for (const a of (await get('/session/artifacts')).artifacts) await post('/session/artifacts/ack', { id: a.id });
});

describe('active time excludes pauses', () => {
  const start = '2026-01-01T10:00:00.000Z';
  const at = (min: number) => Date.parse(start) + min * 60_000;

  it('subtracts finished pauses', () => {
    expect(activeElapsedMs({ startedAt: start, totalPausedMs: 10 * 60_000 }, at(60))).toBe(50 * 60_000);
  });
  it('freezes during an open pause', () => {
    const s = { startedAt: start, pausedAt: new Date(at(20)).toISOString(), totalPausedMs: 0 };
    expect(activeElapsedMs(s, at(20))).toBe(20 * 60_000);
    expect(activeElapsedMs(s, at(50))).toBe(20 * 60_000);
    expect(pausedMs(s, at(50))).toBe(30 * 60_000);
  });
  it('uses endedAt for finished sessions and ignores a stale pausedAt', () => {
    const s = { startedAt: start, endedAt: new Date(at(45)).toISOString(), totalPausedMs: 15 * 60_000 };
    expect(activeElapsedMs(s, at(500))).toBe(30 * 60_000);
  });
});

describe('pausing', () => {
  it('pausing on the desktop tells the bridge, and resuming accumulates paused time', async () => {
    const w = await openWindow();
    await startSession(w);

    await w.store.getState().pauseSession();
    let b = await get('/session/active');
    expect(b.active).toBe(true);
    expect(b.paused).toBe(true);
    expect(b.paused_at).toBeTruthy();

    await sleep(300);
    await w.store.getState().resumeSession();
    b = await get('/session/active');
    expect(b.paused).toBe(false);
    expect(b.total_paused_ms).toBeGreaterThanOrEqual(250);
    expect(w.store.getState().activeSession!.pausedAt).toBeUndefined();
  });

  it('follows a pause done from the extension, and a stale desktop sync cannot undo it', async () => {
    const w = await openWindow();
    const s = await startSession(w);

    const res = await post('/session/pause', { started_at: s.startedAt, source: 'extension' });
    expect(res.status).toBe(200);

    // The desktop timer fires before it has noticed. Its older state must not win.
    w.store.getState().tickTimer();
    await sleep(150);
    expect((await get('/session/active')).paused).toBe(true);

    await w.store.getState().pollBridge();
    expect(w.store.getState().activeSession!.pausedAt).toBeTruthy();

    // And back again.
    await post('/session/resume', { started_at: s.startedAt });
    await w.store.getState().pollBridge();
    expect(w.store.getState().activeSession!.pausedAt).toBeUndefined();
    expect(w.store.getState().activeSession!.totalPausedMs).toBeGreaterThanOrEqual(0);
  });

  it('rejects pause or resume with nothing running, or for a different session', async () => {
    expect((await post('/session/pause', {})).status).toBe(409);
    const w = await openWindow();
    const s = await startSession(w);
    expect((await post('/session/pause', { started_at: '1999-01-01T00:00:00Z' })).status).toBe(409);
    expect((await post('/session/resume', { started_at: s.startedAt })).status).toBe(200); // not paused: harmless
  });

  it('does not run the clock or raise the time-up prompt while paused', async () => {
    const w = await openWindow();
    const s = await startSession(w, 30);
    // 40 minutes in, but 25 of them were paused: only 15 active minutes.
    w.store.setState({
      activeSession: {
        ...s,
        startedAt: new Date(Date.now() - 40 * 60_000).toISOString(),
        totalPausedMs: 25 * 60_000,
      },
    });
    w.store.getState().tickTimer();
    expect(w.store.getState().elapsedSeconds).toBe(15 * 60);
    expect(w.store.getState().isOutcomeModalOpen).toBe(false);

    // Same wall clock, currently paused for the last 20 minutes: still nothing.
    w.store.setState({
      activeSession: {
        ...w.store.getState().activeSession!,
        totalPausedMs: 5 * 60_000,
        pausedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      },
    });
    w.store.getState().tickTimer();
    expect(w.store.getState().elapsedSeconds).toBe(15 * 60);
    expect(w.store.getState().isOutcomeModalOpen).toBe(false);
  });

  it('finishing while paused folds the open pause into the total', async () => {
    const w = await openWindow();
    const s = await startSession(w);
    w.store.setState({
      activeSession: { ...s, pausedAt: new Date(Date.now() - 10 * 60_000).toISOString(), totalPausedMs: 5 * 60_000 },
    });
    await w.store.getState().endSession('yes');
    const saved = (await w.db.getAllFocusSessions()).find((x) => x.startedAt === s.startedAt)!;
    expect(saved.pausedAt).toBeUndefined();
    expect(Math.round(saved.totalPausedMs! / 60_000)).toBe(15);
  });
});

describe('reflection', () => {
  it('saves the optional answers and tidies them', async () => {
    const w = await openWindow();
    const s = await startSession(w);
    await w.store.getState().endSession('partial', 'got most of it', undefined, {
      difficulty: 4,
      estimateAccuracy: 'under',
      wouldDoDifferently: '  start earlier  ',
      didOtherTasks: false,
      otherTasksNote: 'should be dropped',
    });
    const saved = (await w.db.getAllFocusSessions()).find((x) => x.id === s.id)!;
    expect(saved.difficulty).toBe(4);
    expect(saved.estimateAccuracy).toBe('under');
    expect(saved.wouldDoDifferently).toBe('start earlier');
    expect(saved.didOtherTasks).toBe(false);
    expect(saved.otherTasksNote).toBeUndefined();
  });

  it('ending with no reflection at all still works', async () => {
    const w = await openWindow();
    const s = await startSession(w);
    await w.store.getState().endSession('yes');
    const saved = (await w.db.getAllFocusSessions()).find((x) => x.id === s.id)!;
    expect(saved.status).toBe('completed');
    expect(saved.difficulty).toBeUndefined();
  });

  it('records a difficulty rating and paused total submitted from the extension', async () => {
    const w = await openWindow();
    const s = await startSession(w);
    await post('/session/pause', { started_at: s.startedAt });
    await sleep(250);
    const res = await post('/session/finish', {
      outcome: 'yes', note: 'done', difficulty: 3, started_at: s.startedAt, source: 'extension',
    });
    expect(res.status).toBe(200);
    expect((await get('/session/finish')).pending.total_paused_ms).toBeGreaterThanOrEqual(200);

    await w.store.getState().pollBridge();
    const saved = (await w.db.getAllFocusSessions()).find((x) => x.id === s.id)!;
    expect(saved.difficulty).toBe(3);
    expect(saved.totalPausedMs).toBeGreaterThanOrEqual(200);
    expect(saved.pausedAt).toBeUndefined();
  });

  it('ignores an out-of-range difficulty from the extension', async () => {
    const w = await openWindow();
    const s = await startSession(w);
    await post('/session/finish', { outcome: 'no', difficulty: 9, started_at: s.startedAt });
    expect((await get('/session/finish')).pending.difficulty).toBeNull();
  });
});

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const sendProof = (sessionStartedAt: string | null, title = 'Docs page') =>
  post('/session/artifact', {
    session_started_at: sessionStartedAt,
    timestamp: new Date().toISOString(),
    url: 'https://example.com/docs',
    title,
    imageDataUrl: TINY_PNG,
  });

describe('proof screenshots from the extension', () => {
  it('accepts images, serves the exact bytes, and rejects anything else', async () => {
    const ok = await sendProof(null);
    expect(ok.status).toBe(200);
    const { artifacts } = await get('/session/artifacts');
    expect(artifacts).toHaveLength(1);

    const bytes = Buffer.from(await (await realFetch(`${TEST_BRIDGE}/artifacts/${artifacts[0].id}`)).arrayBuffer());
    expect(bytes.equals(Buffer.from(TINY_PNG.split(',')[1], 'base64'))).toBe(true);

    const bad = await post('/session/artifact', { imageDataUrl: 'data:text/html;base64,PGI+aGk8L2I+' });
    expect(bad.status).toBe(400);
    expect((await post('/session/artifact', { imageDataUrl: 'not a data url' })).status).toBe(400);
  });

  it('attaches the screenshot to the running session and clears the bridge copy', async () => {
    const w = await openWindow();
    const s = await startSession(w);
    await sendProof(s.startedAt, 'My dashboard');

    await w.store.getState().pollBridge();

    expect(fakeAttachments).toHaveLength(1);
    expect(fakeAttachments[0]).toMatchObject({ sessionId: s.id, source: 'extension', note: 'My dashboard', type: 'image/png' });
    expect((await get('/session/artifacts')).artifacts).toHaveLength(0);
    expect(w.store.getState().attachmentsVersion).toBe(1);
  });

  it('attaches an untagged capture to whatever session is running', async () => {
    const w = await openWindow();
    const s = await startSession(w);
    await sendProof(null);
    await w.store.getState().pollBridge();
    expect(fakeAttachments[0].sessionId).toBe(s.id);
  });

  it('does not attach twice if the same image is listed again', async () => {
    const w = await openWindow();
    const s = await startSession(w);
    await sendProof(s.startedAt);
    await w.store.getState().pollBridge();
    await w.store.getState().pollBridge();
    expect(fakeAttachments).toHaveLength(1);
  });

  it('keeps an image that has no session yet instead of dropping it', async () => {
    const w = await openWindow();
    await sendProof('2026-03-03T03:03:03.000Z');
    await w.store.getState().pollBridge();
    expect(fakeAttachments).toHaveLength(0);
    expect((await get('/session/artifacts')).artifacts).toHaveLength(1);
  });

  it('attaches a late image to a session that has already ended', async () => {
    const w = await openWindow();
    const s = await startSession(w);
    await w.store.getState().endSession('yes');
    await sendProof(s.startedAt);

    await w.store.getState().pollBridge();

    expect(fakeAttachments).toHaveLength(1);
    expect(fakeAttachments[0].sessionId).toBe(s.id);
  });
});

describe('categories through the bridge', () => {
  it('keeps every field of a task, including its category, effort and due date', async () => {
    const res = await post('/tasks', {
      id: 'task_cat_1', title: 'Cold outreach', categoryId: 'sales', effort: 'high', impact: 'high',
      dueDate: '2026-05-01', estimatedMinutes: 40, priority: 'high', tags: ['q2'],
    });
    expect(res.status).toBe(200);
    const stored = (await res.json()).task;
    expect(stored).toMatchObject({ categoryId: 'sales', effort: 'high', impact: 'high', dueDate: '2026-05-01', title: 'Cold outreach' });
    await realFetch(`${TEST_BRIDGE}/tasks?id=task_cat_1`, { method: 'DELETE' });
  });

  it('carries the session category to the extension and through a remote finish', async () => {
    const w = await openWindow();
    await w.store.getState().startSession({
      task: 'Write post', plannedMinutes: 30, strictness: 'soft', blockWebsites: false, categoryId: 'content',
    });
    await sleep(100);
    const live = await get('/session/active');
    expect(live.category_id).toBe('content');

    await post('/session/finish', { outcome: 'yes', started_at: live.started_at });
    expect((await get('/session/finish')).pending.category_id).toBe('content');

    // A window that never saw the session records it from the snapshot, category included.
    const other = await openWindow();
    (globalThis as any).localStorage = new MemoryStorage();
    const fresh = await openWindow();
    await fresh.store.getState().pollBridge();
    const saved = (await fresh.db.getAllFocusSessions()).find((s) => s.startedAt === live.started_at)!;
    expect(saved.categoryId).toBe('content');
    void other;
  });
});
