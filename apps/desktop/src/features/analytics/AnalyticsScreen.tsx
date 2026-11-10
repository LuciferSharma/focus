import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Flame,
  PieChart as PieChartIcon,
  ShieldAlert,
  Target,
  Zap,
  RefreshCw,
  Award,
  AlertTriangle,
  FileText,
  TrendingUp,
  TrendingDown,
  Monitor,
  Coffee,
  Pencil,
  Eye,
  Trash2,
  X,
  Save,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { FocusSession, BlockAttempt } from '@focuswatch/shared-types';
import { dbService } from '../../services/db';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { activeElapsedMs } from '../../services/sessionTime';
import { SessionDetails } from '../sessions/SessionDetails';
import { BehaviorPatterns } from './BehaviorPatterns';
import { CategoryInsights } from './CategoryInsights';
import { useCategoryStore } from '../../stores/useCategoryStore';
import { CategoryBadge, CategoryPicker } from '../categories/CategoryChips';
import { findCategory } from '../../services/categories';
import { sessionCategoryId } from '../../services/categoryStats';
import { DeepWorkHeatmap } from './DeepWorkHeatmap';
import { streakEngine } from '../../services/streakEngine';
import { AISummarySlot } from '../sessions/AISummarySlot';

type TimeRange = 'today' | 'week' | 'month' | 'all';

export const AnalyticsScreen: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('week');
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [blockAttempts, setBlockAttempts] = useState<BlockAttempt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedAiSessionId, setExpandedAiSessionId] = useState<string | null>(null);
  const [expandedDetailsSessionId, setExpandedDetailsSessionId] = useState<string | null>(null);

  // Edit / Trim Session Modal State
  const [editingSession, setEditingSession] = useState<FocusSession | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editDeliverables, setEditDeliverables] = useState('');
  const [editActualMinutes, setEditActualMinutes] = useState<number>(25);
  const [editOutcome, setEditOutcome] = useState<'yes' | 'partial' | 'no'>('yes');
  const [editCategoryId, setEditCategoryId] = useState<string | undefined>(undefined);

  const categories = useCategoryStore((s) => s.categories);
  // A session without its own category counts under its task's current one.
  const [taskCategoryByTaskId, setTaskCategoryByTaskId] = useState<Record<string, string | undefined>>({});

  const { rawTimeline, refreshDashboard } = useDashboardStore();

  const loadData = async () => {
    setIsLoading(true);
    try {
      await refreshDashboard();
      const allSessions = await dbService.getAllFocusSessions();
      const allAttempts = await dbService.getAllBlockAttempts();
      const allTasks = await dbService.getAllTasks();
      const taskCategories: Record<string, string | undefined> = {};
      allTasks.forEach((t) => (taskCategories[t.id] = t.categoryId));
      setTaskCategoryByTaskId(taskCategories);
      setSessions(allSessions);
      setBlockAttempts(allAttempts);
    } catch (err) {
      console.error('Failed to load analytics data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter data by selected Time Range
  const filterByRange = <T extends { startedAt?: string; timestamp?: string }>(items: T[]): T[] => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    return items.filter((item) => {
      const dateStr = item.startedAt || item.timestamp;
      if (!dateStr) return true;
      const itemTime = new Date(dateStr).getTime();

      if (timeRange === 'today') {
        return itemTime >= startOfDay;
      } else if (timeRange === 'week') {
        const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
        return itemTime >= sevenDaysAgo;
      } else if (timeRange === 'month') {
        const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
        return itemTime >= thirtyDaysAgo;
      }
      return true; // 'all'
    });
  };

  const filteredSessions = filterByRange(sessions);
  const filteredAttempts = filterByRange(blockAttempts);

  // Helper to get ACTUAL focus duration in minutes for a session
  const getActualMinutes = (s: FocusSession): number => {
    if (!s.startedAt) return s.plannedMinutes || 25;
    // Active time only: time spent paused is not focus time.
    const rawMins = Math.round(activeElapsedMs(s) / 60000);

    // If session ran over 2.5x planned duration, clamp to max 2.5x planned duration (or 180m) to prevent runaway entry distortion
    const maxLogicalMins = Math.max((s.plannedMinutes || 25) * 2.5, 180);
    return Math.min(rawMins, maxLogicalMins);
  };

  const handleOpenEditModal = (session: FocusSession) => {
    setEditingSession(session);
    setEditTaskTitle(session.task);
    setEditDeliverables(session.expectedOutput || '');
    setEditActualMinutes(getActualMinutes(session));
    setEditOutcome(session.completedOutcome || 'yes');
    setEditCategoryId(sessionCategoryId(session, taskCategoryByTaskId));
  };

  const handleSaveEditSession = async () => {
    if (!editingSession) return;
    const startMs = new Date(editingSession.startedAt).getTime();
    // endedAt is wall-clock, so add back the recorded pause time to land on the chosen active minutes.
    const newEndedAt = new Date(
      startMs + editActualMinutes * 60 * 1000 + (editingSession.totalPausedMs || 0)
    ).toISOString();

    const updatedSession: FocusSession = {
      ...editingSession,
      task: editTaskTitle.trim() || editingSession.task,
      expectedOutput: editDeliverables.trim() || undefined,
      endedAt: newEndedAt,
      completedOutcome: editOutcome,
      categoryId: editCategoryId,
    };

    await dbService.saveFocusSession(updatedSession);
    setEditingSession(null);
    await loadData();
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (window.confirm('Are you sure you want to delete this session record from history?')) {
      await dbService.deleteFocusSession(sessionId);
      await loadData();
    }
  };

  // Compute Session Metrics
  const completedSessions = filteredSessions.filter((s) => s.status === 'completed');

  // Total ACTUAL minutes spent in deep work sessions
  const categoryOf = (s: FocusSession) => findCategory(sessionCategoryId(s, taskCategoryByTaskId), categories);
  const wasteSessions = filteredSessions.filter((s) => categoryOf(s)?.isWaste);
  const workSessions = filteredSessions.filter((s) => !categoryOf(s)?.isWaste);
  const wastedLoggedMinutes = wasteSessions.reduce((acc, s) => acc + getActualMinutes(s), 0);
  const totalActualMinutes = workSessions.reduce((acc, s) => acc + getActualMinutes(s), 0);
  const totalPlannedMinutes = workSessions.reduce((acc, s) => acc + s.plannedMinutes, 0);

  const actualFocusedHours = (totalActualMinutes / 60).toFixed(1);
  const plannedFocusedHours = (totalPlannedMinutes / 60).toFixed(1);

  const successCount = completedSessions.filter((s) => s.completedOutcome === 'yes').length;
  const partialCount = completedSessions.filter((s) => s.completedOutcome === 'partial').length;
  const missedCount = completedSessions.filter((s) => s.completedOutcome === 'no').length;

  const successRate =
    completedSessions.length > 0
      ? Math.round((successCount / completedSessions.length) * 100)
      : 100;

  // Compute System Time Breakdown from ActivityWatch timeline
  let productiveSecs = 0;
  let distractingSecs = 0;
  let neutralSecs = 0;
  let afkSecs = 0;

  const productiveAppMap = new Map<string, number>();
  const distractingAppMap = new Map<string, number>();

  rawTimeline.forEach((event) => {
    if (event.isAfk) {
      afkSecs += event.durationSeconds;
      return;
    }

    const name = event.domain || event.appOrBrowser || 'Unknown';
    if (event.productivityScore > 0 || event.categoryId === 'deep_work') {
      productiveSecs += event.durationSeconds;
      productiveAppMap.set(name, (productiveAppMap.get(name) || 0) + event.durationSeconds);
    } else if (event.productivityScore < 0 || event.categoryId === 'distracting') {
      distractingSecs += event.durationSeconds;
      distractingAppMap.set(name, (distractingAppMap.get(name) || 0) + event.durationSeconds);
    } else {
      neutralSecs += event.durationSeconds;
    }
  });

  const totalMonitoredSecs = Math.max(1, productiveSecs + distractingSecs + neutralSecs + afkSecs);
  const productivePct = Math.round((productiveSecs / totalMonitoredSecs) * 100);
  const distractingPct = Math.round((distractingSecs / totalMonitoredSecs) * 100);
  const neutralPct = Math.round((neutralSecs / totalMonitoredSecs) * 100);
  const afkPct = Math.round((afkSecs / totalMonitoredSecs) * 100);

  const topProductiveApps = Array.from(productiveAppMap.entries())
    .map(([name, secs]) => ({ name, mins: Math.round(secs / 60) }))
    .sort((a, b) => b.mins - a.mins)
    .slice(0, 4);

  const topDistractingApps = Array.from(distractingAppMap.entries())
    .map(([name, secs]) => ({ name, mins: Math.round(secs / 60) }))
    .sort((a, b) => b.mins - a.mins)
    .slice(0, 4);

  // Daily Trend Data for Charting (ACTUAL focus minutes vs block attempts)
  const dailyTrendMap = new Map<string, { date: string; actualMins: number; attempts: number }>();

  const daysToDisplay = timeRange === 'today' ? 1 : timeRange === 'week' ? 7 : 14;
  for (let i = daysToDisplay - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split('T')[0];
    const label = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    dailyTrendMap.set(key, { date: label, actualMins: 0, attempts: 0 });
  }

  filteredSessions.forEach((s) => {
    if (!s.startedAt) return;
    const key = s.startedAt.split('T')[0];
    const entry = dailyTrendMap.get(key);
    if (entry) {
      entry.actualMins += getActualMinutes(s);
    }
  });

  filteredAttempts.forEach((a) => {
    if (!a.timestamp) return;
    const key = a.timestamp.split('T')[0];
    const entry = dailyTrendMap.get(key);
    if (entry) {
      entry.attempts += 1;
    }
  });

  const dailyTrendData = Array.from(dailyTrendMap.values());

  const formatHoursMins = (totalMins: number) => {
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h === 0) return `${m}m`;
    return `${h}h ${m}m`;
  };

  const formatSecsHoursMins = (secs: number) => {
    const totalMins = Math.round(secs / 60);
    return formatHoursMins(totalMins);
  };

  return (
    <div className="p-6 bg-slate-950 text-slate-100 min-h-screen space-y-6 font-mono">
      {/* Header & Range Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <h2 className="text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            [PERFORMANCE_ANALYTICS_&_REAL_TIME_AUDIT]
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Actual deep work session tracking, idle & wasted time breakdown, and threat telemetry.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Range Selector */}
          <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 text-[10px] font-bold">
            {(['today', 'week', 'month', 'all'] as TimeRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 rounded-lg transition-all uppercase ${
                  timeRange === r
                    ? 'bg-emerald-600 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                [{r}]
              </button>
            ))}
          </div>

          <button
            onClick={loadData}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            title="Refresh Analytics Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 365-Day Tactical Deep Work Heatmap */}
      <DeepWorkHeatmap stats={streakEngine.calculateStreaks(sessions)} />

      {/* KPI Row 1: Actual Session Time vs Planned */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* KPI 1: Actual Deep Work */}
        <div className="p-4 rounded-2xl bg-[#070b14] border border-slate-800 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase">
            <span>[ACTUAL_DEEP_WORK_TIME]</span>
            <Flame className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-2xl font-black text-emerald-400 font-mono">
              {actualFocusedHours} hrs
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Actual time spent focused in {workSessions.length} sessions
              {wastedLoggedMinutes > 0 && (
                <span className="text-rose-400"> (+{formatHoursMins(wastedLoggedMinutes)} logged as wasted time, not counted)</span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between text-[9px] text-slate-400 pt-1 border-t border-slate-900">
            <span>Planned Target: <span className="font-bold text-slate-200">{plannedFocusedHours} hrs</span></span>
            {totalActualMinutes >= totalPlannedMinutes ? (
              <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                <TrendingUp className="w-3 h-3" /> +{formatHoursMins(totalActualMinutes - totalPlannedMinutes)}
              </span>
            ) : (
              <span className="text-amber-400 font-bold flex items-center gap-0.5">
                <TrendingDown className="w-3 h-3" /> -{formatHoursMins(totalPlannedMinutes - totalActualMinutes)}
              </span>
            )}
          </div>
        </div>

        {/* KPI 2: Productive vs Wasted */}
        <div className="p-4 rounded-2xl bg-[#070b14] border border-slate-800 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase">
            <span>[PRODUCTIVE_VS_WASTED]</span>
            <Monitor className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <div className="text-2xl font-black text-white font-mono flex items-baseline gap-2">
              <span className="text-cyan-400">{formatSecsHoursMins(productiveSecs)}</span>
              <span className="text-xs text-slate-500 font-normal">vs {formatSecsHoursMins(distractingSecs)} wasted</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {productivePct}% Productive activity ratio
            </div>
          </div>
          <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden flex">
            <div className="bg-cyan-500 h-full" style={{ width: `${productivePct}%` }}></div>
            <div className="bg-rose-500 h-full" style={{ width: `${distractingPct}%` }}></div>
            <div className="bg-slate-700 h-full" style={{ width: `${neutralPct}%` }}></div>
          </div>
        </div>

        {/* KPI 3: Idle / AFK Time */}
        <div className="p-4 rounded-2xl bg-[#070b14] border border-slate-800 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase">
            <span>[IDLE_&_AFK_TIME]</span>
            <Coffee className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="text-2xl font-black text-amber-400 font-mono">
              {formatSecsHoursMins(afkSecs)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Time away from keyboard / screen idle ({afkPct}% of day)
            </div>
          </div>
          <div className="text-[9px] text-slate-400 pt-1 border-t border-slate-900">
            Detected via ActivityWatch AFK watcher
          </div>
        </div>

        {/* KPI 4: Session Success Rate */}
        <div className="p-4 rounded-2xl bg-[#070b14] border border-slate-800 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase">
            <span>[GOAL_SUCCESS_RATE]</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-2xl font-black text-emerald-400 font-mono">
              {successRate}%
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {successCount} Fulfilled | {partialCount} Partial | {missedCount} Missed
            </div>
          </div>
          <div className="text-[9px] text-slate-400 pt-1 border-t border-slate-900">
            {filteredAttempts.length} Hostile block attempts shielded
          </div>
        </div>
      </div>

      {/* Time Categorization Breakdown Bar */}
      <div className="p-4 rounded-2xl bg-[#070b14] border border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between text-xs font-bold text-slate-200">
          <span className="uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-cyan-400" /> [TELEMETRY_TIME_DISTRIBUTION_BREAKDOWN]
          </span>
          <span className="text-[10px] text-slate-500 font-normal">
            Total Monitored: {formatSecsHoursMins(totalMonitoredSecs)}
          </span>
        </div>

        {/* Multi-segmented Color Bar */}
        <div className="w-full bg-slate-900 h-3 rounded-lg overflow-hidden flex gap-0.5">
          <div
            className="bg-emerald-500 h-full transition-all duration-500"
            style={{ width: `${productivePct}%` }}
            title={`Productive: ${productivePct}%`}
          ></div>
          <div
            className="bg-rose-500 h-full transition-all duration-500"
            style={{ width: `${distractingPct}%` }}
            title={`Wasted: ${distractingPct}%`}
          ></div>
          <div
            className="bg-slate-600 h-full transition-all duration-500"
            style={{ width: `${neutralPct}%` }}
            title={`Neutral: ${neutralPct}%`}
          ></div>
          <div
            className="bg-amber-500/80 h-full transition-all duration-500"
            style={{ width: `${afkPct}%` }}
            title={`Idle/AFK: ${afkPct}%`}
          ></div>
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] pt-1">
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded bg-emerald-500 flex-shrink-0"></span>
            <span>Productive Work: <strong className="text-emerald-400">{formatSecsHoursMins(productiveSecs)} ({productivePct}%)</strong></span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded bg-rose-500 flex-shrink-0"></span>
            <span>Wasted / Distracting: <strong className="text-rose-400">{formatSecsHoursMins(distractingSecs)} ({distractingPct}%)</strong></span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded bg-slate-600 flex-shrink-0"></span>
            <span>Neutral / System: <strong className="text-slate-400">{formatSecsHoursMins(neutralSecs)} ({neutralPct}%)</strong></span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded bg-amber-500 flex-shrink-0"></span>
            <span>Idle / Away (AFK): <strong className="text-amber-400">{formatSecsHoursMins(afkSecs)} ({afkPct}%)</strong></span>
          </div>
        </div>
      </div>

      {/* Middle Row: Top Apps Breakdown + Trend Chart */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Daily Trend Chart */}
        <div className="md:col-span-2 p-5 rounded-2xl bg-[#070b14] border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              [ACTUAL_DEEP_WORK_MINUTES_VS_BLOCK_ATTEMPTS]
            </h3>
            <span className="text-[9px] text-slate-500">Actual Focused Minutes</span>
          </div>

          <div className="w-full h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" stroke="#475569" fontSize={10} tickLine={false} />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#020617',
                    borderColor: '#1e293b',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                  }}
                />
                <Bar dataKey="actualMins" name="Actual Work (mins)" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="attempts" name="Block Attempts" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Productive & Distracting Lists */}
        <div className="p-5 rounded-2xl bg-[#070b14] border border-slate-800 space-y-4">
          <div className="border-b border-slate-800/80 pb-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              [APPLICATION_USAGE_RANKING]
            </h3>
          </div>

          <div className="space-y-4 text-xs">
            {/* Top Productive Apps */}
            <div className="space-y-2">
              <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest block">
                [TOP_PRODUCTIVE_TARGETS]
              </span>
              {topProductiveApps.length === 0 ? (
                <span className="text-[10px] text-slate-500 italic">No activity recorded</span>
              ) : (
                topProductiveApps.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-[11px] bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
                    <span className="text-slate-200 font-bold truncate max-w-[130px]">{item.name}</span>
                    <span className="text-emerald-400 font-mono font-bold">{item.mins}m</span>
                  </div>
                ))
              )}
            </div>

            {/* Top Distracting Apps */}
            <div className="space-y-2">
              <span className="text-[9px] font-bold text-rose-400 uppercase tracking-widest block">
                [TOP_WASTED_TARGETS]
              </span>
              {topDistractingApps.length === 0 ? (
                <span className="text-[10px] text-slate-500 italic font-mono">No wasted time recorded</span>
              ) : (
                topDistractingApps.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-[11px] bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
                    <span className="text-slate-200 font-bold truncate max-w-[130px]">{item.name}</span>
                    <span className="text-rose-400 font-mono font-bold">{item.mins}m</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Work by category */}
      <CategoryInsights sessions={completedSessions} taskCategoryByTaskId={taskCategoryByTaskId} />

      {/* Patterns across sessions: what keeps repeating */}
      <BehaviorPatterns sessions={completedSessions} />

      {/* Operational Sessions Audit Log Table */}
      <div className="p-5 rounded-2xl bg-[#070b14] border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              [OPERATIONAL_SESSION_AUDIT_LOG]
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Comparison of actual deep work elapsed time vs planned target for every session.
            </p>
          </div>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
            {filteredSessions.length} RECORDS
          </span>
        </div>

        {filteredSessions.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-xs italic">
            No focus sessions recorded yet. Click [ ENGAGE_DEEP_WORK ] on the command dashboard to start your first session.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase">
                  <th className="py-2.5 px-3">DATE & TIME</th>
                  <th className="py-2.5 px-3">OPERATIONAL TASK</th>
                  <th className="py-2.5 px-3">DELIVERABLE</th>
                  <th className="py-2.5 px-3">ACTUAL SPAN</th>
                  <th className="py-2.5 px-3">PLANNED SPAN</th>
                  <th className="py-2.5 px-3">DELTA</th>
                  <th className="py-2.5 px-3">OUTCOME</th>
                  <th className="py-2.5 px-3">REFLECTION NOTE</th>
                  <th className="py-2.5 px-3">AI RETROSPECTIVE</th>
                  <th className="py-2.5 px-3 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredSessions.map((s) => {
                  const dateFormatted = s.startedAt
                    ? new Date(s.startedAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'N/A';

                  const actualMins = getActualMinutes(s);
                  const deltaMins = actualMins - s.plannedMinutes;

                  return (
                    <React.Fragment key={s.id}>
                      <tr className="hover:bg-slate-900/50 transition-all">
                        <td className="py-3 px-3 text-[11px] text-slate-400 whitespace-nowrap">
                          {dateFormatted}
                        </td>

                        <td className="py-3 px-3 font-bold text-white">
                          {s.task}
                          <div className="mt-1">
                            <CategoryBadge category={categoryOf(s)} />
                          </div>
                        </td>

                        <td className="py-3 px-3 text-slate-400 text-[11px]">
                          {s.expectedOutput || <span className="text-slate-600 italic">None specified</span>}
                        </td>

                        <td className="py-3 px-3 font-bold text-emerald-400 whitespace-nowrap">
                          {actualMins}m
                        </td>

                        <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                          {s.plannedMinutes}m
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          {deltaMins > 0 ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-none bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                              +{deltaMins}m over
                            </span>
                          ) : deltaMins < 0 ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-none bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                              {deltaMins}m early
                            </span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-none bg-slate-800 text-slate-400">
                              Exact target
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          {s.completedOutcome === 'yes' ? (
                            <span className="text-[9px] px-2 py-0.5 rounded-none bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold uppercase flex items-center gap-1 w-fit">
                              <CheckCircle2 className="w-2.5 h-2.5" /> FULFILLED
                            </span>
                          ) : s.completedOutcome === 'partial' ? (
                            <span className="text-[9px] px-2 py-0.5 rounded-none bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold uppercase flex items-center gap-1 w-fit">
                              <AlertTriangle className="w-2.5 h-2.5" /> PARTIAL
                            </span>
                          ) : s.completedOutcome === 'no' ? (
                            <span className="text-[9px] px-2 py-0.5 rounded-none bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold uppercase flex items-center gap-1 w-fit">
                              <ShieldAlert className="w-2.5 h-2.5" /> MISSED
                            </span>
                          ) : (
                            <span className="text-[9px] px-2 py-0.5 rounded-none bg-slate-800 text-slate-400 uppercase">
                              {s.status}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-[11px] text-slate-400 max-w-xs truncate">
                          {s.completionNote || <span className="text-slate-600 italic">No note added</span>}
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          <button
                            onClick={() =>
                              setExpandedAiSessionId(expandedAiSessionId === s.id ? null : s.id)
                            }
                            className="px-2.5 py-1 text-[10px] font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 hover:bg-cyan-900 rounded-none transition-all flex items-center gap-1"
                          >
                            <FileText className="w-3 h-3 text-cyan-400" />
                            <span>{expandedAiSessionId === s.id ? 'CLOSE AI' : 'VIEW AI PROMPT'}</span>
                          </button>
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() =>
                                setExpandedDetailsSessionId(expandedDetailsSessionId === s.id ? null : s.id)
                              }
                              title="View full notes, reflection and attachments"
                              className={`p-1.5 rounded border transition-all ${
                                expandedDetailsSessionId === s.id
                                  ? 'bg-cyan-950 text-cyan-300 border-cyan-500/40'
                                  : 'bg-slate-900 hover:bg-cyan-950 text-slate-400 hover:text-cyan-300 border-slate-800 hover:border-cyan-500/40'
                              }`}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleOpenEditModal(s)}
                              title="Edit / Trim session duration & details"
                              className="p-1.5 rounded bg-slate-900 hover:bg-emerald-950 text-slate-400 hover:text-emerald-300 border border-slate-800 hover:border-emerald-500/40 transition-all"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleDeleteSession(s.id)}
                              title="Delete session record from history"
                              className="p-1.5 rounded bg-slate-900 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-500/40 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {expandedDetailsSessionId === s.id && (
                        <tr>
                          <td colSpan={10} className="p-4 bg-slate-950/90 border-b border-slate-800">
                            <SessionDetails session={s} />
                          </td>
                        </tr>
                      )}

                      {expandedAiSessionId === s.id && (
                        <tr>
                          <td colSpan={10} className="p-4 bg-slate-950/90 border-b border-slate-800">
                            <AISummarySlot session={s} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit / Trim Session Modal */}
      {editingSession && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 font-mono">
          <div className="bg-[#050811] border border-slate-800 rounded-none max-w-md w-full p-5 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  [EDIT_&_TRIM_FOCUS_SESSION]
                </h3>
              </div>
              <button
                onClick={() => setEditingSession(null)}
                className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Operational Objective
                </label>
                <input
                  type="text"
                  value={editTaskTitle}
                  onChange={(e) => setEditTaskTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Category
                </label>
                <CategoryPicker value={editCategoryId} onChange={setEditCategoryId} />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Concrete Deliverables
                </label>
                <textarea
                  rows={2}
                  value={editDeliverables}
                  onChange={(e) => setEditDeliverables(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-emerald-500 resize-y"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Actual Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={editActualMinutes}
                    onChange={(e) => setEditActualMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white font-mono text-xs font-bold focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[9px] text-slate-500 mt-0.5">
                    Original Planned: {editingSession.plannedMinutes}m
                  </p>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Outcome
                  </label>
                  <select
                    value={editOutcome}
                    onChange={(e) => setEditOutcome(e.target.value as any)}
                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                  >
                    <option value="yes">FULFILLED</option>
                    <option value="partial">PARTIAL</option>
                    <option value="no">MISSED</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => handleDeleteSession(editingSession.id)}
                className="px-3 py-1.5 text-xs text-rose-400 hover:text-rose-300 font-bold hover:bg-rose-950/50 rounded border border-rose-900/40 transition-all flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> DELETE RECORD
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSession(null)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditSession}
                  className="px-4 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-all flex items-center gap-1.5 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                >
                  <Save className="w-3.5 h-3.5" /> SAVE CHANGES
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
