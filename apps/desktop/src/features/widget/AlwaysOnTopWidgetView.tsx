import React, { useEffect, useState } from 'react';
import { Flame, Target, Maximize2, Minimize2, CheckCircle2, Crosshair, Shield } from 'lucide-react';
import { FocusSession } from '@focuswatch/shared-types';

export const AlwaysOnTopWidgetView: React.FC = () => {
  const [session, setSession] = useState<FocusSession | null>(null);
  const [elapsed, setElapsed] = useState<number>(0);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  useEffect(() => {
    // Listen to BroadcastChannel for real-time updates from main window
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const bus = new BroadcastChannel('focuswatch_state_bus');
      bus.onmessage = (event) => {
        if (event.data?.type === 'SESSION_STATE_UPDATE') {
          setSession(event.data.activeSession);
          setElapsed(event.data.elapsedSeconds || 0);
        }
      };
      return () => bus.close();
    }
  }, []);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const plannedSeconds = (session?.plannedMinutes || 0) * 60;
  const remainingSeconds = session ? Math.max(0, plannedSeconds - elapsed) : 0;
  const progressPercent = plannedSeconds > 0 ? Math.min(100, Math.round((elapsed / plannedSeconds) * 100)) : 0;

  const handleFinish = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Broadcast finish event to main window
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const bus = new BroadcastChannel('focuswatch_state_bus');
      bus.postMessage({ type: 'TRIGGER_FINISH_SESSION' });
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="select-none bg-[#030712]/95 border border-slate-800 backdrop-blur-xl rounded-2xl p-3.5 shadow-[0_0_25px_rgba(0,0,0,0.9)] text-white font-mono w-72 transition-all cursor-move will-glow"
    >
      {/* HUD Header Bar */}
      <div data-tauri-drag-region className="flex items-center justify-between">
        <div data-tauri-drag-region className="flex items-center gap-1.5">
          <div className="p-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
            <Crosshair className="w-3.5 h-3.5 animate-pulse" />
          </div>
          <span className="text-[10px] font-bold tracking-widest text-emerald-400 uppercase">
            [FW_HUD]
          </span>
        </div>

        <div className="flex items-center gap-2" data-tauri-drag-region="false">
          <span className="font-mono font-black text-sm text-emerald-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]">
            {formatTimer(remainingSeconds)}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="text-slate-400 hover:text-white transition-colors p-1"
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Task Objective Title */}
      <div data-tauri-drag-region className="mt-2 space-y-1">
        <p className="text-xs font-bold text-slate-100 truncate">
          {session?.task || 'No active operation'}
        </p>

        {/* Progress bar */}
        <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Expanded Stats & Actions */}
      {isExpanded && (
        <div className="mt-3 pt-2 border-t border-slate-800 space-y-2 text-[10px] text-slate-400">
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-1 text-slate-300">
              <Flame className="w-3 h-3 text-emerald-400" /> Focused
            </span>
            <span className="font-mono font-semibold text-emerald-400">{Math.floor(elapsed / 60)}m</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="flex items-center gap-1 text-slate-300">
              <Shield className="w-3 h-3 text-cyan-400" /> Mode
            </span>
            <span className="font-mono font-bold uppercase text-cyan-300">
              {session?.strictness || 'STANDARD'}
            </span>
          </div>

          <button
            data-tauri-drag-region="false"
            onClick={handleFinish}
            className="w-full mt-2 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-extrabold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-[0_0_12px_rgba(16,185,129,0.4)] active:scale-95"
          >
            <CheckCircle2 className="w-3.5 h-3.5 fill-slate-950" />
            [ COMPLETE_OPERATION ]
          </button>
        </div>
      )}
    </div>
  );
};
