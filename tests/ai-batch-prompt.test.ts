import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAiBatchPrompt } from '../apps/desktop/src/services/aiBatchPrompt';
import { DEFAULT_CATEGORIES } from '../apps/desktop/src/services/categories';

class MemoryStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return Array.from(this.m.keys())[i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

beforeEach(() => {
  (globalThis as any).localStorage = new MemoryStorage();
  (globalThis as any).fetch = async () => {
    throw new Error('offline in tests');
  };
});

describe('AI batch import prompt', () => {
  it('lists every live category by its token and leaves out archived ones', () => {
    const cats = DEFAULT_CATEGORIES.map((c) => (c.id === 'admin' ? { ...c, archived: true } : c));
    const prompt = buildAiBatchPrompt(cats);
    expect(prompt).toContain('@coding (Coding)');
    expect(prompt).toContain('@planning (Planning & strategy)');
    expect(prompt).toContain('@time_waste (Time waste, wasted time, rarely applies)');
    expect(prompt).not.toContain('@admin');
    expect(prompt).not.toContain('{{');
  });

  it('includes a category you added yourself', () => {
    const prompt = buildAiBatchPrompt([...DEFAULT_CATEGORIES, { id: 'hiring', name: 'Hiring', color: '#fff' }]);
    expect(prompt).toContain('@hiring (Hiring)');
  });

  it('still works when no category is available', () => {
    const none = DEFAULT_CATEGORIES.map((c) => ({ ...c, archived: true }));
    const prompt = buildAiBatchPrompt(none);
    expect(prompt).toContain('none are set up');
    expect(prompt).not.toContain('{{');
    expect(prompt).not.toMatch(/\s@\w+ \(\d+m\)/);
  });

  it('gives examples that the real importer reads back with a category from the list', async () => {
    vi.resetModules();
    const tasks = (await import('../apps/desktop/src/stores/useTaskStore')).useTaskStore;
    const cats = (await import('../apps/desktop/src/stores/useCategoryStore')).useCategoryStore;

    const prompt = buildAiBatchPrompt(cats.getState().categories);
    const examples = prompt
      .split('EXAMPLE OF THE ONLY ACCEPTABLE OUTPUT STYLE:')[1]
      .split('\n')
      .filter((l) => l.startsWith('- [ ] '));
    expect(examples).toHaveLength(4);

    expect(await tasks.getState().batchCreateTasks(examples.join('\n'))).toBe(4);
    const imported = tasks.getState().tasks;
    const ids = new Set(cats.getState().categories.map((c) => c.id));
    for (const t of imported) {
      expect(t.categoryId && ids.has(t.categoryId)).toBeTruthy();
      expect(t.title).not.toMatch(/[@#()[\]]/);
      expect(t.estimatedMinutes).toBeGreaterThan(0);
    }
  });
});
