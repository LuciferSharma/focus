import React from 'react';
import { HelpCircle, Play, Coffee, StopCircle } from 'lucide-react';
import { useSessionStore } from '../../stores/useSessionStore';

interface InactivityPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InactivityPromptModal: React.FC<InactivityPromptModalProps> = ({ isOpen, onClose }) => {
  const { activeSession, openOutcomeModal } = useSessionStore();

  if (!isOpen || !activeSession) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-8 shadow-2xl space-y-6 text-center">
        {/* Animated Icon */}
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
          <HelpCircle className="w-8 h-8 animate-bounce" />
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
            Inactivity Detected
          </span>
          <h3 className="text-xl font-bold text-white pt-2">Are you still working?</h3>
          <p className="text-xs text-slate-300 italic font-semibold">"{activeSession.task}"</p>
          <p className="text-[11px] text-slate-400 pt-1">
            FocusWatch noticed no activity or typing for the last 5 minutes.
          </p>
        </div>

        {/* Action Choices */}
        <div className="space-y-3 pt-2">
          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs shadow-lg shadow-brand-600/30 flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <Play className="w-4 h-4 fill-current" />
            Yes, Still Working
          </button>

          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 font-semibold text-xs flex items-center justify-center gap-2 transition-all"
          >
            <Coffee className="w-4 h-4 text-amber-400" />
            Taking a Short Break
          </button>

          <button
            onClick={() => {
              onClose();
              openOutcomeModal();
            }}
            className="w-full py-3.5 rounded-2xl bg-slate-950 hover:bg-rose-950/40 text-rose-400 hover:text-rose-300 border border-slate-800 hover:border-rose-500/30 font-semibold text-xs flex items-center justify-center gap-2 transition-all"
          >
            <StopCircle className="w-4 h-4" />
            End Session
          </button>
        </div>
      </div>
    </div>
  );
};
