import { FocusSession } from '@focuswatch/shared-types';
import { activeElapsedMinutes } from './sessionTime';

export interface Theme {
  phrase: string;
  count: number; // number of different sessions that mention it
  tasks: string[];
}

export interface BehaviorInsights {
  sessionCount: number;
  reflectionCount: number; // sessions where at least one optional question was answered
  planning: { avgDeltaMinutes: number; ranLong: number; onTarget: number; ranShort: number };
  estimate: { answered: number; under: number; aboutRight: number; over: number };
  difficulty: {
    answered: number;
    average: number | null;
    counts: [number, number, number, number, number];
    byBucket: { label: string; sessions: number; fulfilledRate: number | null }[];
  };
  interruptions: {
    answered: number;
    yes: number;
    topOtherTasks: { name: string; count: number }[];
    pausedSessions: number;
    avgPausedMinutes: number;
  };
  themes: Theme[];
  recentLessons: { task: string; startedAt: string; text: string }[];
  repeatedTasks: { task: string; sessions: number; notFulfilled: number }[];
  headlines: string[];
}

const STOPWORDS = new Set(
  (
    'a an and are as at be been but by can could did do does doing done for from get got had has have how i if in into is it ' +
    'its just like me more most much my no not of on one or our out so some than that the their them then there these they ' +
    'this to too up us was we were what when which while who will with would you your should next time thing things also ' +
    'really very less about after before again been being over under want wanted need needed make made keep kept'
  ).split(' ')
);

interface ParsedEntry {
  task: string;
  words: string[]; // every word, in order, lower-cased
  keepIdx: number[]; // positions in `words` that carry meaning (not stopwords or tiny words)
}

function parseEntry(task: string, text: string): ParsedEntry {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .map((t) => t.replace(/^'+|'+$/g, ''))
    .filter((t) => t.length > 0);
  const keepIdx: number[] = [];
  words.forEach((w, i) => {
    if (w.length >= 3 && !STOPWORDS.has(w)) keepIdx.push(i);
  });
  return { task, words, keepIdx };
}

/** The wording the person actually used, e.g. "ask for help sooner", for a run of key words. */
function spanText(entry: ParsedEntry, keys: string[]): string | null {
  const kept = entry.keepIdx.map((i) => entry.words[i]);
  for (let i = 0; i + keys.length <= kept.length; i++) {
    if (keys.every((k, j) => kept[i + j] === k)) {
      return entry.words.slice(entry.keepIdx[i], entry.keepIdx[i + keys.length - 1] + 1).join(' ');
    }
  }
  return null;
}

const sameSet = (a: Set<number>, b: Set<number>) => a.size === b.size && Array.from(a).every((x) => b.has(x));

/**
 * Phrases that show up in more than one session. Single words and pairs of neighbouring
 * key words are counted per session, then overlapping pairs that always appear together
 * are joined, so "break smaller" + "smaller pieces" becomes "break it into smaller pieces".
 */
function findThemes(entries: { task: string; text: string }[]): Theme[] {
  const parsed = entries.map((e) => parseEntry(e.task, e.text));
  const found = new Map<string, { keys: string[]; sessions: Set<number> }>();
  const note = (keys: string[], idx: number) => {
    const id = keys.join(' ');
    const rec = found.get(id) || { keys, sessions: new Set<number>() };
    rec.sessions.add(idx);
    found.set(id, rec);
  };

  parsed.forEach((e, idx) => {
    const kept = e.keepIdx.map((i) => e.words[i]);
    kept.forEach((k) => note([k], idx));
    for (let i = 0; i < kept.length - 1; i++) note([kept[i], kept[i + 1]], idx);
  });

  let phrases = Array.from(found.values()).filter((r) => r.sessions.size >= 2);

  // Join "a b" + "b c" into "a b c" while both are always seen in the same sessions.
  for (let guard = 0; guard < 6; guard++) {
    let merged = false;
    for (const left of phrases.filter((p) => p.keys.length >= 2)) {
      const right = phrases.find(
        (p) =>
          p !== left &&
          p.keys.length >= 2 &&
          p.keys[0] === left.keys[left.keys.length - 1] &&
          sameSet(p.sessions, left.sessions)
      );
      if (!right) continue;
      const keys = [...left.keys, ...right.keys.slice(1)];
      phrases = phrases.filter((p) => p !== left && p !== right);
      phrases.push({ keys, sessions: left.sessions });
      merged = true;
      break;
    }
    if (!merged) break;
  }

  // Drop a part when a longer phrase covers it in exactly the same sessions.
  const kept = phrases.filter(
    (p) =>
      !phrases.some(
        (q) =>
          q !== p &&
          q.keys.length > p.keys.length &&
          sameSet(q.sessions, p.sessions) &&
          p.keys.every((k) => q.keys.includes(k))
      )
  );

  return kept
    .map((p) => {
      const first = Math.min(...Array.from(p.sessions));
      const shown = spanText(parsed[first], p.keys) || p.keys.join(' ');
      return {
        phrase: shown,
        count: p.sessions.size,
        tasks: Array.from(new Set(Array.from(p.sessions).map((i) => parsed[i].task))),
        words: p.keys.length,
      };
    })
    .sort((a, b) => b.count - a.count || b.words - a.words || a.phrase.localeCompare(b.phrase))
    .slice(0, 8)
    .map(({ phrase, count, tasks }) => ({ phrase, count, tasks }));
}

function splitOtherTasks(note: string): string[] {
  return note
    .split(/[,;\n]|\band\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.toLowerCase() !== 'yes');
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Turns a set of finished sessions into the patterns the Analytics tab shows. */
export function computeBehaviorInsights(sessions: FocusSession[]): BehaviorInsights {
  const done = sessions.filter((s) => s.status !== 'active');

  // --- planning reality: actual active time against the plan, using the same runaway clamp as the history table
  const deltas = done.map((s) => {
    const planned = s.plannedMinutes || 25;
    const actual = Math.min(activeElapsedMinutes(s), Math.max(planned * 2.5, 180));
    return { planned, actual, delta: actual - planned };
  });
  const planning = {
    avgDeltaMinutes: deltas.length ? Math.round(deltas.reduce((a, d) => a + d.delta, 0) / deltas.length) : 0,
    ranLong: deltas.filter((d) => d.actual > d.planned * 1.15).length,
    ranShort: deltas.filter((d) => d.actual < d.planned * 0.85).length,
    onTarget: 0,
  };
  planning.onTarget = deltas.length - planning.ranLong - planning.ranShort;

  // --- self-assessed estimate
  const withEstimate = done.filter((s) => s.estimateAccuracy);
  const estimate = {
    answered: withEstimate.length,
    under: withEstimate.filter((s) => s.estimateAccuracy === 'under').length,
    aboutRight: withEstimate.filter((s) => s.estimateAccuracy === 'about_right').length,
    over: withEstimate.filter((s) => s.estimateAccuracy === 'over').length,
  };

  // --- difficulty, and whether hard sessions get finished less often
  const rated = done.filter((s) => s.difficulty);
  const counts: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  rated.forEach((s) => (counts[(s.difficulty as number) - 1] += 1));
  const bucket = (label: string, pick: (d: number) => boolean) => {
    const inBucket = rated.filter((s) => pick(s.difficulty as number) && s.completedOutcome);
    return {
      label,
      sessions: inBucket.length,
      fulfilledRate: inBucket.length ? pct(inBucket.filter((s) => s.completedOutcome === 'yes').length, inBucket.length) : null,
    };
  };
  const difficulty = {
    answered: rated.length,
    average: rated.length ? Math.round((rated.reduce((a, s) => a + (s.difficulty as number), 0) / rated.length) * 10) / 10 : null,
    counts,
    byBucket: [bucket('Easy (1-2)', (d) => d <= 2), bucket('Medium (3)', (d) => d === 3), bucket('Hard (4-5)', (d) => d >= 4)],
  };

  // --- interruptions: other tasks in between, and pauses
  const askedAboutOthers = done.filter((s) => s.didOtherTasks !== undefined);
  const otherTaskCounts = new Map<string, { name: string; count: number }>();
  done.forEach((s) => {
    if (!s.didOtherTasks || !s.otherTasksNote) return;
    const seen = new Set<string>();
    splitOtherTasks(s.otherTasksNote).forEach((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const rec = otherTaskCounts.get(key) || { name, count: 0 };
      rec.count += 1;
      otherTaskCounts.set(key, rec);
    });
  });
  const paused = done.filter((s) => (s.totalPausedMs || 0) > 0);
  const interruptions = {
    answered: askedAboutOthers.length,
    yes: askedAboutOthers.filter((s) => s.didOtherTasks).length,
    topOtherTasks: Array.from(otherTaskCounts.values()).sort((a, b) => b.count - a.count).slice(0, 5),
    pausedSessions: paused.length,
    avgPausedMinutes: paused.length
      ? Math.round(paused.reduce((a, s) => a + (s.totalPausedMs || 0), 0) / paused.length / 60000)
      : 0,
  };

  // --- recurring lessons
  const lessons = done
    .filter((s) => s.wouldDoDifferently && s.wouldDoDifferently.trim())
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const themes = findThemes(lessons.map((s) => ({ task: s.task, text: s.wouldDoDifferently as string })));
  const recentLessons = lessons.slice(0, 5).map((s) => ({
    task: s.task,
    startedAt: s.startedAt,
    text: (s.wouldDoDifferently as string).trim(),
  }));

  // --- tasks that keep coming back
  const byTask = new Map<string, { task: string; sessions: number; notFulfilled: number }>();
  done.forEach((s) => {
    const key = s.taskId || s.task.trim().toLowerCase();
    const rec = byTask.get(key) || { task: s.task, sessions: 0, notFulfilled: 0 };
    rec.sessions += 1;
    if (s.completedOutcome !== 'yes') rec.notFulfilled += 1;
    byTask.set(key, rec);
  });
  const repeatedTasks = Array.from(byTask.values())
    .filter((t) => t.sessions >= 2)
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 6);

  const reflectionCount = done.filter(
    (s) => s.difficulty || s.estimateAccuracy || (s.wouldDoDifferently && s.wouldDoDifferently.trim()) || s.didOtherTasks !== undefined
  ).length;

  // --- plain-language takeaways, only when there is enough data to mean something
  const headlines: string[] = [];
  if (deltas.length >= 3 && Math.abs(planning.avgDeltaMinutes) >= 5) {
    headlines.push(
      `Your sessions run ${Math.abs(planning.avgDeltaMinutes)}m ${planning.avgDeltaMinutes > 0 ? 'longer' : 'shorter'} than planned on average` +
        (planning.avgDeltaMinutes > 0 ? ` (${planning.ranLong} of ${deltas.length} ran long).` : '.')
    );
  }
  if (estimate.answered >= 3) {
    if (estimate.under / estimate.answered >= 0.5) {
      headlines.push(`You said you underestimated ${estimate.under} of ${estimate.answered} sessions (${pct(estimate.under, estimate.answered)}%).`);
    } else if (estimate.over / estimate.answered >= 0.5) {
      headlines.push(`You said you overestimated ${estimate.over} of ${estimate.answered} sessions (${pct(estimate.over, estimate.answered)}%).`);
    }
  }
  if (interruptions.answered >= 3 && interruptions.yes / interruptions.answered >= 0.4) {
    const top = interruptions.topOtherTasks[0];
    headlines.push(
      `You worked on other tasks mid-session in ${interruptions.yes} of ${interruptions.answered} sessions (${pct(interruptions.yes, interruptions.answered)}%)` +
        (top && top.count >= 2 ? `, most often: ${top.name}.` : '.')
    );
  }
  const [easy, medium, hard] = difficulty.byBucket;
  const easierSessions = easy.sessions + medium.sessions;
  if (hard.sessions >= 2 && easierSessions >= 2 && hard.fulfilledRate !== null) {
    const easierFulfilled = Math.round(
      (((easy.fulfilledRate || 0) * easy.sessions) + ((medium.fulfilledRate || 0) * medium.sessions)) / easierSessions
    );
    if (hard.fulfilledRate + 15 <= easierFulfilled) {
      headlines.push(`Hard sessions (4-5) were fulfilled ${hard.fulfilledRate}% of the time, versus ${easierFulfilled}% for easier ones.`);
    }
  }
  if (themes[0]) {
    headlines.push(`"${themes[0].phrase}" came up in ${themes[0].count} of your would-do-differently notes.`);
  }
  if (repeatedTasks[0]) {
    headlines.push(`"${repeatedTasks[0].task}" has taken ${plural(repeatedTasks[0].sessions, 'session')} so far.`);
  }

  return {
    sessionCount: done.length,
    reflectionCount,
    planning,
    estimate,
    difficulty,
    interruptions,
    themes,
    recentLessons,
    repeatedTasks,
    headlines: headlines.slice(0, 5),
  };
}
