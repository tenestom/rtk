import { useState } from 'react';
import CoordinateView from './CoordinateView';
import { haversine, formatMeters } from '../utils/geo';

// Point colours
const COLOURS = { A: '#3b82f6', B: '#a855f7', C: '#f59e0b' };

/** Law of cosines: angle at vertex opposite side c, given all three side lengths. */
function angleDeg(a, b, c) {
  const cos = (a * a + b * b - c * c) / (2 * a * b);
  const clamped = Math.max(-1, Math.min(1, cos));
  return (Math.acos(clamped) * 180) / Math.PI;
}

export default function DistanceMeasure({ data, onBack }) {
  // Each point: { lat, lon, label: string }
  const [points, setPoints]   = useState([null, null, null]); // [A, B, C]
  const [labels, setLabels]   = useState(['', '', '']);       // custom labels

  const hasGps    = data?.lat != null && data?.lon != null;
  const currentPos = hasGps ? { lat: data.lat, lon: data.lon } : null;

  const [pA, pB, pC] = points;

  // ── Distances ─────────────────────────────────────────────────────────
  const dAB = pA && pB ? haversine(pA.lat, pA.lon, pB.lat, pB.lon) : null;
  const dBC = pB && pC ? haversine(pB.lat, pB.lon, pC.lat, pC.lon) : null;
  const dAC = pA && pC ? haversine(pA.lat, pA.lon, pC.lat, pC.lon) : null;

  // ── Angles (law of cosines) ────────────────────────────────────────────
  let angA = null, angB = null, angC = null;
  if (dAB && dBC && dAC) {
    angA = angleDeg(dAB, dAC, dBC);  // at A: sides from A are AB and AC, opposite = BC
    angB = angleDeg(dAB, dBC, dAC);  // at B: sides from B are AB and BC, opposite = AC
    angC = angleDeg(dAC, dBC, dAB);  // at C: sides from C are AC and BC, opposite = AB
  }

  // ── Map points ────────────────────────────────────────────────────────
  const mapPoints = ['A', 'B', 'C']
    .map((key, i) => points[i]
      ? { lat: points[i].lat, lon: points[i].lon,
          label: labels[i].trim() || key,
          sublabel: key,
          color: COLOURS[key] }
      : null)
    .filter(Boolean);

  // ── Actions ───────────────────────────────────────────────────────────
  function savePoint(i) {
    if (!hasGps) return;
    setPoints(prev => {
      const next = [...prev];
      next[i] = { lat: data.lat, lon: data.lon };
      return next;
    });
  }

  function clearPoint(i) {
    setPoints(prev => { const n=[...prev]; n[i]=null; return n; });
    // If C is cleared, shift nothing. If B is cleared but C exists, don't auto-shift.
  }

  function reset() { setPoints([null,null,null]); setLabels(['','','']); }

  // ── Helpers ───────────────────────────────────────────────────────────
  const KEYS = ['A', 'B', 'C'];
  const pointCount = points.filter(Boolean).length;

  return (
    <div className="feature-screen dm-screen">

      {/* Nav */}
      <div className="screen-nav">
        <button id="btn-back-distance" className="back-btn" onClick={onBack}>← Back</button>
        <h2 className="screen-title">Measure Distance</h2>
      </div>

      {/* Live GPS */}
      <div className="live-pos-strip">
        <span className="lps-label">Live</span>
        <span className="lps-coords">
          {hasGps ? `${data.lat.toFixed(7)},  ${data.lon.toFixed(7)}` : 'Waiting for GPS…'}
        </span>
      </div>

      {/* Point cards */}
      <div className="dm-points-grid">
        {[0, 1, 2].map(i => {
          const key    = KEYS[i];
          const pt     = points[i];
          const color  = COLOURS[key];
          // Only allow saving the next sequential point (or updating existing)
          const canSave = pt != null || (i === 0 ? true : points[i-1] != null);

          return (
            <div key={key} className={`dm-card${pt ? ' dm-card--set' : ''}`}
              style={{ '--pt-color': color }}>
              <div className="dm-card-top">
                <span className="dm-badge">{key}</span>
                <input
                  id={`input-label-${key.toLowerCase()}`}
                  className="dm-label-input"
                  placeholder={`Label (opt.)`}
                  value={labels[i]}
                  maxLength={12}
                  onChange={e => setLabels(prev => {
                    const n=[...prev]; n[i]=e.target.value; return n;
                  })}
                />
              </div>

              {pt ? (
                <div className="dm-coords">
                  <span>{pt.lat.toFixed(6)}</span>
                  <span>{pt.lon.toFixed(6)}</span>
                </div>
              ) : (
                <span className="dm-empty">Not set</span>
              )}

              <div className="dm-card-actions">
                <button
                  id={`btn-save-${key.toLowerCase()}`}
                  className="dm-btn dm-btn--save"
                  onClick={() => savePoint(i)}
                  disabled={!hasGps || !canSave}>
                  {pt ? `↺ Update ${key}` : `＋ Save ${key}`}
                </button>
                {pt && (
                  <button className="dm-btn dm-btn--clear" onClick={() => clearPoint(i)}>✕</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Map */}
      <CoordinateView
        points={mapPoints}
        currentPos={currentPos}
        triangle={pA && pB && pC ? { dAB, dBC, dAC, angA, angB, angC } : null}
        distance={dAB}
      />

      {/* Measurements panel */}
      {pointCount >= 2 && (
        <div className="dm-results">

          {/* Side distances */}
          <div className="dmr-section">
            <span className="dmr-heading">Distances</span>
            {dAB != null && (
              <div className="dmr-row">
                <span className="dmr-side" style={{color: COLOURS.A}}>A</span>
                <span className="dmr-dash">↔</span>
                <span className="dmr-side" style={{color: COLOURS.B}}>B</span>
                <span className="dmr-val">{formatMeters(dAB)}</span>
              </div>
            )}
            {dBC != null && (
              <div className="dmr-row">
                <span className="dmr-side" style={{color: COLOURS.B}}>B</span>
                <span className="dmr-dash">↔</span>
                <span className="dmr-side" style={{color: COLOURS.C}}>C</span>
                <span className="dmr-val">{formatMeters(dBC)}</span>
              </div>
            )}
            {dAC != null && (
              <div className="dmr-row">
                <span className="dmr-side" style={{color: COLOURS.A}}>A</span>
                <span className="dmr-dash">↔</span>
                <span className="dmr-side" style={{color: COLOURS.C}}>C</span>
                <span className="dmr-val">{formatMeters(dAC)}</span>
              </div>
            )}
          </div>

          {/* Angles (only when triangle) */}
          {angA != null && (
            <div className="dmr-section">
              <span className="dmr-heading">Angles</span>
              <div className="dmr-row">
                <span className="dmr-corner" style={{background: COLOURS.A}}>A</span>
                <span className="dmr-val">{angA.toFixed(2)}°</span>
              </div>
              <div className="dmr-row">
                <span className="dmr-corner" style={{background: COLOURS.B}}>B</span>
                <span className="dmr-val">{angB.toFixed(2)}°</span>
              </div>
              <div className="dmr-row">
                <span className="dmr-corner" style={{background: COLOURS.C}}>C</span>
                <span className="dmr-val">{angC.toFixed(2)}°</span>
              </div>
              <div className="dmr-row dmr-row--sum">
                <span className="dmr-sum-label">∑</span>
                <span className="dmr-val dmr-val--muted">
                  {(angA + angB + angC).toFixed(1)}°
                </span>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Reset */}
      {pointCount > 0 && (
        <button id="btn-reset" className="reset-btn" onClick={reset}>✕ Clear all</button>
      )}

    </div>
  );
}
