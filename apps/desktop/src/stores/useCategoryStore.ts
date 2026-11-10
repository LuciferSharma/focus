import { create } from 'zustand';
import { TaskCategory } from '@focuswatch/shared-types';
import {
  CATEGORY_COLORS,
  CATEGORY_STORAGE_KEY,
  loadCategories,
  makeCategoryId,
  normalizeToken,
} from '../services/categories';

const storage = () => (typeof localStorage !== 'undefined' ? localStorage : undefined);

function persist(categories: TaskCategory[]) {
  try {
    storage()?.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(categories));
  } catch {}
}

interface CategoryState {
  categories: TaskCategory[];
  /** Adds a category. Returns it, or null if the name is empty or already used. */
  addCategory: (name: string, color?: string, isWaste?: boolean) => TaskCategory | null;
  updateCategory: (
    id: string,
    patch: Partial<Pick<TaskCategory, 'name' | 'color' | 'isWaste' | 'archived'>>
  ) => boolean;
}

export const useCategoryStore = create<CategoryState>((set, get) => ({
  categories: loadCategories(storage()),

  addCategory: (name, color, isWaste) => {
    const clean = name.trim();
    if (!clean) return null;
    const { categories } = get();
    if (categories.some((c) => normalizeToken(c.name) === normalizeToken(clean))) return null;

    const created: TaskCategory = {
      id: makeCategoryId(clean, categories),
      name: clean,
      color: color || CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length],
      isWaste: isWaste || undefined,
    };
    const next = [...categories, created];
    persist(next);
    set({ categories: next });
    return created;
  },

  updateCategory: (id, patch) => {
    const { categories } = get();
    const target = categories.find((c) => c.id === id);
    if (!target) return false;

    if (patch.name !== undefined) {
      const clean = patch.name.trim();
      if (!clean) return false;
      if (categories.some((c) => c.id !== id && normalizeToken(c.name) === normalizeToken(clean))) return false;
      patch = { ...patch, name: clean };
    }

    const next = categories.map((c) => (c.id === id ? { ...c, ...patch } : c));
    persist(next);
    set({ categories: next });
    return true;
  },
}));
