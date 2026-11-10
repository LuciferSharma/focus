import React from 'react';
import { FocusSession } from '@focuswatch/shared-types';
import { pausedMs } from '../../services/sessionTime';
import { AttachmentPicker } from './AttachmentPicker';

const DIFFICULTY_LABELS = ['', 'Easy', 'Light', 'Solid', 'Hard', 'Brutal'];
const ACCURACY_LABELS: Record<string, string> = {
  under: 'Took longer than planned',
  about_right: 'About right',
  over: 'Finished early',
};

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="px-3 py-2 bg-slate-950 border border-slate-800">
    <div className="text-[8px] uppercase tracking-wider text-slate-500 font-bold">{label}</div>
    <div className="text-xs text-slate-100 font-bold mt-0.5">{children}</div>
  </div>
);

/** Read-only view of everything recorded when a session ended. Used in the history. */
export const SessionDetails: React.FC<{ session: FocusSession }> = ({ session }) => {
  const paused = Math.round(pausedMs(session) / 60000);
  const hasFacts =
    session.difficulty || session.estimateAccuracy || session.didOtherTasks !== undefined || paused > 0;
  const hasText = session.completionNote || session.wouldDoDifferently;

  return (
    <div className="space-y-4 font-mono">
      {hasFacts && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {session.difficulty && (
            <Fact label="Difficulty">
              {session.difficulty}/5 <span className="text-slate-500 font-normal">{DIFFICULTY_LABELS[session.difficulty]}</span>
            </Fact>
          )}
          {session.estimateAccuracy && <Fact label="Estimate">{ACCURACY_LABELS[session.estimateAccuracy]}</Fact>}
          {session.didOtherTasks !== undefined && (
            <Fact label="Other tasks in between">
              {session.didOtherTasks ? session.otherTasksNote || 'Yes' : 'No, stayed on it'}
            </Fact>
          )}
          {paused > 0 && <Fact label="Time paused">{paused}m</Fact>}
        </div>
      )}

      {session.completionNote && (
        <div>
          <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-1">What got done</div>
          <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">{session.completionNote}</p>
        </div>
      )}

      {session.wouldDoDifferently && (
        <div>
          <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-1">Would do differently</div>
          <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">{session.wouldDoDifferently}</p>
        </div>
      )}

      <AttachmentPicker sessionId={session.id} readOnly />

      {!hasFacts && !hasText && (
        <p className="text-[11px] text-slate-600 italic">
          No notes or reflection were recorded for this session.
        </p>
      )}
    </div>
  );
};
