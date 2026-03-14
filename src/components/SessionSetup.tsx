import { useState, useRef } from 'react';
import type { SessionConfig, HorizonProfile } from '../types';
import { parseHorizonCSV } from '../lib/horizonProfile';

interface Props {
  onCalculate: (config: SessionConfig, horizon: HorizonProfile) => void;
  loading: boolean;
}

/** Parse a numeric string handling both comma and dot as decimal separators */
function parseNum(value: string, fallback: number = 0): number {
  const normalized = value.replace(',', '.');
  const n = parseFloat(normalized);
  return isNaN(n) ? fallback : n;
}

export function SessionSetup({ onCalculate, loading }: Props) {
  const [date, setDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  // Store decimal inputs as strings to allow typing "1," or "1." without losing the separator
  const [latStr, setLatStr] = useState('45.46');
  const [lonStr, setLonStr] = useState('9.19');
  const [fovWStr, setFovWStr] = useState('1.5');
  const [fovHStr, setFovHStr] = useState('1.0');
  const [elevation, setElevation] = useState(120);
  const [slewDelay, setSlewDelay] = useState(30);
  const [defaultExposure, setDefaultExposure] = useState(120);
  const [startTime, setStartTime] = useState('');
  const [minAltitude, setMinAltitude] = useState(10);
  const [horizon, setHorizon] = useState<HorizonProfile>([]);
  const [horizonFileName, setHorizonFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleGeolocate = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLatStr(String(Math.round(pos.coords.latitude * 10000) / 10000));
          setLonStr(String(Math.round(pos.coords.longitude * 10000) / 10000));
          if (pos.coords.altitude) setElevation(Math.round(pos.coords.altitude));
        },
        (err) => alert('Geolocation not available: ' + err.message)
      );
    }
  };

  const handleHorizonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setHorizonFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const profile = parseHorizonCSV(text);
      setHorizon(profile);
    };
    reader.readAsText(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCalculate({
      date,
      location: {
        latitude: parseNum(latStr, 45.46),
        longitude: parseNum(lonStr, 9.19),
        elevation,
      },
      fovWidth: parseNum(fovWStr, 1.5),
      fovHeight: parseNum(fovHStr, 1.0),
      slewDelaySec: slewDelay,
      defaultExposureSec: defaultExposure,
      startTime,
      minAltitude,
    }, horizon);
  };

  return (
    <form className="session-setup" onSubmit={handleSubmit}>
      <h2>Session Setup</h2>

      <div className="form-group">
        <label>Observation date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Latitude (N)</label>
          <input type="text" inputMode="decimal" value={latStr}
            onChange={e => setLatStr(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Longitude (E)</label>
          <input type="text" inputMode="decimal" value={lonStr}
            onChange={e => setLonStr(e.target.value)} />
        </div>
        <button type="button" className="btn-geo" onClick={handleGeolocate} title="Use GPS">
          &#9737;
        </button>
      </div>

      <div className="form-group">
        <label>Elevation (m)</label>
        <input type="number" value={elevation}
          onChange={e => setElevation(parseInt(e.target.value))} />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>FOV width (&deg;)</label>
          <input type="text" inputMode="decimal" value={fovWStr}
            onChange={e => setFovWStr(e.target.value)} />
        </div>
        <div className="form-group">
          <label>FOV height (&deg;)</label>
          <input type="text" inputMode="decimal" value={fovHStr}
            onChange={e => setFovHStr(e.target.value)} />
        </div>
      </div>

      <div className="form-group">
        <label>Slew delay (s)</label>
        <input type="number" min="0" max="300" value={slewDelay}
          onChange={e => setSlewDelay(parseInt(e.target.value) || 0)} />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Default exposure (s)</label>
          <input type="number" min="1" max="3600" value={defaultExposure}
            onChange={e => setDefaultExposure(parseInt(e.target.value))} />
        </div>
        <div className="form-group">
          <label>Minimum altitude (&deg;)</label>
          <input type="number" min="0" max="45" value={minAltitude}
            onChange={e => setMinAltitude(parseInt(e.target.value))} />
        </div>
      </div>

      <div className="form-group">
        <label>Start time (optional, HH:MM local)</label>
        <input type="time" value={startTime}
          onChange={e => setStartTime(e.target.value)} />
        <small>Leave empty to start at astronomical twilight</small>
      </div>

      <div className="form-group">
        <label>Horizon profile (CSV: azimuth, elevation)</label>
        <input type="file" accept=".csv,.txt" ref={fileInputRef}
          onChange={handleHorizonFile} />
        {horizonFileName && (
          <small>Loaded: {horizonFileName} ({horizon.length} points)</small>
        )}
      </div>

      <button type="submit" className="btn-calculate" disabled={loading}>
        {loading ? 'Calculating...' : 'Calculate Observation Plan'}
      </button>
    </form>
  );
}
