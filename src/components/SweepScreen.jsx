import { useState, useEffect, useRef, useMemo, Component } from 'react';
import { toLocalMeters, haversine } from '../utils/geo.js';
import { corridorRect, polygonAreaM, rectAreaM, formatArea, makeViewport } from '../utils/geometry.js';
import SweepMap from './SweepMap.jsx';

// ── localStorage helpers ──────────────────────────────────────────────
const STORE_KEY   = 'rtk_sweeps_v1';
const CURRENT_KEY = 'rtk_sweep_current_v1';

// Saved sweeps (completed)
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

// ── Active session persistence ────────────────────────────────────────
// NOTE: we deliberately do NOT serialize sweepViewport's toPixel function.
// Instead we only store the raw boundary+ref coords and recompute the
// viewport on restore. This avoids JSON stripping the function.

function validateSession(raw) {
  // Returns a clean session object or null if data looks corrupt.
  if (!raw || typeof raw !== 'object') return null;
  try {
    const boundaryGPS = Array.isArray(raw.boundaryGPS) ? raw.boundaryGPS.filter(
      p => p && typeof p.lat === 'number' && typeof p.lon === 'number'
    ) : [];
    const trackGPS = Array.isArray(raw.trackGPS) ? raw.trackGPS.filter(
      p => p && typeof p.lat === 'number' && typeof p.lon === 'number'
    ) : [];
    // Corridors: each must be a 4-element array of [number,number] pairs
    const corridors = Array.isArray(raw.corridors) ? raw.corridors.filter(rect =>
      Array.isArray(rect) && rect.length === 4 &&
      rect.every(pt => Array.isArray(pt) && pt.length === 2 &&
        typeof pt[0] === 'number' && typeof pt[1] === 'number' &&
        isFinite(pt[0]) && isFinite(pt[1]))
    ) : [];
    const pois = Array.isArray(raw.pois) ? raw.pois.filter(
      p => p && typeof p.lat === 'number' && typeof p.lon === 'number'
    ) : [];
    const sweepWidth = typeof raw.sweepWidth === 'number' && raw.sweepWidth > 0
      ? raw.sweepWidth : 3;
    const refLat = typeof raw.refLat === 'number' && isFinite(raw.refLat) ? raw.refLat : null;
    const refLon = typeof raw.refLon === 'number' && isFinite(raw.refLon) ? raw.refLon : null;
    const phase = ['boundary','sweeping','paused'].includes(raw.phase) ? raw.phase : 'boundary';
    return { boundaryGPS, trackGPS, corridors, pois, sweepWidth, refLat, refLon, phase };
  } catch {
    return null;
  }
}

function loadSession() {
  try {
    const raw = JSON.parse(localStorage.getItem(CURRENT_KEY) || 'null');
    return validateSession(raw);
  } catch {
    // Corrupt JSON — wipe it
    try { localStorage.removeItem(CURRENT_KEY); } catch {}
    return null;
  }
}

function saveSession(obj) {
  try {
    // Serialize only safe primitives — no functions, no viewport object
    const safe = {
      boundaryGPS: obj.boundaryGPS,
      sweepWidth:  obj.sweepWidth,
      phase:       obj.phase,
      refLat:      obj.refLat,
      refLon:      obj.refLon,
      trackGPS:    obj.trackGPS,
      corridors:   obj.corridors,
      pois:        obj.pois,
      // sweepViewport intentionally omitted — recomputed on restore
    };
    localStorage.setItem(CURRENT_KEY, JSON.stringify(safe));
  } catch {}
}

function clearSessionStorage() {
  try { localStorage.removeItem(CURRENT_KEY); } catch {}
}

// ── Error boundary ────────────────────────────────────────────────────
class SweepErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { crashed: false, error: null }; }
  static getDerivedStateFromError(error) { return { crashed: true, error }; }
  componentDidCatch(error, info) {
    console.error('[SweepScreen] render crash:', error, info);
    // Wipe corrupt session so recovery is clean
    try { localStorage.removeItem(CURRENT_KEY); } catch {}
  }
  handleReset() {
    try { localStorage.removeItem(CURRENT_KEY); } catch {}
    this.setState({ crashed: false, error: null });
    this.props.onBack?.();
  }
  render() {
    if (this.state.crashed) {
      return (
        <div className="feature-screen" style={{ alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
          <div style={{ fontSize: '2.5rem' }}>⚠️</div>
          <h2 style={{ color: '#f87171', fontSize: '1.1rem', textAlign: 'center', margin: 0 }}>
            Sweep crashed
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
            The saved sweep session may be corrupt.<br />
            It has been cleared automatically.
          </p>
          {this.state.error && (
            <pre style={{
              fontSize: '0.6rem', color: '#475569', background: 'rgba(0,0,0,0.3)',
              padding: '8px', borderRadius: '8px', maxWidth: '100%', overflowX: 'auto',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {String(this.state.error)}
            </pre>
          )}
          <button
            style={{
              padding: '10px 24px', borderRadius: '12px', border: 'none',
              background: '#1d4ed8', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
            }}
            onClick={() => this.handleReset()}>
            ← Return to Home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─────────────────────────────────────────────────────────────────────
export default function SweepScreenWithBoundary(props) {
  return (
    <SweepErrorBoundary onBack={props.onBack}>
      <SweepScreen {...props} />
    </SweepErrorBoundary>
  );
}

function SweepScreen({ data, onBack }) {

  // ── Restore session from localStorage ────────────────────────────────
  // loadSession() validates and sanitizes — returns null on any problem
  const _sess = loadSession();

  // ── Top-level navigation ────────────────────────────────────────────
  const [topTab,      setTopTab]      = useState('new');
  const [viewingSweep,setViewingSweep]= useState(null);

  // ── Boundary definition ─────────────────────────────────────────────
  const [boundaryGPS, setBoundaryGPS] = useState(() => _sess?.boundaryGPS ?? []);
  const [sweepWidth,  setSweepWidth]  = useState(() => _sess?.sweepWidth  ?? 3);

  // ── Sweep state ──────────────────────────────────────────────────────
  // If session was mid-sweep, restore as paused (safe — corridors intact)
  const [phase,        setPhase]        = useState(() => {
    const p = _sess?.phase;
    return (p === 'sweeping' || p === 'paused') ? 'paused' : 'boundary';
  });
  const [refLat,       setRefLat]       = useState(() => _sess?.refLat ?? null);
  const [refLon,       setRefLon]       = useState(() => _sess?.refLon ?? null);
  const [trackGPS,     setTrackGPS]     = useState(() => _sess?.trackGPS  ?? []);
  const [corridors,    setCorridors]    = useState(() => _sess?.corridors  ?? []);
  const [pois,         setPois]         = useState(() => _sess?.pois       ?? []);

  // sweepViewport is always recomputed — never restored from localStorage
  // because it contains a non-serializable toPixel() function
  const [sweepViewport, setSweepViewport] = useState(() => {
    if (!_sess?.refLat || !_sess?.boundaryGPS?.length) return null;
    try {
      const bM = _sess.boundaryGPS.map(p =>
        toLocalMeters(p.lat, p.lon, _sess.refLat, _sess.refLon));
      return bM.length >= 3 ? makeViewport(bM) : null;
    } catch { return null; }
  });

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

  // ── Mutable refs ─────────────────────────────────────────────────────
  const phaseRef   = useRef(phase);
  const refLatRef  = useRef(refLat);
  const refLonRef  = useRef(refLon);
  const sweepWRef  = useRef(sweepWidth);
  const prevMRef   = useRef(null);

  // ── Persist session on state changes ─────────────────────────────────
  useEffect(() => {
    if (phase === 'boundary' && boundaryGPS.length === 0 && pois.length === 0) {
      clearSessionStorage();
      return;
    }
    saveSession({ boundaryGPS, sweepWidth, phase, refLat, refLon, trackGPS, corridors, pois });
  }, [boundaryGPS, sweepWidth, phase, refLat, refLon, trackGPS, corridors, pois]);

  // ── GPS info ─────────────────────────────────────────────────────────
  const hasGps = data?.lat != null && data?.lon != null;

  // ── Local-metre derivations ───────────────────────────────────────────
  const renderRef = refLat !== null
    ? { lat: refLat, lon: refLon }
    : (boundaryGPS[0] ?? null);

  const boundaryM = useMemo(() => {
    if (!renderRef || boundaryGPS.length === 0) return [];
    return boundaryGPS.map(p => {
      try { return toLocalMeters(p.lat, p.lon, renderRef.lat, renderRef.lon); }
      catch { return { x: 0, y: 0 }; }
    });
  }, [boundaryGPS, renderRef?.lat, renderRef?.lon]); // eslint-disable-line

  const currentM = useMemo(() => {
    if (!hasGps || !renderRef) return null;
    try { return toLocalMeters(data.lat, data.lon, renderRef.lat, renderRef.lon); }
    catch { return null; }
  }, [hasGps, data?.lat, data?.lon, renderRef?.lat, renderRef?.lon]); // eslint-disable-line

  const trackM = useMemo(() => {
    if (!refLat) return [];
    return trackGPS.map(p => {
      try { return toLocalMeters(p.lat, p.lon, refLat, refLon); }
      catch { return null; }
    }).filter(Boolean);
  }, [trackGPS, refLat, refLon]);

  const poisM = useMemo(() => {
    if (!refLat) return [];
    return pois.map(p => {
      try { return { ...toLocalMeters(p.lat, p.lon, refLat, refLon), desc: p.desc }; }
      catch { return null; }
    }).filter(Boolean);
  }, [pois, refLat, refLon]);

  const heading = useMemo(() => {
    if (trackM.length < 2) return null;
    const a = trackM[trackM.length - 2];
    const b = trackM[trackM.length - 1];
    return Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI;
  }, [trackM]);

  const boundaryAreaM2 = useMemo(() => polygonAreaM(boundaryM), [boundaryM]);

  const sweptAreaM2 = useMemo(() =>
    corridors.reduce((s, r) => {
      try { return s + rectAreaM(r); } catch { return s; }
    }, 0), [corridors]);

  const trackLengthM = useMemo(() => {
    if (trackGPS.length < 2) return 0;
    return trackGPS.reduce((total, p, i) => {
      try {
        return i === 0 ? 0 : total + haversine(trackGPS[i-1].lat, trackGPS[i-1].lon, p.lat, p.lon);
      } catch { return total; }
    }, 0);
  }, [trackGPS]);

  // ── GPS recording effect ─────────────────────────────────────────────
  useEffect(() => {
    if (!hasGps || phaseRef.current !== 'sweeping') return;
    const rLat = refLatRef.current, rLon = refLonRef.current;
    if (rLat === null) return;
    try {
      const m    = toLocalMeters(data.lat, data.lon, rLat, rLon);
      const prev = prevMRef.current;
      if (!prev) {
        prevMRef.current = m;
        setTrackGPS(t => [...t, { lat: data.lat, lon: data.lon }]);
        return;
      }
      const dx = m.x - prev.x, dy = m.y - prev.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.5) return;
      setTrackGPS(t => [...t, { lat: data.lat, lon: data.lon }]);
      const rect = corridorRect(prev.x, prev.y, m.x, m.y, sweepWRef.current);
      if (rect) setCorridors(c => [...c, rect]);
      prevMRef.current = m;
    } catch (e) {
      console.warn('[SweepScreen] GPS effect error:', e);
    }
  }, [data]);

  // ── Actions ──────────────────────────────────────────────────────────
  function addBoundaryPoint() {
    if (!hasGps) return;
    setBoundaryGPS(b => [...b, { lat: data.lat, lon: data.lon }]);
  }
  function undoLastPoint() { setBoundaryGPS(b => b.slice(0, -1)); }

  function startSweep() {
    if (boundaryGPS.length < 3 || !hasGps) return;
    const cLat = boundaryGPS.reduce((s, p) => s + p.lat, 0) / boundaryGPS.length;
    const cLon = boundaryGPS.reduce((s, p) => s + p.lon, 0) / boundaryGPS.length;
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

  function pauseSweep()  { phaseRef.current = 'paused';    setPhase('paused'); }
  function resumeSweep() { prevMRef.current = null; phaseRef.current = 'sweeping'; setPhase('sweeping'); }
  function endSweep()    { phaseRef.current = 'paused';    setPhase('paused'); setShowSaveDialog(true); }

  function confirmSave() {
    storeSweep({
      id: `sweep_${Date.now()}`,
      name: sweepName.trim() || `Sweep ${new Date().toLocaleDateString()}`,
      date: new Date().toISOString(),
      boundaryGPS, sweepWidth, corridors, pois,
      trackLength: trackGPS.length,
      boundaryAreaM2: polygonAreaM(boundaryM),
      refLat, refLon,
    });
    setSavedSweeps(loadSweeps());
    setShowSaveDialog(false);
    resetAll();
  }

  function discardSweep() { setShowSaveDialog(false); resetAll(); }

  function resetAll() {
    clearSessionStorage();
    setBoundaryGPS([]); setSweepWidth(3);
    setRefLat(null); setRefLon(null); setSweepViewport(null);
    setTrackGPS([]); setCorridors([]); setPois([]);
    setPhase('boundary'); phaseRef.current = 'boundary';
    refLatRef.current = null; refLonRef.current = null;
    prevMRef.current = null;
    setSelectedPoi(null);
  }

  function addPoi() {
    if (!hasGps) return;
    setPoiDraftGPS({ lat: data.lat, lon: data.lon });
    setPoiDesc(''); setShowPoiInput(true);
  }
  function savePoi() {
    if (!poiDraftGPS) return;
    setPois(p => [...p, { lat: poiDraftGPS.lat, lon: poiDraftGPS.lon, desc: poiDesc }]);
    setShowPoiInput(false); setPoiDraftGPS(null); setPoiDesc('');
  }

  function handleDeleteSaved(id) {
    deleteSweep(id); setSavedSweeps(loadSweeps());
    if (viewingSweep?.id === id) setViewingSweep(null);
  }

  function savedSweepProps(sw) {
    try {
      const rLat = sw.refLat, rLon = sw.refLon;
      const bM = sw.boundaryGPS.map(p => toLocalMeters(p.lat, p.lon, rLat, rLon));
      const pM = (sw.pois ?? []).map(p => ({ ...toLocalMeters(p.lat, p.lon, rLat, rLon), desc: p.desc }));
      return { boundaryM: bM, poisM: pM, fixedViewport: makeViewport(bM) };
    } catch {
      return { boundaryM: [], poisM: [], fixedViewport: null };
    }
  }

  const hasSession = boundaryGPS.length > 0 || corridors.length > 0 || pois.length > 0;

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="feature-screen sweep-screen">

      {/* Nav bar */}
      <div className="screen-nav">
        <button id="btn-back-sweep" className="back-btn"
          onClick={() => { if (viewingSweep) { setViewingSweep(null); return; } onBack(); }}>
          ← Back
        </button>
        <h2 className="screen-title">
          {viewingSweep ? viewingSweep.name : 'Sweep Area'}
        </h2>
      </div>

      {/* ── Viewing a saved sweep ── */}
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
                <span className="ssr-val">{(viewingSweep.pois ?? []).length}</span>
                <span className="ssr-label">POIs</span>
              </div>
              <div className="ssr-item">
                <span className="ssr-val">{new Date(viewingSweep.date).toLocaleDateString()}</span>
                <span className="ssr-label">date</span>
              </div>
            </div>
            <SweepMap
              boundaryM={bM}
              corridors={viewingSweep.corridors ?? []}
              poisM={pM}
              fixedViewport={vp}
              showLive={false}
              clipId="sweep-view-clip"
            />
          </>
        );
      })()}

      {/* ── Main UI ── */}
      {!viewingSweep && (
        <>
          <div className="tab-bar">
            <button id="tab-sweep-new" className={`tab-btn${topTab==='new' ? ' tab-btn--active':''}`}
              onClick={() => setTopTab('new')}>🗺️ New Sweep</button>
            <button id="tab-sweep-saved" className={`tab-btn${topTab==='saved' ? ' tab-btn--active':''}`}
              onClick={() => setTopTab('saved')}>
              💾 Saved {savedSweeps.length > 0 && `(${savedSweeps.length})`}
            </button>
          </div>

          {/* ══ NEW SWEEP TAB ═══════════════════════════════════════════ */}
          {topTab === 'new' && (
            <>
              {/* Restored session banner */}
              {hasSession && phase === 'paused' && corridors.length > 0 && (
                <div className="sweep-restored-banner">
                  <span className="srb-icon">↩</span>
                  <span className="srb-text">
                    Session restored — {corridors.length} corridor{corridors.length !== 1 ? 's' : ''} painted
                    {pois.length > 0 && `, ${pois.length} POI${pois.length !== 1 ? 's' : ''}`}
                  </span>
                </div>
              )}

              {/* Live GPS strip */}
              <div className="live-pos-strip">
                <span className="lps-label">Live</span>
                <span className="lps-coords">
                  {hasGps
                    ? `${data.lat.toFixed(7)},  ${data.lon.toFixed(7)}`
                    : 'Waiting for GPS…'}
                </span>
              </div>

              {/* Stats row */}
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
                    <span className="ssr-val">{trackLengthM.toFixed(0)} m</span>
                    <span className="ssr-label">track</span>
                  </div>
                  <div className="ssr-item">
                    <span className="ssr-val">{pois.length}</span>
                    <span className="ssr-label">POIs</span>
                  </div>
                </div>
              )}

              {/* Map */}
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

              {/* Selected POI card */}
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
                      <button className="sweep-btn sweep-btn--ghost" onClick={undoLastPoint}>
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
                      Add {3 - boundaryGPS.length} more point{3 - boundaryGPS.length > 1 ? 's' : ''} to close the polygon
                    </p>
                  )}

                  {hasSession && (
                    <button id="btn-clear-sweep-session"
                      className="sweep-btn sweep-btn--clear-session"
                      onClick={resetAll}>
                      ✕ Clear session
                    </button>
                  )}
                </div>
              )}

              {/* ═══ SWEEPING / PAUSED PHASE ══════════════════════════ */}
              {(phase === 'sweeping' || phase === 'paused') && (
                <div className="sweep-controls">
                  <div className="sweep-btn-row">
                    {phase === 'sweeping' ? (
                      <button id="btn-pause-sweep" className="sweep-btn sweep-btn--pause"
                        onClick={pauseSweep}>⏸ Pause</button>
                    ) : (
                      <button id="btn-resume-sweep" className="sweep-btn sweep-btn--start"
                        onClick={resumeSweep}>▶ Resume</button>
                    )}
                    <button id="btn-add-poi" className="sweep-btn sweep-btn--poi"
                      onClick={addPoi} disabled={!hasGps}>📍 Add POI</button>
                    <button id="btn-end-sweep" className="sweep-btn sweep-btn--end"
                      onClick={endSweep}>■ End Sweep</button>
                  </div>
                  {phase === 'sweeping' && (
                    <p className="sweep-hint sweep-hint--active">
                      Sweeping… {sweepWidth} m wide corridor is being painted
                    </p>
                  )}
                  {phase === 'paused' && (
                    <p className="sweep-hint">Sweep paused. Press Resume to continue.</p>
                  )}
                  <button id="btn-clear-sweep-session-sweep"
                    className="sweep-btn sweep-btn--clear-session"
                    onClick={resetAll}>
                    ✕ Clear session
                  </button>
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
                        {(sw.pois?.length ?? 0) > 0 && ` · ${sw.pois.length} POI${sw.pois.length > 1 ? 's' : ''}`}
                      </span>
                    </div>
                    <div className="sc-actions">
                      <button className="sc-btn sc-btn--view" onClick={() => setViewingSweep(sw)}>View</button>
                      <button className="sc-btn sc-btn--del" onClick={() => handleDeleteSaved(sw.id)}>✕</button>
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
            <textarea id="input-poi-desc" className="sm-textarea" rows={3} autoFocus
              placeholder="e.g. Rock, 30cm deep, red buoy marker"
              value={poiDesc} onChange={e => setPoiDesc(e.target.value)} />
            <div className="sm-actions">
              <button className="sm-btn sm-btn--save" onClick={savePoi}>Save POI</button>
              <button className="sm-btn sm-btn--cancel"
                onClick={() => { setShowPoiInput(false); setPoiDraftGPS(null); }}>Cancel</button>
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
              <span>{pois.length} POI{pois.length !== 1 ? 's' : ''}</span>
              <span>{corridors.length} corridors</span>
            </div>
            <label className="sm-label">Sweep name</label>
            <input id="input-sweep-name" type="text" className="sm-input" autoFocus
              value={sweepName} onChange={e => setSweepName(e.target.value)} />
            <div className="sm-actions">
              <button className="sm-btn sm-btn--save" onClick={confirmSave}>Save</button>
              <button className="sm-btn sm-btn--cancel" onClick={discardSweep}>Discard</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
