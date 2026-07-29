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

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { BUOY_DEFS, IWWF } from '../utils/slalom.js';

// ── Constants ──────────────────────────────────────────────────────────
const INIT_VB_W = 28;          // metres, initial lateral span (±14m)
const ARROW_SCALE = 10;        // 1 cm error → 0.1 m arrow; 10 cm → 1 m arrow
const MIN_ARROW_M = 0.02;      // suppress arrows < 2 cm error
const STATUS_COLOR = { ok: '#22c55e', warn: '#f97316', bad: '#ef4444' };

// Full-course viewBox (all 26 buoys + pre-gates)
const FULL_VB = { x: -14, y: -(IWWF.T + IWWF.H + 4), w: 28, h: IWWF.T + 2 * IWWF.H + 8 };

// Pick the largest nice scale-bar length that is ≤ vb.w/4
function niceScaleM(vbW) {
  const opts = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200];
  const target = vbW / 4;
  let pick = opts[0];
  for (const m of opts) { if (m <= target) pick = m; else break; }
  return pick;
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
}) {
  const svgRef  = useRef(null);
  const vbRef   = useRef({ x: -14, y: -32, w: INIT_VB_W, h: 40 });
  const [vb, _setVb] = useState(vbRef.current);
  const setVb = useCallback((next) => {
    const v = typeof next === 'function' ? next(vbRef.current) : next;
    vbRef.current = v;
    _setVb(v);
  }, []);

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
      // Show 75% north of entry gate, 25% south (entry gate at 25% from bottom)
      const initVb = { x: -INIT_VB_W / 2, y: -(h * 0.75), w: INIT_VB_W, h };
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

    // Find nearest buoy in SVG coords (buoy at (def.cx, −def.cy))
    const threshold = curVb.w / 5;
    let bestId = null, bestDist = threshold;
    for (const def of BUOY_DEFS) {
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
            setVb({ x: -INIT_VB_W / 2, y: -(h * 0.75), w: INIT_VB_W, h });
          }}>⊡</button>
        <button className="sco-btn" title="Fit full course"
          onClick={() => setVb(FULL_VB)}>↕</button>
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
        {/* ── Arrowhead marker for error arrows ─────────────────── */}
        <defs>
          <marker id="slm-arrow" markerWidth="5" markerHeight="4"
            refX="5" refY="2" orient="auto" markerUnits="strokeWidth">
            <polygon points="0 0, 5 2, 0 4" fill="#f97316" />
          </marker>
        </defs>

        {/* ── Background ────────────────────────────────────────── */}
        <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="#060c1a" />

        {/* Course rectangle (entry gate to exit gate) */}
        <rect x={vb.x} y={-IWWF.T} width={vb.w} height={IWWF.T}
          fill="rgba(59,130,246,0.04)" />

        {/* Pre-gate zones */}
        <rect x={vb.x} y={0}       width={vb.w} height={IWWF.H}
          fill="rgba(34,197,94,0.03)" />
        <rect x={vb.x} y={-IWWF.T - IWWF.H} width={vb.w} height={IWWF.H}
          fill="rgba(34,197,94,0.03)" />

        {/* Centreline */}
        <line x1={0} y1={vb.y} x2={0} y2={vb.y + vb.h}
          stroke="rgba(148,163,184,0.12)" strokeWidth={r * 0.15}
          strokeDasharray={`${r * 0.8} ${r * 0.4}`} />

        {/* Boat channel corridor */}
        <rect x={-IWWF.G} y={-IWWF.T} width={IWWF.G * 2} height={IWWF.T}
          fill="rgba(234,179,8,0.06)" />

        {/* Gate crossbars */}
        <line x1={-IWWF.E * 4} y1={0}       x2={IWWF.E * 4} y2={0}
          stroke="rgba(239,68,68,0.4)" strokeWidth={r * 0.12} />
        <line x1={-IWWF.E * 4} y1={-IWWF.T} x2={IWWF.E * 4} y2={-IWWF.T}
          stroke="rgba(239,68,68,0.4)" strokeWidth={r * 0.12} />

        {/* ── Buoys ─────────────────────────────────────────────── */}
        {BUOY_DEFS.map(def => {
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

              {/* Error arrows (longitudinal + lateral) */}
              {isBad && hasMeasPos && (() => {
                const lon = err.dLon; // positive = too far north
                const lat = err.dLat; // positive = too far right
                const sw  = r * 0.22;
                return (
                  <>
                    {Math.abs(lon) > MIN_ARROW_M && (
                      <line x1={bx} y1={by} x2={bx} y2={by - lon * ARROW_SCALE}
                        stroke="#f97316" strokeWidth={sw}
                        markerEnd="url(#slm-arrow)" />
                    )}
                    {Math.abs(lat) > MIN_ARROW_M && (
                      <line x1={bx} y1={by} x2={bx + lat * ARROW_SCALE} y2={by}
                        stroke="#f97316" strokeWidth={sw}
                        markerEnd="url(#slm-arrow)" />
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
                  fill="rgba(10,15,30,0.55)" stroke={def.color}
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
                x={def.cx >= 0 ? tx + r * 1.5 : tx - r * 1.5}
                y={ty}
                textAnchor={def.cx >= 0 ? 'start' : 'end'}
                dominantBaseline="middle"
                fontSize={r * 0.82}
                fill="rgba(255,255,255,0.42)"
                style={{ pointerEvents: 'none', userSelect: 'none' }}>
                {def.label}
              </text>

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
