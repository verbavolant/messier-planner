import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine
} from 'recharts';
import type { ScheduledObject } from '../types';
import { dateToJD, equatorialToHorizontal } from '../lib/astronomy';

interface Props {
  scheduled: ScheduledObject[];
  nightStart: Date;
  nightEnd: Date;
  latitude: number;
  longitude: number;
}

const COLORS = [
  '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7',
  '#dfe6e9', '#fd79a8', '#a29bfe', '#00b894', '#e17055',
  '#6c5ce7', '#fdcb6e', '#e84393', '#00cec9', '#fab1a0',
];

function formatTimeAxis(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

export function AltitudeChart({ scheduled, nightStart, nightEnd, latitude, longitude }: Props) {
  const chartData = useMemo(() => {
    if (scheduled.length === 0) return null;

    // Select up to 15 objects for the chart (evenly spaced from schedule)
    const step = Math.max(1, Math.floor(scheduled.length / 15));
    const selected = scheduled.filter((_, i) => i % step === 0).slice(0, 15);

    // Generate data points every 10 minutes
    const data: Record<string, number | string>[] = [];
    const startMs = nightStart.getTime();
    const endMs = nightEnd.getTime();
    const interval = 10 * 60 * 1000; // 10 minutes

    for (let t = startMs; t <= endMs; t += interval) {
      const point: Record<string, number | string> = {
        time: t,
        timeLabel: formatTimeAxis(t),
      };

      const jd = dateToJD(new Date(t));

      for (const s of selected) {
        const coords = equatorialToHorizontal(
          s.object.ra, s.object.dec, jd, latitude, longitude
        );
        point[s.object.messier] = Math.max(0, parseFloat(coords.altitude.toFixed(1)));
      }

      data.push(point);
    }

    return { data, selected };
  }, [scheduled, nightStart, nightEnd, latitude, longitude]);

  if (!chartData || chartData.data.length === 0) return null;

  return (
    <div className="altitude-chart">
      <h3>Altitude over time</h3>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData.data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis
            dataKey="time"
            tickFormatter={formatTimeAxis}
            type="number"
            domain={['dataMin', 'dataMax']}
            stroke="#888"
          />
          <YAxis
            domain={[0, 90]}
            label={{ value: 'Altitude (°)', angle: -90, position: 'insideLeft', fill: '#888' }}
            stroke="#888"
          />
          <Tooltip
            labelFormatter={(val) => formatTimeAxis(val as number)}
            contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333' }}
          />
          <Legend />
          <ReferenceLine y={10} stroke="#666" strokeDasharray="5 5" label="Min 10°" />
          <ReferenceLine y={30} stroke="#444" strokeDasharray="3 3" />

          {chartData.selected.map((s: ScheduledObject, i: number) => (
            <Line
              key={s.object.messier}
              type="monotone"
              dataKey={s.object.messier}
              stroke={COLORS[i % COLORS.length]}
              dot={false}
              activeDot={false}
              strokeWidth={1.5}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
