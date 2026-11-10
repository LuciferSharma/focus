import { create } from 'zustand';
import { TaskItem, TaskPriority, TaskStatus, SubTask } from '@focuswatch/shared-types';
import { dbService } from '../services/db';
import { resolveCategoryToken } from '../services/categories';
import { useCategoryStore } from './useCategoryStore';

const BRIDGE_URL = 'http://127.0.0.1:47777';

interface TaskState {
  tasks: TaskItem[];
  filterStatus: TaskStatus | 'all';
  filterPriority: TaskPriority | 'all';
  searchQuery: string;
  isDrawerOpen: boolean;
  isLoading: boolean;

  // Actions
  loadTasks: () => Promise<void>;
  createTask: (task: Omit<TaskItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<TaskItem>;
  batchCreateTasks: (rawMarkdownOrText: string) => Promise<number>;
  updateTask: (id: string, updates: Partial<TaskItem>) => Promise<void>;
  toggleSubtask: (taskId: string, subtaskId: string) => Promise<void>;
  addSubtask: (taskId: string, text: string) => Promise<void>;
  removeSubtask: (taskId: string, subtaskId: string) => Promise<void>;
  completeTask: (taskId: string) => Promise<void>;
  archiveTask: (taskId: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;

  // UI Filters
  setFilterStatus: (status: TaskStatus | 'all') => void;
  setFilterPriority: (priority: TaskPriority | 'all') => void;
  setSearchQuery: (query: string) => void;
  setDrawerOpen: (open: boolean) => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  filterStatus: 'all',
  filterPriority: 'all',
  searchQuery: '',
  isDrawerOpen: false,
  isLoading: false,

  loadTasks: async () => {
    set({ isLoading: true });
    try {
      const deletedIds = await dbService.getDeletedTaskIds();
      const localTasks = await dbService.getAllTasks();

      // Attempt to sync from standalone bridge HTTP server (127.0.0.1:47777/tasks)
      let remoteTasks: TaskItem[] = [];
      try {
        const res = await fetch(`${BRIDGE_URL}/tasks`);
        if (res.ok) {
          remoteTasks = await res.json();
        }
      } catch {}

      // Process remote tasks - skip any task that was previously deleted
      for (const rt of remoteTasks) {
        if (deletedIds.has(rt.id)) {
          // Re-send delete signal to bridge if it still exists remotely
          fetch(`${BRIDGE_URL}/tasks?id=${rt.id}`, { method: 'DELETE' }).catch(() => {});
          fetch(`${BRIDGE_URL}/tasks/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: rt.id }),
          }).catch(() => {});
          continue;
        }

        const existing = localTasks.find((t) => t.id === rt.id);
        if (!existing) {
          await dbService.saveTask(rt);
        } else if (new Date(rt.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
          await dbService.saveTask(rt);
        }
      }

      const merged = (await dbService.getAllTasks()).filter((t) => !deletedIds.has(t.id));
      set({ tasks: merged, isLoading: false });
    } catch (err) {
      console.error('Failed to load tasks from DB:', err);
      set({ isLoading: false });
    }
  },

  createTask: async (rawTask) => {
    const now = new Date().toISOString();
    const newTask: TaskItem = {
      ...rawTask,
      id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: now,
      updatedAt: now,
      tags: rawTask.tags || [],
      subtasks: rawTask.subtasks || [],
    };

    await dbService.saveTask(newTask);
    fetch(`${BRIDGE_URL}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTask),
    }).catch(() => {});

    set((state) => ({ tasks: [newTask, ...state.tasks] }));
    return newTask;
  },

  batchCreateTasks: async (rawMarkdownOrText: string) => {
    const lines = rawMarkdownOrText.split('\n');
    const newTasks: TaskItem[] = [];
    const now = new Date().toISOString();

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Strip markdown bullets: "- [ ]", "* [ ]", "-", "*", "1.", "1)"
      let cleaned = line
        .replace(/^[-*+]\s*\[[\s[xX]?\]\s*/, '')
        .replace(/^[-*+]\s+/, '')
        .replace(/^\d+[\.\)]\s+/, '')
        .trim();

      if (!cleaned) continue;

      // Extract #tags
      const tags: string[] = [];
      const tagMatches = cleaned.match(/#(\w+)/g);
      if (tagMatches) {
        tagMatches.forEach((t) => tags.push(t.substring(1)));
        cleaned = cleaned.replace(/#(\w+)/g, '').trim();
      }

      // Extract a category such as "@coding" or "@time-waste". A word that is not one of
      // your categories is left in the title untouched.
      let categoryId: string | undefined;
      const categoryMatch = cleaned.match(/(^|\s)@([A-Za-z0-9_&-]+)/);
      if (categoryMatch) {
        const resolved = resolveCategoryToken(categoryMatch[2], useCategoryStore.getState().categories);
        if (resolved) {
          categoryId = resolved.id;
          cleaned = cleaned.replace(categoryMatch[0], ' ').replace(/\s{2,}/g, ' ').trim();
        }
      }

      // Extract estimated minutes if formatted like (45m), [30 mins], etc.
      let estimatedMinutes = 45;
      const minMatch = cleaned.match(/[\(\[](\d+)\s*(?:m|min|mins|minutes)?[\)\]]/i);
      if (minMatch) {
        estimatedMinutes = parseInt(minMatch[1], 10);
        cleaned = cleaned.replace(/[\(\[]\d+\s*(?:m|min|mins|minutes)?[\)\]]/i, '').trim();
      }

      // Check priority keywords inside title
      let priority: TaskPriority = 'medium';
      if (cleaned.toLowerCase().includes('[critical]') || cleaned.toLowerCase().includes('priority:critical')) {
        priority = 'critical';
        cleaned = cleaned.replace(/\[critical\]|priority:critical/gi, '').trim();
      } else if (cleaned.toLowerCase().includes('[high]') || cleaned.toLowerCase().includes('priority:high')) {
        priority = 'high';
        cleaned = cleaned.replace(/\[high\]|priority:high/gi, '').trim();
      } else if (cleaned.toLowerCase().includes('[low]') || cleaned.toLowerCase().includes('priority:low')) {
        priority = 'low';
        cleaned = cleaned.replace(/\[low\]|priority:low/gi, '').trim();
      }

      const item: TaskItem = {
        id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        title: cleaned,
        estimatedMinutes,
        priority,
        status: 'backlog',
        tags,
        subtasks: [],
        categoryId,
        createdAt: now,
        updatedAt: now,
      };

      await dbService.saveTask(item);
      fetch(`${BRIDGE_URL}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      }).catch(() => {});

      newTasks.push(item);
    }

    if (newTasks.length > 0) {
      set((state) => ({ tasks: [...newTasks, ...state.tasks] }));
    }

    return newTasks.length;
  },

  updateTask: async (id, updates) => {
    const { tasks } = get();
    const existing = tasks.find((t) => t.id === id);
    if (!existing) return;

    const updated: TaskItem = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await dbService.saveTask(updated);
    fetch(`${BRIDGE_URL}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {});

    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? updated : t)),
    }));
  },

  toggleSubtask: async (taskId, subtaskId) => {
    const { tasks, updateTask } = get();
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const updatedSubtasks = task.subtasks.map((sub: SubTask) =>
      sub.id === subtaskId ? { ...sub, completed: !sub.completed } : sub
    );

    await updateTask(taskId, { subtasks: updatedSubtasks });
  },

  addSubtask: async (taskId, text) => {
    const { tasks, updateTask } = get();
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !text.trim()) return;

    const newSub: SubTask = {
      id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      text: text.trim(),
      completed: false,
    };

    await updateTask(taskId, { subtasks: [...task.subtasks, newSub] });
  },

  removeSubtask: async (taskId, subtaskId) => {
    const { tasks, updateTask } = get();
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const updatedSubtasks = task.subtasks.filter((sub: SubTask) => sub.id !== subtaskId);
    await updateTask(taskId, { subtasks: updatedSubtasks });
  },

  completeTask: async (taskId) => {
    const { updateTask } = get();
    const now = new Date().toISOString();
    await updateTask(taskId, {
      status: 'completed',
      completedAt: now,
    });
  },

  archiveTask: async (taskId) => {
    const { updateTask } = get();
    await updateTask(taskId, { status: 'archived' });
  },

  deleteTask: async (taskId) => {
    await dbService.deleteTask(taskId);

    // Notify bridge server to purge task from memory
    fetch(`${BRIDGE_URL}/tasks?id=${taskId}`, {
      method: 'DELETE',
    }).catch(() => {});

    fetch(`${BRIDGE_URL}/tasks/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId }),
    }).catch(() => {});

    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
    }));
  },

  setFilterStatus: (filterStatus) => set({ filterStatus }),
  setFilterPriority: (filterPriority) => set({ filterPriority }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setDrawerOpen: (isDrawerOpen) => set({ isDrawerOpen }),
}));
