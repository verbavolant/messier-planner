import type { ScheduledObject } from '../types';

interface Props {
  scheduled: ScheduledObject[];
  nightStart: Date;
  nightEnd: Date;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

export function NightTimeline({ scheduled, nightStart, nightEnd }: Props) {
  if (scheduled.length === 0) return null;

  const nightDuration = nightEnd.getTime() - nightStart.getTime();

  const getPosition = (time: Date) => {
    return ((time.getTime() - nightStart.getTime()) / nightDuration) * 100;
  };

  // Generate hour marks
  const hourMarks: { time: Date; label: string }[] = [];
  const startHour = new Date(nightStart);
  startHour.setMinutes(0, 0, 0);
  startHour.setHours(startHour.getHours() + 1);
  while (startHour.getTime() < nightEnd.getTime()) {
    hourMarks.push({ time: new Date(startHour), label: formatTime(startHour) });
    startHour.setHours(startHour.getHours() + 1);
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'ok': return '#4ecdc4';
      case 'low': return '#ffeaa7';
      case 'setting': return '#ff6b6b';
      default: return '#636e72';
    }
  };

  return (
    <div className="night-timeline">
      <h3>Night Timeline</h3>
      <div className="timeline-info">
        <span>Twilight: {formatTime(nightStart)}</span>
        <span>Dawn: {formatTime(nightEnd)}</span>
        <span>Duration: {(nightDuration / 3600000).toFixed(1)}h</span>
      </div>

      <div className="timeline-bar">
        {/* Hour marks */}
        {hourMarks.map(mark => (
          <div
            key={mark.label}
            className="timeline-hour-mark"
            style={{ left: `${getPosition(mark.time)}%` }}
          >
            <span className="hour-label">{mark.label}</span>
          </div>
        ))}

        {/* Observation blocks */}
        {scheduled.map(s => {
          const left = getPosition(s.startTime);
          const width = Math.max(0.3, getPosition(s.endTime) - left);
          return (
            <div
              key={s.object.id}
              className="timeline-block"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: statusColor(s.status),
              }}
              title={`${s.object.messier} (${formatTime(s.startTime)} - ${formatTime(s.endTime)}) Alt: ${s.altitude.toFixed(0)}°`}
            >
              {width > 2 && <span className="block-label">{s.object.messier.replace('M', '')}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
