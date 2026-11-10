import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  BellRing,
  Trophy,
  Pause,
  Play,
  X,
  ChevronDown,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { useSessionStore, SessionReflection } from '../../stores/useSessionStore';
import { useTaskStore } from '../../stores/useTaskStore';
import { pausedMs } from '../../services/sessionTime';
import { AISummarySlot } from './AISummarySlot';
import { AttachmentPicker } from './AttachmentPicker';

type Outcome = 'yes' | 'partial' | 'no';
type Accuracy = 'under' | 'about_right' | 'over';
type Difficulty = 1 | 2 | 3 | 4 | 5;

interface Draft {
  outcome: Outcome | null;
  note: string;
  difficulty: Difficulty | null;
  accuracy: Accuracy | null;
  differently: string;
  didOther: boolean | null;
  otherNote: string;
}

const EMPTY_DRAFT: Draft = {
  outcome: null,
  note: '',
  difficulty: null,
  accuracy: null,
  differently: '',
  didOther: null,
  otherNote: '',
};

const draftKey = (sessionId: string) => `focuswatch_draft_${sessionId}`;

function loadDraft(sessionId: string): Draft {
  try {
    const raw = localStorage.getItem(draftKey(sessionId));
    if (raw) return { ...EMPTY_DRAFT, ...JSON.parse(raw) };
  } catch {}
  return EMPTY_DRAFT;
}

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  1: 'Easy',
  2: 'Light',
  3: 'Solid',
  4: 'Hard',
  5: 'Brutal',
};

/** A textarea that grows with its content, between a minimum and maximum height. */
const AutoTextarea: React.FC<
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number; maxHeightPx?: number }
> = ({ minRows = 4, maxHeightPx = 380, value, className = '', ...rest }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeightPx)}px`;
  }, [value, maxHeightPx]);
  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      className={`w-full px-3 py-2.5 bg-slate-950 border border-slate-800 text-slate-100 text-xs leading-relaxed placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 resize-none overflow-y-auto ${className}`}
      {...rest}
    />
  );
};

const Section: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({
  title,
  hint,
  children,
}) => (
  <section className="space-y-2">
    <div className="flex items-baseline justify-between gap-3">
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-300">{title}</h4>
      {hint && <span className="text-[9px] text-slate-500">{hint}</span>}
    </div>
    {children}
  </section>
);

export const OutcomeVerificationModal: React.FC = () => {
  const {
    isOutcomeModalOpen,
    closeOutcomeModal,
    activeSession,
    endSession,
    elapsedSeconds,
    attachmentsVersion,
    pauseSession,
    resumeSession,
  } = useSessionStore();
  const { tasks } = useTaskStore();

  const sessionId = activeSession?.id ?? '';
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  // Pick up a saved draft whenever the session changes (including after a reload).
  useEffect(() => {
    setDraft(sessionId ? loadDraft(sessionId) : EMPTY_DRAFT);
    setAiOpen(false);
  }, [sessionId]);

  // Every edit is written straight to storage, so closing the panel to keep working,
  // or reloading the app, never loses what was typed.
  const update = (patch: Partial<Draft>) =>
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      try {
        if (sessionId) localStorage.setItem(draftKey(sessionId), JSON.stringify(next));
      } catch {}
      return next;
    });

  const handleSubmit = async () => {
    if (!draft.outcome || submitting || !activeSession) return;
    setSubmitting(true);
    try {
      const extras: SessionReflection = {
        difficulty: draft.difficulty ?? undefined,
        estimateAccuracy: draft.accuracy ?? undefined,
        wouldDoDifferently: draft.differently,
        didOtherTasks: draft.didOther ?? undefined,
        otherTasksNote: draft.otherNote,
      };
      await endSession(draft.outcome, draft.note.trim() || undefined, undefined, extras);
      try {
        localStorage.removeItem(draftKey(sessionId));
      } catch {}
      setDraft(EMPTY_DRAFT);
    } finally {
      setSubmitting(false);
    }
  };

  // Keyboard: Ctrl/Cmd+Enter submits, Escape goes back to work. The handler reads the
  // latest submit function through a ref so the listener is registered only once per open.
  const submitRef = useRef(handleSubmit);
  submitRef.current = handleSubmit;
  useEffect(() => {
    if (!isOutcomeModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeOutcomeModal();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void submitRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOutcomeModalOpen, closeOutcomeModal]);

  if (!isOutcomeModalOpen || !activeSession) return null;

  const isPaused = Boolean(activeSession.pausedAt);
  const plannedSeconds = (activeSession.plannedMinutes || 25) * 60;
  const isTimeUp = !isPaused && elapsedSeconds >= plannedSeconds;
  const activeMinutes = Math.round(elapsedSeconds / 60);
  const pausedMinutes = Math.round(pausedMs(activeSession) / 60000);
  const deltaMinutes = activeMinutes - activeSession.plannedMinutes;

  const ratio = elapsedSeconds / plannedSeconds;
  const suggestedAccuracy: Accuracy = ratio > 1.15 ? 'under' : ratio < 0.85 ? 'over' : 'about_right';

  // Other tasks the user might have touched: quick-add chips, never required.
  const otherTaskChips = tasks
    .filter((t) => t.id !== activeSession.taskId && (t.status === 'in_progress' || t.status === 'backlog'))
    .slice(0, 6);

  const addOtherTask = (title: string) => {
    const existing = draft.otherNote.trim();
    if (existing.toLowerCase().includes(title.toLowerCase())) return;
    update({ otherNote: existing ? `${existing}, ${title}` : title });
  };

  const outcomeOptions: {
    id: Outcome;
    label: string;
    sub: string;
    Icon: React.ElementType;
    idle: string;
    selected: string;
  }[] = [
    {
      id: 'yes',
      label: 'Yes',
      sub: 'Delivered it',
      Icon: CheckCircle2,
      idle: 'border-slate-800 text-slate-300 hover:border-emerald-500/50 hover:bg-emerald-950/30',
      selected: 'border-emerald-400 bg-emerald-950/60 text-emerald-200 shadow-[0_0_18px_rgba(16,185,129,0.25)]',
    },
    {
      id: 'partial',
      label: 'Partially',
      sub: 'Task goes back to In Progress',
      Icon: AlertTriangle,
      idle: 'border-slate-800 text-slate-300 hover:border-amber-500/50 hover:bg-amber-950/30',
      selected: 'border-amber-400 bg-amber-950/60 text-amber-200 shadow-[0_0_18px_rgba(245,158,11,0.25)]',
    },
    {
      id: 'no',
      label: 'No',
      sub: 'Task goes back to Backlog',
      Icon: XCircle,
      idle: 'border-slate-800 text-slate-300 hover:border-rose-500/50 hover:bg-rose-950/30',
      selected: 'border-rose-400 bg-rose-950/60 text-rose-200 shadow-[0_0_18px_rgba(244,63,94,0.25)]',
    },
  ];

  const chip = (active: boolean, tone: 'cyan' | 'amber' = 'cyan') =>
    `px-2.5 py-1.5 text-[11px] font-bold border transition-all ${
      active
        ? tone === 'cyan'
          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
          : 'bg-amber-500/20 border-amber-400 text-amber-200'
        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200'
    }`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 font-mono">
      <div className="w-full max-w-5xl max-h-[94vh] bg-[#050811] border border-slate-800 shadow-[0_0_60px_rgba(0,0,0,0.85)] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-10 h-10 border flex items-center justify-center flex-shrink-0 ${
                isTimeUp
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 animate-pulse'
                  : isPaused
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                  : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
              }`}
            >
              {isTimeUp ? <BellRing className="w-5 h-5" /> : isPaused ? <Pause className="w-5 h-5" /> : <Trophy className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <div
                className={`text-[10px] font-bold uppercase tracking-widest ${
                  isTimeUp ? 'text-amber-400' : isPaused ? 'text-sky-300' : 'text-emerald-400'
                }`}
              >
                {isTimeUp ? '[ time is up ]' : isPaused ? '[ session paused ]' : '[ wrap up session ]'}
              </div>
              <h3 className="text-base font-bold text-white truncate" title={activeSession.task}>
                {activeSession.task}
              </h3>
              {activeSession.expectedOutput && (
                <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">
                  <span className="text-slate-500">Target:</span> {activeSession.expectedOutput}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3 flex-shrink-0">
            <div className="hidden sm:flex items-stretch gap-2 text-[10px]">
              <div className="px-2.5 py-1.5 bg-slate-950 border border-slate-800">
                <div className="text-[8px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" /> Planned
                </div>
                <div className="font-bold text-white">{activeSession.plannedMinutes}m</div>
              </div>
              <div className="px-2.5 py-1.5 bg-slate-950 border border-slate-800">
                <div className="text-[8px] uppercase tracking-wider text-slate-500">Active</div>
                <div
                  className={`font-bold ${
                    deltaMinutes > 0 ? 'text-amber-300' : 'text-emerald-300'
                  }`}
                >
                  {activeMinutes}m{' '}
                  <span className="text-[9px] font-normal text-slate-500">
                    ({deltaMinutes > 0 ? '+' : ''}
                    {deltaMinutes})
                  </span>
                </div>
              </div>
              {pausedMinutes > 0 && (
                <div className="px-2.5 py-1.5 bg-slate-950 border border-slate-800">
                  <div className="text-[8px] uppercase tracking-wider text-slate-500">Paused</div>
                  <div className="font-bold text-sky-300">{pausedMinutes}m</div>
                </div>
              )}
            </div>
            <button
              onClick={closeOutcomeModal}
              className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700"
              title="Keep working (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 custom-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left: what happened */}
            <div className="lg:col-span-3 space-y-5">
              <Section title="Did you complete the promised output?" hint="Required">
                <div className="grid grid-cols-3 gap-2.5">
                  {outcomeOptions.map(({ id, label, sub, Icon, idle, selected }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => update({ outcome: id })}
                      aria-pressed={draft.outcome === id}
                      className={`p-3 border text-left transition-all active:scale-[0.98] ${
                        draft.outcome === id ? selected : idle
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold text-sm">
                        <Icon className="w-4 h-4" /> {label}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1 leading-snug">{sub}</div>
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="What did you get done?" hint="Line breaks are kept">
                <AutoTextarea
                  minRows={6}
                  maxHeightPx={420}
                  value={draft.note}
                  onChange={(e) => update({ note: e.target.value })}
                  placeholder={
                    'Write as much as you like: what shipped, what you learned, where you stopped, links, next steps...'
                  }
                />
                <div className="text-[9px] text-slate-600 text-right">{draft.note.length} characters</div>
              </Section>

              <Section title="Screenshots and photos" hint="Optional, kept on this computer">
                <AttachmentPicker
                  sessionId={activeSession.id}
                  version={attachmentsVersion}
                  enablePaste={isOutcomeModalOpen}
                />
              </Section>
            </div>

            {/* Right: reflection */}
            <div className="lg:col-span-2 space-y-5 lg:border-l lg:border-slate-800 lg:pl-6">
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">
                  Reflection
                </h4>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  All optional. These build a picture of how you actually work.
                </p>
              </div>

              <Section title="How hard was it?">
                <div className="grid grid-cols-5 gap-1.5">
                  {([1, 2, 3, 4, 5] as Difficulty[]).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => update({ difficulty: draft.difficulty === n ? null : n })}
                      className={`py-1.5 border text-center transition-all ${
                        draft.difficulty === n
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                      }`}
                    >
                      <div className="text-sm font-black">{n}</div>
                      <div className="text-[8px] uppercase tracking-wide">{DIFFICULTY_LABELS[n]}</div>
                    </button>
                  ))}
                </div>
              </Section>

              <Section
                title="Was your estimate right?"
                hint={`Planned ${activeSession.plannedMinutes}m, spent ${activeMinutes}m`}
              >
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      ['under', 'Took longer'],
                      ['about_right', 'About right'],
                      ['over', 'Finished early'],
                    ] as [Accuracy, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => update({ accuracy: draft.accuracy === id ? null : id })}
                      className={`${chip(draft.accuracy === id, 'amber')} ${
                        draft.accuracy === null && suggestedAccuracy === id
                          ? 'ring-1 ring-slate-500'
                          : ''
                      }`}
                      title={draft.accuracy === null && suggestedAccuracy === id ? 'Suggested from your times' : undefined}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="What would you do differently?">
                <AutoTextarea
                  minRows={3}
                  maxHeightPx={200}
                  value={draft.differently}
                  onChange={(e) => update({ differently: e.target.value })}
                  placeholder="Start earlier, split it up, ask for help sooner, turn off notifications..."
                />
              </Section>

              <Section title="Did you work on other tasks in between?">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => update({ didOther: draft.didOther === false ? null : false })}
                    className={chip(draft.didOther === false)}
                  >
                    No, stayed on it
                  </button>
                  <button
                    type="button"
                    onClick={() => update({ didOther: draft.didOther === true ? null : true })}
                    className={chip(draft.didOther === true, 'amber')}
                  >
                    Yes
                  </button>
                </div>

                {draft.didOther === true && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={draft.otherNote}
                      onChange={(e) => update({ otherNote: e.target.value })}
                      placeholder="Which ones? Replies, a bug, a call..."
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-slate-100 text-xs placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                    />
                    {otherTaskChips.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {otherTaskChips.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => addOtherTask(t.title)}
                            className="max-w-[200px] truncate px-2 py-1 text-[10px] border border-slate-800 bg-slate-950 text-slate-400 hover:text-white hover:border-slate-600"
                            title={`Add "${t.title}"`}
                          >
                            + {t.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Section>

              <div className="border border-slate-800">
                <button
                  type="button"
                  onClick={() => setAiOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white"
                >
                  <span>AI retrospective prompt (optional)</span>
                  {aiOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
                {aiOpen && (
                  <div className="p-2 border-t border-slate-800">
                    <AISummarySlot
                      session={{
                        ...activeSession,
                        completedOutcome: draft.outcome ?? undefined,
                        completionNote: draft.note.trim() || undefined,
                        difficulty: draft.difficulty ?? undefined,
                        estimateAccuracy: draft.accuracy ?? undefined,
                        wouldDoDifferently: draft.differently.trim() || undefined,
                        didOtherTasks: draft.didOther ?? undefined,
                        otherTasksNote: draft.otherNote.trim() || undefined,
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-slate-800 bg-[#03060d] flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeOutcomeModal}
              className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-white border border-slate-800 hover:border-slate-600"
            >
              Keep working
            </button>
            {isPaused ? (
              <button
                type="button"
                onClick={async () => {
                  await resumeSession();
                  closeOutcomeModal();
                }}
                className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-sky-200 border border-sky-500/40 bg-sky-950/40 hover:bg-sky-900/50 flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" /> Resume
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  await pauseSession();
                  closeOutcomeModal();
                }}
                className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-sky-200 border border-sky-500/40 bg-sky-950/40 hover:bg-sky-900/50 flex items-center gap-1.5"
                title="Freeze the timer and continue this session later"
              >
                <Pause className="w-3.5 h-3.5" /> Pause instead
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-[10px] text-slate-500">
              {draft.outcome ? 'Ctrl+Enter to submit' : 'Choose an outcome to finish'}
            </span>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!draft.outcome || submitting}
              className="px-5 py-2 text-[11px] font-black uppercase tracking-wider bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_16px_rgba(16,185,129,0.35)] disabled:shadow-none"
            >
              {submitting ? 'Saving...' : 'Submit & end session'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
