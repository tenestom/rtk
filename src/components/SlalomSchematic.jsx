/**
 * SlalomSchematic — to-scale interactive course diagram
 *
 * Coordinate system:
 *   SVG x  = course cx   (right = positive, centreline = 0)
 *   SVG y  = −course cy  (north = up, entry gate line = 0, exit gate = −259)
 *
 * ViewBox is in course-metres. 1 SVG unit = 1 metre.
 * preserveAspectRatio="none" so the SVG always fills its container,
 * and the viewBox maintains equal px/m on both axes at the initial zoom.
 *
 * Touch:  1-finger drag = pan  |  2-finger pinch = zoom
 *         quick tap (<10 px, <200 ms) = buoy selection
 */

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { BUOY_DEFS, IWWF } from '../utils/slalom.js';

// ── Constants ──────────────────────────────────────────────────────────
const INIT_VB_W = 28;          // metres, initial lateral span (±14m)
const MIN_ARROW_M = 0.02;      // suppress correction arrows < 2 cm error
const STATUS_COLOR = { ok: '#22c55e', warn: '#f97316', bad: '#ef4444' };

// Colour constants for isNew / isChanged rings
const NEW_RING_COLOR     = '#60a5fa'; // blue
const CHANGED_RING_COLOR = '#34d399'; // teal

// Pick the largest nice scale-bar length that is ≤ vb.w/4
function niceScaleM(vbW) {
  const opts = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200];
  const target = vbW / 4;
  let pick = opts[0];
  for (const m of opts) { if (m <= target) pick = m; else break; }
  return pick;
}

/**
 * For a selected buoy, return up to 4 neighbor defs:
 *   { kind: 'before'|'after'|'lateral', def: BuoyDef }
 *
 * Longitudinal: the single closest buoy at the prev / next distinct cy level.
 * Lateral:      buoys at exactly the same cy, sorted by proximity, up to 2.
 */
function getNeighbors(selDef, buoyDefs) {
  const CY_TOL = 0.5; // m
  const sortedCY = [...new Set(buoyDefs.map(d => d.cy))].sort((a, b) => a - b);
  const selIdx   = (() => {
    const i = sortedCY.indexOf(selDef.cy);
    return i !== -1 ? i : sortedCY.findIndex(cy => Math.abs(cy - selDef.cy) < CY_TOL);
  })();

  const closest = (candidates) =>
    candidates.length === 0 ? null :
    candidates.reduce((best, d) => {
      const dA = Math.hypot(d.cx - selDef.cx, d.cy - selDef.cy);
      const dB = Math.hypot(best.cx - selDef.cx, best.cy - selDef.cy);
      return dA < dB ? d : best;
    });

  const results = [];

  // Longitudinal before
  if (selIdx > 0) {
    const prevCy = sortedCY[selIdx - 1];
    const nb = closest(buoyDefs.filter(d => Math.abs(d.cy - prevCy) < CY_TOL && d.id !== selDef.id));
    if (nb) results.push({ kind: 'before', def: nb });
  }
  // Longitudinal after
  if (selIdx >= 0 && selIdx < sortedCY.length - 1) {
    const nextCy = sortedCY[selIdx + 1];
    const nb = closest(buoyDefs.filter(d => Math.abs(d.cy - nextCy) < CY_TOL && d.id !== selDef.id));
    if (nb) results.push({ kind: 'after', def: nb });
  }
  // Lateral (same cy level, up to 2 nearest)
  buoyDefs
    .filter(d => Math.abs(d.cy - selDef.cy) < CY_TOL && d.id !== selDef.id)
    .sort((a, b) => Math.abs(a.cx - selDef.cx) - Math.abs(b.cx - selDef.cx))
    .slice(0, 2)
    .forEach(d => results.push({ kind: 'lateral', def: d }));

  return results;
}

/** Colour a distance line by deviation from theoretical. */
function distLineColor(delta) {
  if (delta < 0.15) return '#22c55e'; // green  < 15 cm
  if (delta < 0.40) return '#f97316'; // orange < 40 cm
  return '#ef4444';                   // red    ≥ 40 cm
}

// ──────────────────────────────────────────────────────────────────────
export default function SlalomSchematic({
  measured,
  statuses,
  posRefId,
  angleRefId,
  selectedId,
  onSelect,
  liveSchematic,      // {cx, cy} in course frame — null if unavailable
  buoyErrors,         // {[id]: {dLon, dLat}} signed errors in course metres
  poisCourse,         // [{cx, cy, desc}] POIs in course frame
  selectedPoi,
  onPoiSelect,
  distMode,
  distSel,
  onDistSelect,
  mode,               // 'survey' | 'place'
  nearestPlaceId,     // buoy id nearest to GPS in place mode (within threshold)
  buoyDefs = BUOY_DEFS, // ← allow caller to pass 8-buoy defs
}) {
  const svgRef  = useRef(null);
  const vbRef   = useRef({ x: -14, y: -32, w: INIT_VB_W, h: 40 });
  const [vb, _setVb] = useState(vbRef.current);
  const setVb = useCallback((next) => {
    const v = typeof next === 'function' ? next(vbRef.current) : next;
    vbRef.current = v;
    _setVb(v);
  }, []);

  // Stale-closure-safe ref for buoyDefs (used inside touch callbacks)
  const buoyDefsRef = useRef(buoyDefs);
  useEffect(() => { buoyDefsRef.current = buoyDefs; }, [buoyDefs]);

  // Full-course viewBox computed from actual buoyDefs extent
  const fullVb = useMemo(() => {
    const minCY = Math.min(...buoyDefs.map(d => d.cy));
    const maxCY = Math.max(...buoyDefs.map(d => d.cy));
    const margin = 8;
    return {
      x: -14,
      y: -(maxCY + margin),
      w:  28,
      h:  (maxCY - minCY) + margin * 2,
    };
  }, [buoyDefs]);

  // Refs for stale-closure-safe access inside touch callbacks
  const selectedIdRef   = useRef(selectedId);
  const onSelectRef     = useRef(onSelect);
  const distModeRef     = useRef(distMode);
  const onDistSelectRef = useRef(onDistSelect);
  useEffect(() => { selectedIdRef.current   = selectedId; },   [selectedId]);
  useEffect(() => { onSelectRef.current     = onSelect; },     [onSelect]);
  useEffect(() => { distModeRef.current     = distMode; },     [distMode]);
  useEffect(() => { onDistSelectRef.current = onDistSelect; }, [onDistSelect]);

  // ── Set equal-scale initial viewBox once SVG dimensions are known ────
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const { width, height } = svg.getBoundingClientRect();
    if (width > 0 && height > 0) {
      const h = INIT_VB_W * (height / width);
      // Compute course south extent so the initial view always shows entry gate area
      const minCY = Math.min(...buoyDefsRef.current.map(d => d.cy));
      // Show entry gate (0) at 30% from bottom; extend south if needed
      const topCY   = h * 0.70;               // how far north to show
      const southCY = Math.min(-4, minCY - 4); // at least 4m south of southernmost buoy
      const useH    = Math.max(h, topCY - southCY);
      const initVb = { x: -INIT_VB_W / 2, y: -(topCY), w: INIT_VB_W, h: useH };
      setVb(initVb);
    }
  }, [setVb]);

  // ── Gesture state ────────────────────────────────────────────────────
  const gestureRef = useRef({
    active: false, type: 'none',
    startVb: null, startTouches: null, startTime: 0,
  });

  // ── Touch handlers (non-passive for preventDefault) ──────────────────
  const handleTouchStart = useCallback((e) => {
    e.preventDefault();
    const touches = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }));
    gestureRef.current = {
      active: true,
      type:   touches.length === 1 ? 'pan' : 'pinch',
      startVb:      { ...vbRef.current },
      startTouches: touches,
      startTime:    Date.now(),
    };
  }, []);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    const g = gestureRef.current;
    if (!g.active || !svgRef.current) return;
    const touches = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }));
    const rect = svgRef.current.getBoundingClientRect();
    const sv = g.startVb;

    if (g.type === 'pan' && touches.length === 1) {
      const dx = -(touches[0].x - g.startTouches[0].x) / rect.width  * sv.w;
      const dy = -(touches[0].y - g.startTouches[0].y) / rect.height * sv.h;
      setVb({ ...sv, x: sv.x + dx, y: sv.y + dy });

    } else if (touches.length >= 2 && g.startTouches.length >= 2) {
      const [s0, s1] = g.startTouches;
      const startDist = Math.hypot(s1.x - s0.x, s1.y - s0.y);
      const curDist   = Math.hypot(touches[1].x - touches[0].x, touches[1].y - touches[0].y);
      if (startDist < 1) return;

      const scale = startDist / curDist; // >1 = zoom out, <1 = zoom in
      // Midpoint of initial touch pair in SVG coords
      const midSX = sv.x + ((s0.x + s1.x) / 2 - rect.left) / rect.width  * sv.w;
      const midSY = sv.y + ((s0.y + s1.y) / 2 - rect.top)  / rect.height * sv.h;

      const newW = Math.min(300, Math.max(1.5, sv.w * scale));
      const newH = Math.min(900, Math.max(1.5, sv.h * scale));
      const as   = newW / sv.w;

      setVb({
        x: midSX - (midSX - sv.x) * as,
        y: midSY - (midSY - sv.y) * as,
        w: newW, h: newH,
      });
    }
  }, [setVb]);

  const handleTouchEnd = useCallback((e) => {
    e.preventDefault();
    const g = gestureRef.current;
    if (!g.active) return;
    g.active = false;

    // Tap detection
    const elapsed   = Date.now() - g.startTime;
    const remaining = Array.from(e.touches);
    if (elapsed < 200 && g.type === 'pan' && remaining.length === 0) {
      const endT = Array.from(e.changedTouches)[0];
      if (!endT) return;
      const moved = Math.hypot(endT.clientX - g.startTouches[0].x, endT.clientY - g.startTouches[0].y);
      if (moved < 10) {
        handleTap(endT.clientX, endT.clientY);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleTap(clientX, clientY) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const curVb = vbRef.current;
    const sx = curVb.x + (clientX - rect.left) / rect.width  * curVb.w;
    const sy = curVb.y + (clientY - rect.top)  / rect.height * curVb.h;

    // Find nearest buoy in SVG coords using the current buoyDefs ref
    const threshold = curVb.w / 5;
    let bestId = null, bestDist = threshold;
    for (const def of buoyDefsRef.current) {
      const d = Math.hypot(sx - def.cx, sy - (-def.cy));
      if (d < bestDist) { bestDist = d; bestId = def.id; }
    }

    if (bestId !== null) {
      if (distModeRef.current) {
        onDistSelectRef.current?.('buoy', bestId);
      } else {
        onSelectRef.current?.(bestId === selectedIdRef.current ? null : bestId);
      }
    } else {
      // Tap on empty area — deselect
      if (!distModeRef.current) onSelectRef.current?.(null);
    }
  }

  // Mouse click handler (desktop)
  function handleClick(e) {
    handleTap(e.clientX, e.clientY);
  }

  // Attach non-passive touch listeners
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener('touchstart', handleTouchStart, { passive: false });
    svg.addEventListener('touchmove',  handleTouchMove,  { passive: false });
    svg.addEventListener('touchend',   handleTouchEnd,   { passive: false });
    return () => {
      svg.removeEventListener('touchstart', handleTouchStart);
      svg.removeEventListener('touchmove',  handleTouchMove);
      svg.removeEventListener('touchend',   handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  // ── Derived render values ────────────────────────────────────────────
  const r      = vb.w / 40;          // buoy radius in course metres
  const scaleM = niceScaleM(vb.w);   // scale-bar length in metres
  const pad    = r * 1.5;            // viewport edge padding in course metres

  // Scale bar position (bottom-left of viewport)
  const sbX1 = vb.x + pad;
  const sbX2 = sbX1 + scaleM;
  const sbY  = vb.y + vb.h - pad;

  // North arrow position (top-right of viewport)
  const naX  = vb.x + vb.w - pad * 2.5;
  const naY  = vb.y + pad * 2.5;

  // ────────────────────────────────────────────────────────────────────
  return (
    <div className="slalom-schematic-wrap">

      {/* Overlay buttons (HTML for reliable tap targets) */}
      <div className="schematic-overlay">
        <button className="sco-btn" title="Reset view"
          onClick={() => {
            const svg = svgRef.current;
            if (!svg) return;
            const { width, height } = svg.getBoundingClientRect();
            const h = INIT_VB_W * ((height || 520) / (width || 360));
            const minCY = Math.min(...buoyDefsRef.current.map(d => d.cy));
            const topCY   = h * 0.70;
            const southCY = Math.min(-4, minCY - 4);
            const useH    = Math.max(h, topCY - southCY);
            setVb({ x: -INIT_VB_W / 2, y: -topCY, w: INIT_VB_W, h: useH });
          }}>⊡</button>
        <button className="sco-btn" title="Fit full course"
          onClick={() => setVb(fullVb)}>↕</button>
      </div>

      {/* ── Main SVG ─────────────────────────────────────────────── */}
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className="slalom-schematic-svg"
        preserveAspectRatio="none"
        onClick={handleClick}
        style={{ touchAction: 'none', userSelect: 'none', display: 'block', width: '100%', cursor: 'crosshair' }}
      >
        {/* ── Arrowhead markers ───────────────────────────────────────── */}
        <defs>
          {/* Correction-direction arrow: bright lime */}
          <marker id="slm-corr" markerWidth="6" markerHeight="5"
            refX="6" refY="2.5" orient="auto" markerUnits="strokeWidth">
            <polygon points="0 0, 6 2.5, 0 5" fill="#2563eb" />
          </marker>
        </defs>

        {/* ── Background ────────────────────────────────────────── */}
        <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="#ffffff" />

        {/* Course rectangle (entry gate to exit gate) */}
        <rect x={vb.x} y={-IWWF.T} width={vb.w} height={IWWF.T}
          fill="rgba(59,130,246,0.06)" />

        {/* Pre-gate zones */}
        <rect x={vb.x} y={0}       width={vb.w} height={IWWF.H}
          fill="rgba(34,197,94,0.05)" />
        <rect x={vb.x} y={-IWWF.T - IWWF.H} width={vb.w} height={IWWF.H}
          fill="rgba(34,197,94,0.05)" />

        {/* Centreline */}
        <line x1={0} y1={vb.y} x2={0} y2={vb.y + vb.h}
          stroke="rgba(0,0,0,0.15)" strokeWidth={r * 0.15}
          strokeDasharray={`${r * 0.8} ${r * 0.4}`} />

        {/* Boat channel corridor */}
        <rect x={-IWWF.G} y={-IWWF.T} width={IWWF.G * 2} height={IWWF.T}
          fill="rgba(234,179,8,0.08)" />

        {/* Gate crossbars — rendered for every distinct gate cy in buoyDefs */}
        {Array.from(
          new Set(buoyDefs.filter(d => d.type === 'gate').map(d => d.cy))
        ).map(gcy => (
          <line key={gcy}
            x1={-IWWF.E * 5} y1={-gcy} x2={IWWF.E * 5} y2={-gcy}
            stroke="rgba(239,68,68,0.5)" strokeWidth={r * 0.1} />
        ))}

        {/* ── Distance lines: selected + measured buoy → neighbors ── */}
        {selectedId && measured?.[selectedId] && (() => {
          const selDef = buoyDefs.find(d => d.id === selectedId);
          if (!selDef) return null;
          const neighbors = getNeighbors(selDef, buoyDefs);
          if (!neighbors.length) return null;

          // Actual course-frame position (measured, else theoretical)
          const coursePos = (def) => {
            const e = buoyErrors?.[def.id];
            return e
              ? { cx: def.cx + e.dLat, cy: def.cy + e.dLon }
              : { cx: def.cx,          cy: def.cy };
          };

          const selCP = coursePos(selDef);
          const sx = selCP.cx, sy = -selCP.cy;  // SVG coords
          const sw = r * 0.14;
          const fz = r * 0.90;

          return neighbors.map(({ kind, def: nDef }) => {
            const nMeas = !!measured?.[nDef.id];
            const nCP   = coursePos(nDef);
            const nx    = nCP.cx, ny = -nCP.cy;

            const measD = Math.hypot(selCP.cx - nCP.cx, selCP.cy - nCP.cy);
            const theoD = Math.hypot(selDef.cx - nDef.cx, selDef.cy - nDef.cy);
            const delta = Math.abs(measD - theoD);

            const color = nMeas ? distLineColor(delta) : '#475569';
            const label = nMeas
              ? `${measD.toFixed(2)} m`
              : `~${theoD.toFixed(1)} m`;

            // Label pivot at midpoint; angle follows line direction
            const lmx = (sx + nx) / 2;
            const lmy = (sy + ny) / 2;
            let ang = Math.atan2(ny - sy, nx - sx) * 180 / Math.PI;
            if (ang > 90)  ang -= 180;
            if (ang < -90) ang += 180;

            const pw = fz * 4.6;
            const ph = fz * 1.45;

            return (
              <g key={`dist-${kind}-${nDef.id}`} style={{ pointerEvents: 'none' }}>
                <line x1={sx} y1={sy} x2={nx} y2={ny}
                  stroke={color} strokeWidth={sw}
                  strokeDasharray={`${r * 0.55} ${r * 0.28}`}
                  opacity={nMeas ? 0.88 : 0.45} />
                <g transform={`translate(${lmx},${lmy}) rotate(${ang})`}>
                  <rect x={-pw / 2} y={-ph / 2} width={pw} height={ph}
                    rx={ph * 0.35} fill="rgba(255,255,255,0.92)"
                    stroke={color} strokeWidth={r * 0.06} />
                  <text textAnchor="middle" dominantBaseline="middle"
                    fontSize={fz} fill={color} fontWeight="700"
                    style={{ userSelect: 'none' }}>
                    {label}
                  </text>
                </g>
              </g>
            );
          });
        })()}

        {/* ── Buoys ─────────────────────────────────────────────── */}
        {buoyDefs.map(def => {
          const tx = def.cx;         // theoretical SVG x
          const ty = -def.cy;        // theoretical SVG y (flipped)
          const status  = statuses?.[def.id];
          const meas    = measured?.[def.id];
          const err     = buoyErrors?.[def.id];
          const isOk    = !status || status.status === 'ok';
          const isBad   = status && status.status !== 'ok';

          // Measured SVG position = theoretical + error offset
          const hasMeasPos = meas && err != null;
          const mx = hasMeasPos ? tx + err.dLat : tx;
          const my = hasMeasPos ? ty - err.dLon : ty;

          const bx = meas ? mx : tx;
          const by = meas ? my : ty;

          const isSelected  = selectedId === def.id;
          const inDistSel   = distMode && distSel?.some(s => s?.type === 'buoy' && s?.id === def.id);
          const isPosRef    = def.id === posRefId;
          const isAngRef    = def.id === angleRefId;
          const isNearPlace = mode === 'place' && nearestPlaceId === def.id;

          return (
            <g key={def.id} style={{ pointerEvents: 'none' }}>

              {/* NEW buoy indicator: dashed blue ring */}
              {def.isNew && (
                <circle cx={tx} cy={ty} r={r * 2.8}
                  fill="none" stroke={NEW_RING_COLOR} strokeWidth={r * 0.18}
                  strokeDasharray={`${r * 0.35} ${r * 0.22}`} opacity="0.65" />
              )}
              {/* CHANGED buoy indicator: solid teal ring */}
              {def.isChanged && (
                <circle cx={tx} cy={ty} r={r * 2.4}
                  fill="none" stroke={CHANGED_RING_COLOR} strokeWidth={r * 0.2}
                  opacity="0.7" />
              )}

              {/* Place mode: dashed target ring for unmeasured buoys */}
              {mode === 'place' && !meas && (
                <circle cx={tx} cy={ty} r={r * 2.2}
                  fill="none" stroke={def.color} strokeWidth={r * 0.18}
                  strokeDasharray={`${r * 0.7} ${r * 0.35}`} opacity="0.4" />
              )}

              {/* Pulsing ring: nearest-to-place buoy */}
              {isNearPlace && (
                <circle cx={tx} cy={ty} r={r * 3} fill="none" stroke="#60a5fa" strokeWidth={r * 0.28} opacity="0.75">
                  <animate attributeName="r" values={`${r*2.5};${r*4};${r*2.5}`} dur="1.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.8;0.1;0.8" dur="1.5s" repeatCount="indefinite" />
                </circle>
              )}

              {/* Dashed theoretical ring for out-of-spec measured buoys */}
              {isBad && hasMeasPos && (
                <circle cx={tx} cy={ty} r={r * 1.25}
                  fill="none" stroke={def.color} strokeWidth={r * 0.18}
                  strokeDasharray={`${r * 0.45} ${r * 0.25}`} opacity="0.5" />
              )}

              {/* Correction arrows: FROM measured buoy TOWARD theoretical position */}
              {isBad && hasMeasPos && (() => {
                // lon = how far buoy IS from theoretical along course (+ = too far north)
                // lat = how far buoy IS from theoretical laterally  (+ = too far right)
                // Correction = negate: move buoy BACK toward theoretical
                const lon = err.dLon;  // metres
                const lat = err.dLat;  // metres
                const sw  = r * 0.28;
                const fz  = r * 1.0;
                const labelBg = 'rgba(255,255,255,0.92)';

                // Vertical (longitudinal) correction arrow
                const lonCm   = Math.round(Math.abs(lon) * 100);
                // Arrow: measured → theoretical in SVG-y direction
                // SVG y is flipped: positive cy = north = negative SVG-y
                // If lon>0 buoy is too far north (SVG-y too negative), correction is south (+SVG-y)
                const lonEnd  = { x: bx,        y: by + lon }; // = ty (theoretical)
                const lonMidY = (by + lonEnd.y) / 2;

                // Horizontal (lateral) correction arrow
                const latCm   = Math.round(Math.abs(lat) * 100);
                // If lat>0 buoy is too far right (SVG-x too positive), correction is left (-SVG-x)
                const latEnd  = { x: bx - lat,  y: by };       // = tx (theoretical)
                const latMidX = (bx + latEnd.x) / 2;

                const corrColor = '#2563eb'; // blue - clearly visible on white

                return (
                  <>
                    {/* Longitudinal correction arrow */}
                    {lonCm > Math.round(MIN_ARROW_M * 100) && (
                      <g style={{ pointerEvents: 'none' }}>
                        <line x1={bx} y1={by} x2={lonEnd.x} y2={lonEnd.y}
                          stroke={corrColor} strokeWidth={sw}
                          markerEnd="url(#slm-corr)" />
                        {/* cm label beside arrow midpoint */}
                        <g transform={`translate(${bx + r * 1.8}, ${lonMidY})`}>
                          <rect x={-fz * 0.3} y={-fz * 0.75} width={fz * 3.2} height={fz * 1.5}
                            rx={fz * 0.3} fill={labelBg}
                            stroke={corrColor} strokeWidth={r * 0.05} />
                          <text textAnchor="middle" dominantBaseline="middle"
                            x={fz * 1.3} fontSize={fz} fill={corrColor} fontWeight="800"
                            style={{ userSelect: 'none' }}>
                            {lonCm} cm
                          </text>
                        </g>
                      </g>
                    )}
                    {/* Lateral correction arrow */}
                    {latCm > Math.round(MIN_ARROW_M * 100) && (
                      <g style={{ pointerEvents: 'none' }}>
                        <line x1={bx} y1={by} x2={latEnd.x} y2={latEnd.y}
                          stroke={corrColor} strokeWidth={sw}
                          markerEnd="url(#slm-corr)" />
                        {/* cm label above arrow midpoint */}
                        <g transform={`translate(${latMidX}, ${by - r * 2.0})`}>
                          <rect x={-fz * 1.6} y={-fz * 0.75} width={fz * 3.2} height={fz * 1.5}
                            rx={fz * 0.3} fill={labelBg}
                            stroke={corrColor} strokeWidth={r * 0.05} />
                          <text textAnchor="middle" dominantBaseline="middle"
                            fontSize={fz} fill={corrColor} fontWeight="800"
                            style={{ userSelect: 'none' }}>
                            {latCm} cm
                          </text>
                        </g>
                      </g>
                    )}
                  </>
                );
              })()}

              {/* Buoy circle */}
              {meas ? (
                <circle cx={bx} cy={by} r={r}
                  fill={status ? STATUS_COLOR[status.status] : def.color}
                  stroke="#0a0f1e" strokeWidth={r * 0.18} />
              ) : (
                <circle cx={tx} cy={ty} r={r}
                  fill="rgba(200,210,220,0.55)" stroke={def.color}
                  strokeWidth={r * 0.18} opacity={mode === 'place' ? 0.7 : 0.38} />
              )}

              {/* Pos ref / angle ref ring */}
              {(isPosRef || isAngRef) && (
                <circle cx={bx} cy={by} r={r * 1.65}
                  fill="none"
                  stroke={isPosRef ? '#a78bfa' : '#34d399'}
                  strokeWidth={r * 0.18}
                  strokeDasharray={`${r * 0.4} ${r * 0.2}`} />
              )}

              {/* Selection ring */}
              {(isSelected || inDistSel) && (
                <circle cx={bx} cy={by} r={r * 2.1}
                  fill="none" stroke="#60a5fa" strokeWidth={r * 0.3} />
              )}

              {/* Label */}
              <text
                x={def.cx >= 0 ? tx + r * 2.0 : tx - r * 2.0}
                y={ty}
                textAnchor={def.cx >= 0 ? 'start' : 'end'}
                dominantBaseline="middle"
                fontSize={r * 1.55}
                fill="rgba(0,0,0,0.75)"
                style={{ pointerEvents: 'none', userSelect: 'none' }}>
                {def.label}
              </text>
              {/* NEW/CHANGED annotation */}
              {(def.isNew || def.isChanged) && (
                <text
                  x={def.cx >= 0 ? tx + r * 2.0 : tx - r * 2.0}
                  y={ty + r * 1.7}
                  textAnchor={def.cx >= 0 ? 'start' : 'end'}
                  fontSize={r * 0.72}
                  fill={def.isNew ? NEW_RING_COLOR : CHANGED_RING_COLOR}
                  opacity="0.85"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}>
                  {def.isNew ? '★ new' : '~ mod'}
                </text>
              )}

            </g>
          );
        })}

        {/* ── Live GPS dot ───────────────────────────────────────── */}
        {liveSchematic && (
          <g style={{ pointerEvents: 'none' }}>
            {/* Pulsing ring */}
            <circle cx={liveSchematic.cx} cy={-liveSchematic.cy}
              r={r * 1.2} fill="none" stroke="#3b82f6" strokeWidth={r * 0.25}>
              <animate attributeName="r"
                values={`${r};${r * 3};${r}`} dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity"
                values="0.8;0;0.8" dur="2s" repeatCount="indefinite" />
            </circle>
            {/* Solid dot */}
            <circle cx={liveSchematic.cx} cy={-liveSchematic.cy}
              r={r * 0.65} fill="#3b82f6" />
          </g>
        )}

        {/* ── POI markers ────────────────────────────────────────── */}
        {(poisCourse ?? []).map((poi, i) => (
          <g key={i} onClick={(e) => { e.stopPropagation(); onPoiSelect?.(i === selectedPoi ? null : i); }}
            style={{ cursor: 'pointer' }}>
            <circle cx={poi.cx} cy={-poi.cy} r={r * 1.2}
              fill="#f59e0b" stroke="#0a0f1e" strokeWidth={r * 0.18}
              opacity={selectedPoi === i ? 1 : 0.82} />
            <text x={poi.cx} y={-poi.cy}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={r * 0.9} fontWeight="900" fill="#0a0f1e"
              style={{ pointerEvents: 'none' }}>!</text>
          </g>
        ))}

        {/* ── Scale bar (bottom-left of viewport) ───────────────── */}
        <g style={{ pointerEvents: 'none' }}>
          <line x1={sbX1} y1={sbY} x2={sbX2} y2={sbY}
            stroke="#64748b" strokeWidth={r * 0.13} strokeLinecap="round" />
          <line x1={sbX1} y1={sbY - r * 0.3} x2={sbX1} y2={sbY + r * 0.3}
            stroke="#64748b" strokeWidth={r * 0.1} />
          <line x1={sbX2} y1={sbY - r * 0.3} x2={sbX2} y2={sbY + r * 0.3}
            stroke="#64748b" strokeWidth={r * 0.1} />
          <text x={(sbX1 + sbX2) / 2} y={sbY - r * 0.55}
            textAnchor="middle" fill="#64748b" fontSize={r * 0.65}
            style={{ userSelect: 'none' }}>
            {scaleM >= 1 ? `${scaleM} m` : `${scaleM * 100} cm`}
          </text>
        </g>

        {/* ── North arrow (top-right of viewport) ───────────────── */}
        <g style={{ pointerEvents: 'none' }}>
          {/* Arrow shaft upward */}
          <line x1={naX} y1={naY + r * 1.2} x2={naX} y2={naY - r * 0.5}
            stroke="#94a3b8" strokeWidth={r * 0.18} />
          {/* Arrowhead */}
          <polygon
            points={`${naX},${naY - r * 1.5} ${naX - r * 0.45},${naY - r * 0.3} ${naX + r * 0.45},${naY - r * 0.3}`}
            fill="#94a3b8" />
          {/* N label */}
          <text x={naX} y={naY + r * 2}
            textAnchor="middle" fill="#64748b"
            fontSize={r * 0.68} fontWeight="700"
            style={{ userSelect: 'none' }}>N</text>
        </g>

      </svg>
    </div>
  );
}
