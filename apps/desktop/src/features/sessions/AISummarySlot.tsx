import React, { useState } from 'react';
import { Sparkles, Copy, Check, Terminal, FileText, Zap } from 'lucide-react';
import { FocusSession } from '@focuswatch/shared-types';
import { aiPromptBuilder } from '../../services/aiPromptBuilder';
import { useDashboardStore } from '../../stores/useDashboardStore';

interface AISummarySlotProps {
  session: FocusSession;
}

export const AISummarySlot: React.FC<AISummarySlotProps> = ({ session }) => {
  const { rawTimeline } = useDashboardStore();
  const [copied, setCopied] = useState(false);

  const payload = aiPromptBuilder.buildStructuredPayload(session, rawTimeline);
  const promptText = aiPromptBuilder.generateRetrospectivePrompt(payload);

  const handleCopy = () => {
    navigator.clipboard.writeText(promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[#050811] border border-slate-800/90 rounded-2xl p-5 space-y-4 font-mono shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              [AI_SESSION_RETROSPECTIVE_GENERATOR]
            </h4>
            <p className="text-[10px] text-slate-400">
              Sanitizes telemetry logs and generates LLM-ready performance context.
            </p>
          </div>
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800/60 transition-all shadow-[0_0_10px_rgba(6,182,212,0.2)]"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? '[ COPIED! ]' : '[ 📋 COPY_AI_PROMPT_PAYLOAD ]'}</span>
        </button>
      </div>

      {/* Structured Telemetry Highlights */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
        <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
          <span className="text-slate-500 uppercase block text-[8px] font-bold">Planned vs Actual</span>
          <span className="font-bold text-white">{payload.plannedMinutes}m / {payload.actualElapsedMinutes}m</span>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
          <span className="text-slate-500 uppercase block text-[8px] font-bold">Context Switches</span>
          <span className="font-bold text-cyan-400">{payload.contextSwitches} switches</span>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
          <span className="text-slate-500 uppercase block text-[8px] font-bold">Distractions Blocked</span>
          <span className="font-bold text-rose-400">{payload.distractionsBlocked} attempts</span>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
          <span className="text-slate-500 uppercase block text-[8px] font-bold">Strictness</span>
          <span className="font-bold text-amber-400 uppercase">{payload.strictness}</span>
        </div>
      </div>

      {/* Top App Distribution */}
      {payload.topAppsUsed.length > 0 && (
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1.5">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
            <Terminal className="w-3 h-3 text-emerald-400" /> Top Digital Workspaces Used:
          </span>
          <div className="flex flex-wrap gap-2 text-[10px]">
            {payload.topAppsUsed.map((app) => (
              <span
                key={app.name}
                className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 font-semibold"
              >
                {app.name}: <span className="text-emerald-400 font-bold">{app.minutes}m</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Code Block Preview */}
      <div className="relative">
        <pre className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 text-[10px] text-slate-300 max-h-36 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
          {promptText}
        </pre>
      </div>
    </div>
  );
};
