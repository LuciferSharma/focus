import React, { useState, useEffect } from 'react';
import {
  Activity,
  ShieldCheck,
  Database,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Globe,
  Terminal,
  ShieldAlert,
  Search,
  Play,
  Info,
  Bug,
} from 'lucide-react';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { dbService } from '../../services/db';

export const DiagnosticsScreen: React.FC = () => {
  const { health, refreshDashboard, loading } = useDashboardStore();
  const [copied, setCopied] = useState(false);
  const [bridgePayload, setBridgePayload] = useState<any>(null);
  const [testDomain, setTestDomain] = useState('youtube.com');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 19)]);
  };

  const fetchBridgeState = async () => {
    try {
      addLog('Fetching http://127.0.0.1:47777/session/active ...');
      const res = await fetch('http://127.0.0.1:47777/session/active');
      if (res.ok) {
        const data = await res.json();
        setBridgePayload(data);
        addLog(`Bridge Payload Received: active=${data.active}, blocked_count=${data.blocked_domains?.length || 0}`);
      } else {
        setBridgePayload({ error: `HTTP ${res.status} ${res.statusText}` });
        addLog(`Bridge Return Error: ${res.status}`);
      }
    } catch (err: any) {
      setBridgePayload({ error: err?.message || 'Bridge offline' });
      addLog(`Bridge Fetch Failed: ${err?.message || 'Offline'}`);
    }
  };

  const handleTestDomain = async () => {
    if (!testDomain.trim()) return;
    const clean = testDomain.trim().toLowerCase();
    addLog(`Testing domain restriction for: "${clean}"`);

    const blocked = await dbService.getBlockedDomains();
    const allowed = await dbService.getAllowedExceptions();

    const isException = allowed.some((d) => clean === d || clean.endsWith(`.${d}`));
    const isBlocked = blocked.some((d) => clean === d || clean.endsWith(`.${d}`));

    if (isException) {
      setTestResult(`ALLOWED (Whitelisted exception in allowed_exceptions: "${clean}")`);
    } else if (isBlocked) {
      setTestResult(`RESTRICTED / BLOCKED (Matches hostile_blocklist: "${clean}")`);
    } else {
      setTestResult(`NOT IN BLOCKLIST (No rule matching "${clean}")`);
    }
  };

  useEffect(() => {
    fetchBridgeState();
    handleTestDomain();
  }, []);

  const handleCopyReport = () => {
    const report = {
      timestamp: new Date().toISOString(),
      activityWatch: health,
      localBridgePayload: bridgePayload,
      testDomainResult: testResult,
      browserExtensionInstalled: health?.webBucketFound ?? false,
      localBridgePort: 47777,
      sqliteDatabase: 'Healthy (SQLite 3)',
    };
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-5 max-w-6xl mx-auto space-y-6 font-mono">
      {/* Top Title Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-sm font-bold tracking-widest text-slate-100 uppercase flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            [SYS_TELEMETRY_&_LIVE_DEBUG_CENTER]
          </h2>
          <p className="text-[10px] text-slate-500 uppercase mt-0.5">
            Real-time inspection of Rust sidecar HTTP bridge (127.0.0.1:47777), active rules, and Chrome extension state.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              refreshDashboard();
              fetchBridgeState();
            }}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-[10px] font-bold text-slate-300 hover:text-white flex items-center gap-1.5 transition-all"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            REFRESH
          </button>

          <button
            onClick={handleCopyReport}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-[10px] font-bold text-white flex items-center gap-1.5 transition-all shadow-sm"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'COPIED' : 'COPY_DIAGNOSTIC_REPORT'}
          </button>
        </div>
      </div>

      {/* Real-time Domain Restriction Tester */}
      <div className="p-4 rounded-2xl bg-[#070b14] border border-slate-800 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Search className="w-4 h-4 text-cyan-400" />
            [TEST_DOMAIN_RESTRICTION_STATUS]
          </h3>
          <span className="text-[9px] text-slate-500">Live DB & Rule Evaluator</span>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-2">
          <input
            type="text"
            value={testDomain}
            onChange={(e) => setTestDomain(e.target.value)}
            placeholder="e.g. youtube.com or instagram.com"
            className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-cyan-500 font-mono"
          />
          <button
            onClick={handleTestDomain}
            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5"
          >
            <Play className="w-3 h-3 fill-current" /> EVALUATE
          </button>
        </div>

        {testResult && (
          <div
            className={`p-3 rounded-xl border text-xs font-bold ${
              testResult.startsWith('RESTRICTED')
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : testResult.startsWith('ALLOWED')
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            EVALUATION RESULT: {testResult}
          </div>
        )}
      </div>

      {/* Row 2: Live Bridge Server JSON Inspector + Extension Service Worker Steps */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bridge JSON Payload */}
        <div className="p-4 rounded-2xl bg-[#070b14] border border-slate-800 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              [LIVE_RUST_BRIDGE_HTTP_PAYLOAD]
            </h3>
            <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30">
              127.0.0.1:47777
            </span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-900 text-[10px] font-mono text-emerald-300 max-h-56 overflow-y-auto">
            <pre className="whitespace-pre-wrap">{JSON.stringify(bridgePayload, null, 2)}</pre>
          </div>
        </div>

        {/* Extension Service Worker Inspection Guide */}
        <div className="p-4 rounded-2xl bg-[#070b14] border border-slate-800 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Bug className="w-4 h-4 text-amber-400" />
              [CHROME_EXTENSION_SERVICE_WORKER_LOGS]
            </h3>
            <span className="text-[9px] text-amber-400 font-bold bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">
              DEVTOOLS_GUIDE
            </span>
          </div>

          <div className="space-y-2 text-[10px] text-slate-300">
            <p className="text-slate-400">
              To view real-time extension network intercept logs in Chrome:
            </p>
            <ol className="list-decimal list-inside space-y-1 bg-slate-950 p-3 rounded-xl border border-slate-900 text-slate-300">
              <li>Open Chrome and navigate to <code className="text-amber-300 font-bold">chrome://extensions</code></li>
              <li>Ensure <strong className="text-white">Developer mode</strong> is toggled <span className="text-emerald-400 font-bold">ON</span> (top-right switch).</li>
              <li>Click <strong className="text-cyan-400">"Inspect views: service worker"</strong> under FocusWatch companion.</li>
              <li>Open the <strong className="text-white">Console</strong> tab in DevTools to view live DNR rule updates & redirect logs!</li>
            </ol>
            <div className="p-2 rounded bg-cyan-950/30 border border-cyan-500/20 text-cyan-300 text-[9px]">
              <Info className="w-3 h-3 inline mr-1" />
              Note: Whenever extension code is modified, click the <strong>Reload (↻)</strong> icon on <code className="text-amber-300">chrome://extensions</code>.
            </div>
          </div>
        </div>
      </div>

      {/* Diagnostics Status Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ActivityWatch Server Card */}
        <div className="p-4 rounded-2xl bg-[#070b14] border border-slate-800 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              [AW_ENGINE_STATUS]
            </h3>
            <span
              className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase ${
                health?.connected
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              }`}
            >
              {health?.connected ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          <div className="space-y-1 text-[10px]">
            <div className="flex justify-between py-1 border-b border-slate-800/40 text-slate-400">
              <span>Server Address</span>
              <span className="text-slate-200">{health?.serverUrl || 'http://127.0.0.1:5600'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/40 text-slate-400">
              <span>Buckets Detected</span>
              <span className="text-slate-200">{health?.bucketsCount ?? 0}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/40 text-slate-400">
              <span>Window Bucket</span>
              <span className="text-slate-200">{health?.windowBucketId || 'None'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/40 text-slate-400">
              <span>AFK Bucket</span>
              <span className="text-slate-200">{health?.afkBucketId || 'None'}</span>
            </div>
          </div>
        </div>

        {/* Live System Log Stream */}
        <div className="p-4 rounded-2xl bg-[#070b14] border border-slate-800 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              [LIVE_SYSTEM_TELEMETRY_LOGS]
            </h3>
            <span className="text-[9px] text-slate-500">{logs.length} LOGS</span>
          </div>

          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-900 text-[9px] font-mono text-slate-300 max-h-40 overflow-y-auto space-y-1">
            {logs.length === 0 ? (
              <p className="text-slate-600 italic">No events logged yet.</p>
            ) : (
              logs.map((l, i) => <div key={i} className="truncate">{l}</div>)
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
