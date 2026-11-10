import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Shield, CheckCircle2, RefreshCw, Server, AlertTriangle, ShieldCheck, ListFilter, Trash2 } from 'lucide-react';
import '../index.css';

export const Options: React.FC = () => {
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const [bridgeHost, setBridgeHost] = useState('http://127.0.0.1:47777');
  const [statusMsg, setStatusMsg] = useState('');
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['activeSession', 'bridgeConnected', 'attemptCount'], (data) => {
        setActiveSession(data.activeSession);
        setBridgeConnected(Boolean(data.bridgeConnected));
        setAttemptCount(data.attemptCount || 0);
      });
    }
  }, []);

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const res = await fetch(`${bridgeHost}/session/active`);
      if (res.ok) {
        setBridgeConnected(true);
        setStatusMsg('✅ CONNECTION SUCCESSFUL: RUST DESKTOP BRIDGE ACTIVE');
      } else {
        setBridgeConnected(false);
        setStatusMsg('⚠️ DESKTOP BRIDGE RESPONDED WITH ERROR');
      }
    } catch {
      setBridgeConnected(false);
      setStatusMsg('❌ CONNECTION FAILED: RUST BRIDGE UNREACHABLE ON 127.0.0.1:47777');
    } finally {
      setIsTesting(false);
      setTimeout(() => setStatusMsg(''), 4000);
    }
  };

  const handleClearRules = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'CLEAR_ALL_RULES' }, () => {
        setStatusMsg('🧹 ALL DYNAMIC DNR RULES CLEARED AND RESET');
        setActiveSession(null);
        setTimeout(() => setStatusMsg(''), 4000);
      });
    }
  };

  return (
    <div className="bg-[#030712] border border-slate-800 p-8 space-y-8 rounded-none font-mono relative overflow-hidden shadow-2xl">
      {/* Scanline Pulse Header Bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-500 via-rose-500 to-brand-500 animate-pulse"></div>

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-brand-950/40 border border-brand-500/40 text-brand-400 font-black flex items-center justify-center text-lg rounded-none shadow-glow-emerald">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white uppercase tracking-wider">FOCUSWATCH EXTENSION SETTINGS</h1>
            <p className="text-xs text-slate-400 pt-0.5">Manifest V3 Cyber Block Companion & Dynamic DNR Engine</p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] text-slate-500 block font-bold uppercase">STATUS</span>
          <span
            className={`text-xs font-black uppercase px-3 py-1 border rounded-none inline-block ${
              bridgeConnected
                ? 'bg-brand-950/60 text-brand-400 border-brand-500/40'
                : 'bg-rose-950/60 text-rose-400 border-rose-500/40'
            }`}
          >
            {bridgeConnected ? '🟢 BRIDGE_ONLINE' : '🔴 BRIDGE_OFFLINE'}
          </span>
        </div>
      </div>

      {/* Bridge Connection Config */}
      <div className="p-6 bg-slate-950 border border-slate-800 space-y-4 rounded-none">
        <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
          <Server className="w-4 h-4 text-brand-400" /> [ RUST_DESKTOP_BRIDGE_CONFIG ]
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-xs text-slate-400 font-bold block">Local HTTP IPC Bridge Endpoint:</label>
            <input
              type="text"
              value={bridgeHost}
              onChange={(e) => setBridgeHost(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 text-white text-xs font-mono rounded-none focus:outline-none focus:border-brand-500"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={handleTestConnection}
              disabled={isTesting}
              className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 rounded-none shadow-glow-emerald transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
              [ TEST_CONNECTION ]
            </button>
          </div>
        </div>
      </div>

      {/* Active Session & Rules Information */}
      <div className="p-6 bg-slate-950 border border-slate-800 space-y-4 rounded-none">
        <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-brand-400" /> [ LIVE_TACTICAL_SHIELD_STATE ]
        </h2>

        {activeSession && activeSession.active ? (
          <div className="p-4 bg-slate-900 border border-brand-500/30 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-brand-400 uppercase">
              <span>● OPERATIONAL_SESSION_ACTIVE</span>
              <span className="text-slate-400">STRICTNESS: {activeSession.strictness_mode?.toUpperCase()}</span>
            </div>
            <p className="text-sm font-bold text-white">{activeSession.task}</p>
            <div className="text-xs text-slate-400 space-y-1 pt-2 border-t border-slate-800">
              <p>● <span className="text-white font-bold">{activeSession.blocked_domains?.length || 0}</span> HOSTILE DOMAINS INTERCEPTED BY DNR</p>
              <p>● <span className="text-white font-bold">{attemptCount}</span> DISRUPTION ATTEMPTS LOGGED THIS SESSION</p>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-slate-900 border border-slate-800 text-xs text-slate-400 space-y-1">
            <p className="text-white font-bold">NO ACTIVE SESSION RUNNING</p>
            <p>Dynamic site blocking activates automatically when you trigger a session in FocusWatch Desktop.</p>
          </div>
        )}
      </div>

      {/* Danger Zone / Reset */}
      <div className="p-6 bg-rose-950/20 border border-rose-500/30 space-y-4 rounded-none">
        <h2 className="text-sm font-black text-rose-400 uppercase tracking-wider flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-500" /> [ SYSTEM_RESET & EMERGENCY ]
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          If dynamic declarativeNetRequest rules become stuck or orphaned, click below to clear all dynamic rules installed in Chrome.
        </p>

        <button
          onClick={handleClearRules}
          className="py-2.5 px-6 bg-rose-950 hover:bg-rose-900 border border-rose-500/50 text-rose-300 font-bold text-xs uppercase tracking-wider flex items-center gap-2 rounded-none transition-all"
        >
          <Trash2 className="w-4 h-4 text-rose-400" />
          [ RESET_DNR_RULES & CLEAR_CACHE ]
        </button>
      </div>

      {statusMsg && (
        <p className="text-xs text-center font-bold text-brand-400 uppercase tracking-wider p-3 bg-brand-950/40 border border-brand-500/30">
          {statusMsg}
        </p>
      )}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('options-root') as HTMLElement).render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>
);
