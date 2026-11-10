import React, { useMemo } from 'react';
import { Layers, Lightbulb, Trash2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { FocusSession } from '@focuswatch/shared-types';
import { useCategoryStore } from '../../stores/useCategoryStore';
import { computeCategoryStats, CategoryRow } from '../../services/categoryStats';

const fmt = (mins: number) =>
  mins >= 60 ? `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m` : `${mins}m`;

const Card: React.FC<{ title: string; hint?: string; className?: string; children: React.ReactNode }> = ({
  title,
  hint,
  className = '',
  children,
}) => (
  <div className={`bg-slate-950 border border-slate-800 p-4 space-y-3 ${className}`}>
    <div className="flex items-baseline justify-between gap-2">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-300">{title}</div>
      {hint && <div className="text-[9px] text-slate-600">{hint}</div>}
    </div>
    {children}
  </div>
);

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
);

const WasteTag: React.FC = () => (
  <span className="inline-flex items-center gap-0.5 px-1 py-px text-[8px] font-bold uppercase bg-rose-500/15 text-rose-300 border border-rose-500/30">
    <Trash2 className="w-2 h-2" /> waste
  </span>
);

const TimeByCategory: React.FC<{ rows: CategoryRow[]; total: number; waste: number; productive: number }> = ({
  rows,
  total,
  waste,
  productive,
}) => (
  <div className="space-y-3">
    <div className="flex h-3 overflow-hidden border border-slate-800">
      {rows.map((r) => (
        <div
          key={r.id}
          style={{ width: `${(r.activeMinutes / Math.max(1, total)) * 100}%`, backgroundColor: r.color }}
          title={`${r.name}: ${fmt(r.activeMinutes)}`}
        />
      ))}
    </div>

    <div className="space-y-1.5">
      {rows.map((r) => {
        const share = total > 0 ? Math.round((r.activeMinutes / total) * 100) : 0;
        return (
          <div key={r.id} className="flex items-center gap-2 text-[11px]">
            <Dot color={r.color} />
            <span className="w-36 truncate text-slate-200 flex items-center gap-1.5" title={r.name}>
              {r.name}
              {r.isWaste && <WasteTag />}
            </span>
            <div className="flex-1 h-1.5 bg-slate-900 overflow-hidden">
              <div className="h-full" style={{ width: `${share}%`, backgroundColor: r.color }} />
            </div>
            <span className="w-16 text-right font-bold text-white">{fmt(r.activeMinutes)}</span>
            <span className="w-9 text-right text-slate-500">{share}%</span>
          </div>
        );
      })}
    </div>

    <div className="flex flex-wrap gap-x-5 gap-y-1 pt-2 border-t border-slate-900 text-[10px] text-slate-400">
      <span>
        Productive <span className="font-bold text-emerald-300">{fmt(productive)}</span>
      </span>
      <span>
        Wasted <span className="font-bold text-rose-300">{fmt(waste)}</span>
      </span>
      <span>
        Total <span className="font-bold text-white">{fmt(total)}</span>
      </span>
    </div>
  </div>
);

const SuccessByCategory: React.FC<{ rows: CategoryRow[] }> = ({ rows }) => {
  const judged = rows.filter((r) => r.successRate !== null);
  if (judged.length === 0) {
    return <p className="text-[10px] text-slate-600 italic">No sessions with an outcome yet.</p>;
  }
  return (
    <div className="space-y-2.5">
      {judged.map((r) => {
        const total = r.fulfilled + r.partial + r.missed;
        return (
          <div key={r.id} className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-slate-200 truncate">
                <Dot color={r.color} /> {r.name}
              </span>
              <span className="font-black text-white">{r.successRate}%</span>
            </div>
            <div className="flex h-1.5 overflow-hidden bg-slate-900" title={`${r.fulfilled} fulfilled, ${r.partial} partial, ${r.missed} missed`}>
              <div className="bg-emerald-400" style={{ width: `${(r.fulfilled / total) * 100}%` }} />
              <div className="bg-amber-400" style={{ width: `${(r.partial / total) * 100}%` }} />
              <div className="bg-rose-400" style={{ width: `${(r.missed / total) * 100}%` }} />
            </div>
          </div>
        );
      })}
      <div className="flex gap-3 text-[9px] text-slate-500 pt-1">
        <span><span className="inline-block w-2 h-2 bg-emerald-400 mr-1" />Fulfilled</span>
        <span><span className="inline-block w-2 h-2 bg-amber-400 mr-1" />Partial</span>
        <span><span className="inline-block w-2 h-2 bg-rose-400 mr-1" />Missed</span>
      </div>
    </div>
  );
};

const EstimatesTable: React.FC<{ rows: CategoryRow[] }> = ({ rows }) => {
  const work = rows.filter((r) => !r.isWaste);
  if (work.length === 0) return <p className="text-[10px] text-slate-600 italic">Nothing to compare yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="text-left text-[9px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
            <th className="py-1.5 pr-3 font-bold">Category</th>
            <th className="py-1.5 px-2 font-bold text-right">Sessions</th>
            <th className="py-1.5 px-2 font-bold text-right" title="Actual minutes minus planned, averaged">Vs plan</th>
            <th className="py-1.5 px-2 font-bold text-right" title="Sessions that ran more than 15% over plan">Ran long</th>
            <th className="py-1.5 px-2 font-bold text-right" title="Of the sessions where you answered, how many you said took longer than planned">Said took longer</th>
            <th className="py-1.5 pl-2 font-bold text-right">Difficulty</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-900">
          {work.map((r) => (
            <tr key={r.id}>
              <td className="py-1.5 pr-3 text-slate-200">
                <span className="flex items-center gap-1.5"><Dot color={r.color} /> {r.name}</span>
              </td>
              <td className="py-1.5 px-2 text-right text-slate-400">{r.sessions}</td>
              <td className={`py-1.5 px-2 text-right font-bold ${r.avgDeltaMinutes > 5 ? 'text-amber-300' : r.avgDeltaMinutes < -5 ? 'text-sky-300' : 'text-emerald-300'}`}>
                {r.avgDeltaMinutes > 0 ? '+' : ''}{r.avgDeltaMinutes}m
              </td>
              <td className="py-1.5 px-2 text-right text-slate-300">{r.ranLongShare}%</td>
              <td className="py-1.5 px-2 text-right text-slate-300">
                {r.underShare === null ? <span className="text-slate-600">n/a</span> : `${r.underShare}% `}
                {r.underShare !== null && <span className="text-slate-600">({r.estimateAnswered})</span>}
              </td>
              <td className="py-1.5 pl-2 text-right text-slate-300">
                {r.difficultyAvg === null ? <span className="text-slate-600">n/a</span> : `${r.difficultyAvg}/5`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** Time, success, estimates and trends broken down by the kind of work. */
export const CategoryInsights: React.FC<{
  sessions: FocusSession[];
  taskCategoryByTaskId: Record<string, string | undefined>;
}> = ({ sessions, taskCategoryByTaskId }) => {
  const categories = useCategoryStore((s) => s.categories);
  const stats = useMemo(
    () => computeCategoryStats(sessions, categories, taskCategoryByTaskId),
    [sessions, categories, taskCategoryByTaskId]
  );
  const uncategorized = stats.rows.find((r) => r.id === '__none__');
  const allUncategorized = stats.rows.length > 0 && stats.rows.every((r) => r.id === '__none__');
  const weekData = stats.weeks.map((w) => ({ label: w.label, ...w.minutes }));

  return (
    <div className="bg-[#050811] border border-slate-800 p-5 space-y-5 font-mono">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" /> Work by category
        </h3>
        <span className="text-[10px] text-slate-500">
          Based on the sessions in the range you picked above
          {uncategorized && !allUncategorized ? `, ${uncategorized.sessions} without a category` : ''}
        </span>
      </div>

      {stats.rows.length === 0 ? (
        <p className="text-xs text-slate-500 italic py-4 text-center">No finished sessions in this range yet.</p>
      ) : (
        <>
          {allUncategorized && (
            <div className="border border-cyan-500/30 bg-cyan-500/5 p-3 text-xs text-slate-300 leading-relaxed">
              None of these sessions have a category yet. Give a task a category on the Tasks tab, or use the pencil
              on a session in the table below, and this section fills in.
            </div>
          )}

          {stats.headlines.length > 0 && (
            <div className="border border-violet-500/30 bg-violet-500/5 p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-violet-300 flex items-center gap-1.5 mb-2">
                <Lightbulb className="w-3.5 h-3.5" /> What stands out
              </div>
              <ul className="space-y-1.5 text-xs text-slate-200 leading-relaxed list-disc pl-4 marker:text-violet-400">
                {stats.headlines.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title="Time by category" className="lg:col-span-2">
              <TimeByCategory
                rows={stats.rows}
                total={stats.totalMinutes}
                waste={stats.wasteMinutes}
                productive={stats.productiveMinutes}
              />
            </Card>

            <Card title="Success rate" hint="How often sessions end fulfilled">
              <SuccessByCategory rows={stats.rows} />
            </Card>

            <Card title="Estimates and difficulty" hint="Which kinds of work you misjudge" className="lg:col-span-3">
              <EstimatesTable rows={stats.rows} />
            </Card>

            <Card title="Weekly trend" hint="Minutes per week, by category" className="lg:col-span-3">
              {stats.weeks.length < 2 && (
                <p className="text-[10px] text-slate-600 italic">
                  Only one week of data in this range. Switch the range at the top to Month or All to see how your mix shifts.
                </p>
              )}
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={weekData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="#0f172a" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={{ stroke: '#1e293b' }} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: '#0f172a' }}
                      contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', fontSize: 11, fontFamily: 'monospace' }}
                      formatter={(value: number, name: string) => [fmt(Math.round(value)), name]}
                    />
                    {stats.weekSeries.map((s) => (
                      <Bar key={s.id} dataKey={s.id} name={s.name} stackId="week" fill={s.color} isAnimationActive={false} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400">
                {stats.weekSeries.map((s) => (
                  <span key={s.id} className="flex items-center gap-1.5">
                    <Dot color={s.color} /> {s.name}
                  </span>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};
