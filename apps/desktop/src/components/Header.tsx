import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Activity,
  AlertCircle,
  LayoutDashboard,
  Stethoscope,
  Shield,
  Terminal,
  Clock,
  BarChart3,
  ListTodo,
  AppWindow,
} from 'lucide-react';
import { useDashboardStore } from '../stores/useDashboardStore';

interface HeaderProps {
  currentTab: 'dashboard' | 'tasks' | 'analytics' | 'rules' | 'diagnostics';
  setTab: (tab: 'dashboard' | 'tasks' | 'analytics' | 'rules' | 'diagnostics') => void;
}

export const Header: React.FC<HeaderProps> = ({ currentTab, setTab }) => {
  const { health } = useDashboardStore();
  const [timeUtc, setTimeUtc] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeUtc(now.toISOString().substring(11, 19) + ' UTC');
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const isAwOnline = health?.connected ?? false;
  const isWebWatcherOnline = health?.webBucketFound ?? false;

  const toggleWidgetWindow = async () => {
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('toggle_hud_widget');
      } else {
        // Web browser mode fallback: open widget URL in popup
        window.open('/#/widget', 'FocusWatch_HUD', 'width=320,height=160,top=100,left=100');
      }
    } catch (err) {
      console.warn('Failed to toggle widget window:', err);
    }
  };

  return (
    <header className="border-b border-slate-800 bg-[#030712] px-5 py-2.5 flex items-center justify-between sticky top-0 z-50 font-mono">
      {/* Brand / Intelligence Logo */}
      <div className="flex items-center space-x-3">
        <div className="w-7 h-7 rounded bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-xs shadow-[0_0_10px_rgba(16,185,129,0.2)]">
          <Terminal className="w-4 h-4" />
        </div>
        <div>
          <h1 className="text-xs font-bold tracking-widest text-slate-100 uppercase flex items-center gap-2">
            FOCUSWATCH <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-900 text-emerald-400 border border-emerald-500/30 font-mono">SYS_v1.0</span>
          </h1>
          <p className="text-[9px] text-slate-500 uppercase tracking-tight">OPERATIONAL TELEMETRY & THREAT BLOCKER</p>
        </div>
      </div>

      {/* Navigation Mode Tabs */}
      <div className="flex items-center bg-slate-950 p-1 rounded border border-slate-800/80 space-x-1">
        <button
          onClick={() => setTab('dashboard')}
          className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold tracking-wider rounded transition-all uppercase ${
            currentTab === 'dashboard'
              ? 'bg-emerald-600 text-white border border-emerald-400/30 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className="w-3 h-3" />
          [ COMMAND ]
        </button>

        <button
          onClick={() => setTab('tasks')}
          className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold tracking-wider rounded transition-all uppercase ${
            currentTab === 'tasks'
              ? 'bg-emerald-600 text-white border border-emerald-400/30 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ListTodo className="w-3 h-3" />
          [ TASKS ]
        </button>

        <button
          onClick={() => setTab('analytics')}
          className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold tracking-wider rounded transition-all uppercase ${
            currentTab === 'analytics'
              ? 'bg-emerald-600 text-white border border-emerald-400/30 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BarChart3 className="w-3 h-3" />
          [ ANALYTICS ]
        </button>

        <button
          onClick={() => setTab('rules')}
          className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold tracking-wider rounded transition-all uppercase ${
            currentTab === 'rules'
              ? 'bg-emerald-600 text-white border border-emerald-400/30 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield className="w-3 h-3" />
          [ DEFENSE_RULES ]
        </button>

        <button
          onClick={() => setTab('diagnostics')}
          className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold tracking-wider transition-all uppercase rounded-none ${
            currentTab === 'diagnostics'
              ? 'bg-emerald-600 text-white border border-emerald-400/30 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Stethoscope className="w-3 h-3" />
          [ DIAGNOSTICS ]
        </button>

        <button
          onClick={toggleWidgetWindow}
          className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold tracking-wider text-cyan-400 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-700/60 transition-all uppercase rounded-none shadow-[0_0_10px_rgba(6,182,212,0.2)]"
          title="Toggle Always-On-Top Floating HUD Overlay Widget"
        >
          <AppWindow className="w-3 h-3 text-cyan-400" />
          [ 📐 HUD_WIDGET ]
        </button>
      </div>

      {/* Tactical Status Ticker */}
      <div className="flex items-center space-x-3 text-[10px]">
        {/* UTC Clock */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950 border border-slate-800/80 text-slate-400">
          <Clock className="w-3 h-3 text-cyan-400" />
          <span className="font-mono text-cyan-300 font-bold">{timeUtc}</span>
        </div>

        {/* ActivityWatch Status */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950 border border-slate-800/80">
          <Activity className="w-3 h-3 text-slate-400" />
          <span className="text-slate-500">AW_ENGINE:</span>
          {isAwOnline ? (
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span> ONLINE
            </span>
          ) : (
            <span className="text-rose-400 font-bold flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> OFFLINE
            </span>
          )}
        </div>

        {/* Browser Watcher Status */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950 border border-slate-800/80">
          <ShieldCheck className="w-3 h-3 text-slate-400" />
          <span className="text-slate-500">EXTENSION:</span>
          {isWebWatcherOnline ? (
            <span className="text-emerald-400 font-bold">LINKED</span>
          ) : (
            <span className="text-amber-400 font-bold">READY</span>
          )}
        </div>
      </div>
    </header>
  );
};
