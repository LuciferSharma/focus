import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Zap,
  Search,
  Filter,
  CheckCircle2,
  Circle,
  Trash2,
  Archive,
  ChevronDown,
  ChevronUp,
  FileText,
  Tag,
  Clock,
  Sparkles,
  X,
  ListTodo,
  Calendar,
  AlertTriangle,
  Grid,
  Target,
  Flame,
  ArrowUpRight,
  TrendingUp,
  ClipboardCopy,
  ClipboardCheck,
} from 'lucide-react';
import { useTaskStore } from '../../stores/useTaskStore';
import { useSessionStore } from '../../stores/useSessionStore';
import { TaskPriority, TaskStatus, TaskItem, SubTask, TaskEffort, TaskImpact, FocusSession, TaskCategory } from '@focuswatch/shared-types';
import { dbService } from '../../services/db';
import { activeElapsedMinutes } from '../../services/sessionTime';
import { SessionDetails } from '../sessions/SessionDetails';
import { useCategoryStore } from '../../stores/useCategoryStore';
import { CategoryPicker, CategoryMenu, CategoryBadge } from '../categories/CategoryChips';
import { CategoryManager } from '../categories/CategoryManager';
import { findCategory } from '../../services/categories';
import { buildAiBatchPrompt } from '../../services/aiBatchPrompt';

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export const TaskListScreen: React.FC = () => {
  const {
    tasks,
    filterStatus,
    filterPriority,
    searchQuery,
    isDrawerOpen,
    loadTasks,
    createTask,
    batchCreateTasks,
    toggleSubtask,
    addSubtask,
    removeSubtask,
    completeTask,
    archiveTask,
    deleteTask,
    setFilterStatus,
    setFilterPriority,
    setSearchQuery,
    setDrawerOpen,
  } = useTaskStore();

  const { openStartModal, openOutcomeModal, activeSession, resumeSession } = useSessionStore();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [batchInput, setBatchInput] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({});
  const [historyOpenIds, setHistoryOpenIds] = useState<Record<string, boolean>>({});
  const categories = useCategoryStore((s) => s.categories);
  const [filterCategory, setFilterCategory] = useState<string>('all'); // 'all', 'none', or a category id
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [newCategoryId, setNewCategoryId] = useState<string | undefined>(undefined);
  const [allSessions, setAllSessions] = useState<FocusSession[]>([]);
  const [newSubtaskText, setNewSubtaskText] = useState<Record<string, string>>({});

  // Form state for single task creation
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newOutput, setNewOutput] = useState('');
  const [newMins, setNewMins] = useState(45);
  const [newPriority, setNewPriority] = useState<TaskPriority>('medium');
  const [newEffort, setNewEffort] = useState<TaskEffort>('low');
  const [newImpact, setNewImpact] = useState<TaskImpact>('high');
  const [newDueDate, setNewDueDate] = useState<string>('');
  const [newTagsStr, setNewTagsStr] = useState('');

  useEffect(() => {
    loadTasks();
    const interval = setInterval(() => {
      loadTasks();
    }, 3000);
    return () => clearInterval(interval);
  }, [loadTasks]);

  // Finished sessions, grouped by the task they belonged to. Reloaded with the task list so
  // a result submitted from the extension shows up here without a refresh.
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      dbService.getAllFocusSessions().then((list) => {
        if (!cancelled) setAllSessions(list);
      });
    load();
    const interval = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const sessionsByTask = useMemo(() => {
    const map: Record<string, FocusSession[]> = {};
    for (const sess of allSessions) {
      if (!sess.taskId || sess.status === 'active') continue;
      (map[sess.taskId] = map[sess.taskId] || []).push(sess);
    }
    return map;
  }, [allSessions]);

  const sessionsFor = (taskId: string) => sessionsByTask[taskId] || [];
  const isHistoryOpen = (t: TaskItem) => historyOpenIds[t.id] ?? t.status === 'completed';
  const toggleHistory = (t: TaskItem) =>
    setHistoryOpenIds((prev) => ({ ...prev, [t.id]: !isHistoryOpen(t) }));

  const toggleTaskExpand = (id: string) => {
    setExpandedTaskIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCreateSingleTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const tags = newTagsStr
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean);

    await createTask({
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
      expectedOutput: newOutput.trim() || undefined,
      estimatedMinutes: newMins,
      priority: newPriority,
      status: 'backlog',
      effort: newEffort,
      impact: newImpact,
      dueDate: newDueDate || undefined,
      tags,
      subtasks: [],
      categoryId: newCategoryId,
    });
    setNewCategoryId(undefined);

    setNewTitle('');
    setNewDesc('');
    setNewOutput('');
    setNewMins(45);
    setNewPriority('medium');
    setNewEffort('low');
    setNewImpact('high');
    setNewDueDate('');
    setNewTagsStr('');
    setIsCreateModalOpen(false);
  };

  const handleCopyAiPrompt = async () => {
    const ok = await copyTextToClipboard(buildAiBatchPrompt(categories));
    if (!ok) {
      alert('Could not access the clipboard. The prompt is printed in the developer console instead.');
      console.log(buildAiBatchPrompt(categories));
      return;
    }
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2200);
  };

  const handleBatchImport = async () => {
    if (!batchInput.trim()) return;
    const count = await batchCreateTasks(batchInput);
    setBatchInput('');
    setDrawerOpen(false);
    alert(`Successfully imported ${count} tasks into Backlog.`);
  };

  const handleEngageTask = (taskItem: TaskItem) => {
    // One session at a time. Starting a second would orphan the first, so route the user
    // to submitting the running one instead.
    if (activeSession) {
      if (activeSession.taskId === taskItem.id) {
        openOutcomeModal();
      } else {
        alert(`A session is already running ("${activeSession.task}"). Stop it and submit its results first.`);
      }
      return;
    }
    openStartModal({
      task: taskItem.title,
      expectedOutput: taskItem.expectedOutput || taskItem.description,
      plannedMinutes: taskItem.estimatedMinutes || 45,
      taskId: taskItem.id,
      categoryId: taskItem.categoryId,
    });
  };

  // Filter tasks based on UI criteria
  const filteredTasks = tasks.filter((t) => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    if (filterCategory === 'none' && t.categoryId) return false;
    if (filterCategory !== 'all' && filterCategory !== 'none' && t.categoryId !== filterCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = t.title.toLowerCase().includes(q);
      const matchDesc = t.description?.toLowerCase().includes(q);
      const matchTag = t.tags.some((tag: string) => tag.toLowerCase().includes(q));
      if (!matchTitle && !matchDesc && !matchTag) return false;
    }
    return true;
  });

  const getPriorityBadge = (priority: TaskPriority) => {
    switch (priority) {
      case 'critical':
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-[0_0_10px_rgba(244,63,94,0.3)] animate-pulse">
            CRITICAL
          </span>
        );
      case 'high':
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
            HIGH
          </span>
        );
      case 'medium':
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            MEDIUM
          </span>
        );
      case 'low':
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-slate-800 text-slate-400 border border-slate-700">
            LOW
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-mono pb-12">
      {/* Tactical Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 backdrop-blur border border-slate-800 p-5 rounded-none shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <ListTodo className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white uppercase tracking-wider">
              [TASK_OPERATIONS_BACKLOG]
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Structured Execution Backlog & Tactical Deep Work Dispatcher
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-cyan-950/60 text-cyan-400 border border-cyan-800/60 hover:bg-cyan-900/60 hover:border-cyan-500 transition-all shadow-[0_0_10px_rgba(6,182,212,0.2)]"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>[ ⚡ BATCH_IMPORT ]</span>
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-all shadow-[0_0_15px_rgba(16,185,129,0.4)]"
          >
            <Plus className="w-4 h-4" />
            <span>[ + QUICK_ADD ]</span>
          </button>
        </div>
      </div>

      {/* Effort-Impact Matrix Graph & Stats Dashboard */}
      {(() => {
        const activeTasks = tasks.filter((t) => t.status !== 'completed' && t.status !== 'archived');
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const nextWeekMs = now.getTime() + 7 * 24 * 60 * 60 * 1000;

        const dueTodayTasks = activeTasks.filter((t) => t.dueDate === todayStr);
        const overdueTasks = activeTasks.filter((t) => t.dueDate && t.dueDate < todayStr);
        const dueThisWeekTasks = activeTasks.filter((t) => {
          if (!t.dueDate) return false;
          const dueTime = new Date(t.dueDate).getTime();
          return dueTime >= now.getTime() && dueTime <= nextWeekMs;
        });

        const getQuadrantTasks = (effort: TaskEffort, impact: TaskImpact) =>
          activeTasks.filter((t) => (t.effort || 'low') === effort && (t.impact || 'high') === impact);

        const quickWins = getQuadrantTasks('low', 'high');
        const majorProjects = getQuadrantTasks('high', 'high');
        const fillIns = getQuadrantTasks('low', 'low');
        const thanklessTasks = getQuadrantTasks('high', 'low');

        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left: 4-Quadrant Visual Matrix Graph */}
            <div className="lg:col-span-2 p-5 bg-[#050811] border border-slate-800 rounded-none space-y-3 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <Grid className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    [EFFORT_VS_REWARD_PRIORITY_MATRIX]
                  </h3>
                </div>
                <span className="text-[9px] text-slate-500 font-bold">
                  Hover node for details & instant session dispatch
                </span>
              </div>

              {/* 2x2 Quadrant Grid */}
              <div className="grid grid-cols-2 gap-2.5 h-[340px]">
                {/* Top Left: QUICK WINS (Low Effort, High Impact) */}
                <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-none flex flex-col justify-between relative overflow-hidden group">
                  <div className="flex items-center justify-between border-b border-emerald-500/20 pb-1.5">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                      <Zap className="w-3 h-3 text-emerald-400 fill-emerald-400/20" /> Quick Wins
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                      Low Effort | High Reward ({quickWins.length})
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-1.5 py-2 pr-1 custom-scrollbar">
                    {quickWins.length === 0 ? (
                      <span className="text-[10px] text-slate-600 italic block pt-4 text-center">No Quick Win tasks</span>
                    ) : (
                      quickWins.map((t) => (
                        <div
                          key={t.id}
                          className="p-2 bg-slate-950/80 hover:bg-slate-900 border border-emerald-500/30 hover:border-emerald-400 rounded transition-all group/item relative cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-bold text-white truncate max-w-[170px]">{t.title}</span>
                            <span className="text-[9px] text-emerald-400 font-bold flex-shrink-0">{t.estimatedMinutes}m</span>
                          </div>

                          {/* Popover Hover Card */}
                          <div className="absolute left-0 right-0 top-full mt-1 z-30 p-2.5 bg-slate-950 border border-emerald-500 text-xs rounded shadow-2xl opacity-0 pointer-events-none group-hover/item:opacity-100 group-hover/item:pointer-events-auto transition-all space-y-1.5">
                            <div className="font-bold text-white">{t.title}</div>
                            {t.expectedOutput && <div className="text-[10px] text-slate-400 italic">{t.expectedOutput}</div>}
                            {t.dueDate && <div className="text-[9px] text-cyan-400">Due: {t.dueDate}</div>}
                            <button
                              onClick={() => handleEngageTask(t)}
                              className="w-full py-1 text-[10px] font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded flex items-center justify-center gap-1"
                            >
                              <Zap className="w-3 h-3 fill-current" /> DISPATCH FOCUS SESSION
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Top Right: MAJOR PROJECTS (High Effort, High Impact) */}
                <div className="p-3 bg-indigo-950/20 border border-indigo-500/30 rounded-none flex flex-col justify-between relative overflow-hidden group">
                  <div className="flex items-center justify-between border-b border-indigo-500/20 pb-1.5">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                      <Target className="w-3 h-3 text-indigo-400" /> Major Projects
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                      High Effort | High Reward ({majorProjects.length})
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-1.5 py-2 pr-1 custom-scrollbar">
                    {majorProjects.length === 0 ? (
                      <span className="text-[10px] text-slate-600 italic block pt-4 text-center">No Major Project tasks</span>
                    ) : (
                      majorProjects.map((t) => (
                        <div
                          key={t.id}
                          className="p-2 bg-slate-950/80 hover:bg-slate-900 border border-indigo-500/30 hover:border-indigo-400 rounded transition-all group/item relative cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-bold text-white truncate max-w-[170px]">{t.title}</span>
                            <span className="text-[9px] text-indigo-300 font-bold flex-shrink-0">{t.estimatedMinutes}m</span>
                          </div>

                          <div className="absolute left-0 right-0 top-full mt-1 z-30 p-2.5 bg-slate-950 border border-indigo-500 text-xs rounded shadow-2xl opacity-0 pointer-events-none group-hover/item:opacity-100 group-hover/item:pointer-events-auto transition-all space-y-1.5">
                            <div className="font-bold text-white">{t.title}</div>
                            {t.expectedOutput && <div className="text-[10px] text-slate-400 italic">{t.expectedOutput}</div>}
                            {t.dueDate && <div className="text-[9px] text-indigo-300">Due: {t.dueDate}</div>}
                            <button
                              onClick={() => handleEngageTask(t)}
                              className="w-full py-1 text-[10px] font-bold bg-indigo-500 hover:bg-indigo-400 text-white rounded flex items-center justify-center gap-1"
                            >
                              <Zap className="w-3 h-3 fill-current" /> DISPATCH FOCUS SESSION
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Bottom Left: FILL-INS (Low Effort, Low Impact) */}
                <div className="p-3 bg-slate-900/30 border border-slate-800 rounded-none flex flex-col justify-between relative overflow-hidden group">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" /> Fill-Ins / Routine
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 bg-slate-800 text-slate-400 font-bold border border-slate-700">
                      Low Effort | Low Reward ({fillIns.length})
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-1.5 py-2 pr-1 custom-scrollbar">
                    {fillIns.length === 0 ? (
                      <span className="text-[10px] text-slate-600 italic block pt-4 text-center">No Fill-In tasks</span>
                    ) : (
                      fillIns.map((t) => (
                        <div
                          key={t.id}
                          className="p-2 bg-slate-950/80 hover:bg-slate-900 border border-slate-800 hover:border-slate-600 rounded transition-all group/item relative cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-bold text-slate-300 truncate max-w-[170px]">{t.title}</span>
                            <span className="text-[9px] text-slate-400 font-bold flex-shrink-0">{t.estimatedMinutes}m</span>
                          </div>

                          <div className="absolute left-0 right-0 top-full mt-1 z-30 p-2.5 bg-slate-950 border border-slate-700 text-xs rounded shadow-2xl opacity-0 pointer-events-none group-hover/item:opacity-100 group-hover/item:pointer-events-auto transition-all space-y-1.5">
                            <div className="font-bold text-white">{t.title}</div>
                            <button
                              onClick={() => handleEngageTask(t)}
                              className="w-full py-1 text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-white rounded flex items-center justify-center gap-1"
                            >
                              <Zap className="w-3 h-3 fill-current" /> DISPATCH FOCUS SESSION
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Bottom Right: THANKLESS TASKS (High Effort, Low Impact) */}
                <div className="p-3 bg-rose-950/20 border border-rose-500/30 rounded-none flex flex-col justify-between relative overflow-hidden group">
                  <div className="flex items-center justify-between border-b border-rose-500/20 pb-1.5">
                    <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-rose-400" /> Re-Evaluate / Thankless
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                      High Effort | Low Reward ({thanklessTasks.length})
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-1.5 py-2 pr-1 custom-scrollbar">
                    {thanklessTasks.length === 0 ? (
                      <span className="text-[10px] text-slate-600 italic block pt-4 text-center">No Thankless tasks</span>
                    ) : (
                      thanklessTasks.map((t) => (
                        <div
                          key={t.id}
                          className="p-2 bg-slate-950/80 hover:bg-slate-900 border border-rose-500/30 hover:border-rose-400 rounded transition-all group/item relative cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-bold text-slate-300 truncate max-w-[170px]">{t.title}</span>
                            <span className="text-[9px] text-rose-400 font-bold flex-shrink-0">{t.estimatedMinutes}m</span>
                          </div>

                          <div className="absolute left-0 right-0 top-full mt-1 z-30 p-2.5 bg-slate-950 border border-rose-500 text-xs rounded shadow-2xl opacity-0 pointer-events-none group-hover/item:opacity-100 group-hover/item:pointer-events-auto transition-all space-y-1.5">
                            <div className="font-bold text-white">{t.title}</div>
                            <button
                              onClick={() => handleEngageTask(t)}
                              className="w-full py-1 text-[10px] font-bold bg-rose-500 hover:bg-rose-400 text-white rounded flex items-center justify-center gap-1"
                            >
                              <Zap className="w-3 h-3 fill-current" /> DISPATCH FOCUS SESSION
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Deadline & Backlog Analytics Sidebar */}
            <div className="p-5 bg-[#050811] border border-slate-800 rounded-none space-y-4 flex flex-col justify-between shadow-xl">
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
                  <Calendar className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    [DEADLINE_&_TARGET_SUMMARY]
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded bg-slate-950 border border-cyan-500/30 space-y-1">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Due Today</div>
                    <div className="text-xl font-black text-cyan-400 font-mono">{dueTodayTasks.length}</div>
                    <div className="text-[9px] text-slate-500">Scheduled for today</div>
                  </div>

                  <div className="p-3 rounded bg-slate-950 border border-emerald-500/30 space-y-1">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Due This Week</div>
                    <div className="text-xl font-black text-emerald-400 font-mono">{dueThisWeekTasks.length}</div>
                    <div className="text-[9px] text-slate-500">Next 7 days</div>
                  </div>
                </div>

                {overdueTasks.length > 0 && (
                  <div className="p-2.5 rounded bg-rose-950/40 border border-rose-500/40 flex items-center justify-between text-xs text-rose-300 font-bold">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-rose-400 animate-pulse" /> OVERDUE TASKS
                    </span>
                    <span className="text-sm">{overdueTasks.length}</span>
                  </div>
                )}

                <div className="p-3 bg-slate-950 border border-slate-800 space-y-2 text-xs">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block border-b border-slate-900 pb-1">
                    High Value Priority Target
                  </span>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-emerald-400 flex items-center gap-1">
                      <Zap className="w-3 h-3 fill-emerald-400" /> Quick Wins:
                    </span>
                    <span className="font-bold text-white">{quickWins.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-indigo-400 flex items-center gap-1">
                      <Target className="w-3 h-3" /> Major Projects:
                    </span>
                    <span className="font-bold text-white">{majorProjects.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Total Active Backlog:</span>
                    <span className="font-bold text-slate-200">{activeTasks.length}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="w-full py-2 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center justify-center gap-1.5 uppercase"
              >
                <Plus className="w-4 h-4" /> CREATE BACKLOG TASK
              </button>
            </div>
          </div>
        );
      })()}

      {/* Toolbar & Filters */}
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-none space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter tasks by keyword or #tag..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Priority Filters */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
            <span className="text-[10px] text-slate-500 uppercase mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Priority:
            </span>
            {(['all', 'critical', 'high', 'medium', 'low'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setFilterPriority(p)}
                className={`px-2.5 py-1 text-[10px] font-semibold uppercase rounded transition-all ${
                  filterPriority === p
                    ? 'bg-slate-800 text-cyan-400 border border-cyan-500/50'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-1.5 border-t border-slate-800/60 pt-3 overflow-x-auto">
          <span className="text-[10px] text-slate-500 uppercase mr-1 flex-shrink-0">Category:</span>
          {[{ id: 'all', name: 'All', color: '#94a3b8' }, ...categories.filter((c) => !c.archived), { id: 'none', name: 'None', color: '#64748b' }].map((c) => {
            const selected = filterCategory === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setFilterCategory(c.id)}
                className="px-2.5 py-1 text-[10px] font-bold border rounded transition-all flex-shrink-0 flex items-center gap-1.5"
                style={{
                  color: selected ? c.color : '#94a3b8',
                  borderColor: selected ? c.color : 'transparent',
                  backgroundColor: selected ? `${c.color}22` : 'transparent',
                }}
              >
                {c.id !== 'all' && c.id !== 'none' && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />
                )}
                {c.name}
              </button>
            );
          })}
          <button
            onClick={() => setIsCategoryManagerOpen(true)}
            className="ml-auto flex-shrink-0 px-2.5 py-1 text-[10px] font-bold text-cyan-300 hover:text-white border border-cyan-500/30 hover:border-cyan-400 rounded"
            title="Add, rename, recolor or archive categories"
          >
            Manage categories
          </button>
        </div>

        {/* Status Tabs */}
        <div className="flex items-center gap-2 border-t border-slate-800/60 pt-3">
          {(['all', 'backlog', 'in_progress', 'completed', 'archived'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1 text-xs font-medium rounded-lg uppercase tracking-wider transition-all ${
                filterStatus === s
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                  : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200 border border-transparent'
              }`}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Task List Items Grid */}
      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-12 text-center space-y-3">
            <ListTodo className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-400">No matching backlog items found.</p>
            <p className="text-xs text-slate-600">
              Create a new task or import a batch markdown list to populate your focus pipeline.
            </p>
          </div>
        ) : (
          filteredTasks.map((t) => {
            const isExpanded = Boolean(expandedTaskIds[t.id]);
            const totalSub = t.subtasks.length;
            const completedSub = t.subtasks.filter((s: SubTask) => s.completed).length;
            const subProgress = totalSub > 0 ? Math.round((completedSub / totalSub) * 100) : 0;

            return (
              <div
                key={t.id}
                className="bg-slate-900/70 border border-slate-800 hover:border-slate-700 rounded-none p-4 transition-all space-y-3 shadow-lg"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <button
                      onClick={() =>
                        t.status === 'completed'
                          ? useTaskStore.getState().updateTask(t.id, { status: 'backlog' })
                          : completeTask(t.id)
                      }
                      className="mt-0.5 text-slate-500 hover:text-emerald-400 transition-colors"
                    >
                      {t.status === 'completed' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>

                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getPriorityBadge(t.priority)}
                        <h3
                          onClick={() => (sessionsFor(t.id).length > 0 ? toggleHistory(t) : undefined)}
                          title={sessionsFor(t.id).length > 0 ? 'Show or hide session notes' : undefined}
                          className={`${sessionsFor(t.id).length > 0 ? 'cursor-pointer hover:text-cyan-300 ' : ''}text-sm font-bold ${
                            t.status === 'completed'
                              ? 'line-through text-slate-500'
                              : 'text-slate-100'
                          }`}
                        >
                          {t.title}
                        </h3>
                      </div>

                      {t.description && (
                        <p className="text-xs text-slate-400 line-clamp-2">{t.description}</p>
                      )}

                      {/* Meta badges: Tags, Target output, Estimated time, Effort, Impact, Due Date */}
                      <div className="flex items-center gap-2.5 text-[11px] text-slate-500 flex-wrap pt-1">
                        <CategoryMenu
                          value={t.categoryId}
                          onChange={(id) => useTaskStore.getState().updateTask(t.id, { categoryId: id })}
                          onManage={() => setIsCategoryManagerOpen(true)}
                        />

                        <span className="flex items-center gap-1 text-slate-400">
                          <Clock className="w-3 h-3 text-cyan-400" />
                          {t.estimatedMinutes}m
                        </span>

                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase ${
                            (t.effort || 'low') === 'high'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          Effort: {t.effort || 'low'}
                        </span>

                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase ${
                            (t.impact || 'high') === 'high'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          Reward: {t.impact || 'high'}
                        </span>

                        {t.dueDate && (
                          <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 bg-cyan-950 text-cyan-300 border border-cyan-800/50 rounded">
                            <Calendar className="w-2.5 h-2.5" /> Due: {t.dueDate}
                          </span>
                        )}

                        {t.expectedOutput && (
                          <span className="flex items-center gap-1 text-amber-400/90 truncate max-w-xs">
                            <FileText className="w-3 h-3" />
                            Target: {t.expectedOutput}
                          </span>
                        )}

                        {t.tags.map((tag: string) => (
                          <span
                            key={tag}
                            className="flex items-center gap-0.5 text-[10px] text-cyan-400/80 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-800/40"
                          >
                            <Tag className="w-2.5 h-2.5" />#{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Actions & Engage Button */}
                  <div className="flex items-center gap-2 self-end md:self-center">
                    {sessionsFor(t.id).length > 0 && (
                      <button
                        onClick={() => toggleHistory(t)}
                        className={`px-2 py-1.5 rounded text-[11px] font-bold border transition-colors ${
                          isHistoryOpen(t)
                            ? 'bg-cyan-950 text-cyan-300 border-cyan-500/40'
                            : 'bg-slate-800/60 text-slate-400 hover:text-cyan-300 border-transparent'
                        }`}
                        title="Notes, reflection and attachments from your sessions on this task"
                      >
                        {sessionsFor(t.id).length} session{sessionsFor(t.id).length === 1 ? '' : 's'}
                      </button>
                    )}

                    <button
                      onClick={() => toggleTaskExpand(t.id)}
                      className="p-1.5 rounded bg-slate-800/60 text-slate-400 hover:text-white transition-colors"
                      title="Toggle Subtasks"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    <button
                      onClick={() => archiveTask(t.id)}
                      className="p-1.5 rounded bg-slate-800/60 text-slate-400 hover:text-amber-400 transition-colors"
                      title="Archive Task"
                    >
                      <Archive className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => deleteTask(t.id)}
                      className="p-1.5 rounded bg-slate-800/60 text-slate-400 hover:text-rose-400 transition-colors"
                      title="Delete Task"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    {activeSession && activeSession.taskId === t.id ? (
                      activeSession.pausedAt ? (
                        <button
                          onClick={() => void resumeSession()}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 transition-all shadow-[0_0_12px_rgba(14,165,233,0.4)] ml-1"
                          title="This task is paused. Resume it."
                        >
                          <span>[ ▶ PAUSED: RESUME ]</span>
                        </button>
                      ) : (
                        <button
                          onClick={openOutcomeModal}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-[0_0_12px_rgba(245,158,11,0.4)] ml-1 animate-pulse"
                          title="This task is running. Stop it and submit your results."
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>[ ■ RUNNING: STOP &amp; SUBMIT ]</span>
                        </button>
                      )
                    ) : (
                      <button
                        onClick={() => handleEngageTask(t)}
                        disabled={Boolean(activeSession)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all shadow-[0_0_12px_rgba(16,185,129,0.3)] ml-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                        title={activeSession ? 'Another session is running. Submit its results first.' : undefined}
                      >
                        <Zap className="w-3.5 h-3.5 fill-slate-950" />
                        <span>[ ⚡ ENGAGE_TASK ]</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Subtask Progress & List */}
                {totalSub > 0 && !isExpanded && (
                  <div className="pt-2 border-t border-slate-800/40 flex items-center gap-3 text-xs text-slate-400">
                    <span>
                      Subtasks: {completedSub}/{totalSub}
                    </span>
                    <div className="flex-1 h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-cyan-400 rounded-full transition-all duration-300"
                        style={{ width: `${subProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Session history: notes, reflection and attachments */}
                {isHistoryOpen(t) && sessionsFor(t.id).length > 0 && (
                  <div className="pt-3 border-t border-slate-800/60 space-y-3 bg-slate-950/40 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">
                      Session history ({sessionsFor(t.id).length})
                    </div>
                    {sessionsFor(t.id).map((sess) => {
                      const spent = activeElapsedMinutes(sess);
                      return (
                        <div key={sess.id} className="border border-slate-800 bg-[#050811] p-3 space-y-3">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                            <span className="text-slate-200 font-bold">
                              {new Date(sess.startedAt).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            <span
                              className={`px-2 py-0.5 text-[9px] font-bold uppercase border ${
                                sess.completedOutcome === 'yes'
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : sess.completedOutcome === 'partial'
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : sess.completedOutcome === 'no'
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                  : 'bg-slate-800 text-slate-400 border-slate-700'
                              }`}
                            >
                              {sess.completedOutcome === 'yes'
                                ? 'Fulfilled'
                                : sess.completedOutcome === 'partial'
                                ? 'Partial'
                                : sess.completedOutcome === 'no'
                                ? 'Missed'
                                : sess.status}
                            </span>
                            <span className="text-slate-400">
                              {spent}m worked of {sess.plannedMinutes}m planned
                            </span>
                          </div>
                          <SessionDetails session={sess} />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Expanded Subtasks Panel */}
                {isExpanded && (
                  <div className="pt-3 border-t border-slate-800/60 space-y-2 bg-slate-950/40 p-3 rounded-lg">
                    <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-1">
                      <span>Subtask CheckList</span>
                      <span>
                        {completedSub}/{totalSub} Completed ({subProgress}%)
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {t.subtasks.map((sub: SubTask) => (
                        <div
                          key={sub.id}
                          className="flex items-center justify-between gap-2 text-xs text-slate-300 group"
                        >
                          <label className="flex items-center gap-2 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={sub.completed}
                              onChange={() => toggleSubtask(t.id, sub.id)}
                              className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0"
                            />
                            <span className={sub.completed ? 'line-through text-slate-500' : ''}>
                              {sub.text}
                            </span>
                          </label>
                          <button
                            onClick={() => removeSubtask(t.id, sub.id)}
                            className="text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Add Subtask input */}
                    <div className="flex items-center gap-2 pt-2">
                      <input
                        type="text"
                        value={newSubtaskText[t.id] || ''}
                        onChange={(e) =>
                          setNewSubtaskText((prev) => ({ ...prev, [t.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            addSubtask(t.id, newSubtaskText[t.id] || '');
                            setNewSubtaskText((prev) => ({ ...prev, [t.id]: '' }));
                          }
                        }}
                        placeholder="Add subtask step..."
                        className="flex-1 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                      />
                      <button
                        onClick={() => {
                          addSubtask(t.id, newSubtaskText[t.id] || '');
                          setNewSubtaskText((prev) => ({ ...prev, [t.id]: '' }));
                        }}
                        className="px-2 py-1 text-[11px] font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 rounded"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {isCategoryManagerOpen && <CategoryManager onClose={() => setIsCategoryManagerOpen(false)} />}

      {/* Quick Add Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#050811] border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" /> [CREATE_NEW_BACKLOG_TASK]
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSingleTask} className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase text-slate-400 mb-1 font-semibold">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Refactor API & database logic"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase text-slate-400 mb-1 font-semibold">
                    Priority
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="low">LOW</option>
                    <option value="medium">MEDIUM</option>
                    <option value="high">HIGH</option>
                    <option value="critical">CRITICAL</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] uppercase text-slate-400 mb-1 font-semibold">
                    Estimated Mins
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={480}
                    value={newMins}
                    onChange={(e) => setNewMins(parseInt(e.target.value, 10) || 45)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] uppercase text-slate-400 mb-1 font-semibold">
                    Effort
                  </label>
                  <select
                    value={newEffort}
                    onChange={(e) => setNewEffort(e.target.value as TaskEffort)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="low">LOW EFFORT</option>
                    <option value="high">HIGH EFFORT</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] uppercase text-slate-400 mb-1 font-semibold">
                    Impact / Reward
                  </label>
                  <select
                    value={newImpact}
                    onChange={(e) => setNewImpact(e.target.value as TaskImpact)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="high">HIGH REWARD</option>
                    <option value="low">LOW REWARD</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] uppercase text-slate-400 mb-1 font-semibold">
                    Deadline (Optional)
                  </label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase text-slate-400 mb-1 font-semibold">
                  Expected Output / Definition of Done
                </label>
                <input
                  type="text"
                  value={newOutput}
                  onChange={(e) => setNewOutput(e.target.value)}
                  placeholder="e.g. All unit tests passing & endpoint documented"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase text-slate-400 mb-1 font-semibold">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={newTagsStr}
                  onChange={(e) => setNewTagsStr(e.target.value)}
                  placeholder="dev, backend, urgent"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase text-slate-400 mb-1 font-semibold">
                  Category (optional)
                </label>
                <CategoryPicker
                  value={newCategoryId}
                  onChange={setNewCategoryId}
                  onManage={() => setIsCategoryManagerOpen(true)}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 rounded-lg shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                >
                  Create Backlog Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Import Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-end">
          <div className="bg-[#050811] border-l border-slate-800 w-full max-w-xl h-full p-6 flex flex-col justify-between space-y-4 shadow-2xl">
            <div className="space-y-4 flex-1 flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" /> [⚡ BATCH_MARKDOWN_IMPORT]
                </h3>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="text-slate-500 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-400">
                Paste your raw task lists or Markdown todo items below. Auto-extracts tags (e.g.
                <code className="text-cyan-400 font-mono">#dev</code>), estimated duration (e.g.{' '}
                <code className="text-cyan-400 font-mono">(30m)</code>), and priority keywords (e.g.{' '}
                <code className="text-rose-400 font-mono">[critical]</code>).
              </p>

              {/* AI Agent Prompt Helper */}
              <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold text-violet-300 uppercase tracking-widest flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" /> Use an AI agent
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                    Copy this prompt into any AI agent (ChatGPT, Claude, Cursor, etc). It will collect every ask
                    from that conversation and return a list in exactly the format this importer accepts. Paste
                    the result below.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyAiPrompt}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                    promptCopied
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                      : 'bg-violet-500/15 text-violet-200 border-violet-500/40 hover:bg-violet-500/30 hover:text-white'
                  }`}
                  title="Copy the AI agent prompt to clipboard"
                >
                  {promptCopied ? (
                    <>
                      <ClipboardCheck className="w-3.5 h-3.5" /> Copied!
                    </>
                  ) : (
                    <>
                      <ClipboardCopy className="w-3.5 h-3.5" /> Copy AI Prompt
                    </>
                  )}
                </button>
              </div>

              <textarea
                value={batchInput}
                onChange={(e) => setBatchInput(e.target.value)}
                placeholder={`- [ ] Fix SQLite database connection leak #dev (30m) [critical]
- [ ] Implement user authentication middleware #auth (60m) [high]
- Design landing page hero component #design (45m)`}
                className="w-full flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setDrawerOpen(false)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleBatchImport}
                className="px-5 py-2 text-xs font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 rounded-lg shadow-[0_0_15px_rgba(6,182,212,0.4)]"
              >
                Parse & Import Tasks
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
