import React, { useState, useEffect } from 'react';
import { Shield, Plus, Trash2, CheckCircle2, ShieldAlert, Globe } from 'lucide-react';
import { dbService } from '../../services/db';
import { useSessionStore } from '../../stores/useSessionStore';

export const RulesScreen: React.FC = () => {
  const [blockedDomains, setBlockedDomains] = useState<string[]>([]);
  const [allowedExceptions, setAllowedExceptions] = useState<string[]>([]);

  const [newBlocked, setNewBlocked] = useState('');
  const [newAllowed, setNewAllowed] = useState('');

  const [synced, setSynced] = useState(false);

  useEffect(() => {
    // Load persisted rules from DB / localStorage on mount
    const loadSavedRules = async () => {
      const blocked = await dbService.getBlockedDomains();
      const allowed = await dbService.getAllowedExceptions();
      setBlockedDomains(blocked);
      setAllowedExceptions(allowed);
      syncRulesToBridge(blocked, allowed);
    };
    loadSavedRules();
  }, []);

  const handleAddBlocked = async (e: React.FormEvent) => {
    e.preventDefault();
    const domain = newBlocked.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (domain && !blockedDomains.includes(domain)) {
      const updated = [...blockedDomains, domain];
      setBlockedDomains(updated);
      setNewBlocked('');
      await dbService.saveBlockedDomains(updated);
      syncRulesToBridge(updated, allowedExceptions);
    }
  };

  const handleRemoveBlocked = async (domain: string) => {
    const updated = blockedDomains.filter((d) => d !== domain);
    setBlockedDomains(updated);
    await dbService.saveBlockedDomains(updated);
    syncRulesToBridge(updated, allowedExceptions);
  };

  const handleAddAllowed = async (e: React.FormEvent) => {
    e.preventDefault();
    const domain = newAllowed.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (domain && !allowedExceptions.includes(domain)) {
      const updated = [...allowedExceptions, domain];
      setAllowedExceptions(updated);
      setNewAllowed('');
      await dbService.saveAllowedExceptions(updated);
      syncRulesToBridge(blockedDomains, updated);
    }
  };

  const handleRemoveAllowed = async (domain: string) => {
    const updated = allowedExceptions.filter((d) => d !== domain);
    setAllowedExceptions(updated);
    await dbService.saveAllowedExceptions(updated);
    syncRulesToBridge(blockedDomains, updated);
  };

  const syncRulesToBridge = async (blocked: string[], allowed: string[]) => {
    try {
      const activeSession = useSessionStore.getState().activeSession;
      const isActive = Boolean(activeSession && activeSession.status === 'active' && activeSession.blockWebsites !== false);

      await fetch('http://127.0.0.1:47777/session/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active: isActive,
          task: activeSession?.task || 'Focus Session',
          started_at: activeSession?.startedAt || null,
          startedAt: activeSession?.startedAt || null,
          planned_minutes: activeSession?.plannedMinutes || 25,
          plannedMinutes: activeSession?.plannedMinutes || 25,
          strictness_mode: activeSession?.strictness || 'standard',
          strictness: activeSession?.strictness || 'standard',
          block_websites: activeSession?.blockWebsites !== false,
          blockWebsites: activeSession?.blockWebsites !== false,
          rules_version: Date.now(),
          blocked_domains: isActive ? blocked : [],
          allowed_exceptions: allowed,
        }),
      });
      setSynced(true);
      setTimeout(() => setSynced(false), 2000);
    } catch {
      // Bridge server offline fallback
    }
  };

  return (
    <div className="p-5 max-w-5xl mx-auto space-y-6 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold tracking-widest text-slate-100 uppercase flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            [DEFENSE_RULES_&_HOSTILE_BLOCKLIST_CONFIG]
          </h2>
          <p className="text-[10px] text-slate-500 uppercase mt-0.5">
            Configure hostile domain interception and explicit allow exceptions.
          </p>
        </div>

        {synced && (
          <span className="text-[10px] px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3" /> [EXTENSION_SYNCED]
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Blocked Websites Card */}
        <div className="p-4 rounded bg-[#090d16] border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-1.5 text-rose-400">
              <ShieldAlert className="w-4 h-4" />
              <h3 className="font-bold text-xs text-white">[HOSTILE_BLOCKLIST]</h3>
            </div>
            <span className="text-[9px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30">
              {blockedDomains.length} Restricted
            </span>
          </div>

          {/* Add Blocked Form */}
          <form onSubmit={handleAddBlocked} className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. twitter.com or tiktok.com"
              value={newBlocked}
              onChange={(e) => setNewBlocked(e.target.value)}
              className="flex-1 px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-rose-500 placeholder:text-slate-600"
            />
            <button
              type="submit"
              className="px-3 py-2 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1 transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> ADD
            </button>
          </form>

          {/* Blocked Domains List */}
          <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
            {blockedDomains.map((domain) => (
              <div
                key={domain}
                className="flex items-center justify-between p-2 rounded bg-slate-950/90 border border-slate-800/60 text-xs hover:border-slate-700 transition-all"
              >
                <span className="font-semibold text-slate-200 flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-slate-500" />
                  {domain}
                </span>
                <button
                  onClick={() => handleRemoveBlocked(domain)}
                  className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-900 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Allowed Exceptions Card */}
        <div className="p-4 rounded bg-[#090d16] border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <h3 className="font-bold text-xs text-white">[FRIENDLY_EXCEPTIONS]</h3>
            </div>
            <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
              {allowedExceptions.length} Allowed
            </span>
          </div>

          {/* Add Allowed Form */}
          <form onSubmit={handleAddAllowed} className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. music.youtube.com or docs.google.com"
              value={newAllowed}
              onChange={(e) => setNewAllowed(e.target.value)}
              className="flex-1 px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-emerald-500 placeholder:text-slate-600"
            />
            <button
              type="submit"
              className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> ADD
            </button>
          </form>

          {/* Allowed Exceptions List */}
          <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
            {allowedExceptions.map((domain) => (
              <div
                key={domain}
                className="flex items-center justify-between p-2 rounded bg-slate-950/90 border border-slate-800/60 text-xs hover:border-slate-700 transition-all"
              >
                <span className="font-semibold text-slate-200 flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-emerald-400" />
                  {domain}
                </span>
                <button
                  onClick={() => handleRemoveAllowed(domain)}
                  className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-900 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
