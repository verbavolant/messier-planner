import { useState } from 'react';
import type { ScheduledObject, MessierObject } from '../types';

interface Props {
  scheduled: ScheduledObject[];
  skipped: MessierObject[];
  onExposureChange: (objectId: number, newExposure: number) => void;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function cardinalDirection(azimuth: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(azimuth / 45) % 8;
  return dirs[index];
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    ok: { label: 'OK', className: 'badge-ok' },
    low: { label: 'Low', className: 'badge-low' },
    setting: { label: 'Setting', className: 'badge-setting' },
    not_visible: { label: 'Not visible', className: 'badge-hidden' },
  };
  const s = map[status] || { label: status, className: '' };
  return <span className={`badge ${s.className}`}>{s.label}</span>;
}

export function ObjectTable({ scheduled, skipped, onExposureChange }: Props) {
  const [showSkipped, setShowSkipped] = useState(false);
  const [sortField, setSortField] = useState<'order' | 'messier' | 'altitude' | 'startTime'>('order');

  const sorted = [...scheduled].sort((a, b) => {
    switch (sortField) {
      case 'order': return a.order - b.order;
      case 'messier': return a.object.id - b.object.id;
      case 'altitude': return b.altitude - a.altitude;
      case 'startTime': return a.startTime.getTime() - b.startTime.getTime();
      default: return 0;
    }
  });

  return (
    <div className="object-table-container">
      <div className="table-header">
        <h3>Observation Plan ({scheduled.length} objects)</h3>
        <div className="table-controls">
          <label>Sort by: </label>
          <select value={sortField} onChange={e => setSortField(e.target.value as typeof sortField)}>
            <option value="order">Shot order</option>
            <option value="messier">Messier number</option>
            <option value="altitude">Altitude</option>
            <option value="startTime">Start time</option>
          </select>
        </div>
      </div>

      <div className="table-scroll">
        <table className="object-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Messier</th>
              <th>Type</th>
              <th>Mag</th>
              <th>Constellation</th>
              <th>Alt&deg;</th>
              <th>Az&deg;</th>
              <th>Start</th>
              <th>End</th>
              <th>Exp (s)</th>
              <th>FOV</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(s => (
              <tr key={s.object.id} className={`row-${s.status}`}>
                <td>{s.order}</td>
                <td className="messier-id">
                  <strong>{s.object.messier}</strong>
                  {s.object.name && <small className="obj-name">{s.object.name}</small>}
                </td>
                <td>{s.object.type}</td>
                <td>{s.object.magnitude.toFixed(1)}</td>
                <td>{s.object.constellation}</td>
                <td>{s.altitude.toFixed(1)}</td>
                <td>{s.azimuth.toFixed(1)} {cardinalDirection(s.azimuth)}</td>
                <td className="time-cell">{formatTime(s.startTime)}</td>
                <td className="time-cell">{formatTime(s.endTime)}</td>
                <td>
                  <input
                    type="number"
                    className="exposure-input"
                    value={s.exposureSec}
                    min={1}
                    max={3600}
                    step={10}
                    onChange={e => onExposureChange(s.object.id, Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </td>
                <td>{s.fovGroup || '-'}</td>
                <td>{statusBadge(s.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {skipped.length > 0 && (
        <div className="skipped-section">
          <button
            className="btn-toggle"
            onClick={() => setShowSkipped(!showSkipped)}
          >
            {showSkipped ? 'Hide' : 'Show'} non-observable objects ({skipped.length})
          </button>
          {showSkipped && (
            <table className="object-table skipped-table">
              <thead>
                <tr>
                  <th>Messier</th>
                  <th>Type</th>
                  <th>Mag</th>
                  <th>Constellation</th>
                  <th>RA</th>
                  <th>Dec</th>
                </tr>
              </thead>
              <tbody>
                {skipped.map(obj => (
                  <tr key={obj.id} className="row-skipped">
                    <td><strong>{obj.messier}</strong> {obj.name && <small>{obj.name}</small>}</td>
                    <td>{obj.type}</td>
                    <td>{obj.magnitude.toFixed(1)}</td>
                    <td>{obj.constellation}</td>
                    <td>{obj.ra.toFixed(2)}h</td>
                    <td>{obj.dec.toFixed(1)}&deg;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
