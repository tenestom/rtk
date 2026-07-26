import { useState } from 'react';
import CoordinateView from './CoordinateView';
import { haversine, formatMeters } from '../utils/geo';

/**
 * Distance Measurement screen.
 *
 * Flow:
 *   1. User taps "Save Point A" → stores current GPS position
 *   2. User moves, taps "Save Point B" → stores current GPS position
 *   3. Haversine distance is displayed and plotted on the CoordinateView
 */
export default function DistanceMeasure({ data, onBack }) {
  const [pointA, setPointA] = useState(null);
  const [pointB, setPointB] = useState(null);

  const hasGps = data?.lat != null && data?.lon != null;
  const currentPos = hasGps ? { lat: data.lat, lon: data.lon } : null;

  const distance =
    pointA && pointB
      ? haversine(pointA.lat, pointA.lon, pointB.lat, pointB.lon)
      : null;

  // Named points passed to the CoordinateView
  const mapPoints = [
    ...(pointA ? [{ lat: pointA.lat, lon: pointA.lon, label: 'A', color: '#3b82f6' }] : []),
    ...(pointB ? [{ lat: pointB.lat, lon: pointB.lon, label: 'B', color: '#a855f7' }] : []),
  ];

  function savePoint(which) {
    if (!hasGps) return;
    const pt = { lat: data.lat, lon: data.lon };
    if (which === 'A') setPointA(pt);
    else setPointB(pt);
  }

  function reset() {
    setPointA(null);
    setPointB(null);
  }

  return (
    <div className="feature-screen">

      {/* Navigation */}
      <div className="screen-nav">
        <button id="btn-back-distance" className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <h2 className="screen-title">Measure Distance</h2>
      </div>

      {/* Live position strip */}
      <div className="live-pos-strip">
        <span className="lps-label">Live position</span>
        <span className="lps-coords">
          {hasGps
            ? `${data.lat.toFixed(7)},  ${data.lon.toFixed(7)}`
            : 'Waiting for GPS fix…'}
        </span>
      </div>

      {/* A / B point cards */}
      <div className="points-row">

        {/* Point A */}
        <div className="point-card">
          <div className="point-card-header">
            <span className="point-label point-label-a">A</span>
            <span className="point-card-title">Point A</span>
          </div>
          {pointA ? (
            <div className="point-coords">
              <span>{pointA.lat.toFixed(6)}</span>
              <span>{pointA.lon.toFixed(6)}</span>
            </div>
          ) : (
            <span className="point-empty">Not set</span>
          )}
          <button
            id="btn-save-a"
            className="point-btn point-btn-a"
            onClick={() => savePoint('A')}
            disabled={!hasGps}
          >
            {pointA ? '↺ Update A' : '＋ Save Point A'}
          </button>
        </div>

        {/* Point B */}
        <div className="point-card">
          <div className="point-card-header">
            <span className="point-label point-label-b">B</span>
            <span className="point-card-title">Point B</span>
          </div>
          {pointB ? (
            <div className="point-coords">
              <span>{pointB.lat.toFixed(6)}</span>
              <span>{pointB.lon.toFixed(6)}</span>
            </div>
          ) : (
            <span className="point-empty">Not set</span>
          )}
          <button
            id="btn-save-b"
            className="point-btn point-btn-b"
            onClick={() => savePoint('B')}
            disabled={!hasGps}
          >
            {pointB ? '↺ Update B' : '＋ Save Point B'}
          </button>
        </div>

      </div>

      {/* Distance result */}
      {distance != null && (
        <div className="distance-result">
          <span className="dr-icon">📐</span>
          <div className="dr-body">
            <span className="dr-label">Distance A → B</span>
            <span className="dr-value">{formatMeters(distance)}</span>
          </div>
        </div>
      )}

      {/* Clear button */}
      {(pointA || pointB) && (
        <button id="btn-reset" className="reset-btn" onClick={reset}>
          ✕ Clear points
        </button>
      )}

      {/* Map */}
      <CoordinateView
        points={mapPoints}
        currentPos={currentPos}
        distance={distance}
      />

    </div>
  );
}
