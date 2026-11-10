import React from 'react';
import { BellRing, Crosshair, CheckCircle2, Pause, Play } from 'lucide-react';
import { useSessionStore } from '../../stores/useSessionStore';

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Always-visible strip (every tab) for the running session: live timer, pause and resume,
 * a clear time-up state, and the button that stops the session and submits results.
 */
export const ActiveSessionBar: React.FC = () => {
  const { activeSession, elapsedSeconds, openOutcomeModal, pauseSession, resumeSession } = useSessionStore();
  if (!activeSession) return null;

  const plannedSeconds = (activeSession.plannedMinutes || 25) * 60;
  const isPaused = Boolean(activeSession.pausedAt);
  const isTimeUp = !isPaused && elapsedSeconds >= plannedSeconds;
  const percent = Math.min(100, Math.round((elapsedSeconds / plannedSeconds) * 100));

  const tone = isPaused
    ? { bar: 'bg-sky-950/50 border-sky-500/40', label: 'text-sky-300', fill: 'bg-sky-400', time: 'text-sky-200' }
    : isTimeUp
    ? { bar: 'bg-amber-950/60 border-amber-500/50', label: 'text-amber-300 animate-pulse', fill: 'bg-amber-400', time: 'text-amber-300' }
    : {
        bar: 'bg-emerald-950/30 border-emerald-500/30',
        label: 'text-emerald-400',
        fill: 'bg-gradient-to-r from-emerald-500 to-cyan-400',
        time: 'text-white',
      };

  return (
    <div className={`border-b font-mono px-5 py-2 flex items-center justify-between gap-4 ${tone.bar}`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest flex-shrink-0 ${tone.label}`}>
          {isPaused ? (
            <Pause className="w-3.5 h-3.5" />
          ) : isTimeUp ? (
            <BellRing className="w-3.5 h-3.5" />
          ) : (
            <Crosshair className="w-3.5 h-3.5 animate-pulse" />
          )}
          {isPaused ? '[ PAUSED ]' : isTimeUp ? '[ TIME IS UP ]' : '[ OPERATION_ACTIVE ]'}
        </div>
        <span className="text-xs font-bold text-white truncate" title={activeSession.task}>
          {activeSession.task}
        </span>
      </div>

      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="hidden md:block w-40">
          <div className="h-1.5 bg-slate-950 border border-slate-800 overflow-hidden">
            <div className={`h-full transition-all duration-1000 ${tone.fill}`} style={{ width: `${percent}%` }} />
          </div>
        </div>

        <div className="text-right leading-tight">
          <div className={`text-sm font-black ${tone.time}`}>
            {isTimeUp ? `+${formatClock(elapsedSeconds - plannedSeconds)}` : formatClock(plannedSeconds - elapsedSeconds)}
          </div>
          <div className="text-[9px] text-slate-500">
            {isPaused ? 'frozen' : isTimeUp ? 'over' : 'left'} of {activeSession.plannedMinutes}m
          </div>
        </div>

        {isPaused ? (
          <button
            onClick={() => void resumeSession()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-sky-500 hover:bg-sky-400 text-slate-950 transition-all"
          >
            <Play className="w-3.5 h-3.5" />
            Resume
          </button>
        ) : (
          <button
            onClick={() => void pauseSession()}
            title="Freeze the timer and continue later"
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-sky-200 border border-sky-500/40 bg-sky-950/40 hover:bg-sky-900/50 transition-all"
          >
            <Pause className="w-3.5 h-3.5" />
            Pause
          </button>
        )}

        <button
          onClick={openOutcomeModal}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all ${
            isTimeUp
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-[0_0_14px_rgba(245,158,11,0.5)]'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          [ STOP &amp; SUBMIT RESULTS ]
        </button>
      </div>
    </div>
  );
};
