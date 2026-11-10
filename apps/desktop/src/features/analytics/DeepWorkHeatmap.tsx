import React, { useState } from 'react';
import { Flame, Trophy, Calendar, Award, Clock } from 'lucide-react';
import { StreakStats, DayContribution } from '../../services/streakEngine';

interface DeepWorkHeatmapProps {
  stats: StreakStats;
}

export const DeepWorkHeatmap: React.FC<DeepWorkHeatmapProps> = ({ stats }) => {
  const [hoveredDay, setHoveredDay] = useState<DayContribution | null>(null);

  const getTileClass = (mins: number) => {
    if (mins === 0) return 'bg-slate-950 border-slate-800 hover:border-slate-600 text-slate-600';
    if (mins < 60) return 'bg-emerald-950/80 border-emerald-800/80 hover:border-emerald-500 text-emerald-400';
    if (mins < 180) return 'bg-emerald-700/80 border-emerald-500 hover:border-emerald-300 text-white';
    if (mins < 300) return 'bg-emerald-500 border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.4)] text-slate-950 font-bold';
    return 'bg-emerald-400 border-emerald-300 shadow-[0_0_15px_rgba(52,211,153,0.8)] animate-pulse text-slate-950 font-extrabold';
  };

  return (
    <div className="bg-[#050811] border border-slate-800 p-5 space-y-5 font-mono shadow-xl rounded-none">
      {/* KPI Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-950 border border-slate-800 p-3 space-y-1 rounded-none">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Current Streak</span>
            <Flame className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          </div>
          <div className="text-xl font-extrabold text-white font-mono flex items-baseline gap-1">
            {stats.currentStreak} <span className="text-[10px] font-normal text-slate-500">days</span>
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 p-3 space-y-1 rounded-none">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Longest Streak</span>
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-extrabold text-white font-mono flex items-baseline gap-1">
            {stats.longestStreak} <span className="text-[10px] font-normal text-slate-500">days</span>
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 p-3 space-y-1 rounded-none">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">30d Focus Time</span>
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-xl font-extrabold text-cyan-300 font-mono flex items-baseline gap-1">
            {stats.totalDeepWorkHours} <span className="text-[10px] font-normal text-slate-500">hrs</span>
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 p-3 space-y-1 rounded-none">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Qualifying Days</span>
            <Award className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-xl font-extrabold text-indigo-300 font-mono flex items-baseline gap-1">
            {stats.qualifyingDaysCount} <span className="text-[10px] font-normal text-slate-500">/ 30</span>
          </div>
        </div>
      </div>

      {/* 30-Day Matrix Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-400" /> [30_DAY_TACTICAL_DEEP_WORK_MATRIX]
          </h3>
          <div className="flex items-center gap-2 text-[9px] text-slate-400 font-mono">
            <span>0m</span>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 bg-slate-950 border border-slate-800"></span>
              <span className="w-3 h-3 bg-emerald-950 border border-emerald-800"></span>
              <span className="w-3 h-3 bg-emerald-700 border border-emerald-500"></span>
              <span className="w-3 h-3 bg-emerald-500 border border-emerald-400"></span>
            </div>
            <span>300m+</span>
          </div>
        </div>

        {/* 30-Day Grid Display (6 cols x 5 rows) */}
        <div className="grid grid-cols-6 sm:grid-cols-10 md:grid-cols-15 gap-2">
          {stats.gridData.map((day) => (
            <div
              key={day.date}
              onMouseEnter={() => setHoveredDay(day)}
              onMouseLeave={() => setHoveredDay(null)}
              className={`p-2 border transition-all cursor-pointer rounded-none flex flex-col items-center justify-between h-14 ${getTileClass(
                day.totalMinutes
              )}`}
            >
              <span className="text-[8px] font-bold opacity-80">{day.dayLabel}</span>
              <span className="text-xs font-extrabold font-mono">
                {day.totalMinutes > 0 ? `${day.totalMinutes}m` : '-'}
              </span>
            </div>
          ))}
        </div>

        {/* Hover Inspector Bar */}
        <div className="h-8 bg-slate-950 border border-slate-800 rounded-none px-3 flex items-center justify-between text-xs font-mono">
          {hoveredDay ? (
            <>
              <span className="text-slate-300 font-bold">{hoveredDay.date} ({hoveredDay.dayLabel})</span>
              <div className="flex items-center gap-4 text-[11px]">
                <span className="text-emerald-400 font-bold">{hoveredDay.totalMinutes} mins focus</span>
                <span className="text-cyan-400 font-semibold">Score: {hoveredDay.focusScore}/100</span>
                <span className="text-slate-400">{hoveredDay.sessionsCount} sessions</span>
              </div>
            </>
          ) : (
            <span className="text-[10px] text-slate-500 italic">
              Hover over a 30-day matrix tile to inspect date telemetry...
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
