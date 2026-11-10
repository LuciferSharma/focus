import React, { useMemo } from 'react';
import { Repeat, Lightbulb, Gauge, Scale, Shuffle, ListRestart, Brain } from 'lucide-react';
import { FocusSession } from '@focuswatch/shared-types';
import { computeBehaviorInsights } from '../../services/behaviorInsights';

const Card: React.FC<{
  title: string;
  Icon: React.ElementType;
  tone?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ title, Icon, tone = 'text-cyan-400', className = '', children }) => (
  <div className={`bg-slate-950 border border-slate-800 p-4 space-y-3 ${className}`}>
    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-300">
      <Icon className={`w-3.5 h-3.5 ${tone}`} /> {title}
    </div>
    {children}
  </div>
);

/** One horizontal bar split into labelled segments. Empty segments take no space. */
const StackedBar: React.FC<{ segments: { value: number; color: string; label: string }[] }> = ({ segments }) => {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total === 0) return <div className="h-2.5 bg-slate-900 border border-slate-800" />;
  return (
    <div className="space-y-1.5">
      <div className="flex h-2.5 overflow-hidden border border-slate-800">
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div key={s.label} className={s.color} style={{ width: `${(s.value / total) * 100}%` }} title={`${s.label}: ${s.value}`} />
          ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1">
            <span className={`inline-block w-2 h-2 ${s.color}`} />
            {s.label} <span className="text-slate-200 font-bold">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

const Hint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[10px] text-slate-600 italic leading-relaxed">{children}</p>
);

/**
 * Patterns across finished sessions: how you plan, what gets in the way, and what you keep
 * telling yourself you would do differently.
 */
export const BehaviorPatterns: React.FC<{ sessions: FocusSession[] }> = ({ sessions }) => {
  const r = useMemo(() => computeBehaviorInsights(sessions), [sessions]);
  const { planning, estimate, difficulty, interruptions } = r;
  const maxDifficultyCount = Math.max(1, ...difficulty.counts);
  const delta = planning.avgDeltaMinutes;

  return (
    <div className="bg-[#050811] border border-slate-800 p-5 space-y-5 font-mono">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Repeat className="w-4 h-4 text-violet-400" /> [BEHAVIOR_PATTERNS]
        </h3>
        <span className="text-[10px] text-slate-500">
          {r.sessionCount} finished session{r.sessionCount === 1 ? '' : 's'} in this range,{' '}
          {r.reflectionCount} with reflection answers
        </span>
      </div>

      {r.sessionCount === 0 ? (
        <p className="text-xs text-slate-500 italic py-4 text-center">
          No finished sessions in this range yet. Patterns appear after you complete a few.
        </p>
      ) : (
        <>
          {/* What keeps repeating */}
          <div className="border border-violet-500/30 bg-violet-500/5 p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-violet-300 flex items-center gap-1.5 mb-2">
              <Lightbulb className="w-3.5 h-3.5" /> What keeps repeating
            </div>
            {r.headlines.length > 0 ? (
              <ul className="space-y-1.5 text-xs text-slate-200 leading-relaxed list-disc pl-4 marker:text-violet-400">
                {r.headlines.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400 leading-relaxed">
                Not enough to call a pattern yet. Answer the optional reflection questions when you end a session
                (difficulty, estimate, other tasks, what you would do differently). After 3 or 4 sessions this
                box starts pointing out what repeats.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Plan vs reality */}
            <Card title="Plan vs reality" Icon={Gauge} tone="text-amber-400">
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-black ${delta > 0 ? 'text-amber-300' : delta < 0 ? 'text-emerald-300' : 'text-white'}`}>
                  {delta > 0 ? '+' : ''}
                  {delta}m
                </span>
                <span className="text-[10px] text-slate-500">average against plan</span>
              </div>
              <StackedBar
                segments={[
                  { value: planning.ranLong, color: 'bg-amber-400', label: 'Ran long' },
                  { value: planning.onTarget, color: 'bg-emerald-400', label: 'On target' },
                  { value: planning.ranShort, color: 'bg-sky-400', label: 'Finished early' },
                ]}
              />
              <Hint>From real timer data, paused time excluded. On target means within 15% of the plan.</Hint>
            </Card>

            {/* Your own estimate call */}
            <Card title="Your estimate call" Icon={Scale} tone="text-cyan-400">
              {estimate.answered === 0 ? (
                <Hint>Nobody has answered "Was your estimate right?" yet.</Hint>
              ) : (
                <>
                  <div className="text-xs text-slate-300">
                    <span className="text-2xl font-black text-white">{Math.round((estimate.under / estimate.answered) * 100)}%</span>{' '}
                    <span className="text-[10px] text-slate-500">said it took longer</span>
                  </div>
                  <StackedBar
                    segments={[
                      { value: estimate.under, color: 'bg-amber-400', label: 'Took longer' },
                      { value: estimate.aboutRight, color: 'bg-emerald-400', label: 'About right' },
                      { value: estimate.over, color: 'bg-sky-400', label: 'Finished early' },
                    ]}
                  />
                </>
              )}
            </Card>

            {/* Difficulty */}
            <Card title="Difficulty" Icon={Brain} tone="text-rose-400">
              {difficulty.answered === 0 ? (
                <Hint>No difficulty ratings yet.</Hint>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-white">{difficulty.average}</span>
                    <span className="text-[10px] text-slate-500">average out of 5, {difficulty.answered} rated</span>
                  </div>
                  <div className="flex items-end gap-1.5">
                    {difficulty.counts.map((c, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
                        <span className="text-[9px] text-slate-400 font-bold h-3">{c > 0 ? c : ''}</span>
                        <div
                          className="w-full bg-rose-400/70"
                          style={{ height: `${c > 0 ? Math.max(6, Math.round((c / maxDifficultyCount) * 40)) : 2}px` }}
                          title={`${c} session${c === 1 ? '' : 's'}`}
                        />
                        <span className="text-[9px] text-slate-500">{i + 1}</span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-0.5 text-[10px] text-slate-400">
                    {difficulty.byBucket.map((b) => (
                      <div key={b.label} className="flex justify-between">
                        <span>{b.label} fulfilled</span>
                        <span className="text-slate-200 font-bold">
                          {b.fulfilledRate === null ? 'n/a' : `${b.fulfilledRate}%`}{' '}
                          <span className="text-slate-600 font-normal">({b.sessions})</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>

            {/* Interruptions */}
            <Card title="Interruptions" Icon={Shuffle} tone="text-orange-400">
              {interruptions.answered === 0 && interruptions.pausedSessions === 0 ? (
                <Hint>No answers about other tasks yet, and no paused sessions.</Hint>
              ) : (
                <>
                  {interruptions.answered > 0 && (
                    <>
                      <div className="text-xs text-slate-300">
                        <span className="text-2xl font-black text-white">
                          {Math.round((interruptions.yes / interruptions.answered) * 100)}%
                        </span>{' '}
                        <span className="text-[10px] text-slate-500">
                          did other tasks mid-session ({interruptions.yes} of {interruptions.answered})
                        </span>
                      </div>
                      {interruptions.topOtherTasks.length > 0 && (
                        <div className="space-y-0.5 text-[10px]">
                          <div className="text-slate-500 uppercase tracking-wider text-[9px] font-bold">Most often</div>
                          {interruptions.topOtherTasks.map((t) => (
                            <div key={t.name} className="flex justify-between text-slate-300">
                              <span className="truncate pr-2">{t.name}</span>
                              <span className="font-bold text-orange-300">x{t.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {interruptions.pausedSessions > 0 && (
                    <p className="text-[10px] text-slate-400 border-t border-slate-800 pt-2">
                      Paused in <span className="text-slate-200 font-bold">{interruptions.pausedSessions}</span> session
                      {interruptions.pausedSessions === 1 ? '' : 's'}, about{' '}
                      <span className="text-slate-200 font-bold">{interruptions.avgPausedMinutes}m</span> each.
                    </p>
                  )}
                </>
              )}
            </Card>

            {/* Recurring lessons */}
            <Card title="What you would do differently" Icon={ListRestart} tone="text-violet-400" className="lg:col-span-2 lg:row-span-2">
              {r.recentLessons.length === 0 ? (
                <Hint>Nothing written under "What would you do differently?" yet.</Hint>
              ) : (
                <>
                  {r.themes.length > 0 ? (
                    <div className="space-y-1.5">
                      <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">
                        Said in more than one session
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {r.themes.map((t) => (
                          <span
                            key={t.phrase}
                            title={`From: ${t.tasks.slice(0, 6).join(', ')}`}
                            className="px-2 py-1 text-[11px] border border-violet-500/40 bg-violet-500/10 text-violet-200"
                          >
                            {t.phrase} <span className="font-black text-violet-300">x{t.count}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Hint>No phrase repeats across sessions yet. It will show here as soon as one does.</Hint>
                  )}

                  <div className="space-y-2 pt-1">
                    <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Most recent</div>
                    {r.recentLessons.map((l) => (
                      <div key={l.startedAt} className="border-l-2 border-slate-700 pl-3">
                        <div className="text-[10px] text-slate-500 truncate">
                          {l.task} ·{' '}
                          {new Date(l.startedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </div>
                        <p className="text-xs text-slate-200 whitespace-pre-wrap line-clamp-3">{l.text}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>

            {/* Tasks that keep coming back */}
            <Card title="Tasks that keep coming back" Icon={Repeat} tone="text-emerald-400">
              {r.repeatedTasks.length === 0 ? (
                <Hint>Every task has been a single session so far.</Hint>
              ) : (
                <div className="space-y-1.5">
                  {r.repeatedTasks.map((t) => (
                    <div key={t.task} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate text-slate-200" title={t.task}>
                        {t.task}
                      </span>
                      <span className="flex-shrink-0 text-slate-400">
                        <span className="font-bold text-white">{t.sessions}</span> sessions
                        {t.notFulfilled > 0 && <span className="text-amber-300"> · {t.notFulfilled} unfinished</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
};
