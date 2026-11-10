import { beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return Array.from(this.m.keys())[i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

/** A freshly opened window: new module graph, same browser storage. */
async function openWindow() {
  vi.resetModules();
  const categories = (await import('../apps/desktop/src/stores/useCategoryStore')).useCategoryStore;
  const tasks = (await import('../apps/desktop/src/stores/useTaskStore')).useTaskStore;
  const sessions = (await import('../apps/desktop/src/stores/useSessionStore')).useSessionStore;
  const db = (await import('../apps/desktop/src/services/db')).dbService;
  return { categories, tasks, sessions, db };
}

beforeEach(() => {
  (globalThis as any).localStorage = new MemoryStorage();
  (globalThis as any).document = { hidden: false, hasFocus: () => true };
  // Never reach the real bridge from a test.
  (globalThis as any).fetch = async () => {
    throw new Error('offline in tests');
  };
});

describe('category store', () => {
  it('adds, renames, recolors and archives, and remembers it all in the next window', async () => {
    const w = await openWindow();
    const added = w.categories.getState().addCategory('Hiring', '#123456');
    expect(added).toMatchObject({ id: 'hiring', name: 'Hiring', color: '#123456' });
    expect(w.categories.getState().addCategory('hiring')).toBeNull(); // same name, any case
    expect(w.categories.getState().addCategory('   ')).toBeNull();

    expect(w.categories.getState().updateCategory('coding', { name: 'Programming', color: '#abcdef' })).toBe(true);
    expect(w.categories.getState().updateCategory('coding', { name: 'Sales' })).toBe(false); // taken
    expect(w.categories.getState().updateCategory('sales', { archived: true })).toBe(true);
    expect(w.categories.getState().addCategory('Waste of time', undefined, true)!.isWaste).toBe(true);

    const next = await openWindow();
    const list = next.categories.getState().categories;
    expect(list.find((c) => c.id === 'coding')).toMatchObject({ name: 'Programming', color: '#abcdef' });
    expect(list.find((c) => c.id === 'sales')!.archived).toBe(true);
    expect(list.find((c) => c.id === 'hiring')).toBeTruthy();
    expect(list.find((c) => c.name === 'Waste of time')!.isWaste).toBe(true);
  });
});

describe('batch import with @category', () => {
  it('reads the category, tags, minutes and priority, and cleans the title', async () => {
    const w = await openWindow();
    const count = await w.tasks.getState().batchCreateTasks(
      [
        '- [ ] Fix login bug #dev @coding (30m) [high]',
        '- [ ] Call the supplier @Sales',
        '- [ ] Scroll the feed @time-waste (15m)',
        '- [ ] Draft pricing @planning (20m)',
      ].join('\n')
    );
    expect(count).toBe(4);
    const byTitle = (t: string) => w.tasks.getState().tasks.find((x) => x.title === t)!;

    expect(byTitle('Fix login bug')).toMatchObject({ categoryId: 'coding', tags: ['dev'], estimatedMinutes: 30, priority: 'high' });
    expect(byTitle('Call the supplier').categoryId).toBe('sales');
    expect(byTitle('Scroll the feed').categoryId).toBe('time_waste');
    expect(byTitle('Draft pricing').categoryId).toBe('planning');
  });

  it('leaves unknown @words and email addresses alone', async () => {
    const w = await openWindow();
    await w.tasks.getState().batchCreateTasks(
      ['- [ ] Ask @dave about the invoice', '- [ ] Email bob@coding.com the file', '- [ ] Plain task'].join('\n')
    );
    const tasks = w.tasks.getState().tasks;
    const dave = tasks.find((t) => t.title.includes('Ask'))!;
    expect(dave.title).toBe('Ask @dave about the invoice');
    expect(dave.categoryId).toBeUndefined();
    const mail = tasks.find((t) => t.title.includes('Email'))!;
    expect(mail.title).toBe('Email bob@coding.com the file');
    expect(mail.categoryId).toBeUndefined();
    expect(tasks.find((t) => t.title === 'Plain task')!.categoryId).toBeUndefined();
  });

  it('understands a category you added yourself, but not an archived one', async () => {
    const w = await openWindow();
    w.categories.getState().addCategory('Hiring');
    w.categories.getState().updateCategory('research', { archived: true });
    await w.tasks.getState().batchCreateTasks('- [ ] Review resumes @hiring\n- [ ] Read papers @research');
    const tasks = w.tasks.getState().tasks;
    expect(tasks.find((t) => t.title === 'Review resumes')!.categoryId).toBe('hiring');
    expect(tasks.find((t) => t.title.startsWith('Read papers'))!.categoryId).toBeUndefined();
  });
});

describe('sessions and categories', () => {
  const start = (w: Awaited<ReturnType<typeof openWindow>>, extra: Record<string, unknown>) =>
    w.sessions.getState().startSession({
      task: 'Some work', plannedMinutes: 30, strictness: 'soft', blockWebsites: false, ...extra,
    } as any);

  const makeTask = (w: Awaited<ReturnType<typeof openWindow>>, title: string, categoryId?: string) =>
    w.tasks.getState().createTask({
      title, estimatedMinutes: 30, priority: 'medium', status: 'backlog', tags: [], subtasks: [], categoryId,
    } as any);

  it('inherits the category of its task', async () => {
    const w = await openWindow();
    const task = await makeTask(w, 'Cold outreach', 'sales');
    await start(w, { taskId: task.id });
    expect(w.sessions.getState().activeSession!.categoryId).toBe('sales');
    expect((await w.db.getActiveSession())!.categoryId).toBe('sales');
  });

  it('lets a chosen category win over the task, and works with no task at all', async () => {
    const w = await openWindow();
    const task = await makeTask(w, 'Outreach', 'sales');
    await start(w, { taskId: task.id, categoryId: 'research' });
    expect(w.sessions.getState().activeSession!.categoryId).toBe('research');
    await w.sessions.getState().endSession('yes');

    await start(w, { categoryId: 'coding' });
    expect(w.sessions.getState().activeSession!.categoryId).toBe('coding');
    await w.sessions.getState().endSession('yes');

    await start(w, {});
    expect(w.sessions.getState().activeSession!.categoryId).toBeUndefined();
  });

  it('keeps the category on the finished session, in history', async () => {
    const w = await openWindow();
    await start(w, { categoryId: 'content' });
    const id = w.sessions.getState().activeSession!.id;
    await w.sessions.getState().endSession('partial', 'half done');
    const saved = (await w.db.getAllFocusSessions()).find((s) => s.id === id)!;
    expect(saved.categoryId).toBe('content');
  });

  it('can change and clear a task category later', async () => {
    const w = await openWindow();
    const task = await makeTask(w, 'Thing', 'admin');
    await w.tasks.getState().updateTask(task.id, { categoryId: 'planning' });
    expect(w.tasks.getState().tasks.find((t) => t.id === task.id)!.categoryId).toBe('planning');
    await w.tasks.getState().updateTask(task.id, { categoryId: undefined });
    expect((await w.db.getTaskById(task.id))!.categoryId).toBeUndefined();
  });
});
