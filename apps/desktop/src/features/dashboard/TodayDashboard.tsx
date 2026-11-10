import React, { useState, useEffect } from 'react';
import ReactGridLayout from 'react-grid-layout/legacy';
import { useContainerWidth } from 'react-grid-layout';
import {
  Play,
  Flame,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Zap,
  Target,
  History,
  Globe,
  Monitor,
  Search,
  ChevronDown,
  HelpCircle,
  Activity,
  Crosshair,
  Move,
  RotateCcw,
  Lock,
  Unlock,
} from 'lucide-react';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useSessionStore } from '../../stores/useSessionStore';
import {
  HourlyBarChartWidget,
  DeepWorkPieChartWidget,
  DistractionPieChartWidget,
} from './FocusCharts';
import { InactivityPromptModal } from '../sessions/InactivityPromptModal';
import { DEFAULT_CATEGORIES } from '@focuswatch/domain-rules';

// Spacious, balanced Palantir default layout across 12 grid columns
const DEFAULT_GRID_LAYOUT = [
  { i: 'hud', x: 0, y: 0, w: 12, h: 2, minW: 2, minH: 1 },
  { i: 'operation', x: 0, y: 2, w: 12, h: 2, minW: 2, minH: 1 },
  { i: 'hourly_chart', x: 0, y: 4, w: 7, h: 6, minW: 2, minH: 2 },
  { i: 'deepwork_split', x: 7, y: 4, w: 5, h: 3, minW: 2, minH: 2 },
  { i: 'threat_split', x: 7, y: 7, w: 5, h: 3, minW: 2, minH: 2 },
  { i: 'friendly_targets', x: 0, y: 10, w: 6, h: 6, minW: 2, minH: 2 },
  { i: 'hostile_targets', x: 6, y: 10, w: 6, h: 6, minW: 2, minH: 2 },
  { i: 'live_feed', x: 0, y: 16, w: 12, h: 8, minW: 2, minH: 2 },
];

export const TodayDashboard: React.FC = () => {
  const { todaySummary, rawTimeline, reclassifyItem } = useDashboardStore();
  const { activeSession, openStartModal, openOutcomeModal, elapsedSeconds, pauseSession, resumeSession } = useSessionStore();
  const { width, containerRef } = useContainerWidth({ initialWidth: 1280 });

  const [layout, setLayout] = useState<any[]>(() => {
    const saved = localStorage.getItem('focuswatch_grid_layout_v5');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        return DEFAULT_GRID_LAYOUT;
      }
    }
    return DEFAULT_GRID_LAYOUT;
  });

  const [isEditMode, setIsEditMode] = useState(false);
  const isEditModeRef = React.useRef(isEditMode);
  useEffect(() => {
    isEditModeRef.current = isEditMode;
  }, [isEditMode]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'timeline' | 'grouped'>('timeline');
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [showInactivityModal, setShowInactivityModal] = useState(false);

  const saveLayout = (newLayout: any) => {
    if (!Array.isArray(newLayout) || newLayout.length === 0) return;
    const clean = newLayout.map((l: any) => ({
      i: l.i,
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
      minW: l.minW ?? 1,
      minH: l.minH ?? 1,
    }));
    setLayout(clean);
    localStorage.setItem('focuswatch_grid_layout_v5', JSON.stringify(clean));
  };

  const handleLayoutChange = (newLayout: any) => {
    if (!isEditModeRef.current) return;
    saveLayout(newLayout);
  };

  const handleResetLayout = () => {
    localStorage.removeItem('focuswatch_grid_layout_v5');
    setLayout(DEFAULT_GRID_LAYOUT);
  };

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    if (hours === 0 && mins === 0) return `${totalSeconds}s`;
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins}m`;
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Separate Top Productive & Top Distractions Data
  const productiveMap = new Map<
    string,
    { name: string; totalSeconds: number; categoryId: string; categoryName: string; isDomain: boolean }
  >();

  const distractingMap = new Map<
    string,
    { name: string; totalSeconds: number; categoryId: string; categoryName: string; isDomain: boolean }
  >();

  for (const event of rawTimeline) {
    if (event.isAfk) continue;
    const name = event.domain || event.appOrBrowser;
    const isDomain = Boolean(event.domain);

    if (event.productivityScore > 0) {
      const existing = productiveMap.get(name);
      if (existing) existing.totalSeconds += event.durationSeconds;
      else {
        productiveMap.set(name, {
          name,
          totalSeconds: event.durationSeconds,
          categoryId: event.categoryId,
          categoryName: event.categoryName,
          isDomain,
        });
      }
    } else if (event.productivityScore < 0) {
      const existing = distractingMap.get(name);
      if (existing) existing.totalSeconds += event.durationSeconds;
      else {
        distractingMap.set(name, {
          name,
          totalSeconds: event.durationSeconds,
          categoryId: event.categoryId,
          categoryName: event.categoryName,
          isDomain,
        });
      }
    }
  }

  const topProductive = Array.from(productiveMap.values()).sort((a, b) => b.totalSeconds - a.totalSeconds);
  const topDistractions = Array.from(distractingMap.values()).sort((a, b) => b.totalSeconds - a.totalSeconds);

  // Grouped Summary View Data
  const groupedMap = new Map<
    string,
    { key: string; type: 'desktop' | 'browser'; categoryName: string; totalSeconds: number }
  >();

  for (const event of rawTimeline) {
    if (event.isAfk) continue;
    const key = event.domain || event.appOrBrowser;
    const existing = groupedMap.get(key);
    if (existing) existing.totalSeconds += event.durationSeconds;
    else {
      groupedMap.set(key, {
        key,
        type: event.type,
        categoryName: event.categoryName,
        totalSeconds: event.durationSeconds,
      });
    }
  }

  const groupedList = Array.from(groupedMap.values()).sort((a, b) => b.totalSeconds - a.totalSeconds);

  // Filtered Events
  const filteredTimeline = rawTimeline.filter((e) => {
    const matchesSearch =
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.appOrBrowser.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.domain && e.domain.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory =
      selectedCategoryFilter === 'all' ||
      (selectedCategoryFilter === 'unknown' && e.categoryId === 'unknown') ||
      e.categoryId === selectedCategoryFilter;

    return matchesSearch && matchesCategory;
  });

  const handleTagChange = async (targetName: string, isDomain: boolean, newCatId: string) => {
    const targetType = isDomain ? 'domain' : 'app';
    await reclassifyItem(targetType, targetName, newCatId);
    setActiveDropdownId(null);
  };

  return (
    <div className="p-2.5 w-full mx-auto space-y-2 font-mono">
      {/* Top Grid Control Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 text-[11px]">
        <div className="flex items-center gap-2 text-slate-400">
          <Move className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-bold text-white uppercase tracking-wider">Today's overview</span>
          <span className="text-[10px] text-slate-500">
            {isEditMode ? 'Drag a card header to move it, drag its edges to resize' : 'Layout saved'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className={`px-2.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1.5 transition-all ${
              isEditMode
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.2)] animate-pulse'
                : 'bg-slate-900 text-slate-300 border border-slate-800 hover:text-white'
            }`}
          >
            {isEditMode ? <Unlock className="w-3 h-3 text-amber-400" /> : <Lock className="w-3 h-3 text-slate-400" />}
            {isEditMode ? 'Done editing' : 'Edit layout'}
          </button>

          <button
            onClick={handleResetLayout}
            className="px-2.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] font-bold text-slate-400 hover:text-white flex items-center gap-1 transition-all"
          >
            <RotateCcw className="w-3 h-3" /> Reset layout
          </button>
        </div>
      </div>

      {/* Rearrangeable & Resizable Grid Dashboard */}
      <div ref={containerRef} className="w-full">
        <ReactGridLayout
          className="layout w-full"
          layout={layout}
          width={width > 0 ? width : 1280}
          cols={12}
          rowHeight={35}
          isDraggable={isEditMode}
          isResizable={isEditMode}
          resizeHandles={['se', 's', 'e', 'w', 'sw', 'nw', 'ne', 'n']}
          draggableHandle=".grid-drag-handle"
          onLayoutChange={handleLayoutChange}
          onDragStop={(newLayout) => {
            if (isEditModeRef.current) saveLayout(newLayout);
          }}
          onResizeStop={(newLayout) => {
            if (isEditModeRef.current) saveLayout(newLayout);
          }}
          compactType="vertical"
        >
        {/* WIDGET: HUD Strip */}
        <div key="hud">
          <div className={`p-2 rounded bg-[#090d16] border border-slate-800 grid grid-cols-5 gap-2 h-full items-center font-mono ${isEditMode ? 'grid-drag-handle cursor-grab' : ''}`}>
            <div className="flex items-center justify-between border-r border-slate-800/80 pr-2">
              <div>
                <div className="text-[8px] uppercase tracking-widest text-slate-500 font-bold">Focus score</div>
                <div className="text-sm font-extrabold text-emerald-400 font-mono mt-0.5">{todaySummary.focusScore} <span className="text-[9px] text-slate-600 font-normal">/100</span></div>
              </div>
              <Zap className="w-3 h-3 text-amber-400" />
            </div>

            <div className="flex items-center justify-between border-r border-slate-800/80 pr-2">
              <div>
                <div className="text-[8px] uppercase tracking-widest text-slate-500 font-bold">Productive time</div>
                <div className="text-sm font-extrabold text-emerald-400 font-mono mt-0.5">{formatTime(todaySummary.productiveSeconds)}</div>
              </div>
              <Flame className="w-3 h-3 text-emerald-400" />
            </div>

            <div className="flex items-center justify-between border-r border-slate-800/80 pr-2">
              <div>
                <div className="text-[8px] uppercase tracking-widest text-slate-500 font-bold">Distracted time</div>
                <div className="text-sm font-extrabold text-rose-400 font-mono mt-0.5">{formatTime(todaySummary.distractingSeconds)}</div>
              </div>
              <ShieldAlert className="w-3 h-3 text-rose-400" />
            </div>

            <div className="flex items-center justify-between border-r border-slate-800/80 pr-2">
              <div>
                <div className="text-[8px] uppercase tracking-widest text-slate-500 font-bold">Active time</div>
                <div className="text-sm font-extrabold text-cyan-400 font-mono mt-0.5">{formatTime(todaySummary.activeSeconds)}</div>
              </div>
              <Activity className="w-3 h-3 text-cyan-400" />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-[8px] uppercase tracking-widest text-slate-500 font-bold">Distractions blocked</div>
                <div className="text-sm font-extrabold text-indigo-400 font-mono mt-0.5">{todaySummary.blockAttempts}</div>
              </div>
              <Target className="w-3 h-3 text-indigo-400" />
            </div>
          </div>
        </div>

        {/* WIDGET: Operation Control Banner */}
        <div key="operation">
          <div className="p-2 bg-[#090d16] border border-slate-800 rounded h-full flex items-center justify-between font-mono">
            {activeSession ? (
              <div className="flex items-center justify-between w-full">
                <div className={`space-y-0.5 ${isEditMode ? 'grid-drag-handle cursor-grab' : ''}`}>
                  <div className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest text-emerald-400">
                    <span className={`w-1.5 h-1.5 rounded-full ${activeSession.pausedAt ? 'bg-sky-400' : 'bg-emerald-500 animate-ping'}`}></span>{' '}
                    {activeSession.pausedAt ? 'Session paused' : 'Session running'}
                  </div>
                  <h3 className="text-[11px] font-bold text-white tracking-wide">{activeSession.task}</h3>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div className="text-sm font-black text-white">{formatTimer(elapsedSeconds)}</div>
                    <div className="text-[8px] text-slate-500">{activeSession.plannedMinutes}m target</div>
                  </div>

                  <button
                    onClick={() => setShowInactivityModal(true)}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-[9px]"
                    title="Check Inactivity Prompt"
                  >
                    <HelpCircle className="w-3 h-3" />
                  </button>

                  <button
                    onClick={() => (activeSession.pausedAt ? void resumeSession() : void pauseSession())}
                    className="px-2.5 py-1 rounded bg-sky-900/70 hover:bg-sky-800 text-sky-200 font-bold text-[9px] border border-sky-500/40"
                  >
                    {activeSession.pausedAt ? 'Resume' : 'Pause'}
                  </button>

                  <button
                    onClick={openOutcomeModal}
                    className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[9px]"
                  >
                    Finish
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between w-full">
                <div className={isEditMode ? 'grid-drag-handle cursor-grab' : ''}>
                  <h3 className="text-[11px] font-bold text-slate-100 flex items-center gap-1">
                    <Crosshair className="w-3 h-3 text-emerald-400" /> Start a focus session
                  </h3>
                  <p className="text-[9px] text-slate-500">Blocks distracting sites and starts the timer.</p>
                </div>

                <button
                  onClick={() => openStartModal()}
                  className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[9px] flex items-center gap-1"
                >
                  <Play className="w-2.5 h-2.5 fill-current" /> Start session
                </button>
              </div>
            )}
          </div>
        </div>

        {/* WIDGET: Hourly Chart */}
        <div key="hourly_chart">
          <HourlyBarChartWidget timeline={rawTimeline} />
        </div>

        {/* WIDGET: Deep Work Split */}
        <div key="deepwork_split">
          <DeepWorkPieChartWidget timeline={rawTimeline} />
        </div>

        {/* WIDGET: Threat Split */}
        <div key="threat_split">
          <DistractionPieChartWidget timeline={rawTimeline} />
        </div>

        {/* WIDGET: Friendly Productive Targets */}
        <div key="friendly_targets">
          <div className="p-2 bg-[#090d16] border border-slate-800 rounded h-full flex flex-col justify-between font-mono">
            <div className={`flex items-center justify-between border-b border-slate-800 pb-1 ${isEditMode ? 'grid-drag-handle cursor-grab' : ''}`}>
              <h3 className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Productive apps & sites
              </h3>
              <span className="text-[8px] text-slate-500">Click a label to change its category</span>
            </div>

            {topProductive.length === 0 ? (
              <p className="text-[9px] text-slate-500 py-4 text-center italic">Nothing recorded yet</p>
            ) : (
              <div className="space-y-1 flex-1 overflow-y-auto max-h-full pr-0.5 pt-0.5">
                {topProductive.map((item) => (
                  <div key={item.name} className="flex items-center justify-between p-1.5 rounded bg-slate-950/90 border border-slate-800/60 text-[9px]">
                    <span className="font-semibold text-slate-200 truncate max-w-[110px]">{item.name}</span>

                    <div className="flex items-center gap-1.5">
                      <div className="relative z-30">
                        <button
                          onClick={() => setActiveDropdownId(activeDropdownId === `prod_${item.name}` ? null : `prod_${item.name}`)}
                          className="text-[8px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-0.5"
                        >
                          {item.categoryName} <ChevronDown className="w-2 h-2" />
                        </button>

                        {activeDropdownId === `prod_${item.name}` && (
                          <div className="absolute right-0 top-5 z-[100] w-32 bg-[#030712] border border-slate-700 rounded shadow-2xl p-1 space-y-0.5">
                            {DEFAULT_CATEGORIES.map((cat) => (
                              <button
                                key={cat.id}
                                onClick={() => handleTagChange(item.name, item.isDomain, cat.id)}
                                className="w-full text-left px-2 py-0.5 rounded text-[8px] text-slate-300 hover:text-white hover:bg-slate-800"
                              >
                                {cat.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <span className="text-slate-400 font-bold">{formatTime(item.totalSeconds)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* WIDGET: Hostile Distracting Targets */}
        <div key="hostile_targets">
          <div className="p-2 bg-[#090d16] border border-slate-800 rounded h-full flex flex-col justify-between font-mono">
            <div className={`flex items-center justify-between border-b border-slate-800 pb-1 ${isEditMode ? 'grid-drag-handle cursor-grab' : ''}`}>
              <h3 className="text-[9px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" /> Distracting apps & sites
              </h3>
              <span className="text-[8px] text-slate-500">Click a label to change its category</span>
            </div>

            {topDistractions.length === 0 ? (
              <p className="text-[9px] text-slate-500 py-4 text-center italic">Nothing recorded yet</p>
            ) : (
              <div className="space-y-1 flex-1 overflow-y-auto max-h-full pr-0.5 pt-0.5">
                {topDistractions.map((item) => (
                  <div key={item.name} className="flex items-center justify-between p-1.5 rounded bg-slate-950/90 border border-slate-800/60 text-[9px]">
                    <span className="font-semibold text-slate-200 truncate max-w-[110px]">{item.name}</span>

                    <div className="flex items-center gap-1.5">
                      <div className="relative z-30">
                        <button
                          onClick={() => setActiveDropdownId(activeDropdownId === `dist_${item.name}` ? null : `dist_${item.name}`)}
                          className="text-[8px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-0.5"
                        >
                          {item.categoryName} <ChevronDown className="w-2 h-2" />
                        </button>

                        {activeDropdownId === `dist_${item.name}` && (
                          <div className="absolute right-0 top-5 z-[100] w-32 bg-[#030712] border border-slate-700 rounded shadow-2xl p-1 space-y-0.5">
                            {DEFAULT_CATEGORIES.map((cat) => (
                              <button
                                key={cat.id}
                                onClick={() => handleTagChange(item.name, item.isDomain, cat.id)}
                                className="w-full text-left px-2 py-0.5 rounded text-[8px] text-slate-300 hover:text-white hover:bg-slate-800"
                              >
                                {cat.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <span className="text-rose-400 font-bold">{formatTime(item.totalSeconds)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* WIDGET: Live Event Feed Table */}
        <div key="live_feed">
          <div className="p-2 bg-[#090d16] border border-slate-800 rounded h-full flex flex-col justify-between font-mono space-y-1.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-800 pb-1">
              <h3 className={`text-[9px] font-bold uppercase tracking-widest text-slate-200 flex items-center gap-1 ${isEditMode ? 'grid-drag-handle cursor-grab' : ''}`}>
                <History className="w-3 h-3 text-emerald-400" /> Recent activity
              </h3>

              <div className="flex items-center gap-1">
                <div className="flex items-center bg-slate-950 p-0.5 rounded border border-slate-800">
                  <button
                    onClick={() => setViewMode('timeline')}
                    className={`px-1.5 py-0.2 rounded text-[8px] font-bold transition-all ${
                      viewMode === 'timeline' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    Timeline
                  </button>
                  <button
                    onClick={() => setViewMode('grouped')}
                    className={`px-1.5 py-0.2 rounded text-[8px] font-bold transition-all ${
                      viewMode === 'grouped' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    By app
                  </button>
                </div>
              </div>
            </div>

            {/* Filter & Search */}
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1 overflow-x-auto">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'deep_work', label: 'Deep work' },
                  { id: 'productive', label: 'Productive' },
                  { id: 'distracting', label: 'Distracting' },
                  { id: 'unknown', label: 'Unknown' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setSelectedCategoryFilter(tab.id)}
                    className={`px-1.5 py-0.2 rounded text-[8px] font-bold border transition-all ${
                      selectedCategoryFilter === tab.id
                        ? 'bg-slate-800 text-white border-slate-700'
                        : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative w-36">
                <Search className="w-2.5 h-2.5 text-slate-500 absolute left-2 top-1.5" />
                <input
                  type="text"
                  placeholder="Search activity..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-6 pr-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[9px] text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Rows Container */}
            {viewMode === 'timeline' && (
              <div className="space-y-0.5 flex-1 overflow-y-auto max-h-full pr-0.5">
                {filteredTimeline.length === 0 ? (
                  <p className="text-[9px] text-slate-500 py-4 text-center italic">No activity found</p>
                ) : (
                  filteredTimeline.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between p-1 rounded bg-slate-950/90 border border-slate-800/60 text-[9px] hover:border-slate-700 transition-all"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {e.type === 'browser' ? (
                          <Globe className="w-2.5 h-2.5 text-cyan-400 flex-shrink-0" />
                        ) : (
                          <Monitor className="w-2.5 h-2.5 text-emerald-400 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-slate-200 truncate max-w-[200px]">{e.title || e.appOrBrowser}</p>
                          <p className="text-[8px] text-slate-500 truncate max-w-[200px]">{e.url || e.appOrBrowser}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="relative z-30">
                          <button
                            onClick={() => setActiveDropdownId(activeDropdownId === e.id ? null : e.id)}
                            className={`text-[8px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider flex items-center gap-0.5 border ${
                              e.productivityScore > 0
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                : e.productivityScore < 0
                                ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                : e.categoryId === 'unknown'
                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            {e.categoryName} <ChevronDown className="w-2 h-2" />
                          </button>

                          {activeDropdownId === e.id && (
                            <div className="absolute right-0 top-5 z-[100] w-32 bg-[#030712] border border-slate-700 rounded shadow-2xl p-1 space-y-0.5">
                              {DEFAULT_CATEGORIES.map((cat) => (
                                <button
                                  key={cat.id}
                                  onClick={() => handleTagChange(e.domain || e.appOrBrowser, Boolean(e.domain), cat.id)}
                                  className="w-full text-left px-2 py-0.5 rounded text-[8px] text-slate-300 hover:text-white hover:bg-slate-800"
                                >
                                  {cat.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <span className="text-slate-300 font-bold">{formatTime(e.durationSeconds)}</span>
                        <span className="text-[8px] text-slate-600">
                          {new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {viewMode === 'grouped' && (
              <div className="space-y-0.5 flex-1 overflow-y-auto max-h-full pr-0.5">
                {groupedList.map((g) => (
                  <div
                    key={g.key}
                    className="flex items-center justify-between p-1 rounded bg-slate-950/90 border border-slate-800/60 text-[9px]"
                  >
                    <div className="flex items-center gap-1.5">
                      {g.type === 'browser' ? <Globe className="w-2.5 h-2.5 text-cyan-400" /> : <Monitor className="w-2.5 h-2.5 text-emerald-400" />}
                      <span className="font-bold text-slate-200">{g.key}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[8px] px-1.5 py-0.2 rounded font-bold uppercase bg-slate-800 text-slate-300">
                        {g.categoryName}
                      </span>
                      <span className="text-slate-200 font-bold">{formatTime(g.totalSeconds)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ReactGridLayout>
    </div>

    <InactivityPromptModal isOpen={showInactivityModal} onClose={() => setShowInactivityModal(false)} />
    </div>
  );
};
