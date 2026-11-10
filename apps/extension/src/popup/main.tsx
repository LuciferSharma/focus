import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  Settings,
  Music,
  Tv,
  RefreshCw,
  Wifi,
  WifiOff,
  Eye,
  Zap,
  Camera,
  FolderDown,
  FileText,
  Shield,
  Clock,
  BellRing,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Pause,
  Play,
} from 'lucide-react';
import '../index.css';

/** Time actually spent working: wall clock minus every pause, including one still open. */
function activeElapsedMs(session: any, now: number = Date.now()): number {
  const start = Date.parse(session?.started_at || session?.startedAt || '');
  if (isNaN(start)) return 0;
  const openPause =
    session?.paused && session?.paused_at ? Math.max(0, now - Date.parse(session.paused_at)) : 0;
  return Math.max(0, now - start - (Number(session?.total_paused_ms) || 0) - openPause);
}

export const Popup: React.FC = () => {
  const [activeSession, setActiveSession] = useState<any>(null);
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [eyeShieldEnabled, setEyeShieldEnabled] = useState(true);
  const [statusMsg, setStatusMsg] = useState('');
  const [isResyncing, setIsResyncing] = useState(false);
  const [telemetryLogs, setTelemetryLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [, setNow] = useState(Date.now());
  const [showSubmit, setShowSubmit] = useState(false);
  const [resultNote, setResultNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const autoOpenedFor = React.useRef<string | null>(null);

  const fetchStorageData = () => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(
        ['activeSession', 'bridgeConnected', 'attemptCount', 'eyeShieldEnabled', 'telemetryLogs'],
        (data) => {
          setActiveSession(data.activeSession);
          setBridgeConnected(Boolean(data.bridgeConnected));
          setAttemptCount(data.attemptCount || 0);
          setEyeShieldEnabled(data.eyeShieldEnabled !== false);
          if (Array.isArray(data.telemetryLogs)) {
            setTelemetryLogs(data.telemetryLogs);
          }
        }
      );
    }
  };

  const appendTelemetryLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    const entry = `[${time}] ${msg}`;
    setTelemetryLogs((prev) => {
      const updated = [entry, ...prev].slice(0, 35);
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ telemetryLogs: updated });
      }
      return updated;
    });
  };

  const runDirectBridgeCheck = async () => {
    appendTelemetryLog('Testing http://127.0.0.1:47777/session/active ...');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const res = await fetch('http://127.0.0.1:47777/session/active', {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const isActive = Boolean(data && data.active);
        appendTelemetryLog(`Bridge HTTP 200 OK: active=${isActive}, task="${data?.task || 'Session'}"`);

        setBridgeConnected(true);
        const sessionPayload = isActive ? data : null;
        setActiveSession(sessionPayload);
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.set({ activeSession: sessionPayload, bridgeConnected: true });
        }
        return true;
      } else {
        appendTelemetryLog(`Bridge Error: HTTP ${res.status} ${res.statusText}`);
        setBridgeConnected(false);
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.set({ activeSession: null, bridgeConnected: false });
        }
        return false;
      }
    } catch (err: any) {
      const errMsg = err?.name === 'AbortError' ? 'FETCH_TIMEOUT (2.5s)' : (err?.message || String(err));
      appendTelemetryLog(`Bridge Exception: ${errMsg}`);
      setBridgeConnected(false);
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ activeSession: null, bridgeConnected: false });
      }
      return false;
    }
  };

  useEffect(() => {
    fetchStorageData();
    runDirectBridgeCheck();

    // 1-second interval for real-time timer clock tick and bridge sync
    const interval = setInterval(() => {
      fetchStorageData();
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const toggleEyeShield = () => {
    const nextVal = !eyeShieldEnabled;
    setEyeShieldEnabled(nextVal);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ eyeShieldEnabled: nextVal });
    }
  };

  const handleTabStash = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        chrome.runtime.sendMessage({ type: 'STASH_TABS' }, (res) => {
          if (chrome.runtime.lastError) {
            console.warn('[Popup] Stash Tabs error:', chrome.runtime.lastError.message);
            setStatusMsg('SW OFFLINE - RETRYING...');
            setTimeout(() => setStatusMsg(''), 3000);
            return;
          }
          setStatusMsg(`STASHED ${res?.stashedCount || 0} TABS TO BACKLOG!`);
          setTimeout(() => setStatusMsg(''), 3000);
        });
      } catch {
        setStatusMsg('SW OFFLINE');
      }
    }
  };

  const handleCaptureProof = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        chrome.runtime.sendMessage({ type: 'CAPTURE_PROOF' }, (res) => {
          if (chrome.runtime.lastError) {
            console.warn('[Popup] Capture Proof error:', chrome.runtime.lastError.message);
            setStatusMsg('SW OFFLINE - RETRYING...');
            setTimeout(() => setStatusMsg(''), 3000);
            return;
          }
          setStatusMsg('DELIVERABLE PROOF CAPTURED!');
          setTimeout(() => setStatusMsg(''), 3000);
        });
      } catch {
        setStatusMsg('SW OFFLINE');
      }
    }
  };

  const handleToggleNotes = () => {
    if (typeof chrome === 'undefined' || !chrome.runtime) return;
    chrome.runtime.sendMessage({ type: 'TOGGLE_NOTE_DRAWER_BG' }, (res) => {
      if (chrome.runtime.lastError || !res?.success) {
        setStatusMsg('SW OFFLINE - TRY AGAIN');
        setTimeout(() => setStatusMsg(''), 3000);
        return;
      }
      if (res.mode !== 'closed' && !res.shownHere) {
        // Chrome does not let extensions draw on its own pages; every other tab shows the notes.
        setStatusMsg('NOTES OPEN ON YOUR OTHER TABS (NOT ALLOWED ON THIS PAGE)');
        setTimeout(() => setStatusMsg(''), 4000);
        return;
      }
      window.close();
    });
  };

  const handleForceResync = async () => {
    setIsResyncing(true);
    const ok = await runDirectBridgeCheck();
    setIsResyncing(false);
    fetchStorageData();

    if (ok) {
      setStatusMsg('SYNCED WITH DESKTOP BRIDGE!');
    } else {
      setStatusMsg('BRIDGE UNREACHABLE - CHECK LOGS');
    }
    setTimeout(() => setStatusMsg(''), 3500);

    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        chrome.runtime.sendMessage({ type: 'FORCE_RESYNC' }, () => {
          if (chrome.runtime.lastError) {}
        });
      } catch {}
    }
  };

  const handleOpenSettings = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open('options.html', '_blank');
    }
  };

  const formatTimer = (startedAtStr?: string) => {
    if (!startedAtStr) return '00:00';
    const startMs = new Date(startedAtStr).getTime();
    if (isNaN(startMs)) return '00:00';

    const elapsedSec = Math.floor(activeElapsedMs(activeSession) / 1000);
    const mins = Math.floor(elapsedSec / 60);
    const secs = elapsedSec % 60;

    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hrs.toString().padStart(2, '0')}:${remMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressPercent = (startedAtStr?: string, plannedMins: number = 25) => {
    if (!startedAtStr) return 0;
    const startMs = new Date(startedAtStr).getTime();
    if (isNaN(startMs)) return 0;

    const elapsedSec = Math.floor(activeElapsedMs(activeSession) / 1000);
    const totalSec = plannedMins * 60;
    return Math.min(100, Math.round((elapsedSec / totalSec) * 100));
  };

  const startedAtStr = activeSession?.started_at || activeSession?.startedAt;
  const plannedMins = Number(activeSession?.planned_minutes || activeSession?.plannedMinutes || 25);
  const blockedCount = activeSession?.blocked_domains?.length || 0;

  const sessionIsActive = Boolean(activeSession && activeSession.active);
  const isPausedSession = sessionIsActive && Boolean(activeSession?.paused);
  const activeElapsedSecs = Math.floor(activeElapsedMs(activeSession) / 1000);
  const isTimeUp = sessionIsActive && !isPausedSession && activeElapsedSecs >= plannedMins * 60;
  const overSeconds = isTimeUp ? activeElapsedSecs - plannedMins * 60 : 0;
  const overLabel = `${Math.floor(overSeconds / 60).toString().padStart(2, '0')}:${(overSeconds % 60).toString().padStart(2, '0')}`;

  // When time runs out, open the submit form once so the next step is obvious.
  useEffect(() => {
    if (isTimeUp && startedAtStr && autoOpenedFor.current !== startedAtStr) {
      autoOpenedFor.current = startedAtStr;
      setShowSubmit(true);
    }
  }, [isTimeUp, startedAtStr]);

  const flashStatus = (msg: string, ms = 4000) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(''), ms);
  };

  // Stops the session and submits the outcome. The bridge ends the session immediately
  // (so blocking stops) and hands the result to the desktop app to record.
  const handleSubmitResults = async (outcome: 'yes' | 'partial' | 'no') => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('http://127.0.0.1:47777/session/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome,
          note: resultNote.trim(),
          difficulty,
          started_at: startedAtStr,
          source: 'extension',
        }),
      });

      if (res.ok) {
        appendTelemetryLog(`Session finished from extension: outcome=${outcome}`);
        setActiveSession(null);
        setShowSubmit(false);
        setResultNote('');
        setDifficulty(null);
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.set({ activeSession: null });
        }
        try { chrome.action?.setBadgeText({ text: '' }); } catch {}
        try {
          chrome.runtime.sendMessage({ type: 'FORCE_RESYNC' }, () => { void chrome.runtime.lastError; });
        } catch {}
        flashStatus('RESULTS SUBMITTED. DESKTOP RECORDS THEM WHEN OPEN.', 5000);
      } else if (res.status === 404) {
        flashStatus('BRIDGE IS OUTDATED. RESTART FOCUSWATCH FROM THE DESKTOP SHORTCUT.', 6000);
      } else if (res.status === 409) {
        flashStatus('SESSION ALREADY ENDED OR CHANGED. REFRESHING...');
        runDirectBridgeCheck();
      } else {
        flashStatus(`SUBMIT FAILED (HTTP ${res.status}). TRY AGAIN.`);
      }
    } catch {
      flashStatus('BRIDGE UNREACHABLE. IS FOCUSWATCH RUNNING?', 5000);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePauseResume = async (action: 'pause' | 'resume') => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`http://127.0.0.1:47777/session/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ started_at: startedAtStr, source: 'extension' }),
      });
      if (res.ok) {
        const snap = await res.json();
        const merged = {
          ...activeSession,
          paused: snap.paused,
          paused_at: snap.paused_at,
          total_paused_ms: snap.total_paused_ms,
          pause_updated_at: snap.pause_updated_at,
        };
        setActiveSession(merged);
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.set({ activeSession: merged });
        }
        try {
          chrome.runtime.sendMessage({ type: 'FORCE_RESYNC' }, () => { void chrome.runtime.lastError; });
        } catch {}
        flashStatus(action === 'pause' ? 'SESSION PAUSED. TIMER AND BLOCKING ARE OFF.' : 'SESSION RESUMED.', 3000);
      } else if (res.status === 404) {
        flashStatus('BRIDGE IS OUTDATED. RESTART FOCUSWATCH FROM THE DESKTOP SHORTCUT.', 6000);
      } else if (res.status === 409) {
        flashStatus('SESSION ALREADY ENDED OR CHANGED. REFRESHING...');
        runDirectBridgeCheck();
      } else {
        flashStatus(`${action.toUpperCase()} FAILED (HTTP ${res.status}).`);
      }
    } catch {
      flashStatus('BRIDGE UNREACHABLE. IS FOCUSWATCH RUNNING?', 5000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-[360px] min-h-[520px] bg-[#030712] text-slate-100 font-mono p-4 space-y-3 border border-slate-800 rounded-none box-border relative overflow-hidden">
      {/* Top Scanline Pulse */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 via-rose-500 to-cyan-500 animate-pulse"></div>

      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center text-xs border border-emerald-500/30 rounded-none">
            F
          </div>
          <span className="font-bold text-xs text-white uppercase tracking-wider">FOCUSWATCH HUD</span>
        </div>

        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-none uppercase tracking-wider ${
              bridgeConnected
                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/40'
                : 'bg-rose-950/60 text-rose-400 border border-rose-500/40'
            }`}
          >
            {bridgeConnected ? <Wifi className="w-3 h-3 text-emerald-400 animate-pulse" /> : <WifiOff className="w-3 h-3 text-rose-400" />}
            {bridgeConnected ? 'ONLINE' : 'OFFLINE'}
          </div>

          <button
            onClick={handleOpenSettings}
            title="Open Extension Settings"
            className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700 rounded-none transition-all"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Session Card */}
      {activeSession && activeSession.active ? (
        <div className="p-3 bg-slate-950 border border-emerald-500/30 space-y-2.5 rounded-none relative">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-emerald-400">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-400 animate-ping"></span>
              SESSION_ACTIVE
            </span>
            <span className="text-slate-400">{activeSession.strictness_mode?.toUpperCase() || 'STANDARD'}</span>
          </div>

          <p className="text-xs font-bold text-white leading-snug tracking-wide line-clamp-2">{activeSession.task}</p>

          {isTimeUp && (
            <div className="p-2 bg-amber-500/15 border border-amber-500/50 text-amber-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
              <BellRing className="w-3.5 h-3.5 flex-shrink-0" />
              <span>TIME IS UP (+{overLabel} OVER). SUBMIT YOUR RESULTS.</span>
            </div>
          )}

          {isPausedSession && (
            <div className="p-2 bg-sky-500/15 border border-sky-500/50 text-sky-200 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Pause className="w-3.5 h-3.5 flex-shrink-0" />
              <span>PAUSED. TIMER AND BLOCKING ARE OFF.</span>
            </div>
          )}

          {/* Live Digital Timer & Progress Bar */}
          <div className="p-2.5 bg-slate-900 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between font-mono font-bold">
              <span className="text-slate-400 flex items-center gap-1.5 text-[10px]">
                <Clock className="w-3.5 h-3.5 text-emerald-400 animate-pulse" /> ELAPSED
              </span>
              <span className="text-emerald-400 font-black text-base tracking-widest font-mono">
                {formatTimer(startedAtStr)}
              </span>
            </div>

            <div className="w-full bg-slate-950 h-1.5 border border-slate-800 overflow-hidden">
              <div
                className="bg-gradient-to-r from-emerald-500 to-cyan-400 h-full transition-all duration-1000"
                style={{ width: `${getProgressPercent(startedAtStr, plannedMins)}%` }}
              ></div>
            </div>

            <div className="flex justify-between items-center text-[9px] text-slate-500 pt-0.5">
              <span>TARGET: {plannedMins} MINS</span>
              <span className="font-bold text-slate-400">{getProgressPercent(startedAtStr, plannedMins)}%</span>
            </div>
          </div>

          {!showSubmit && (
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="bg-slate-900 p-1.5 border border-slate-800 text-center">
              <span className="text-slate-500 block">BLOCKED_TARGETS</span>
              <span className="text-white font-black text-xs">{blockedCount} DOMAINS</span>
            </div>
            <div className="bg-slate-900 p-1.5 border border-slate-800 text-center">
              <span className="text-slate-500 block">ATTEMPTS</span>
              <span className="text-rose-400 font-black text-xs">#{attemptCount}</span>
            </div>
          </div>
          )}

          <div className="grid grid-cols-2 gap-1.5">
            <button
              disabled={submitting}
              onClick={() => handlePauseResume(isPausedSession ? 'resume' : 'pause')}
              className={`py-2 text-[11px] font-black uppercase tracking-wider border transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                isPausedSession
                  ? 'bg-sky-500 hover:bg-sky-400 text-slate-950 border-sky-300'
                  : 'bg-sky-950/50 hover:bg-sky-900/60 text-sky-200 border-sky-500/40'
              }`}
            >
              {isPausedSession ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              {isPausedSession ? 'RESUME' : 'PAUSE'}
            </button>

            <button
              onClick={() => setShowSubmit((v) => !v)}
              className={`py-2 text-[11px] font-black uppercase tracking-wider border transition-all ${
                isTimeUp
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-300 shadow-[0_0_14px_rgba(245,158,11,0.45)]'
                  : 'bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border-emerald-500/40'
              }`}
            >
              {showSubmit ? 'CANCEL' : 'STOP & SUBMIT'}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3 bg-slate-950 border border-slate-800 text-center space-y-1 rounded-none">
          <p className="text-xs font-bold text-slate-300 uppercase">NO ACTIVE SESSION</p>
          <p className="text-[10px] text-slate-500">Website shield triggers on desktop focus start.</p>
        </div>
      )}

      {showSubmit && sessionIsActive && (
        <div className="p-3 bg-slate-950 border border-amber-500/40 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
            DID YOU COMPLETE THE OUTPUT?
          </div>
          {activeSession?.expected_output && (
            <p className="text-[10px] text-slate-400 line-clamp-2">TARGET: {activeSession.expected_output}</p>
          )}
          <input
            type="text"
            value={resultNote}
            onChange={(e) => setResultNote(e.target.value)}
            placeholder="What was accomplished? (optional)"
            className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 text-white text-[11px] focus:outline-none focus:border-amber-500 placeholder:text-slate-600"
          />
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              HOW HARD WAS IT? (OPTIONAL)
            </div>
            <div className="grid grid-cols-5 gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDifficulty(difficulty === n ? null : n)}
                  className={`py-1 text-[11px] font-black border transition-all ${
                    difficulty === n
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-[10px] font-bold">
            <button
              disabled={submitting}
              onClick={() => handleSubmitResults('yes')}
              className="p-2 bg-emerald-950/50 hover:bg-emerald-900/70 border border-emerald-500/40 text-emerald-300 flex flex-col items-center gap-1 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>YES</span>
            </button>
            <button
              disabled={submitting}
              onClick={() => handleSubmitResults('partial')}
              className="p-2 bg-amber-950/50 hover:bg-amber-900/70 border border-amber-500/40 text-amber-300 flex flex-col items-center gap-1 disabled:opacity-50"
            >
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>PARTIAL</span>
            </button>
            <button
              disabled={submitting}
              onClick={() => handleSubmitResults('no')}
              className="p-2 bg-rose-950/50 hover:bg-rose-900/70 border border-rose-500/40 text-rose-300 flex flex-col items-center gap-1 disabled:opacity-50"
            >
              <XCircle className="w-4 h-4 text-rose-400" />
              <span>NO</span>
            </button>
          </div>
        </div>
      )}

      {!(showSubmit && sessionIsActive) && (
      <>
      {/* Toggles Suite */}
      <div className="text-[10px]">
        <button
          onClick={toggleEyeShield}
          className={`w-full p-2 border flex items-center justify-between font-bold transition-all ${
            eyeShieldEnabled
              ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/40'
              : 'bg-slate-950 text-slate-500 border-slate-800'
          }`}
        >
          <span className="flex items-center gap-1">
            <Eye className="w-3 h-3" /> EYE_SHIELD
          </span>
          <span>{eyeShieldEnabled ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {/* Quick Action Commands */}
      <div className="space-y-1.5 pt-1">
        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">TACTICAL_COMMANDS</div>
        <div className="grid grid-cols-3 gap-1.5 text-[10px]">
          <button
            onClick={handleTabStash}
            title="Stash all tabs to desktop backlog (Alt + S)"
            className="p-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 flex flex-col items-center justify-center gap-1 font-bold"
          >
            <FolderDown className="w-3.5 h-3.5 text-amber-400" />
            <span>STASH (Alt+S)</span>
          </button>

          <button
            onClick={handleCaptureProof}
            title="Capture deliverable proof screenshot (Alt + Shift + C)"
            className="p-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 flex flex-col items-center justify-center gap-1 font-bold"
          >
            <Camera className="w-3.5 h-3.5 text-emerald-400" />
            <span>PROOF (Alt+C)</span>
          </button>

          <button
            onClick={handleToggleNotes}
            title="Toggle Tactical Note-Taker Drawer (Alt + N)"
            className="p-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 flex flex-col items-center justify-center gap-1 font-bold"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span>NOTES (Alt+N)</span>
          </button>
        </div>
      </div>

      </>
      )}

      {/* Diagnostic Resync Footer */}
      <div className="pt-2 border-t border-slate-800/80 space-y-2">
        {!(showSubmit && sessionIsActive) && (
        <div className="flex items-center justify-between text-[10px]">
          <button
            onClick={handleForceResync}
            disabled={isResyncing}
            className="py-1 px-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold border border-slate-700 flex items-center gap-1 rounded-none transition-all"
          >
            <RefreshCw className={`w-3 h-3 text-cyan-400 ${isResyncing ? 'animate-spin' : ''}`} />
            <span>FORCE_RESYNC</span>
          </button>

          <button
            onClick={() => setShowLogs(!showLogs)}
            className="text-slate-500 hover:text-slate-300 font-bold underline decoration-slate-700"
          >
            {showLogs ? 'HIDE LOGS' : 'VIEW TELEMETRY LOGS'}
          </button>
        </div>
        )}

        {statusMsg && (
          <div className="p-1.5 bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-[10px] font-bold text-center tracking-wider animate-fade-in">
            {statusMsg}
          </div>
        )}

        {/* Telemetry Log Panel */}
        {showLogs && (
          <div className="p-2 bg-slate-950 border border-slate-800 space-y-1 rounded-none max-h-32 overflow-y-auto">
            <div className="flex items-center justify-between text-[9px] text-slate-400 border-b border-slate-800 pb-1 font-bold">
              <span>LIVE SYSTEM TELEMETRY LOGS</span>
              <span>{telemetryLogs.length} LOGS</span>
            </div>
            <div className="space-y-1 text-[9px] text-slate-400 font-mono select-all">
              {telemetryLogs.length > 0 ? (
                telemetryLogs.map((log, i) => (
                  <div key={i} className="leading-tight break-all border-b border-slate-900/50 pb-0.5">
                    {log}
                  </div>
                ))
              ) : (
                <div className="text-slate-600 italic">No telemetry logs captured yet.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const container = document.getElementById('popup-root') || document.getElementById('root');
if (container) {
  ReactDOM.createRoot(container as HTMLElement).render(
    <React.StrictMode>
      <Popup />
    </React.StrictMode>
  );
}
