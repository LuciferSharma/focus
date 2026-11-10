import { FocusSession } from '@focuswatch/shared-types';
import { activeElapsedMinutes } from './sessionTime';

export interface DayContribution {
  date: string; // YYYY-MM-DD
  dayLabel: string; // e.g. "Aug 06"
  totalMinutes: number;
  focusScore: number;
  sessionsCount: number;
  isQualifying: boolean;
}

export interface StreakStats {
  currentStreak: number;
  longestStreak: number;
  totalDeepWorkHours: number;
  qualifyingDaysCount: number;
  dailyGoalMinutes: number;
  gridData: DayContribution[];
}

export class StreakEngine {
  private dailyGoalMinutes: number;

  constructor(dailyGoalMinutes: number = 60) {
    this.dailyGoalMinutes = dailyGoalMinutes;
  }

  public toLocalDateString(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  public calculateStreaks(sessions: FocusSession[], daysRange: number = 30): StreakStats {
    const dayMap = new Map<string, { totalMinutes: number; sessionsCount: number; completedCount: number }>();

    // Aggregate sessions by local calendar date
    for (const session of sessions) {
      if (!session.startedAt) continue;

      const startDate = new Date(session.startedAt);
      const dateKey = this.toLocalDateString(startDate);

      const elapsedMins = Math.max(1, activeElapsedMinutes(session));

      const current = dayMap.get(dateKey) || { totalMinutes: 0, sessionsCount: 0, completedCount: 0 };
      current.totalMinutes += elapsedMins;
      current.sessionsCount += 1;
      if (session.completedOutcome === 'yes' || session.status === 'completed') {
        current.completedCount += 1;
      }
      dayMap.set(dateKey, current);
    }

    // Build grid data array for requested range (default 30 days) ending today
    const gridData: DayContribution[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalDeepWorkMins = 0;
    let qualifyingDaysCount = 0;

    for (let i = daysRange - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateKey = this.toLocalDateString(d);
      const dayLabel = d.toLocaleDateString([], { month: 'short', day: '2-digit' });

      const stats = dayMap.get(dateKey) || { totalMinutes: 0, sessionsCount: 0, completedCount: 0 };
      const totalMinutes = stats.totalMinutes;
      const isQualifying = totalMinutes >= this.dailyGoalMinutes;

      let focusScore = 0;
      if (totalMinutes > 0) {
        const minScore = Math.min(60, Math.round((totalMinutes / 120) * 60));
        const completionScore = stats.sessionsCount > 0 ? Math.round((stats.completedCount / stats.sessionsCount) * 40) : 20;
        focusScore = Math.min(100, minScore + completionScore);
      }

      if (isQualifying) qualifyingDaysCount++;
      totalDeepWorkMins += totalMinutes;

      gridData.push({
        date: dateKey,
        dayLabel,
        totalMinutes,
        focusScore,
        sessionsCount: stats.sessionsCount,
        isQualifying,
      });
    }

    // Calculate streaks
    const todayStr = this.toLocalDateString(today);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = this.toLocalDateString(yesterday);

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    const reversed = [...gridData].reverse();
    const todayData = dayMap.get(todayStr);
    const yesterdayData = dayMap.get(yesterdayStr);

    const isTodayQualifying = (todayData?.totalMinutes || 0) >= this.dailyGoalMinutes;
    const isYesterdayQualifying = (yesterdayData?.totalMinutes || 0) >= this.dailyGoalMinutes;

    if (isTodayQualifying || isYesterdayQualifying) {
      for (const day of reversed) {
        if (day.date === todayStr && !isTodayQualifying) {
          continue;
        }
        if (day.isQualifying) {
          currentStreak++;
        } else {
          break;
        }
      }
    }

    for (const day of gridData) {
      if (day.isQualifying) {
        tempStreak++;
        if (tempStreak > longestStreak) {
          longestStreak = tempStreak;
        }
      } else {
        tempStreak = 0;
      }
    }

    return {
      currentStreak,
      longestStreak,
      totalDeepWorkHours: Math.round((totalDeepWorkMins / 60) * 10) / 10,
      qualifyingDaysCount,
      dailyGoalMinutes: this.dailyGoalMinutes,
      gridData,
    };
  }
}

export const streakEngine = new StreakEngine();
