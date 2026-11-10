import { FocusSession, TaskCategory } from '@focuswatch/shared-types';
import { activeElapsedMinutes } from './sessionTime';
import { UNCATEGORIZED } from './categories';

export interface CategoryRow {
  id: string;
  name: string;
  color: string;
  isWaste: boolean;
  sessions: number;
  activeMinutes: number;
  plannedMinutes: number;
  fulfilled: number;
  partial: number;
  missed: number;
  successRate: number | null; // null when nothing was judged, or for waste categories
  avgDeltaMinutes: number; // actual minus planned, averaged
  ranLongShare: number; // percent of sessions that ran more than 15% over plan
  difficultyAvg: number | null;
  difficultyAnswered: number;
  estimateAnswered: number;
  underCount: number; // sessions where you said it took longer than planned
  underShare: number | null;
}

export interface WeekBucket {
  weekStart: string; // local Monday, YYYY-MM-DD
  label: string;
  total: number;
  minutes: Record<string, number>; // category id -> minutes
}

export interface CategoryStats {
  rows: CategoryRow[];
  totalMinutes: number;
  wasteMinutes: number;
  productiveMinutes: number;
  weeks: WeekBucket[];
  weekSeries: { id: string; name: string; color: string }[];
  headlines: string[];
}

/** Which category a session counts under: its own, else its task's, else none. */
export function sessionCategoryId(
  session: FocusSession,
  taskCategoryByTaskId: Record<string, string | undefined> = {}
): string | undefined {
  return session.categoryId || (session.taskId ? taskCategoryByTaskId[session.taskId] : undefined) || undefined;
}

/** Active minutes with the same runaway clamp the history table uses. */
export function sessionMinutes(session: FocusSession): number {
  const planned = session.plannedMinutes || 25;
  return Math.min(activeElapsedMinutes(session), Math.max(planned * 2.5, 180));
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local midnight of the Monday that starts the week containing `ms`. */
function weekStartOf(ms: number): Date {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

const hoursText = (mins: number) => (mins >= 90 ? `${(mins / 60).toFixed(1)}h` : `${mins}m`);

export function computeCategoryStats(
  sessions: FocusSession[],
  categories: TaskCategory[],
  taskCategoryByTaskId: Record<string, string | undefined> = {}
): CategoryStats {
  const done = sessions.filter((s) => s.status !== 'active');
  const byId = new Map(categories.map((c) => [c.id, c]));
  const resolve = (s: FocusSession): TaskCategory => {
    const id = sessionCategoryId(s, taskCategoryByTaskId);
    return (id && byId.get(id)) || UNCATEGORIZED;
  };

  // --- per category
  const groups = new Map<string, { cat: TaskCategory; items: FocusSession[] }>();
  done.forEach((s) => {
    const cat = resolve(s);
    const g = groups.get(cat.id) || { cat, items: [] };
    g.items.push(s);
    groups.set(cat.id, g);
  });

  const rows: CategoryRow[] = Array.from(groups.values()).map(({ cat, items }) => {
    const mins = items.map((s) => ({ s, actual: sessionMinutes(s), planned: s.plannedMinutes || 25 }));
    const fulfilled = items.filter((s) => s.completedOutcome === 'yes').length;
    const partial = items.filter((s) => s.completedOutcome === 'partial').length;
    const missed = items.filter((s) => s.completedOutcome === 'no').length;
    const judged = fulfilled + partial + missed;
    const rated = items.filter((s) => s.difficulty);
    const estimated = items.filter((s) => s.estimateAccuracy);
    const under = estimated.filter((s) => s.estimateAccuracy === 'under').length;
    return {
      id: cat.id,
      name: cat.name,
      color: cat.color,
      isWaste: Boolean(cat.isWaste),
      sessions: items.length,
      activeMinutes: mins.reduce((a, m) => a + m.actual, 0),
      plannedMinutes: mins.reduce((a, m) => a + m.planned, 0),
      fulfilled,
      partial,
      missed,
      successRate: cat.isWaste || judged === 0 ? null : pct(fulfilled, judged),
      avgDeltaMinutes: Math.round(mins.reduce((a, m) => a + (m.actual - m.planned), 0) / mins.length),
      ranLongShare: pct(mins.filter((m) => m.actual > m.planned * 1.15).length, mins.length),
      difficultyAvg: rated.length
        ? Math.round((rated.reduce((a, s) => a + (s.difficulty as number), 0) / rated.length) * 10) / 10
        : null,
      difficultyAnswered: rated.length,
      estimateAnswered: estimated.length,
      underCount: under,
      underShare: estimated.length ? pct(under, estimated.length) : null,
    };
  });
  rows.sort((a, b) => b.activeMinutes - a.activeMinutes);

  const totalMinutes = rows.reduce((a, r) => a + r.activeMinutes, 0);
  const wasteMinutes = rows.filter((r) => r.isWaste).reduce((a, r) => a + r.activeMinutes, 0);

  // --- weekly trend: continuous Monday-based weeks, at most the latest 8
  let weeks: WeekBucket[] = [];
  if (done.length > 0) {
    const stamps = done.map((s) => Date.parse(s.startedAt)).filter((t) => !isNaN(t));
    const first = weekStartOf(Math.min(...stamps));
    const last = weekStartOf(Math.max(...stamps));
    const buckets = new Map<string, WeekBucket>();
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 7)) {
      const key = localDateKey(d);
      buckets.set(key, {
        weekStart: key,
        label: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        total: 0,
        minutes: {},
      });
    }
    done.forEach((s) => {
      const bucket = buckets.get(localDateKey(weekStartOf(Date.parse(s.startedAt))));
      if (!bucket) return;
      const m = sessionMinutes(s);
      const id = resolve(s).id;
      bucket.minutes[id] = (bucket.minutes[id] || 0) + m;
      bucket.total += m;
    });
    weeks = Array.from(buckets.values()).slice(-8);
  }
  const weekSeries = rows
    .filter((r) => weeks.some((w) => (w.minutes[r.id] || 0) > 0))
    .map((r) => ({ id: r.id, name: r.name, color: r.color }));

  // --- plain-language takeaways
  const headlines: string[] = [];
  const top = rows[0];
  if (top && totalMinutes > 0 && pct(top.activeMinutes, totalMinutes) >= 35 && rows.length > 1) {
    headlines.push(`${pct(top.activeMinutes, totalMinutes)}% of your session time went to ${top.name}.`);
  }
  if (wasteMinutes > 0) {
    headlines.push(`${hoursText(wasteMinutes)} (${pct(wasteMinutes, totalMinutes)}%) of session time was logged as wasted time.`);
  }
  const overrun = rows
    .filter((r) => !r.isWaste && r.sessions >= 2 && r.avgDeltaMinutes >= 10)
    .sort((a, b) => b.avgDeltaMinutes - a.avgDeltaMinutes)[0];
  if (overrun) {
    headlines.push(`${overrun.name} runs ${overrun.avgDeltaMinutes}m over plan on average. It is the work you underestimate most.`);
  }
  const judged = rows.filter((r) => r.successRate !== null && r.fulfilled + r.partial + r.missed >= 3);
  if (judged.length >= 2) {
    const best = [...judged].sort((a, b) => (b.successRate as number) - (a.successRate as number))[0];
    const worst = [...judged].sort((a, b) => (a.successRate as number) - (b.successRate as number))[0];
    if (best !== worst && (best.successRate as number) - (worst.successRate as number) >= 30) {
      headlines.push(`${best.name} sessions are fulfilled ${best.successRate}% of the time, ${worst.name} only ${worst.successRate}%.`);
    }
  }
  if (weeks.length >= 2) {
    const [prev, latest] = weeks.slice(-2);
    const mover = rows
      .filter((r) => !r.isWaste)
      .map((r) => ({ r, a: prev.minutes[r.id] || 0, b: latest.minutes[r.id] || 0 }))
      .filter((m) => Math.abs(m.b - m.a) >= 30 && m.a > 0)
      .sort((x, y) => Math.abs(y.b - y.a) - Math.abs(x.b - x.a))[0];
    if (mover && Math.abs(mover.b - mover.a) / mover.a >= 0.3) {
      const change = pct(Math.abs(mover.b - mover.a), mover.a);
      headlines.push(`${mover.r.name} time is ${mover.b > mover.a ? 'up' : 'down'} ${change}% on the week before.`);
    }
  }

  return {
    rows,
    totalMinutes,
    wasteMinutes,
    productiveMinutes: totalMinutes - wasteMinutes,
    weeks,
    weekSeries,
    headlines: headlines.slice(0, 4),
  };
}
