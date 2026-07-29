import { useState, useEffect, useMemo } from 'react';
import {
  BUOY_DEFS, BUOY_BY_ID, BUOY_DEFS_8, BUOY_BY_ID_8, IWWF_DIM_DEFS,
  buildCourseTransform, buildCourseInverseTransform,
  computeStatus, formatError, computeMeasuredDimensions,
} from '../utils/slalom.js';
import { haversine } from '../utils/geo.js';
import SlalomSchematic from './SlalomSchematic.jsx';

// ── localStorage helpers ──────────────────────────────────────────────
const CURRENT_KEY = 'rtk_slalom_current_v1';
const SAVED_KEY   = 'rtk_slalom_saved_v1';

function loadCurrent() {
  try { return JSON.parse(localStorage.getItem(CURRENT_KEY) || 'null') || {}; }
  catch { return {}; }
}
function saveCurrent(obj) {
  try { localStorage.setItem(CURRENT_KEY, JSON.stringify(obj)); } catch {}
}
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); }
  catch { return []; }
}
function storeSaved(arr) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(arr)); } catch {}
}

const STATUS_COLOR = { ok: '#22c55e', warn: '#f97316', bad: '#ef4444' };
const STATUS_LABEL = { ok: 'Within tolerance', warn: 'Near limit', bad: 'Out of tolerance' };

export default function SlalomSurvey({ data, onBack }) {

  // ── Restore persisted state ───────────────────────────────────────────
  const [measured,    setMeasured]    = useState(() => loadCurrent().measured    ?? {});
  const [posRefId,    setPosRefId]    = useState(() => loadCurrent().posRefId    ?? 1);
  const [angleRefId,  setAngleRefId]  = useState(() => loadCurrent().angleRefId  ?? 23);
  const [pois,        setPois]        = useState(() => loadCurrent().pois        ?? []);
  const [courseType,  setCourseType]  = useState(() => loadCurrent().courseType  ?? '6');

  // ── UI state ─────────────────────────────────────────────────────
  const [selectedId,  setSelectedId]  = useState(null);
  const [tab,         setTab]         = useState('survey');  // 'survey'|'results'|'saved'
  const [mode,        setMode]        = useState('survey'); // 'survey'|'place'

  // POI input
  const [showPoiInput, setShowPoiInput] = useState(false);
  const [poiDraft,     setPoiDraft]     = useState(null);
  const [poiDesc,      setPoiDesc]      = useState('');
  const [selectedPoi,  setSelectedPoi]  = useState(null);   // index

  // Save dialog
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [courseName,     setCourseName]     = useState('');

  // Saved courses
  const [savedCourses, setSavedCourses] = useState(loadSaved);
  const [viewingCourse, setViewingCourse] = useState(null);

  // Distance measurement selection
  const [distSel,  setDistSel]  = useState([null, null]); // [{type:'buoy'|'poi', id}]
  const [distMode, setDistMode] = useState(false);

  const hasGps    = data?.lat != null && data?.lon != null;
  const currentPos = hasGps ? { lat: data.lat, lon: data.lon } : null; // eslint-disable-line

  // ── Active buoy set (depends on courseType) ───────────────────────────
  const activeBuoyDefs = courseType === '8' ? BUOY_DEFS_8 : BUOY_DEFS;
  const activeBuoyById = courseType === '8' ? BUOY_BY_ID_8 : BUOY_BY_ID;
  const totalBuoys     = activeBuoyDefs.length;

  // ── Persist current session whenever key state changes ───────────────
  useEffect(() => {
    saveCurrent({ measured, posRefId, angleRefId, pois, courseType });
  }, [measured, posRefId, angleRefId, pois, courseType]);
  const posRefMeasured   = measured[posRefId];
  const angleRefMeasured = measured[angleRefId];
  const canCompute = posRefMeasured && angleRefMeasured && posRefId !== angleRefId;

  const courseToGPS = useMemo(() => {
    if (!canCompute) return null;
    return buildCourseTransform(
      activeBuoyById[posRefId],   posRefMeasured,
      activeBuoyById[angleRefId], angleRefMeasured,
    );
  }, [canCompute, activeBuoyById, posRefId, posRefMeasured, angleRefId, angleRefMeasured]);

  // Inverse: GPS → course frame {cx, cy} (metres)
  const gpsToCourse = useMemo(() => {
    if (!canCompute) return null;
    return buildCourseInverseTransform(
      activeBuoyById[posRefId],   posRefMeasured,
      activeBuoyById[angleRefId], angleRefMeasured,
    );
  }, [canCompute, activeBuoyById, posRefId, posRefMeasured, angleRefId, angleRefMeasured]);

  const theoretical = useMemo(() => {
    if (!courseToGPS) return {};
    return Object.fromEntries(activeBuoyDefs.map(b => [b.id, courseToGPS(b.cx, b.cy)]));
  }, [courseToGPS, activeBuoyDefs]);

  const statuses = useMemo(() => Object.fromEntries(
    activeBuoyDefs.map(b => {
      const m = measured[b.id], t = theoretical[b.id];
      if (!m || !t) return [b.id, null];
      return [b.id, computeStatus(m, t, b.tol)];
    })
  ), [activeBuoyDefs, measured, theoretical]);

  // Signed course-frame errors for each measured buoy: {dLon, dLat} in metres
  // dLon > 0 = too far toward exit gate; dLat > 0 = too far right
  const buoyErrors = useMemo(() => {
    if (!gpsToCourse) return {};
    const result = {};
    for (const def of activeBuoyDefs) {
      const m = measured[def.id];
      if (!m) continue;
      const mc = gpsToCourse(m.lat, m.lon);
      result[def.id] = { dLon: mc.cy - def.cy, dLat: mc.cx - def.cx };
    }
    return result;
  }, [gpsToCourse, activeBuoyDefs, measured]);

  // POIs converted to course frame for the schematic
  const poisCourse = useMemo(() => {
    if (!gpsToCourse) return [];
    return pois.map((p, idx) => ({ ...gpsToCourse(p.lat, p.lon), desc: p.desc, idx }));
  }, [gpsToCourse, pois]);

  // ── Live position in course frame ───────────────────────────────────
  const liveSchematic = useMemo(() => {
    if (!gpsToCourse || !hasGps) return null;
    return gpsToCourse(data.lat, data.lon);
  }, [gpsToCourse, hasGps, data?.lat, data?.lon]);

  // ── Place mode: nearest unmeasured buoy within proximity threshold ─────
  const nearestPlaceId = useMemo(() => {
    if (mode !== 'place' || !gpsToCourse || !hasGps) return null;
    const live = gpsToCourse(data.lat, data.lon);
    let bestId = null, bestDist = 8; // 8 m proximity threshold
    for (const def of activeBuoyDefs) {
      if (measured[def.id]) continue;
      const d = Math.hypot(live.cx - def.cx, live.cy - def.cy);
      if (d < bestDist) { bestDist = d; bestId = def.id; }
    }
    return bestId;
  }, [mode, gpsToCourse, hasGps, data?.lat, data?.lon, measured, activeBuoyDefs]);

  // ── Distance measurement ──────────────────────────────────────────────
  const distanceResult = useMemo(() => {
    const [a, b] = distSel;
    if (!a || !b) return null;
    const getPos = (sel) => {
      if (sel.type === 'buoy') return measured[sel.id] ?? null;
      if (sel.type === 'poi')  return pois[sel.id]     ?? null;
      return null;
    };
    const posA = getPos(a), posB = getPos(b);
    if (!posA || !posB) return null;
    return haversine(posA.lat, posA.lon, posB.lat, posB.lon);
  }, [distSel, measured, pois]);

  // ── Progress counts ───────────────────────────────────────────────────
  const measuredCount = useMemo(() =>
    activeBuoyDefs.filter(b => measured[b.id]).length,
  [activeBuoyDefs, measured]);
  const statusCounts  = Object.values(statuses).reduce(
    (acc, s) => { if (s) acc[s.status] = (acc[s.status] || 0) + 1; return acc; }, {}
  );

  // ── Course type toggle ────────────────────────────────────────────────
  function handleCourseTypeChange(newType) {
    if (newType === courseType) return;
    if (Object.keys(measured).length > 0 || pois.length > 0) {
      // eslint-disable-next-line no-alert
      if (!window.confirm('Switching course type will clear all current measurements. Continue?')) return;
    }
    setCourseType(newType);
    setMeasured({});
    setPois([]);
    setSelectedId(null);
    setSelectedPoi(null);
    setDistSel([null, null]);
  }

  // ── Actions ───────────────────────────────────────────────────────────
  function saveGps(id) {
    if (!hasGps) return;
    setMeasured(m => ({ ...m, [id]: { lat: data.lat, lon: data.lon } }));
  }
  function clearBuoy(id) {
    setMeasured(m => { const n = { ...m }; delete n[id]; return n; });
  }
  function clearSession() {
    setMeasured({}); setPois([]);
    setPosRefId(1); setAngleRefId(23);
    setSelectedId(null); setSelectedPoi(null);
    setDistSel([null, null]);
  }
  function addPoi() {
    if (!hasGps) return;
    setPoiDraft({ lat: data.lat, lon: data.lon });
    setPoiDesc('');
    setShowPoiInput(true);
  }
  function savePoi() {
    if (!poiDraft) return;
    setPois(p => [...p, { lat: poiDraft.lat, lon: poiDraft.lon, desc: poiDesc }]);
    setShowPoiInput(false); setPoiDraft(null); setPoiDesc('');
  }
  function deletePoi(i) {
    setPois(p => p.filter((_, idx) => idx !== i));
    if (selectedPoi === i) setSelectedPoi(null);
  }

  function confirmSave() {
    const entry = {
      id:         `slalom_${Date.now()}`,
      name:       courseName.trim() || `Course ${new Date().toLocaleDateString()}`,
      date:       new Date().toISOString(),
      measured,
      posRefId,
      angleRefId,
      pois,
      count:      measuredCount,
      totalBuoys,
      courseType,
    };
    const all = [entry, ...loadSaved()];
    storeSaved(all);
    setSavedCourses(all);
    setShowSaveDialog(false);
  }
  function deleteCourseSaved(id) {
    const filtered = savedCourses.filter(c => c.id !== id);
    storeSaved(filtered);
    setSavedCourses(filtered);
    if (viewingCourse?.id === id) setViewingCourse(null);
  }

  // ── Distance selection handler ─────────────────────────────────────────
  function handleDistSelect(type, id) {
    if (!distMode) return;
    setDistSel(prev => {
      if (!prev[0]) return [{ type, id }, null];
      if (!prev[1]) return [prev[0], { type, id }];
      return [{ type, id }, null]; // restart
    });
  }

  // ── Selected buoy panel data ──────────────────────────────────────────
  const selDef    = selectedId ? activeBuoyById[selectedId] : null;
  const selMeas   = selectedId ? measured[selectedId]   : null;
  const selStatus = selectedId ? statuses[selectedId]   : null;
  const selTheo   = selectedId ? theoretical[selectedId]: null;

  // ── Saved course computed props ────────────────────────────────────────
  function savedCourseProps(sw) {
    if (!sw) return {};
    // Use the correct buoy defs for this saved course's course type
    const ct = sw.courseType ?? '6';
    const swDefs   = ct === '8' ? BUOY_DEFS_8 : BUOY_DEFS;
    const swById   = ct === '8' ? BUOY_BY_ID_8 : BUOY_BY_ID;

    const canC = sw.measured[sw.posRefId] && sw.measured[sw.angleRefId]
              && sw.posRefId !== sw.angleRefId;
    let theo = {}, savedBuoyErrors = {};
    if (canC) {
      const fn = buildCourseTransform(
        swById[sw.posRefId],   sw.measured[sw.posRefId],
        swById[sw.angleRefId], sw.measured[sw.angleRefId],
      );
      theo = Object.fromEntries(swDefs.map(b => [b.id, fn(b.cx, b.cy)]));
      const gps2c = buildCourseInverseTransform(
        swById[sw.posRefId],   sw.measured[sw.posRefId],
        swById[sw.angleRefId], sw.measured[sw.angleRefId],
      );
      for (const def of swDefs) {
        const m = sw.measured[def.id];
        if (!m) continue;
        const mc = gps2c(m.lat, m.lon);
        savedBuoyErrors[def.id] = { dLon: mc.cy - def.cy, dLat: mc.cx - def.cx };
      }
    }
    const sts = Object.fromEntries(swDefs.map(b => {
      const m = sw.measured[b.id], t = theo[b.id];
      if (!m || !t) return [b.id, null];
      return [b.id, computeStatus(m, t, b.tol)];
    }));
    return {
      measured: sw.measured, theoretical: theo, statuses: sts,
      pois: sw.pois ?? [], buoyErrors: savedBuoyErrors,
      buoyDefs: swDefs,
    };
  }

  const vc = viewingCourse ? savedCourseProps(viewingCourse) : null;

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="feature-screen slalom-screen">

      {/* ── Nav bar ── */}
      <div className="screen-nav">
        <button id="btn-back-slalom" className="back-btn"
          onClick={() => { if (viewingCourse) { setViewingCourse(null); return; } onBack(); }}>
          ← Back
        </button>
        <h2 className="screen-title">
          {viewingCourse ? viewingCourse.name : 'Survey Slalom Course'}
        </h2>
      </div>

      {/* ── Viewing a saved course ── */}
      {viewingCourse && vc && (
        <>
          <div className="slalom-progress">
            <div className="sp-count">
              <span className="sp-num">{viewingCourse.count}</span>
              <span className="sp-denom">/{viewingCourse.totalBuoys ?? 26} buoys</span>
            </div>
            <span style={{fontSize:'0.68rem',color:'var(--text-muted)'}}>
              {new Date(viewingCourse.date).toLocaleDateString()} · read-only
            </span>
          </div>
          <div className="tab-bar">
            {['survey','results'].map(t => (
              <button key={t} className={`tab-btn${tab===t?' tab-btn--active':''}`}
                onClick={() => setTab(t)}>
                {t === 'survey' ? '🗺️ Schematic' : '📋 Results'}
              </button>
            ))}
          </div>
          {tab === 'survey' && (
            <SlalomSchematic
              measured={vc.measured} statuses={vc.statuses}
              posRefId={viewingCourse.posRefId} angleRefId={viewingCourse.angleRefId}
              selectedId={selectedId} onSelect={setSelectedId}
              liveSchematic={null} buoyErrors={vc.buoyErrors}
              poisCourse={[]} selectedPoi={null} onPoiSelect={() => {}}
              distMode={false} distSel={[null,null]} onDistSelect={() => {}}
              mode="survey" nearestPlaceId={null}
              buoyDefs={vc.buoyDefs}
            />
          )}
          {tab === 'results' && (
            <SavedResultsList statuses={vc.statuses} buoyErrors={vc.buoyErrors} />
          )}
        </>
      )}

      {/* ── Main UI ── */}
      {!viewingCourse && (
        <>
          {/* Progress strip */}
          <div className="slalom-progress">
            <div className="sp-count">
              <span className="sp-num">{measuredCount}</span>
              <span className="sp-denom">/{totalBuoys} buoys</span>
            </div>
            <div className="sp-pills">
              {statusCounts.ok   > 0 && <span className="sp-pill sp-ok">✓{statusCounts.ok}</span>}
              {statusCounts.warn > 0 && <span className="sp-pill sp-warn">◑{statusCounts.warn}</span>}
              {statusCounts.bad  > 0 && <span className="sp-pill sp-bad">✗{statusCounts.bad}</span>}
              {pois.length       > 0 && <span className="sp-pill sp-poi">!{pois.length}</span>}
            </div>
            <div className="sp-refs">
              <span className="sp-ref sp-ref-pos"
                onClick={() => { if (selectedId) setPosRefId(selectedId); }}>
                POS #{posRefId}
              </span>
              <span className="sp-ref sp-ref-ang"
                onClick={() => { if (selectedId) setAngleRefId(selectedId); }}>
                ANG #{angleRefId}
              </span>
            </div>
          </div>

          {/* Tab bar */}
          <div className="tab-bar">
            {['survey','results','saved'].map(t => (
              <button key={t} id={`tab-${t}`}
                className={`tab-btn${tab===t?' tab-btn--active':''}`}
                onClick={() => setTab(t)}>
                {t==='survey'  ? '🗺️ Schematic' :
                 t==='results' ? '📋 Results'  :
                                 `💾 Saved${savedCourses.length>0?` (${savedCourses.length})`:''}`}
              </button>
            ))}
          </div>

          {/* ══ SURVEY TAB ══════════════════════════════════════════════════════ */}
          {tab === 'survey' && (
            <>
              <div className="live-pos-strip">
                <span className="lps-label">Live</span>
                <span className="lps-coords">
                  {hasGps ? `${data.lat.toFixed(7)},  ${data.lon.toFixed(7)}` : 'Waiting for GPS…'}
                </span>
              </div>

              {/* Course type selector */}
              <div className="slalom-course-type-bar">
                <span className="sctb-label">Course:</span>
                <button id="btn-ct-6"
                  className={`sctb-btn${courseType === '6' ? ' sctb-btn--active' : ''}`}
                  onClick={() => handleCourseTypeChange('6')}>
                  6 Buoy
                </button>
                <button id="btn-ct-8"
                  className={`sctb-btn${courseType === '8' ? ' sctb-btn--active' : ''}`}
                  onClick={() => handleCourseTypeChange('8')}>
                  8 Buoy
                </button>
              </div>

              {/* Survey / Place Course mode toggle */}
              <div className="slalom-mode-toggle">
                <button id="btn-mode-survey"
                  className={`smt-btn${mode === 'survey' ? ' smt-btn--active' : ''}`}
                  onClick={() => setMode('survey')}>
                  Survey
                </button>
                <button id="btn-mode-place"
                  className={`smt-btn${mode === 'place' ? ' smt-btn--active' : ''}`}
                  onClick={() => setMode('place')}>
                  🎯 Place Course
                </button>
              </div>

              {/* Place mode guidance panel */}
              {mode === 'place' && canCompute && (
                <div className="place-guidance-panel">
                  {nearestPlaceId ? (
                    <>
                      <span className="pgp-icon">🎯</span>
                      <div className="pgp-body">
                        <span className="pgp-title">Place buoy {nearestPlaceId}</span>
                        <span className="pgp-name">{activeBuoyById[nearestPlaceId]?.name}</span>
                      </div>
                      <button className="pgp-measure"
                        onClick={() => saveGps(nearestPlaceId)} disabled={!hasGps}>
                        ⊙ Measure
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="pgp-icon">🧭</span>
                      <span className="pgp-text">Navigate to the next buoy shown on the schematic</span>
                    </>
                  )}
                </div>
              )}
              {mode === 'place' && !canCompute && (
                <div className="place-guidance-panel">
                  <span className="pgp-icon">⚠️</span>
                  <span className="pgp-text">Measure buoy {posRefId} (pos ref) and buoy {angleRefId} (angle ref) to compute theoretical positions</span>
                </div>
              )}

              <SlalomSchematic
                measured={measured}
                statuses={statuses}
                posRefId={posRefId}
                angleRefId={angleRefId}
                selectedId={selectedId}
                onSelect={id => setSelectedId(id === selectedId ? null : id)}
                liveSchematic={liveSchematic}
                buoyErrors={buoyErrors}
                poisCourse={poisCourse}
                selectedPoi={selectedPoi}
                onPoiSelect={i => setSelectedPoi(i === selectedPoi ? null : i)}
                distMode={distMode}
                distSel={distSel}
                onDistSelect={handleDistSelect}
                mode={mode}
                nearestPlaceId={nearestPlaceId}
                buoyDefs={activeBuoyDefs}
              />

              {/* Buoy action panel */}
              {selDef && (
                <div className="buoy-panel" style={{ borderColor: `${selDef.color}44` }}>
                  <div className="bp-header">
                    <div className="bp-badge" style={{ background: selDef.color }}>{selDef.label}</div>
                    <div className="bp-identity">
                      <span className="bp-name">{selDef.name}</span>
                      <span className="bp-type">{selDef.type} · tol ±{(selDef.tol*100).toFixed(1)} cm</span>
                    </div>
                    <button className="bp-close" onClick={() => setSelectedId(null)}>✕</button>
                  </div>

                  {selMeas && selStatus && (
                    <div className="bp-status" style={{ borderColor: STATUS_COLOR[selStatus.status] }}>
                      <span className="bp-status-dot" style={{ background: STATUS_COLOR[selStatus.status] }} />
                      <span className="bp-status-label" style={{ color: STATUS_COLOR[selStatus.status] }}>
                        {STATUS_LABEL[selStatus.status]}
                      </span>
                      <span className="bp-status-error">error: {formatError(selStatus.error)}</span>
                    </div>
                  )}

                  {selMeas && (
                    <div className="bp-coords">
                      <span className="bpc-label">Measured</span>
                      <span className="bpc-val">{selMeas.lat.toFixed(7)}</span>
                      <span className="bpc-val">{selMeas.lon.toFixed(7)}</span>
                    </div>
                  )}
                  {selTheo && (
                    <div className="bp-coords bp-coords--theo">
                      <span className="bpc-label">Theoretical</span>
                      <span className="bpc-val">{selTheo.lat.toFixed(7)}</span>
                      <span className="bpc-val">{selTheo.lon.toFixed(7)}</span>
                    </div>
                  )}

                  <div className="bp-actions">
                    <button id={`btn-save-buoy-${selectedId}`}
                      className="bp-btn bp-btn--save"
                      onClick={() => saveGps(selectedId)} disabled={!hasGps}>
                      {selMeas ? '↺ Update GPS' : '＋ Save GPS'}
                    </button>
                    {selMeas && (
                      <button className="bp-btn bp-btn--clear" onClick={() => clearBuoy(selectedId)}>✕ Clear</button>
                    )}
                    {selMeas && selectedId !== posRefId && (
                      <button className="bp-btn bp-btn--posref" onClick={() => setPosRefId(selectedId)}>⊙ Pos ref</button>
                    )}
                    {selMeas && selectedId !== angleRefId && (
                      <button className="bp-btn bp-btn--angref" onClick={() => setAngleRefId(selectedId)}>∠ Ang ref</button>
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

              {/* Selected POI card */}
              {selectedPoi !== null && pois[selectedPoi] && (
                <div className="slalom-poi-card">
                  <span className="spc-icon">!</span>
                  <div className="spc-body">
                    <span className="spc-label">POI {selectedPoi + 1}</span>
                    <span className="spc-desc">{pois[selectedPoi].desc || '(no description)'}</span>
                  </div>
                  <button className="spc-del" onClick={() => deletePoi(selectedPoi)}>🗑</button>
                  <button className="spc-close" onClick={() => setSelectedPoi(null)}>✕</button>
                </div>
              )}

              {!selectedId && selectedPoi === null && (
                <p className="slalom-tap-hint">Tap a buoy to select it</p>
              )}

              {/* Bottom action bar */}
              <div className="slalom-action-bar">
                <button className="sab-btn sab-btn--poi" onClick={addPoi} disabled={!hasGps}>
                  📍 Add POI
                </button>
                <button className={`sab-btn${distMode?' sab-btn--dist-active':' sab-btn--dist'}`}
                  onClick={() => { setDistMode(d => !d); setDistSel([null,null]); }}>
                  📏 Measure
                </button>
                <button className="sab-btn sab-btn--save" onClick={() => {
                  setCourseName(`Course ${new Date().toLocaleDateString()}`);
                  setShowSaveDialog(true);
                }} disabled={measuredCount === 0}>
                  💾 Save
                </button>
                <button className="sab-btn sab-btn--clear" onClick={clearSession}
                  disabled={measuredCount === 0 && pois.length === 0}>
                  ✕ Clear
                </button>
              </div>

              {/* Distance mode status */}
              {distMode && (
                <div className="slalom-dist-status">
                  <span className="sds-label">
                    {!distSel[0] ? 'Tap any buoy or POI to select point 1' :
                     !distSel[1] ? 'Tap any buoy or POI to select point 2' :
                     distanceResult != null
                       ? `Distance: ${distanceResult >= 1 ? distanceResult.toFixed(2) + ' m' : (distanceResult * 100).toFixed(1) + ' cm'}`
                       : 'One or both points not yet measured'}
                  </span>
                  {distSel[0] && (
                    <button className="sds-clear" onClick={() => setDistSel([null,null])}>Reset</button>
                  )}
                </div>
              )}
            </>
          )}

          {/* ══ RESULTS TAB ══════════════════════════════════════════════ */}
          {tab === 'results' && (
            <div className="results-scroll">
              <DimensionsPanel measured={measured} />
              <div className="rl-section-heading">Per-buoy GPS error</div>
              {!canCompute && (
                <div className="results-no-refs">
                  <span className="rno-icon">⚠️</span>
                  <p>Measure pos ref (buoy {posRefId}) and angle ref (buoy {angleRefId}) to compute theoretical positions.</p>
                </div>
              )}
              <div className="results-list">
                {activeBuoyDefs.map(b => {
                  const m = measured[b.id], st = statuses[b.id];
                  if (!m) return (
                    <div key={b.id} className="rl-row rl-row--unmeasured">
                      <span className="rl-badge" style={{ background: b.color }}>{b.label}</span>
                      <span className="rl-name">{b.name}</span>
                      <span className="rl-pending">—</span>
                    </div>
                  );
                  const err = buoyErrors[b.id];
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
                      {/* Directional error breakdown for out-of-spec buoys */}
                      {st && st.status !== 'ok' && err && (
                        <div className="rl-error-detail">
                          <span className="rl-ed-dir">
                            {err.dLon > 0 ? '↑' : '↓'} {Math.abs(err.dLon * 100).toFixed(1)} cm {err.dLon > 0 ? 'exit' : 'entry'}
                          </span>
                          <span className="rl-ed-sep">·</span>
                          <span className="rl-ed-dir">
                            {err.dLat > 0 ? '→' : '←'} {Math.abs(err.dLat * 100).toFixed(1)} cm {err.dLat > 0 ? 'right' : 'left'}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══ SAVED TAB ════════════════════════════════════════════════ */}
          {tab === 'saved' && (
            <div className="saved-list">
              {savedCourses.length === 0 && (
                <div className="saved-empty">
                  <span className="se-icon">💾</span>
                  <p>No saved courses yet.<br />Complete a survey and tap Save.</p>
                </div>
              )}
              {savedCourses.map(sw => (
                <div key={sw.id} className="saved-card">
                  <div className="sc-header">
                    <div className="sc-info">
                      <span className="sc-name">{sw.name}</span>
                      <span className="sc-meta">
                        {new Date(sw.date).toLocaleDateString()} · {sw.count}/{sw.totalBuoys ?? 26} buoys
                        {(sw.courseType === '8') && <span className="sc-badge sc-badge--8buoy">8-Buoy</span>}
                        {(sw.pois?.length ?? 0) > 0 && ` · ${sw.pois.length} POI${sw.pois.length>1?'s':''}`}
                      </span>
                    </div>
                    <div className="sc-actions">
                      <button className="sc-btn sc-btn--view"
                        onClick={() => { setViewingCourse(sw); setTab('survey'); }}>View</button>
                      <button className="sc-btn sc-btn--del"
                        onClick={() => deleteCourseSaved(sw.id)}>✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══ POI INPUT MODAL ════════════════════════════════════════════ */}
      {showPoiInput && (
        <div className="sweep-modal-overlay">
          <div className="sweep-modal">
            <h3 className="sm-title">📍 Add Point of Interest</h3>
            <p className="sm-sub">GPS position captured. Add a description:</p>
            <textarea id="input-poi-desc-slalom" className="sm-textarea" rows={3}
              placeholder="e.g. Sunken log, marked with yellow buoy"
              value={poiDesc} onChange={e => setPoiDesc(e.target.value)} autoFocus />
            <div className="sm-actions">
              <button className="sm-btn sm-btn--save" onClick={savePoi}>Save POI</button>
              <button className="sm-btn sm-btn--cancel"
                onClick={() => { setShowPoiInput(false); setPoiDraft(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SAVE DIALOG ════════════════════════════════════════════════ */}
      {showSaveDialog && (
        <div className="sweep-modal-overlay">
          <div className="sweep-modal">
            <h3 className="sm-title">💾 Save Course Survey</h3>
            <div className="sm-stats">
              <span>{measuredCount}/26 buoys</span>
              <span>{pois.length} POI{pois.length!==1?'s':''}</span>
            </div>
            <label className="sm-label">Course name</label>
            <input id="input-course-name" type="text" className="sm-input"
              value={courseName} onChange={e => setCourseName(e.target.value)} autoFocus />
            <div className="sm-actions">
              <button className="sm-btn sm-btn--save" onClick={confirmSave}>Save</button>
              <button className="sm-btn sm-btn--cancel" onClick={() => setShowSaveDialog(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ── Saved course results list (read-only) ─────────────────────────────
function SavedResultsList({ statuses, buoyErrors = {} }) {
  const SC = { ok: '#22c55e', warn: '#f97316', bad: '#ef4444' };
  return (
    <div className="results-list">
      {BUOY_DEFS.map(b => {
        const st  = statuses[b.id];
        const err = buoyErrors[b.id];
        if (!st) return (
          <div key={b.id} className="rl-row rl-row--unmeasured">
            <span className="rl-badge" style={{ background: b.color }}>{b.label}</span>
            <span className="rl-name">{b.name}</span>
            <span className="rl-pending">—</span>
          </div>
        );
        return (
          <div key={b.id} className="rl-row"
            style={{ borderLeft: `3px solid ${SC[st.status]}` }}>
            <span className="rl-badge" style={{ background: b.color }}>{b.label}</span>
            <span className="rl-name">{b.name}</span>
            <span className="rl-tol">±{(b.tol*100).toFixed(0)}cm</span>
            <span className="rl-error" style={{ color: SC[st.status] }}>
              {formatError(st.error)}
            </span>
            {st.status !== 'ok' && err && (
              <div className="rl-error-detail">
                <span className="rl-ed-dir">
                  {err.dLon > 0 ? '↑' : '↓'} {Math.abs(err.dLon * 100).toFixed(1)} cm {err.dLon > 0 ? 'exit' : 'entry'}
                </span>
                <span className="rl-ed-sep">·</span>
                <span className="rl-ed-dir">
                  {err.dLat > 0 ? '→' : '←'} {Math.abs(err.dLat * 100).toFixed(1)} cm {err.dLat > 0 ? 'right' : 'left'}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── DimensionsPanel ───────────────────────────────────────────────────
/**
 * Shows all 8 official IWWF dimensions in a table.
 * Visible from the start; measured values fill in as buoys are surveyed.
 */
const DIM_STATUS_COLOR = { ok: '#22c55e', warn: '#f97316', bad: '#ef4444' };

function DimensionsPanel({ measured }) {
  const dims = useMemo(() => computeMeasuredDimensions(measured), [measured]);

  function dimStatus(measured_val, tol) {
    if (measured_val == null) return null;
    // We compare to spec via IWWF_DIM_DEFS lookup
    // (caller passes spec so we don't need it here — see row render below)
    return null; // computed per-row
  }

  return (
    <div className="dim-panel">
      <div className="dim-panel-header">
        <span className="dim-ph-title">IWWF Dimensions</span>
        <span className="dim-ph-sub">Official spec vs measured</span>
      </div>

      {/* Column headers */}
      <div className="dim-col-heads">
        <span className="dch-dim">Dim</span>
        <span className="dch-spec">Spec</span>
        <span className="dch-tol">Tol</span>
        <span className="dch-meas">Measured</span>
        <span className="dch-err">Error</span>
      </div>

      {IWWF_DIM_DEFS.map(def => {
        const instances = dims[def.key] ?? [];
        const hasMeas   = instances.length > 0;

        // Summary: average of all instances
        const avg = hasMeas
          ? instances.reduce((s, x) => s + x.value, 0) / instances.length
          : null;

        const avgErr   = avg != null ? Math.abs(avg - def.spec) : null;
        const avgStatus = avgErr != null
          ? (avgErr < def.tol * 0.8 ? 'ok' : avgErr < def.tol ? 'warn' : 'bad')
          : null;

        return (
          <div key={def.key} className="dim-group">
            {/* Summary row */}
            <div className={`dim-row dim-row--summary${hasMeas ? ' dim-row--measured' : ''}`}
              style={avgStatus ? { borderLeftColor: DIM_STATUS_COLOR[avgStatus] } : {}}>
              <span className="dr-dim">{def.key}</span>
              <span className="dr-spec">{def.spec >= 10 ? def.spec.toFixed(1) : def.spec.toFixed(3)} m</span>
              <span className="dr-tol">{def.tolPct}</span>
              <span className="dr-meas">
                {avg != null ? `${avg.toFixed(3)} m` : '—'}
                {instances.length > 1 && (
                  <span className="dr-count"> ×{instances.length}</span>
                )}
              </span>
              <span className="dr-err"
                style={avgStatus ? { color: DIM_STATUS_COLOR[avgStatus] } : {}}>
                {avgErr != null ? formatError(avgErr) : ''}
              </span>
            </div>

            {/* Per-instance sub-rows (when > 1 instance) */}
            {instances.length > 1 && instances.map((inst, i) => {
              const err = Math.abs(inst.value - def.spec);
              const st  = err < def.tol * 0.8 ? 'ok' : err < def.tol ? 'warn' : 'bad';
              return (
                <div key={i} className="dim-row dim-row--instance">
                  <span className="dr-dim-inst" />
                  <span className="dr-label-inst">{inst.label}</span>
                  <span className="dr-meas-inst">{inst.value.toFixed(3)} m</span>
                  <span className="dr-err-inst" style={{ color: DIM_STATUS_COLOR[st] }}>
                    {formatError(err)}
                  </span>
                </div>
              );
            })}

            {/* Description */}
            <div className="dim-detail">{def.label.replace(/^. — /, '')} — {def.detail}</div>
          </div>
        );
      })}
    </div>
  );
}
