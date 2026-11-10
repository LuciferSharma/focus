import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FocusSession, TaskCategory } from '@focuswatch/shared-types';
import {
  CATEGORY_STORAGE_KEY,
  DEFAULT_CATEGORIES,
  loadCategories,
  makeCategoryId,
  resolveCategoryToken,
} from '../apps/desktop/src/services/categories';
import { computeCategoryStats } from '../apps/desktop/src/services/categoryStats';

class MemoryStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return Array.from(this.m.keys())[i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

describe('default categories', () => {
  it('ships the agreed starter set, with only Time waste counted as waste', () => {
    expect(DEFAULT_CATEGORIES.map((c) => c.name)).toEqual([
      'Coding', 'Content', 'Sales', 'Research', 'Communication', 'Planning & strategy', 'Admin & ops', 'Time waste',
    ]);
    expect(DEFAULT_CATEGORIES.filter((c) => c.isWaste).map((c) => c.id)).toEqual(['time_waste']);
  });

  it('loads defaults from empty or corrupted storage', () => {
    expect(loadCategories(undefined)).toEqual(DEFAULT_CATEGORIES);
    const bad = new MemoryStorage();
    bad.setItem(CATEGORY_STORAGE_KEY, '{not json');
    expect(loadCategories(bad)).toEqual(DEFAULT_CATEGORIES);
    bad.setItem(CATEGORY_STORAGE_KEY, JSON.stringify({ nope: true }));
    expect(loadCategories(bad)).toEqual(DEFAULT_CATEGORIES);
  });

  it('keeps your own categories and still restores any built-in that is missing', () => {
    const storage = new MemoryStorage();
    const custom: TaskCategory[] = [
      { id: 'coding', name: 'Programming', color: '#000000' },
      { id: 'hiring', name: 'Hiring', color: '#111111' },
    ];
    storage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(custom));
    const loaded = loadCategories(storage);
    expect(loaded.find((c) => c.id === 'coding')!.name).toBe('Programming'); // rename kept
    expect(loaded.find((c) => c.id === 'hiring')).toBeTruthy(); // custom kept
    expect(loaded.find((c) => c.id === 'sales')).toBeTruthy(); // missing built-in restored
  });

  it('makes readable unique ids for new categories', () => {
    expect(makeCategoryId('Hiring & HR', DEFAULT_CATEGORIES)).toBe('hiringhr');
    const taken = [...DEFAULT_CATEGORIES, { id: 'hiring', name: 'Hiring', color: '#fff' }];
    expect(makeCategoryId('Hiring', taken)).toBe('hiring_2');
    expect(makeCategoryId('!!!', DEFAULT_CATEGORIES)).toBe('category');
  });
});

describe('@category tokens', () => {
  const cats = DEFAULT_CATEGORIES;
  it('matches by id or by name, ignoring case and punctuation', () => {
    expect(resolveCategoryToken('coding', cats)?.id).toBe('coding');
    expect(resolveCategoryToken('CODING', cats)?.id).toBe('coding');
    expect(resolveCategoryToken('time-waste', cats)?.id).toBe('time_waste');
    expect(resolveCategoryToken('timewaste', cats)?.id).toBe('time_waste');
    expect(resolveCategoryToken('Admin&ops', cats)?.id).toBe('admin');
  });
  it('accepts a unique prefix of a name, but not an ambiguous or tiny one', () => {
    expect(resolveCategoryToken('planning', cats)?.id).toBe('planning');
    expect(resolveCategoryToken('commun', cats)?.id).toBe('communication');
    expect(resolveCategoryToken('co', cats)).toBeUndefined();
    const twins: TaskCategory[] = [
      { id: 'a', name: 'Marketing ads', color: '#1' },
      { id: 'b', name: 'Marketing email', color: '#2' },
    ];
    expect(resolveCategoryToken('marketing', twins)).toBeUndefined();
  });
  it('ignores unknown words and archived categories', () => {
    expect(resolveCategoryToken('nonsense', cats)).toBeUndefined();
    expect(resolveCategoryToken('', cats)).toBeUndefined();
    const archived = cats.map((c) => (c.id === 'sales' ? { ...c, archived: true } : c));
    expect(resolveCategoryToken('sales', archived)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------------------------
const MIN = 60_000;
let seq = 0;

function done(categoryId: string | undefined, plannedMin: number, activeMin: number, daysAgo: number, extra: Partial<FocusSession> = {}): FocusSession {
  seq += 1;
  const start = Date.parse('2026-03-18T10:00:00') - daysAgo * 24 * 60 * MIN;
  return {
    id: `c${seq}`, task: `Task ${seq}`, categoryId, plannedMinutes: plannedMin,
    startedAt: new Date(start).toISOString(), plannedEndAt: new Date(start + plannedMin * MIN).toISOString(),
    endedAt: new Date(start + activeMin * MIN).toISOString(), status: 'completed', strictness: 'standard',
    blockRuleSetId: 'default_v1', completedOutcome: 'yes', ...extra,
  };
}

describe('computeCategoryStats', () => {
  it('splits time by category and keeps waste out of productive time', () => {
    const r = computeCategoryStats(
      [done('coding', 60, 60, 1), done('coding', 60, 60, 2), done('sales', 30, 30, 1), done('time_waste', 30, 30, 1)],
      DEFAULT_CATEGORIES
    );
    expect(r.totalMinutes).toBe(180);
    expect(r.wasteMinutes).toBe(30);
    expect(r.productiveMinutes).toBe(150);
    expect(r.rows.map((x) => x.id)).toEqual(['coding', 'sales', 'time_waste']);
    expect(r.rows[2]).toMatchObject({ isWaste: true, successRate: null });
    expect(r.headlines.join(' ')).toContain('67% of your session time went to Coding');
    expect(r.headlines.join(' ')).toContain('30m (17%) of session time was logged as wasted time');
  });

  it('files sessions without a category under their task, then under Uncategorized', () => {
    const viaTask = { ...done(undefined, 30, 30, 1), taskId: 'task_x' };
    const lost = done(undefined, 30, 30, 1);
    const unknownId = done('deleted_category', 30, 30, 1);
    const r = computeCategoryStats([viaTask, lost, unknownId], DEFAULT_CATEGORIES, { task_x: 'research' });
    expect(r.rows.find((x) => x.id === 'research')!.sessions).toBe(1);
    expect(r.rows.find((x) => x.id === '__none__')!.sessions).toBe(2);
  });

  it('still counts a session whose category was archived', () => {
    const archived = DEFAULT_CATEGORIES.map((c) => (c.id === 'sales' ? { ...c, archived: true } : c));
    const r = computeCategoryStats([done('sales', 30, 30, 1)], archived);
    expect(r.rows[0].name).toBe('Sales');
  });

  it('measures success, overrun, difficulty and your own estimate per category', () => {
    const r = computeCategoryStats(
      [
        done('coding', 30, 50, 1, { completedOutcome: 'partial', difficulty: 4, estimateAccuracy: 'under' }),
        done('coding', 30, 45, 2, { completedOutcome: 'yes', difficulty: 5, estimateAccuracy: 'under' }),
        done('coding', 30, 30, 3, { completedOutcome: 'no', estimateAccuracy: 'about_right' }),
        done('sales', 30, 28, 1), done('sales', 30, 30, 2), done('sales', 30, 31, 3),
      ],
      DEFAULT_CATEGORIES
    );
    const coding = r.rows.find((x) => x.id === 'coding')!;
    expect(coding).toMatchObject({ sessions: 3, fulfilled: 1, partial: 1, missed: 1, successRate: 33 });
    expect(coding.avgDeltaMinutes).toBe(12); // (20 + 15 + 0) / 3
    expect(coding.ranLongShare).toBe(67);
    expect(coding.difficultyAvg).toBe(4.5);
    expect(coding).toMatchObject({ estimateAnswered: 3, underCount: 2, underShare: 67 });
    const text = r.headlines.join(' ');
    expect(text).toContain('Coding runs 12m over plan on average');
    expect(text).toContain('Sales sessions are fulfilled 100% of the time, Coding only 33%');
  });

  it('builds continuous Monday-based weeks and reports a real shift', () => {
    const r = computeCategoryStats(
      [
        done('coding', 60, 60, 16), // two weeks back
        done('coding', 60, 60, 2),
        done('coding', 60, 60, 1),
        done('coding', 60, 60, 0),
        done('sales', 60, 60, 0),
      ],
      DEFAULT_CATEGORIES
    );
    expect(r.weeks.length).toBeGreaterThanOrEqual(3);
    // There is no gap between the first and last week, even where nothing happened.
    const starts = r.weeks.map((w) => Date.parse(w.weekStart));
    starts.slice(1).forEach((t, i) => expect(Math.round((t - starts[i]) / (24 * 60 * MIN))).toBe(7));
    expect(r.weekSeries.map((s) => s.id).sort()).toEqual(['coding', 'sales']);
    expect(r.weeks.reduce((a, w) => a + w.total, 0)).toBe(r.totalMinutes);
  });

  it('copes with no sessions and ignores a session still running', () => {
    expect(computeCategoryStats([], DEFAULT_CATEGORIES)).toMatchObject({ rows: [], totalMinutes: 0, weeks: [], headlines: [] });
    const running = done('coding', 30, 30, 0, { status: 'active', endedAt: undefined });
    expect(computeCategoryStats([running], DEFAULT_CATEGORIES).rows).toEqual([]);
  });
});
