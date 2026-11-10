import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { NormalizedActivityEvent } from '@focuswatch/shared-types';
import { Flame, ShieldAlert, BarChart3 } from 'lucide-react';

interface FocusChartsProps {
  timeline: NormalizedActivityEvent[];
}

const COLORS_DEEP_WORK = ['#10b981', '#059669', '#047857', '#34d399', '#6ee7b7'];
const COLORS_DISTRACTING = ['#f43f5e', '#e11d48', '#be123c', '#fb7185', '#fda4af'];

export const HourlyBarChartWidget: React.FC<FocusChartsProps> = ({ timeline }) => {
  const hourlyDataMap = new Map<number, { hour: string; deepWork: number; productive: number; neutral: number; distracting: number }>();

  for (let i = 0; i < 24; i++) {
    const label = i === 0 ? '12A' : i === 12 ? '12P' : i > 12 ? `${i - 12}P` : `${i}A`;
    hourlyDataMap.set(i, { hour: label, deepWork: 0, productive: 0, neutral: 0, distracting: 0 });
  }

  for (const event of timeline) {
    if (event.isAfk) continue;
    const eventDate = new Date(event.timestamp);
    const hour = eventDate.getHours();
    const durationMins = Math.round(event.durationSeconds / 60);

    const entry = hourlyDataMap.get(hour);
    if (entry) {
      if (event.categoryId === 'deep_work') entry.deepWork += durationMins;
      else if (event.productivityScore > 0) entry.productive += durationMins;
      else if (event.productivityScore < 0) entry.distracting += durationMins;
      else entry.neutral += durationMins;
    }
  }

  const hourlyData = Array.from(hourlyDataMap.values()).filter(
    (h) => h.deepWork > 0 || h.productive > 0 || h.neutral > 0 || h.distracting > 0
  );

  const displayHourlyData =
    hourlyData.length > 0
      ? hourlyData
      : [
          { hour: '9A', deepWork: 25, productive: 10, neutral: 5, distracting: 0 },
          { hour: '10A', deepWork: 45, productive: 15, neutral: 0, distracting: 5 },
          { hour: '11A', deepWork: 30, productive: 20, neutral: 10, distracting: 0 },
          { hour: '12P', deepWork: 10, productive: 10, neutral: 25, distracting: 15 },
        ];

  return (
    <div className="p-3 bg-[#090d16] border border-slate-800 rounded h-full flex flex-col justify-between font-mono">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5 cursor-grab grid-drag-handle">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-200 flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
          Activity by hour
        </h3>
        <span className="text-[9px] text-slate-500 font-mono">24 hours</span>
      </div>

      <div className="flex-1 w-full min-h-[120px] pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={displayHourlyData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
            <XAxis dataKey="hour" stroke="#475569" fontSize={9} tickLine={false} />
            <YAxis stroke="#475569" fontSize={9} tickLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#020617',
                borderColor: '#1e293b',
                borderRadius: '4px',
                color: '#f8fafc',
                fontSize: '10px',
                fontFamily: 'monospace',
              }}
            />
            <Bar dataKey="deepWork" name="Deep Work" stackId="a" fill="#10b981" />
            <Bar dataKey="productive" name="Productive" stackId="a" fill="#06b6d4" />
            <Bar dataKey="neutral" name="Neutral" stackId="a" fill="#64748b" />
            <Bar dataKey="distracting" name="Distracting" stackId="a" fill="#f43f5e" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const DeepWorkPieChartWidget: React.FC<FocusChartsProps> = ({ timeline }) => {
  const deepWorkDistributionMap = new Map<string, number>();

  for (const event of timeline) {
    if (event.isAfk) continue;
    const durationMins = Math.round(event.durationSeconds / 60);
    const name = event.domain || event.appOrBrowser;
    if (event.categoryId === 'deep_work' || event.productivityScore > 0) {
      deepWorkDistributionMap.set(name, (deepWorkDistributionMap.get(name) || 0) + durationMins);
    }
  }

  const deepWorkPieData = Array.from(deepWorkDistributionMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return (
    <div className="p-3 bg-[#090d16] border border-slate-800 rounded h-full flex flex-col justify-between font-mono">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-200 flex items-center gap-1.5 border-b border-slate-800 pb-1.5 cursor-grab grid-drag-handle">
        <Flame className="w-3.5 h-3.5 text-emerald-400" />
        Where productive time went
      </h3>

      {deepWorkPieData.length === 0 ? (
        <p className="text-[10px] text-slate-500 py-6 text-center italic font-mono">No data yet</p>
      ) : (
        <div className="flex-1 w-full min-h-[120px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={deepWorkPieData}
                cx="50%"
                cy="50%"
                innerRadius={25}
                outerRadius={45}
                paddingAngle={2}
                dataKey="value"
              >
                {deepWorkPieData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS_DEEP_WORK[index % COLORS_DEEP_WORK.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#020617',
                  borderColor: '#1e293b',
                  borderRadius: '4px',
                  color: '#f8fafc',
                  fontSize: '10px',
                  fontFamily: 'monospace',
                }}
                formatter={(val: any) => [`${val}m`, 'Span']}
              />
              <Legend formatter={(value) => <span className="text-[9px] font-mono text-slate-300">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export const DistractionPieChartWidget: React.FC<FocusChartsProps> = ({ timeline }) => {
  const distractionDistributionMap = new Map<string, number>();

  for (const event of timeline) {
    if (event.isAfk) continue;
    const durationMins = Math.round(event.durationSeconds / 60);
    const name = event.domain || event.appOrBrowser;
    if (event.productivityScore < 0) {
      distractionDistributionMap.set(name, (distractionDistributionMap.get(name) || 0) + durationMins);
    }
  }

  const distractionPieData = Array.from(distractionDistributionMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return (
    <div className="p-3 bg-[#090d16] border border-slate-800 rounded h-full flex flex-col justify-between font-mono">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-200 flex items-center gap-1.5 border-b border-slate-800 pb-1.5 cursor-grab grid-drag-handle">
        <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
        Where distracted time went
      </h3>

      {distractionPieData.length === 0 ? (
        <p className="text-[10px] text-slate-500 py-6 text-center italic font-mono">No distractions recorded</p>
      ) : (
        <div className="flex-1 w-full min-h-[120px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={distractionPieData}
                cx="50%"
                cy="50%"
                innerRadius={25}
                outerRadius={45}
                paddingAngle={2}
                dataKey="value"
              >
                {distractionPieData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS_DISTRACTING[index % COLORS_DISTRACTING.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#020617',
                  borderColor: '#1e293b',
                  borderRadius: '4px',
                  color: '#f8fafc',
                  fontSize: '10px',
                  fontFamily: 'monospace',
                }}
                formatter={(val: any) => [`${val}m`, 'Span']}
              />
              <Legend formatter={(value) => <span className="text-[9px] font-mono text-slate-300">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
