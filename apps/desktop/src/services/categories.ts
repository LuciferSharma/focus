import { TaskCategory } from '@focuswatch/shared-types';

export const CATEGORY_STORAGE_KEY = 'focuswatch_task_categories';

/** Shown in analytics for tasks and sessions that have no category. Never stored. */
export const UNCATEGORIZED: TaskCategory = {
  id: '__none__',
  name: 'Uncategorized',
  color: '#64748b',
};

/** Colors offered when making or editing a category. */
export const CATEGORY_COLORS = [
  '#06b6d4', '#a855f7', '#10b981', '#6366f1', '#3b82f6', '#f59e0b',
  '#14b8a6', '#ec4899', '#84cc16', '#f97316', '#f43f5e', '#64748b',
];

export const DEFAULT_CATEGORIES: TaskCategory[] = [
  { id: 'coding', name: 'Coding', color: '#06b6d4', builtIn: true },
  { id: 'content', name: 'Content', color: '#a855f7', builtIn: true },
  { id: 'sales', name: 'Sales', color: '#10b981', builtIn: true },
  { id: 'research', name: 'Research', color: '#6366f1', builtIn: true },
  { id: 'communication', name: 'Communication', color: '#3b82f6', builtIn: true },
  { id: 'planning', name: 'Planning & strategy', color: '#f59e0b', builtIn: true },
  { id: 'admin', name: 'Admin & ops', color: '#14b8a6', builtIn: true },
  { id: 'time_waste', name: 'Time waste', color: '#f43f5e', isWaste: true, builtIn: true },
];

/** Reads the saved list. Built-in categories are always present, even if storage is empty or old. */
export function loadCategories(storage: Pick<Storage, 'getItem'> | undefined): TaskCategory[] {
  let saved: TaskCategory[] = [];
  try {
    const raw = storage?.getItem(CATEGORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      saved = parsed.filter(
        (c): c is TaskCategory => c && typeof c.id === 'string' && typeof c.name === 'string' && typeof c.color === 'string'
      );
    }
  } catch {
    saved = [];
  }
  const missingBuiltIns = DEFAULT_CATEGORIES.filter((d) => !saved.some((s) => s.id === d.id));
  return [...saved, ...missingBuiltIns].length === 0 ? DEFAULT_CATEGORIES : [...saved, ...missingBuiltIns];
}

/** Lower-cases and drops everything except letters and digits: "Time-waste", "time_waste", "Time waste" all match. */
export function normalizeToken(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Finds the category an `@token` refers to, by id or by name. Archived categories do not match. */
export function resolveCategoryToken(token: string, categories: TaskCategory[]): TaskCategory | undefined {
  const wanted = normalizeToken(token);
  if (!wanted) return undefined;
  const live = categories.filter((c) => !c.archived);
  return (
    live.find((c) => normalizeToken(c.id) === wanted) ||
    live.find((c) => normalizeToken(c.name) === wanted) ||
    // "planning" for "Planning & strategy": accept a unique prefix of at least 4 letters
    (wanted.length >= 4
      ? (() => {
          const hits = live.filter((c) => normalizeToken(c.name).startsWith(wanted));
          return hits.length === 1 ? hits[0] : undefined;
        })()
      : undefined)
  );
}

export function findCategory(id: string | undefined, categories: TaskCategory[]): TaskCategory | undefined {
  return id ? categories.find((c) => c.id === id) : undefined;
}

/** A readable id for a new category, unique among existing ones. */
export function makeCategoryId(name: string, existing: TaskCategory[]): string {
  const base = normalizeToken(name).slice(0, 24) || 'category';
  let id = base;
  let n = 2;
  while (existing.some((c) => c.id === id)) id = `${base}_${n++}`;
  return id;
}
