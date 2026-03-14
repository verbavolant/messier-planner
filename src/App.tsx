import { useState, useCallback } from 'react';
import type { SessionConfig, HorizonProfile, ScheduleResult } from './types';
import { messierCatalog } from './data/messierCatalog';
import { optimizeSchedule } from './lib/optimizer';
import { SessionSetup } from './components/SessionSetup';
import { ObjectTable } from './components/ObjectTable';
import { AltitudeChart } from './components/AltitudeChart';
import { NightTimeline } from './components/NightTimeline';
import { ExportButton } from './components/ExportButton';
import './App.css';

function formatTime(date: Date): string {
  return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function App() {
  const [result, setResult] = useState<ScheduleResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [horizon, setHorizon] = useState<HorizonProfile>([]);
  const [exposureOverrides, setExposureOverrides] = useState<Map<number, number>>(new Map());

  const handleCalculate = useCallback((cfg: SessionConfig, hz: HorizonProfile) => {
    setLoading(true);
    setConfig(cfg);
    setHorizon(hz);

    setTimeout(() => {
      try {
        const schedule = optimizeSchedule(messierCatalog, cfg, hz, exposureOverrides);
        setResult(schedule);
      } catch (err) {
        console.error('Calculation error:', err);
        alert('Error calculating the plan. Please check your parameters.');
      }
      setLoading(false);
    }, 50);
  }, [exposureOverrides]);

  const handleExposureChange = useCallback((objectId: number, newExposure: number) => {
    setExposureOverrides(prev => {
      const next = new Map(prev);
      next.set(objectId, newExposure);
      return next;
    });
  }, []);

  const handleRecalculate = useCallback(() => {
    if (config) {
      handleCalculate(config, horizon);
    }
  }, [config, horizon, handleCalculate]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Messier Marathon Planner</h1>
        <p className="subtitle">Plan your Messier Marathon with optimized observation order</p>
      </header>

      <div className="app-layout">
        <aside className="sidebar">
          <SessionSetup onCalculate={handleCalculate} loading={loading} />
        </aside>

        <main className="content">
          {!result && !loading && (
            <div className="placeholder">
              <div className="placeholder-icon">&#9733;</div>
              <p>Set up parameters and press "Calculate Observation Plan" to begin</p>
              <p className="placeholder-detail">
                110 Messier objects &middot; Automatic order optimization &middot;
                FOV grouping &middot; Horizon profile
              </p>
            </div>
          )}

          {loading && (
            <div className="placeholder">
              <div className="spinner"></div>
              <p>Calculating... Optimizing observation order</p>
            </div>
          )}

          {result && !loading && (
            <>
              <div className="summary-cards">
                <div className="card">
                  <div className="card-value">{result.scheduledObjects.length}</div>
                  <div className="card-label">Scheduled objects</div>
                </div>
                <div className="card">
                  <div className="card-value">{result.skippedObjects.length}</div>
                  <div className="card-label">Not observable</div>
                </div>
                <div className="card">
                  <div className="card-value">{result.totalTimeMin.toFixed(0)} min</div>
                  <div className="card-label">Total time</div>
                </div>
                <div className="card">
                  <div className="card-value">{result.totalExposureMin.toFixed(0)} min</div>
                  <div className="card-label">Exposure time</div>
                </div>
                <div className="card">
                  <div className="card-value">{formatTime(result.nightStart)}</div>
                  <div className="card-label">Night start</div>
                </div>
                <div className="card">
                  <div className="card-value">{formatTime(result.nightEnd)}</div>
                  <div className="card-label">Astronomical dawn</div>
                </div>
                <div className={`card ${result.fitsBeforeDawn ? 'card-ok' : 'card-warn'}`}>
                  <div className="card-value">{formatTime(result.endTime)}</div>
                  <div className="card-label">
                    {result.fitsBeforeDawn ? "Finishes before dawn" : "Exceeds dawn!"}
                  </div>
                </div>
              </div>

              <div className="action-bar">
                <ExportButton result={result} />
                <button className="btn-recalc" onClick={handleRecalculate}>
                  Recalculate with modified exposures
                </button>
              </div>

              <NightTimeline
                scheduled={result.scheduledObjects}
                nightStart={result.nightStart}
                nightEnd={result.nightEnd}
              />

              <AltitudeChart
                scheduled={result.scheduledObjects}
                nightStart={result.nightStart}
                nightEnd={result.nightEnd}
                latitude={config!.location.latitude}
                longitude={config!.location.longitude}
              />

              <ObjectTable
                scheduled={result.scheduledObjects}
                skipped={result.skippedObjects}
                onExposureChange={handleExposureChange}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
