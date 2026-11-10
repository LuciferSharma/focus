import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  AlertCircle,
  CheckCircle2,
  Shield,
  Clock,
  Zap,
  Crosshair,
  ShieldAlert,
  Lock,
} from 'lucide-react';
import { useSessionStore } from '../../stores/useSessionStore';
import { useTaskStore } from '../../stores/useTaskStore';
import { dbService } from '../../services/db';
import { CategoryPicker } from '../categories/CategoryChips';

const DEFAULT_PRESET_TASKS = [
  { id: undefined, title: 'Refactor API & backend database logic', minutes: 45, output: 'API endpoints refactored with clean error handling' },
  { id: undefined, title: 'Build pricing page UI component', minutes: 60, output: 'Responsive pricing grid rendered with Tailwind' },
  { id: undefined, title: 'Fix dashboard grid layout & lock persistence', minutes: 45, output: 'Grid layout state saved to local storage' },
  { id: undefined, title: 'Write comprehensive integration unit tests', minutes: 75, output: '100% test coverage on critical path services' },
];

export const StartSessionModal: React.FC = () => {
  const { isStartModalOpen, startModalPrefill, closeStartModal, startSession } = useSessionStore();
  const { tasks, loadTasks } = useTaskStore();

  const [task, setTask] = useState('');
  const [expectedOutput, setExpectedOutput] = useState('');
  const [plannedMinutes, setPlannedMinutes] = useState(75);
  const [strictness, setStrictness] = useState<'soft' | 'standard' | 'strict'>('standard');
  const [blockWebsites, setBlockWebsites] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>(undefined);
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [error, setError] = useState('');

  const [blockedDomains, setBlockedDomains] = useState<string[]>([]);
  const [allowedExceptions, setAllowedExceptions] = useState<string[]>([]);

  useEffect(() => {
    if (isStartModalOpen) {
      loadTasks();
      if (startModalPrefill) {
        setTask(startModalPrefill.task || '');
        setExpectedOutput(startModalPrefill.expectedOutput || '');
        setPlannedMinutes(startModalPrefill.plannedMinutes || 75);
        setSelectedTaskId(startModalPrefill.taskId);
        setCategoryId(startModalPrefill.categoryId);
        setBlockWebsites(true);
      } else {
        setTask('');
        setExpectedOutput('');
        setPlannedMinutes(75);
        setSelectedTaskId(undefined);
        setCategoryId(undefined);
        setBlockWebsites(true);
      }
      dbService.getBlockedDomains().then(setBlockedDomains);
      dbService.getAllowedExceptions().then(setAllowedExceptions);
    }
  }, [isStartModalOpen, startModalPrefill, loadTasks]);

  if (!isStartModalOpen) return null;

  const calculateEndTime = (mins: number) => {
    const end = new Date(Date.now() + mins * 60 * 1000);
    return end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (task.trim().length < 6) {
      setError('Please provide an operational task description (min 6 characters).');
      return;
    }
    setError('');

    const taskId = selectedTaskId || startModalPrefill?.taskId;
    startSession({
      task: task.trim(),
      expectedOutput: expectedOutput.trim() || undefined,
      plannedMinutes,
      strictness,
      blockWebsites,
      taskId,
      categoryId,
    });

    if (taskId) {
      useTaskStore.getState().updateTask(taskId, {
        status: 'in_progress',
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 font-mono overflow-y-auto">
      <div className="bg-[#050811] border border-slate-800 rounded-none max-w-xl w-full p-4 sm:p-5 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative flex flex-col max-h-[92vh] my-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Crosshair className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                  [INITIATE_DEEP_WORK_OPERATION]
                </h3>
                <span className="text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                  READY
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Lock digital threat routes and enforce high-priority focus protocols.
              </p>
            </div>
          </div>

          <button
            onClick={closeStartModal}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800/80 transition-all border border-transparent hover:border-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 pt-3">
          <div className="flex-1 overflow-y-auto space-y-3.5 pr-1.5 custom-scrollbar">
            {/* Operational Task Input */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" /> Operational Objective <span className="text-rose-500">*</span>
                </label>
                <span className="text-[9px] text-slate-500">Min 6 chars</span>
              </div>

              <input
                type="text"
                placeholder='e.g., "Finish the QuickReel API pricing page"'
                value={task}
                onChange={(e) => {
                  setTask(e.target.value);
                  if (error) setError('');
                }}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-emerald-500 transition-all placeholder:text-slate-600 font-mono"
              />

              {/* Dynamic Task Preset Chips */}
              {(() => {
                const availableTasks = tasks.filter((t) => t.status === 'in_progress' || t.status === 'backlog');
                const presetList = availableTasks.length > 0
                  ? availableTasks.slice(0, 6).map((t) => ({
                      id: t.id,
                      title: t.title,
                      minutes: t.estimatedMinutes || 25,
                      output: t.expectedOutput || t.description || '',
                      categoryId: t.categoryId,
                    }))
                  : DEFAULT_PRESET_TASKS;

                return (
                  <div className="flex items-center gap-1.5 overflow-x-auto pt-0.5 pb-0.5 custom-scrollbar">
                    <span className="text-[8px] text-slate-500 uppercase font-bold flex-shrink-0">
                      {availableTasks.length > 0 ? 'BACKLOG TASKS:' : 'SUGGESTED:'}
                    </span>
                    {presetList.map((preset, idx) => (
                      <button
                        key={preset.id || idx}
                        type="button"
                        onClick={() => {
                          setTask(preset.title);
                          if (preset.output) setExpectedOutput(preset.output);
                          if (preset.minutes) setPlannedMinutes(preset.minutes);
                          setSelectedTaskId(preset.id);
                          setCategoryId((preset as { categoryId?: string }).categoryId);
                          if (error) setError('');
                        }}
                        title={`Click to auto-fill: "${preset.title}" (${preset.minutes}m)`}
                        className={`text-[8px] px-2 py-0.5 rounded border transition-all truncate max-w-[150px] flex-shrink-0 font-mono ${
                          task === preset.title
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50 font-bold'
                            : 'bg-slate-900 hover:bg-slate-800 border-slate-800/80 text-slate-400 hover:text-emerald-300'
                        }`}
                      >
                        {preset.title}
                      </button>
                    ))}
                  </div>
                );
              })()}

              {error && (
                <p className="text-[10px] text-rose-400 flex items-center gap-1 font-semibold pt-0.5">
                  <AlertCircle className="w-3 h-3" />
                  {error}
                </p>
              )}
            </div>

            {/* Category */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                Category <span className="text-slate-500 font-normal">(Optional)</span>
              </label>
              <CategoryPicker value={categoryId} onChange={setCategoryId} />
            </div>

            {/* Concrete Deliverable / Output */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-cyan-400" /> Concrete Deliverable <span className="text-slate-500 font-normal">(Optional)</span>
                </label>
                <span className="text-[8px] text-slate-500">Shift+Enter for new line</span>
              </div>
              <textarea
                rows={2}
                placeholder={'e.g., "1. Deployed endpoint returning JSON\n2. Unit tests passing"'}
                value={expectedOutput}
                onChange={(e) => setExpectedOutput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (e.shiftKey) {
                      // Shift + Enter: Allow natural multiline entry, do not submit form
                      e.stopPropagation();
                    } else {
                      // Plain Enter: Submit form
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }
                }}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-emerald-500 transition-all placeholder:text-slate-600 font-mono resize-y min-h-[54px]"
              />
            </div>

            {/* Time Span Duration Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1">
                  <Clock className="w-3 h-3 text-emerald-400" /> Operational Span (Duration)
                </label>
                <span className="text-[9px] font-bold text-emerald-400">
                  Target End: {calculateEndTime(plannedMinutes || 25)} ({plannedMinutes || 25} mins)
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {/* Preset Chips */}
                <div className="grid grid-cols-6 gap-1 flex-1">
                  {[25, 45, 60, 75, 90, 120].map((mins) => (
                    <button
                      type="button"
                      key={mins}
                      onClick={() => setPlannedMinutes(mins)}
                      className={`py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center justify-center ${
                        plannedMinutes === mins
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-900'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>

                {/* Custom Minutes Input */}
                <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 flex-shrink-0 sm:w-32 justify-between">
                  <span className="text-[9px] text-slate-500 font-bold uppercase">Custom:</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      max={1440}
                      value={plannedMinutes || ''}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val > 0) {
                          setPlannedMinutes(Math.min(1440, val));
                        } else if (e.target.value === '') {
                          setPlannedMinutes(0);
                        }
                      }}
                      onBlur={() => {
                        if (!plannedMinutes || plannedMinutes < 1) {
                          setPlannedMinutes(25);
                        }
                      }}
                      className="w-12 bg-transparent text-white font-mono text-xs font-bold focus:outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[10px] text-slate-400 font-bold">m</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Strictness Defense Mode Selector */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1">
                <Lock className="w-3 h-3 text-indigo-400" /> Defense Strictness Mode
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'soft', label: 'SOFT', desc: '0s delay' },
                  { id: 'standard', label: 'STANDARD', desc: '15s unlock delay' },
                  { id: 'strict', label: 'STRICT', desc: '30s unlock friction' },
                ].map((m) => {
                  const isActive = strictness === m.id;
                  return (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => setStrictness(m.id as any)}
                      className={`p-2 rounded-lg border text-left transition-all ${
                        isActive
                          ? m.id === 'strict'
                            ? 'bg-rose-500/15 text-rose-300 border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
                            : m.id === 'soft'
                            ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-900'
                      }`}
                    >
                      <div className="font-bold text-[10px] flex items-center justify-between">
                        <span>[{m.label}]</span>
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping"></span>}
                      </div>
                      <div className="text-[9px] text-slate-500 mt-0.5">{m.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Website Blocking Shield Toggle */}
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`p-1.5 rounded-md border flex-shrink-0 ${
                  blockWebsites
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-slate-800/50 border-slate-700/50 text-slate-500'
                }`}>
                  <Shield className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 truncate">
                    <span>Website Blocking Shield</span>
                    <span className={`text-[8px] px-1.5 py-0.2 rounded border font-bold flex-shrink-0 ${
                      blockWebsites
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      {blockWebsites ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">
                    {blockWebsites
                      ? 'Actively block restricted domains via extension during session.'
                      : 'Unrestricted browsing allowed while timer & activity logging run.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setBlockWebsites(!blockWebsites)}
                className={`relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  blockWebsites ? 'bg-emerald-500' : 'bg-slate-800'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    blockWebsites ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Active Defense Rules Live Summary */}
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-300">
                <span className="flex items-center gap-1.5 uppercase tracking-wider">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" /> [OPERATIONAL_RULES_ENGAGED]
                </span>
                <span className="text-[9px] text-slate-500 font-normal">
                  {blockedDomains.length} Restricted | {allowedExceptions.length} Whitelisted
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[9px] pt-1 border-t border-slate-900 max-h-20 overflow-y-auto">
                <div className="space-y-0.5">
                  <span className="text-slate-500 uppercase font-bold text-[8px] block">[HOSTILE_TARGETS_BLOCKED]</span>
                  {!blockWebsites ? (
                    <span className="text-amber-500/80 text-[8px] font-semibold italic">Shield disabled for session</span>
                  ) : blockedDomains.length === 0 ? (
                    <span className="text-slate-600 text-[8px] italic">No blocked domains</span>
                  ) : (
                    blockedDomains.slice(0, 3).map((d) => (
                      <div key={d} className="flex items-center gap-1 text-rose-400 font-semibold truncate">
                        <ShieldAlert className="w-2.5 h-2.5 flex-shrink-0" />
                        <span className="truncate">{d}</span>
                      </div>
                    ))
                  )}
                  {blockWebsites && blockedDomains.length > 3 && (
                    <span className="text-slate-600 text-[8px] italic">+{blockedDomains.length - 3} more</span>
                  )}
                </div>

                <div className="space-y-0.5">
                  <span className="text-slate-500 uppercase font-bold text-[8px] block">[FRIENDLY_EXCEPTIONS]</span>
                  {allowedExceptions.length === 0 ? (
                    <span className="text-slate-600 text-[8px] italic">No allowed exceptions</span>
                  ) : (
                    allowedExceptions.slice(0, 3).map((d) => (
                      <div key={d} className="flex items-center gap-1 text-emerald-400 font-semibold truncate">
                        <CheckCircle2 className="w-2.5 h-2.5 flex-shrink-0" />
                        <span className="truncate">{d}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Fixed Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2.5 mt-1 border-t border-slate-800/80 flex-shrink-0">
            <button
              type="button"
              onClick={closeStartModal}
              className="px-3.5 py-2 rounded-lg text-xs font-bold text-slate-500 hover:text-white transition-all"
            >
              [ CANCEL ]
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center gap-2 transition-all active:scale-95 uppercase tracking-wider"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              [ ENGAGE_OPERATION ]
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
