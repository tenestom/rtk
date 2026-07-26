import { useState, useEffect, useRef, useMemo } from 'react';
import { toLocalMeters, haversine } from '../utils/geo.js';
import { corridorRect, polygonAreaM, rectAreaM, formatArea, makeViewport } from '../utils/geometry.js';
import SweepMap from './SweepMap.jsx';

// ── localStorage helpers ──────────────────────────────────────────────
const STORE_KEY = 'rtk_sweeps_v1';

function loadSweeps() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); }
  catch { return []; }
}
function storeSweep(sweep) {
  const all = loadSweeps();
  all.push(sweep);
  localStorage.setItem(STORE_KEY, JSON.stringify(all));
}
function deleteSweep(id) {
  const filtered = loadSweeps().filter(s => s.id !== id);
  localStorage.setItem(STORE_KEY, JSON.stringify(filtered));
}

// ─────────────────────────────────────────────────────────────────────
export default function SweepScreen({ data, onBack }) {

  // ── Top-level navigation ────────────────────────────────────────────
  const [topTab,      setTopTab]      = useState('new');    // 'new' | 'saved'
  const [viewingSweep,setViewingSweep]= useState(null);     // saved sweep object

  // ── Boundary definition ─────────────────────────────────────────────
  const [boundaryGPS, setBoundaryGPS] = useState([]);
  const [sweepWidth,  setSweepWidth]  = useState(3);

  // ── Sweep state ──────────────────────────────────────────────────────
  const [phase,        setPhase]        = useState('boundary'); // 'boundary'|'sweeping'|'paused'
  const [refLat,       setRefLat]       = useState(null);
  const [refLon,       setRefLon]       = useState(null);
  const [sweepViewport,setSweepViewport]= useState(null);
  const [trackGPS,     setTrackGPS]     = useState([]);
  const [corridors,    setCorridors]    = useState([]);
  const [pois,         setPois]         = useState([]);

  // ── POI input ────────────────────────────────────────────────────────
  const [showPoiInput, setShowPoiInput] = useState(false);
  const [poiDraftGPS,  setPoiDraftGPS]  = useState(null);
  const [poiDesc,      setPoiDesc]      = useState('');
  const [selectedPoi,  setSelectedPoi]  = useState(null);

  // ── Save dialog ──────────────────────────────────────────────────────
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [sweepName,      setSweepName]      = useState('');

  // ── Saved sweeps ─────────────────────────────────────────────────────
  const [savedSweeps, setSavedSweeps] = useState(loadSweeps);

  // ── Mutable refs (read inside effects without causing re-runs) ───────
  const phaseRef      = useRef('boundary');
  const refLatRef     = useRef(null);
  const refLonRef     = useRef(null);
  const sweepWRef     = useRef(3);
  const prevMRef      = useRef(null);    // last plotted local-metre position

  // ── Derived GPS info ─────────────────────────────────────────────────
  const hasGps = data?.lat != null && data?.lon != null;

  // ── Derived local-metre coordinates ──────────────────────────────────

  /** Stable reference used for rendering during boundary phase */
  const renderRef = refLat !== null
    ? { lat: refLat, lon: refLon }
    : (boundaryGPS[0] ?? null);

  const boundaryM = useMemo(() => {
    if (!renderRef || boundaryGPS.length === 0) return [];
    return boundaryGPS.map(p => toLocalMeters(p.lat, p.lon, renderRef.lat, renderRef.lon));
  }, [boundaryGPS, renderRef?.lat, renderRef?.lon]);   // eslint-disable-line

  const currentM = useMemo(() => {
    if (!hasGps || !renderRef) return null;
    return toLocalMeters(data.lat, data.lon, renderRef.lat, renderRef.lon);
  }, [hasGps, data?.lat, data?.lon, renderRef?.lat, renderRef?.lon]); // eslint-disable-line

  const trackM = useMemo(() => {
    if (!refLat) return [];
    return trackGPS.map(p => toLocalMeters(p.lat, p.lon, refLat, refLon));
  }, [trackGPS, refLat, refLon]);

  const poisM = useMemo(() => {
    if (!refLat) return [];
    return pois.map(p => ({
      ...toLocalMeters(p.lat, p.lon, refLat, refLon),
      desc: p.desc,
    }));
  }, [pois, refLat, refLon]);

  /** Direction of travel in degrees from north */
  const heading = useMemo(() => {
    if (trackM.length < 2) return null;
    const a = trackM[trackM.length - 2];
    const b = trackM[trackM.length - 1];
    return Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI;
  }, [trackM]);

  const boundaryAreaM2 = useMemo(() =>
    polygonAreaM(boundaryM), [boundaryM]);

  const sweptAreaM2 = useMemo(() =>
    corridors.reduce((s, r) => s + rectAreaM(r), 0), [corridors]);

  const trackLengthM = useMemo(() => {
    if (trackGPS.length < 2) return 0;
    return trackGPS.reduce((total, p, i) =>
      i === 0 ? 0 : total + haversine(trackGPS[i-1].lat, trackGPS[i-1].lon, p.lat, p.lon), 0);
  }, [trackGPS]);

  // ── GPS recording effect ─────────────────────────────────────────────
  useEffect(() => {
    if (!hasGps) return;
    if (phaseRef.current !== 'sweeping') return;
    const rLat = refLatRef.current, rLon = refLonRef.current;
    if (rLat === null) return;

    const m = toLocalMeters(data.lat, data.lon, rLat, rLon);
    const prev = prevMRef.current;

    if (!prev) {
      prevMRef.current = m;
      setTrackGPS(t => [...t, { lat: data.lat, lon: data.lon }]);
      return;
    }

    const dx = m.x - prev.x, dy = m.y - prev.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.5) return;  // minimum movement threshold

    setTrackGPS(t => [...t, { lat: data.lat, lon: data.lon }]);

    const rect = corridorRect(prev.x, prev.y, m.x, m.y, sweepWRef.current);
    if (rect) setCorridors(c => [...c, rect]);

    prevMRef.current = m;
  }, [data]);  // only re-runs on new GPS data

  // ── Actions ──────────────────────────────────────────────────────────

  function addBoundaryPoint() {
    if (!hasGps) return;
    setBoundaryGPS(b => [...b, { lat: data.lat, lon: data.lon }]);
  }

  function undoLastPoint() {
    setBoundaryGPS(b => b.slice(0, -1));
  }

  function startSweep() {
    if (boundaryGPS.length < 3 || !hasGps) return;

    // Fix reference = centroid of boundary polygon
    const cLat = boundaryGPS.reduce((s, p) => s + p.lat, 0) / boundaryGPS.length;
    const cLon = boundaryGPS.reduce((s, p) => s + p.lon, 0) / boundaryGPS.length;

    // Compute and lock viewport
    const bM = boundaryGPS.map(p => toLocalMeters(p.lat, p.lon, cLat, cLon));
    const vp = makeViewport(bM);

    setRefLat(cLat); setRefLon(cLon);
    refLatRef.current = cLat; refLonRef.current = cLon;
    sweepWRef.current = sweepWidth;
    setSweepViewport(vp);
    prevMRef.current = null;

    phaseRef.current = 'sweeping';
    setPhase('sweeping');
    setSweepName(`Sweep ${new Date().toLocaleDateString()}`);
  }

  function pauseSweep() {
    phaseRef.current = 'paused';
    setPhase('paused');
  }

  function resumeSweep() {
    prevMRef.current = null;  // don't draw a corridor across the paused gap
    phaseRef.current = 'sweeping';
    setPhase('sweeping');
  }

  function endSweep() {
    phaseRef.current = 'paused';
    setPhase('paused');
    setShowSaveDialog(true);
  }

  function confirmSave() {
    const sweep = {
      id:         `sweep_${Date.now()}`,
      name:       sweepName.trim() || `Sweep ${new Date().toLocaleDateString()}`,
      date:       new Date().toISOString(),
      boundaryGPS,
      sweepWidth,
      corridors,
      pois,
      trackLength:    trackGPS.length,
      boundaryAreaM2: polygonAreaM(boundaryM),
      refLat,
      refLon,
    };
    storeSweep(sweep);
    setSavedSweeps(loadSweeps());
    setShowSaveDialog(false);
    resetAll();
  }

  function discardSweep() {
    setShowSaveDialog(false);
    resetAll();
  }

  function resetAll() {
    setBoundaryGPS([]); setSweepWidth(3);
    setRefLat(null); setRefLon(null); setSweepViewport(null);
    setTrackGPS([]); setCorridors([]); setPois([]);
    setPhase('boundary');
    phaseRef.current = 'boundary';
    refLatRef.current = null; refLonRef.current = null;
    prevMRef.current = null;
    setSelectedPoi(null);
  }

  function addPoi() {
    if (!hasGps) return;
    setPoiDraftGPS({ lat: data.lat, lon: data.lon });
    setPoiDesc('');
    setShowPoiInput(true);
  }

  function savePoi() {
    if (!poiDraftGPS) return;
    setPois(p => [...p, { lat: poiDraftGPS.lat, lon: poiDraftGPS.lon, desc: poiDesc }]);
    setShowPoiInput(false);
    setPoiDraftGPS(null);
    setPoiDesc('');
  }

  function handleDeleteSaved(id) {
    deleteSweep(id);
    setSavedSweeps(loadSweeps());
    if (viewingSweep?.id === id) setViewingSweep(null);
  }

  // ── Saved sweep map helpers ───────────────────────────────────────────
  function savedSweepProps(sw) {
    const rLat = sw.refLat, rLon = sw.refLon;
    const bM   = sw.boundaryGPS.map(p => toLocalMeters(p.lat, p.lon, rLat, rLon));
    const pM   = sw.pois.map(p => ({ ...toLocalMeters(p.lat, p.lon, rLat, rLon), desc: p.desc }));
    const vp   = makeViewport(bM);
    return { boundaryM: bM, poisM: pM, fixedViewport: vp };
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  return (
    <div className="feature-screen sweep-screen">

      {/* ── Nav bar ── */}
      <div className="screen-nav">
        <button id="btn-back-sweep" className="back-btn"
          onClick={() => { if (viewingSweep) { setViewingSweep(null); return; } onBack(); }}>
          ← Back
        </button>
        <h2 className="screen-title">
          {viewingSweep ? viewingSweep.name : 'Sweep Area'}
        </h2>
      </div>

      {/* ── If viewing a saved sweep ── */}
      {viewingSweep && (() => {
        const { boundaryM: bM, poisM: pM, fixedViewport: vp } = savedSweepProps(viewingSweep);
        return (
          <>
            <div className="sweep-stats-row">
              <div className="ssr-item">
                <span className="ssr-val">{formatArea(viewingSweep.boundaryAreaM2 ?? 0)}</span>
                <span className="ssr-label">area</span>
              </div>
              <div className="ssr-item">
                <span className="ssr-val">{viewingSweep.pois.length}</span>
                <span className="ssr-label">POIs</span>
              </div>
              <div className="ssr-item">
                <span className="ssr-val">{new Date(viewingSweep.date).toLocaleDateString()}</span>
                <span className="ssr-label">date</span>
              </div>
            </div>
            <SweepMap
              boundaryM={bM}
              corridors={viewingSweep.corridors}
              poisM={pM}
              fixedViewport={vp}
              showLive={false}
              clipId="sweep-view-clip"
            />
          </>
        );
      })()}

      {/* ── Main UI (not viewing saved) ── */}
      {!viewingSweep && (
        <>
          {/* Tab bar */}
          <div className="tab-bar">
            <button id="tab-sweep-new"   className={`tab-btn${topTab==='new'   ? ' tab-btn--active':''}`}
              onClick={()=>setTopTab('new')}>🗺️ New Sweep</button>
            <button id="tab-sweep-saved" className={`tab-btn${topTab==='saved' ? ' tab-btn--active':''}`}
              onClick={()=>setTopTab('saved')}>
              💾 Saved {savedSweeps.length > 0 && `(${savedSweeps.length})`}
            </button>
          </div>

          {/* ══ NEW SWEEP TAB ═══════════════════════════════════════════ */}
          {topTab === 'new' && (
            <>
              {/* Live GPS indicator */}
              <div className="live-pos-strip">
                <span className="lps-label">Live</span>
                <span className="lps-coords">
                  {hasGps
                    ? `${data.lat.toFixed(7)},  ${data.lon.toFixed(7)}`
                    : 'Waiting for GPS…'}
                </span>
              </div>

              {/* ── Stats row (sweeping phase) ── */}
              {phase !== 'boundary' && (
                <div className="sweep-stats-row">
                  <div className="ssr-item">
                    <span className="ssr-val">{formatArea(boundaryAreaM2)}</span>
                    <span className="ssr-label">area</span>
                  </div>
                  <div className="ssr-item">
                    <span className="ssr-val">{formatArea(sweptAreaM2)}</span>
                    <span className="ssr-label">swept (est.)</span>
                  </div>
                  <div className="ssr-item">
                    <span className="ssr-val">{(trackLengthM).toFixed(0)} m</span>
                    <span className="ssr-label">track</span>
                  </div>
                  <div className="ssr-item">
                    <span className="ssr-val">{pois.length}</span>
                    <span className="ssr-label">POIs</span>
                  </div>
                </div>
              )}

              {/* ── Map ── */}
              <SweepMap
                boundaryM={boundaryM}
                corridors={corridors}
                trackM={trackM}
                currentM={currentM}
                poisM={poisM}
                fixedViewport={sweepViewport}
                heading={heading}
                showLive={true}
                selectedPoi={selectedPoi}
                onPoiTap={i => setSelectedPoi(i === selectedPoi ? null : i)}
                clipId="sweep-clip"
              />

              {/* ── Selected POI panel ── */}
              {selectedPoi !== null && poisM[selectedPoi] && (
                <div className="sweep-poi-card">
                  <span className="spc-icon">!</span>
                  <div className="spc-body">
                    <span className="spc-label">POI {selectedPoi + 1}</span>
                    <span className="spc-desc">{pois[selectedPoi]?.desc || '(no description)'}</span>
                  </div>
                  <button className="spc-close" onClick={() => setSelectedPoi(null)}>✕</button>
                </div>
              )}

              {/* ═══ BOUNDARY PHASE ═══════════════════════════════════ */}
              {phase === 'boundary' && (
                <div className="sweep-controls">
                  <div className="sweep-width-row">
                    <label className="swl">Sweep width</label>
                    <input
                      id="input-sweep-width"
                      type="number" min="0.5" max="50" step="0.5"
                      className="sweep-width-input"
                      value={sweepWidth}
                      onChange={e => setSweepWidth(Math.max(0.5, parseFloat(e.target.value) || 3))}
                    />
                    <span className="swl">m</span>
                  </div>

                  <div className="sweep-btn-row">
                    <button id="btn-add-boundary" className="sweep-btn sweep-btn--primary"
                      onClick={addBoundaryPoint} disabled={!hasGps}>
                      + Add boundary point
                      {boundaryGPS.length > 0 && ` (${boundaryGPS.length})`}
                    </button>
                    {boundaryGPS.length > 0 && (
                      <button className="sweep-btn sweep-btn--ghost"
                        onClick={undoLastPoint}>
                        ↩ Undo
                      </button>
                    )}
                  </div>

                  {boundaryGPS.length >= 3 && (
                    <button id="btn-start-sweep" className="sweep-btn sweep-btn--start"
                      onClick={startSweep} disabled={!hasGps}>
                      ▶ Start Sweep
                    </button>
                  )}

                  {boundaryGPS.length > 0 && boundaryGPS.length < 3 && (
                    <p className="sweep-hint">
                      Add {3 - boundaryGPS.length} more point{3-boundaryGPS.length>1?'s':''} to close the polygon
                    </p>
                  )}
                </div>
              )}

              {/* ═══ SWEEPING PHASE ═══════════════════════════════════ */}
              {(phase === 'sweeping' || phase === 'paused') && (
                <div className="sweep-controls">
                  <div className="sweep-btn-row">
                    {phase === 'sweeping' ? (
                      <button id="btn-pause-sweep" className="sweep-btn sweep-btn--pause"
                        onClick={pauseSweep}>
                        ⏸ Pause
                      </button>
                    ) : (
                      <button id="btn-resume-sweep" className="sweep-btn sweep-btn--start"
                        onClick={resumeSweep}>
                        ▶ Resume
                      </button>
                    )}

                    <button id="btn-add-poi" className="sweep-btn sweep-btn--poi"
                      onClick={addPoi} disabled={!hasGps}>
                      📍 Add POI
                    </button>

                    <button id="btn-end-sweep" className="sweep-btn sweep-btn--end"
                      onClick={endSweep}>
                      ■ End Sweep
                    </button>
                  </div>

                  {phase === 'sweeping' && (
                    <p className="sweep-hint sweep-hint--active">
                      Sweeping… move {sweepWidth} m wide corridor is being painted
                    </p>
                  )}
                  {phase === 'paused' && (
                    <p className="sweep-hint">Sweep paused. Press Resume to continue.</p>
                  )}
                </div>
              )}
            </>
          )}

          {/* ══ SAVED SWEEPS TAB ════════════════════════════════════════ */}
          {topTab === 'saved' && (
            <div className="saved-list">
              {savedSweeps.length === 0 && (
                <div className="saved-empty">
                  <span className="se-icon">💾</span>
                  <p>No saved sweeps yet.<br />Complete a sweep and save it to see it here.</p>
                </div>
              )}
              {savedSweeps.slice().reverse().map(sw => (
                <div key={sw.id} className="saved-card">
                  <div className="sc-header">
                    <div className="sc-info">
                      <span className="sc-name">{sw.name}</span>
                      <span className="sc-meta">
                        {new Date(sw.date).toLocaleDateString()}
                        {' · '}{formatArea(sw.boundaryAreaM2 ?? 0)}
                        {sw.pois.length > 0 && ` · ${sw.pois.length} POI${sw.pois.length>1?'s':''}`}
                      </span>
                    </div>
                    <div className="sc-actions">
                      <button className="sc-btn sc-btn--view"
                        onClick={() => setViewingSweep(sw)}>View</button>
                      <button className="sc-btn sc-btn--del"
                        onClick={() => handleDeleteSaved(sw.id)}>✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══ POI INPUT MODAL ══════════════════════════════════════════ */}
      {showPoiInput && (
        <div className="sweep-modal-overlay">
          <div className="sweep-modal">
            <h3 className="sm-title">📍 Add Point of Interest</h3>
            <p className="sm-sub">GPS position captured. Add a description:</p>
            <textarea
              id="input-poi-desc"
              className="sm-textarea"
              placeholder="e.g. Rock, 30cm deep, red buoy marker"
              rows={3}
              value={poiDesc}
              onChange={e => setPoiDesc(e.target.value)}
              autoFocus
            />
            <div className="sm-actions">
              <button className="sm-btn sm-btn--save" onClick={savePoi}>Save POI</button>
              <button className="sm-btn sm-btn--cancel"
                onClick={() => { setShowPoiInput(false); setPoiDraftGPS(null); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SAVE DIALOG ══════════════════════════════════════════════ */}
      {showSaveDialog && (
        <div className="sweep-modal-overlay">
          <div className="sweep-modal">
            <h3 className="sm-title">💾 Save Sweep</h3>
            <div className="sm-stats">
              <span>{formatArea(sweptAreaM2)} swept (est.)</span>
              <span>{pois.length} POI{pois.length!==1?'s':''}</span>
              <span>{corridors.length} corridors</span>
            </div>
            <label className="sm-label">Sweep name</label>
            <input
              id="input-sweep-name"
              type="text"
              className="sm-input"
              value={sweepName}
              onChange={e => setSweepName(e.target.value)}
              autoFocus
            />
            <div className="sm-actions">
              <button className="sm-btn sm-btn--save" onClick={confirmSave}>
                Save
              </button>
              <button className="sm-btn sm-btn--cancel" onClick={discardSweep}>
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
