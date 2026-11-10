import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { ShieldAlert, ArrowLeft, KeyRound, Clock, CheckCircle2, Lock, Flame } from 'lucide-react';
import { extractDomain } from '@focuswatch/domain-rules';
import '../index.css';

export const BlockedPage: React.FC = () => {
  const [blockedUrl, setBlockedUrl] = useState('');
  const [blockedDomain, setBlockedDomain] = useState('');
  const [task, setTask] = useState('Deep Work Focus Session');
  const [attempts, setAttempts] = useState(1);
  const [strictnessMode, setStrictnessMode] = useState<'soft' | 'standard' | 'strict'>('standard');
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [frictionInput, setFrictionInput] = useState('');
  const [unlockReason, setUnlockReason] = useState('');
  const [unlockMinutes, setUnlockMinutes] = useState(5);
  const [delayCountdown, setDelayCountdown] = useState<number | null>(null);

  const expectedFrictionSentence = `I am intentionally pausing my deep work session to access ${blockedDomain || 'this domain'}`;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const url = params.get('url') || '';
    setBlockedUrl(url);
    const domain = extractDomain(url);
    setBlockedDomain(domain);

    // Get active session and attempts from storage
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['activeSession', 'attemptCount'], (data) => {
        if (data.activeSession?.task) {
          setTask(data.activeSession.task);
        }
        if (data.activeSession?.strictness_mode) {
          setStrictnessMode(data.activeSession.strictness_mode);
        }
        const newCount = (data.attemptCount || 0) + 1;
        setAttempts(newCount);
        chrome.storage.local.set({ attemptCount: newCount });

        // Report attempt to background worker & desktop bridge
        chrome.runtime.sendMessage({
          type: 'LOG_ATTEMPT',
          payload: {
            url,
            domain: extractDomain(url),
            ruleId: 'rule_blocked_session',
            timestamp: new Date().toISOString(),
          },
        });
      });
    }
  }, []);

  // Auto-redirect if domain is unblocked or session ends
  useEffect(() => {
    if (!blockedDomain || !blockedUrl) return;

    const checkUnblocked = () => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['activeSession'], (data) => {
          const active = data.activeSession;
          if (active && active.active) {
            const isStillBlocked = (active.blocked_domains || []).includes(blockedDomain);
            if (!isStillBlocked) {
              window.location.href = blockedUrl;
            }
          } else {
            // Session inactive: redirect back
            window.location.href = blockedUrl;
          }
        });
      }
    };

    const interval = setInterval(checkUnblocked, 1500);
    return () => clearInterval(interval);
  }, [blockedDomain, blockedUrl]);

  const handleReturnToWork = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.close();
    }
  };

  const getDelayDuration = () => {
    switch (strictnessMode) {
      case 'soft':
        return 0;
      case 'strict':
        return 30;
      case 'standard':
      default:
        return 15;
    }
  };

  const isFrictionMatched = frictionInput.trim().toLowerCase() === expectedFrictionSentence.trim().toLowerCase();

  const handleUnlockSubmit = () => {
    if (!isFrictionMatched || !unlockReason.trim()) return;

    const delaySec = getDelayDuration();
    if (delaySec === 0) {
      window.location.href = blockedUrl;
      return;
    }

    setDelayCountdown(delaySec);
    const interval = setInterval(() => {
      setDelayCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          window.location.href = blockedUrl;
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  return (
    <div className="w-full max-w-xl bg-[#030712] border border-slate-800 p-8 shadow-2xl space-y-6 text-left rounded-none font-mono relative overflow-hidden">
      {/* Top Cyber Scanline Bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-600 via-brand-500 to-rose-600 animate-pulse"></div>

      {/* Header Banner */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-rose-950/40 border border-rose-500/40 text-rose-500 flex items-center justify-center rounded-none shadow-glow-emerald">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-rose-400 bg-rose-950/60 px-2.5 py-0.5 border border-rose-500/30">
              [ RESTRICTED_HOSTILE_TARGET ]
            </span>
            <h1 className="text-xl font-black text-white pt-1 tracking-tight">{blockedDomain || 'HOSTILE_DOMAIN'}</h1>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] text-slate-500 block font-semibold">ATTEMPT_COUNTER</span>
          <span className="text-lg font-black text-rose-400 flex items-center justify-end gap-1">
            <Flame className="w-4 h-4 text-rose-500" /> #{attempts}
          </span>
        </div>
      </div>

      {/* Active Goal Container */}
      <div className="p-5 bg-slate-950 border border-slate-800/90 space-y-3 rounded-none relative">
        <div className="flex items-center justify-between text-xs font-bold text-brand-400 uppercase tracking-wider">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-brand-400" /> [ ACTIVE_OPERATIONAL_OBJECTIVE ]
          </span>
          <span className="text-[10px] px-2 py-0.5 bg-slate-900 border border-slate-800 text-slate-400">
            MODE: {strictnessMode.toUpperCase()}
          </span>
        </div>
        <p className="text-sm font-bold text-white leading-relaxed tracking-wide">{task}</p>
        <p className="text-xs text-slate-500 pt-1 border-t border-slate-900">
          This site was intercepted by FocusWatch Cyber Companion during active focus hours.
        </p>
      </div>

      {/* Primary Action Buttons */}
      <div className="space-y-3 pt-2">
        <button
          onClick={handleReturnToWork}
          className="w-full py-4 bg-brand-600 hover:bg-brand-500 text-white font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 shadow-glow-emerald rounded-none transition-all active:translate-y-0.5"
        >
          <ArrowLeft className="w-4 h-4" />
          [ RETURN_TO_DEEP_WORK ]
        </button>

        <button
          onClick={() => setShowUnlockModal(true)}
          className="w-full py-3 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-white border border-slate-800 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 rounded-none transition-all"
        >
          <KeyRound className="w-4 h-4 text-amber-500" />
          [ REQUEST_TEMPORARY_UNLOCK ]
        </button>
      </div>

      {/* High Friction Unlock Modal */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#030712] border border-amber-500/40 p-6 max-w-lg w-full text-left space-y-5 rounded-none shadow-2xl font-mono">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" /> [ FRICTION_UNLOCK_CHALLENGE ]
              </h3>
              <span className="text-[10px] text-amber-400 bg-amber-950/60 px-2 py-0.5 border border-amber-500/30">
                STRICTNESS: {strictnessMode.toUpperCase()} ({getDelayDuration()}s DELAY)
              </span>
            </div>

            {/* Mandatory Typing Challenge */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block">
                1. Type mandatory friction sentence character-for-character:
              </label>
              <div className="p-3 bg-slate-950 border border-slate-800 text-xs text-rose-400 font-bold select-none">
                "{expectedFrictionSentence}"
              </div>
              <input
                type="text"
                placeholder="Type sentence here..."
                value={frictionInput}
                onChange={(e) => setFrictionInput(e.target.value)}
                className={`w-full px-3.5 py-2.5 bg-slate-950 border text-white text-xs rounded-none focus:outline-none ${
                  isFrictionMatched ? 'border-brand-500 bg-brand-950/10' : 'border-slate-800'
                }`}
              />
            </div>

            {/* Reason Input */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block">2. Operational justification / reason:</label>
              <input
                type="text"
                placeholder="e.g. Inspecting API docs for active task"
                value={unlockReason}
                onChange={(e) => setUnlockReason(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 text-white text-xs rounded-none focus:outline-none focus:border-brand-500"
              />
            </div>

            {/* Unlock Duration Selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block">3. Access Window Duration:</label>
              <div className="grid grid-cols-3 gap-2">
                {[5, 10, 15].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setUnlockMinutes(m)}
                    className={`py-2 text-xs font-bold border rounded-none transition-all ${
                      unlockMinutes === m
                        ? 'bg-brand-600 text-white border-brand-500'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    {m} MINS
                  </button>
                ))}
              </div>
            </div>

            {/* Countdown Spinner Alert */}
            {delayCountdown !== null && (
              <div className="p-3 bg-amber-950/50 border border-amber-500/40 text-amber-300 text-xs text-center flex items-center justify-center gap-2 font-bold uppercase tracking-wider">
                <Clock className="w-4 h-4 animate-spin text-amber-400" /> Unlocking target in {delayCountdown} seconds...
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowUnlockModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white uppercase"
              >
                [ CANCEL ]
              </button>
              <button
                onClick={handleUnlockSubmit}
                disabled={!isFrictionMatched || !unlockReason.trim() || delayCountdown !== null}
                className="px-6 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-xs font-black uppercase tracking-wider rounded-none shadow-glow-emerald"
              >
                [ GRANT_TEMPORARY_ACCESS ]
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('blocked-root') as HTMLElement).render(
  <React.StrictMode>
    <BlockedPage />
  </React.StrictMode>
);
