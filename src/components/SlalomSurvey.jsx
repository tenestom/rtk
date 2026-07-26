import { useState, useMemo } from 'react';
import {
  BUOY_DEFS, BUOY_BY_ID,
  buildCourseTransform, computeStatus, formatError,
} from '../utils/slalom.js';
import SlalomSchematic from './SlalomSchematic.jsx';
import SlalomMap from './SlalomMap.jsx';

const STATUS_COLOR = { ok: '#22c55e', warn: '#f97316', bad: '#ef4444' };
const STATUS_LABEL = { ok: 'Within tolerance', warn: 'Near limit', bad: 'Out of tolerance' };

export default function SlalomSurvey({ data, onBack }) {
  // ── State ────────────────────────────────────────────────────────────
  const [measured,   setMeasured]   = useState({});
  const [posRefId,   setPosRefId]   = useState(1);
  const [angleRefId, setAngleRefId] = useState(23);
  const [selectedId, setSelectedId] = useState(null);
  const [tab,        setTab]        = useState('survey');   // 'survey' | 'map' | 'results'

  const hasGps    = data?.lat != null && data?.lon != null;
  const currentPos = hasGps ? { lat: data.lat, lon: data.lon } : null;

  // ── Course transform (needs both refs measured and distinct) ─────────
  const posRefMeasured   = measured[posRefId];
  const angleRefMeasured = measured[angleRefId];
  const canCompute = posRefMeasured && angleRefMeasured && posRefId !== angleRefId;

  const courseToGPS = useMemo(() => {
    if (!canCompute) return null;
    return buildCourseTransform(
      BUOY_BY_ID[posRefId],   posRefMeasured,
      BUOY_BY_ID[angleRefId], angleRefMeasured,
    );
  }, [canCompute, posRefId, posRefMeasured, angleRefId, angleRefMeasured]);

  // ── Theoretical positions for all 26 buoys ───────────────────────────
  const theoretical = useMemo(() => {
    if (!courseToGPS) return {};
    return Object.fromEntries(
      BUOY_DEFS.map(b => [b.id, courseToGPS(b.cx, b.cy)])
    );
  }, [courseToGPS]);

  // ── Status for each measured buoy ────────────────────────────────────
  const statuses = useMemo(() => {
    return Object.fromEntries(
      BUOY_DEFS.map(b => {
        const m = measured[b.id];
        const t = theoretical[b.id];
        if (!m || !t) return [b.id, null];
        return [b.id, computeStatus(m, t, b.tol)];
      })
    );
  }, [measured, theoretical]);

  // ── Progress counts ───────────────────────────────────────────────────
  const measuredCount = Object.keys(measured).length;
  const statusCounts  = Object.values(statuses).reduce(
    (acc, s) => { if (s) acc[s.status] = (acc[s.status] || 0) + 1; return acc; },
    {}
  );

  // ── Actions ───────────────────────────────────────────────────────────
  function saveGps(id) {
    if (!hasGps) return;
    setMeasured(m => ({ ...m, [id]: { lat: data.lat, lon: data.lon } }));
  }

  function clearBuoy(id) {
    setMeasured(m => { const n = { ...m }; delete n[id]; return n; });
  }

  // ── Selected buoy panel data ──────────────────────────────────────────
  const selDef    = selectedId ? BUOY_BY_ID[selectedId] : null;
  const selMeas   = selectedId ? measured[selectedId]    : null;
  const selStatus = selectedId ? statuses[selectedId]    : null;
  const selTheo   = selectedId ? theoretical[selectedId] : null;

  return (
    <div className="feature-screen slalom-screen">

      {/* ── Nav bar ── */}
      <div className="screen-nav">
        <button id="btn-back-slalom" className="back-btn" onClick={onBack}>← Back</button>
        <h2 className="screen-title">Survey Slalom Course</h2>
      </div>

      {/* ── Progress strip ── */}
      <div className="slalom-progress">
        <div className="sp-count">
          <span className="sp-num">{measuredCount}</span>
          <span className="sp-denom">/26 buoys</span>
        </div>
        <div className="sp-pills">
          {statusCounts.ok   > 0 && <span className="sp-pill sp-ok">  ✓{statusCounts.ok}</span>}
          {statusCounts.warn > 0 && <span className="sp-pill sp-warn">◑{statusCounts.warn}</span>}
          {statusCounts.bad  > 0 && <span className="sp-pill sp-bad"> ✗{statusCounts.bad}</span>}
        </div>
        <div className="sp-refs">
          <span className="sp-ref sp-ref-pos" title="Position reference"
            onClick={() => { if (selectedId) setPosRefId(selectedId); }}>
            POS #{posRefId}
          </span>
          <span className="sp-ref sp-ref-ang" title="Angle reference"
            onClick={() => { if (selectedId) setAngleRefId(selectedId); }}>
            ANG #{angleRefId}
          </span>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="tab-bar">
        {['survey', 'map', 'results'].map(t => (
          <button key={t} id={`tab-${t}`}
            className={`tab-btn${tab === t ? ' tab-btn--active' : ''}`}
            onClick={() => setTab(t)}>
            {t === 'survey'  ? '🗺️ Schematic' :
             t === 'map'     ? '📍 Map' :
                               '📋 Results'}
          </button>
        ))}
      </div>

      {/* ══ SURVEY TAB ══════════════════════════════════════════════════ */}
      {tab === 'survey' && (
        <>
          {/* Live GPS strip */}
          <div className="live-pos-strip">
            <span className="lps-label">Live</span>
            <span className="lps-coords">
              {hasGps
                ? `${data.lat.toFixed(7)},  ${data.lon.toFixed(7)}`
                : 'Waiting for GPS…'}
            </span>
          </div>

          {/* Interactive schematic */}
          <SlalomSchematic
            measured={measured}
            statuses={statuses}
            posRefId={posRefId}
            angleRefId={angleRefId}
            selectedId={selectedId}
            onSelect={id => setSelectedId(id === selectedId ? null : id)}
          />

          {/* ── Selected-buoy action panel ── */}
          {selDef && (
            <div className="buoy-panel" style={{ borderColor: `${selDef.color}44` }}>

              {/* Header */}
              <div className="bp-header">
                <div className="bp-badge" style={{ background: selDef.color }}>
                  {selDef.label}
                </div>
                <div className="bp-identity">
                  <span className="bp-name">{selDef.name}</span>
                  <span className="bp-type">{selDef.type} · tol ±{(selDef.tol * 100).toFixed(1)} cm</span>
                </div>
                <button className="bp-close" onClick={() => setSelectedId(null)}>✕</button>
              </div>

              {/* Status row */}
              {selMeas && selStatus && (
                <div className="bp-status" style={{ borderColor: STATUS_COLOR[selStatus.status] }}>
                  <span className="bp-status-dot"
                    style={{ background: STATUS_COLOR[selStatus.status] }} />
                  <span className="bp-status-label"
                    style={{ color: STATUS_COLOR[selStatus.status] }}>
                    {STATUS_LABEL[selStatus.status]}
                  </span>
                  <span className="bp-status-error">
                    error: {formatError(selStatus.error)}
                  </span>
                </div>
              )}

              {/* Measured coords */}
              {selMeas && (
                <div className="bp-coords">
                  <span className="bpc-label">Measured</span>
                  <span className="bpc-val">{selMeas.lat.toFixed(7)}</span>
                  <span className="bpc-val">{selMeas.lon.toFixed(7)}</span>
                </div>
              )}

              {/* Theoretical coords */}
              {selTheo && (
                <div className="bp-coords bp-coords--theo">
                  <span className="bpc-label">Theoretical</span>
                  <span className="bpc-val">{selTheo.lat.toFixed(7)}</span>
                  <span className="bpc-val">{selTheo.lon.toFixed(7)}</span>
                </div>
              )}

              {/* Action buttons */}
              <div className="bp-actions">
                <button id={`btn-save-buoy-${selectedId}`}
                  className="bp-btn bp-btn--save"
                  onClick={() => saveGps(selectedId)}
                  disabled={!hasGps}>
                  {selMeas ? '↺ Update GPS' : '＋ Save GPS'}
                </button>

                {selMeas && (
                  <button className="bp-btn bp-btn--clear"
                    onClick={() => clearBuoy(selectedId)}>
                    ✕ Clear
                  </button>
                )}

                {selMeas && selectedId !== posRefId && (
                  <button className="bp-btn bp-btn--posref"
                    onClick={() => setPosRefId(selectedId)}>
                    ⊙ Set pos ref
                  </button>
                )}

                {selMeas && selectedId !== angleRefId && (
                  <button className="bp-btn bp-btn--angref"
                    onClick={() => setAngleRefId(selectedId)}>
                    ∠ Set angle ref
                  </button>
                )}
              </div>

              {!canCompute && (
                <p className="bp-hint">
                  Measure buoys&nbsp;<strong>{posRefId}</strong>&nbsp;(pos ref) and&nbsp;
                  <strong>{angleRefId}</strong>&nbsp;(angle ref) to compute theoretical positions
                </p>
              )}
            </div>
          )}

          {!selectedId && (
            <p className="slalom-tap-hint">Tap a buoy in the diagram to select it</p>
          )}
        </>
      )}

      {/* ══ MAP TAB ═════════════════════════════════════════════════════ */}
      {tab === 'map' && (
        <SlalomMap
          measured={measured}
          theoretical={theoretical}
          statuses={statuses}
          currentPos={currentPos}
          buoyDefs={BUOY_DEFS}
        />
      )}

      {/* ══ RESULTS TAB ═════════════════════════════════════════════════ */}
      {tab === 'results' && (
        <div className="results-list">
          {!canCompute && (
            <div className="results-no-refs">
              <span className="rno-icon">⚠️</span>
              <p>Measure position ref (buoy {posRefId}) and angle ref (buoy {angleRefId})
                 to see results.</p>
            </div>
          )}

          {BUOY_DEFS.map(b => {
            const m  = measured[b.id];
            const st = statuses[b.id];
            if (!m) return (
              <div key={b.id} className="rl-row rl-row--unmeasured">
                <span className="rl-badge" style={{ background: b.color }}>{b.label}</span>
                <span className="rl-name">{b.name}</span>
                <span className="rl-pending">—</span>
              </div>
            );
            return (
              <div key={b.id} className="rl-row"
                style={{ borderLeft: `3px solid ${st ? STATUS_COLOR[st.status] : '#334155'}` }}>
                <span className="rl-badge" style={{ background: b.color }}>{b.label}</span>
                <span className="rl-name">{b.name}</span>
                <span className="rl-tol">±{(b.tol*100).toFixed(0)}cm</span>
                {st ? (
                  <span className="rl-error" style={{ color: STATUS_COLOR[st.status] }}>
                    {formatError(st.error)}
                  </span>
                ) : (
                  <span className="rl-pending">no refs</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
