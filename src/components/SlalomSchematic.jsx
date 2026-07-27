/**
 * SlalomSchematic — interactive top-down diagram of all 26 buoys.
 *
 * Props:
 *   measured, statuses, posRefId, angleRefId, selectedId, onSelect
 *   liveSchematic  { cx, cy } | null  – live position in course-frame metres
 *   pois           [{lat,lon,desc}]
 *   selectedPoi    number | null
 *   onPoiSelect    (i) => void
 *   distMode       boolean
 *   distSel        [{type,id}|null, {type,id}|null]
 *   onDistSelect   (type, id) => void
 */

import { BUOY_DEFS, IWWF } from '../utils/slalom.js';

const W  = 300;
const H  = 640;
const CX = 150;

const STATUS_RING = { ok: '#22c55e', warn: '#f97316', bad: '#ef4444' };

// ── Course-frame to schematic-pixel transform ─────────────────────────
// Entry gate (cy=0) → sy≈557; Exit gate (cy=259) → sy≈75
// Linear: sy = 557 - cy * (557-75)/259
const SY_ENTRY = 557;
const SY_EXIT  = 75;
const PX_PER_M = (SY_ENTRY - SY_EXIT) / IWWF.LEN;  // pixels per metre (along course)

// Lateral: cx=0 → sx=150; cx=±11.5m (skier) → sx=±248/52
// px per metre lateral: (248-150)/11.5
const PX_PER_M_LAT = (248 - CX) / IWWF.F;

function courseToSchematic(cx, cy) {
  return {
    sx: CX + cx * PX_PER_M_LAT,
    sy: SY_ENTRY - cy * PX_PER_M,
  };
}

export default function SlalomSchematic({
  measured, statuses, posRefId, angleRefId, selectedId, onSelect,
  liveSchematic   = null,
  pois            = [],
  selectedPoi     = null,
  onPoiSelect     = () => {},
  distMode        = false,
  distSel         = [null, null],
  onDistSelect    = () => {},
}) {
  // Is a buoy currently selected for distance measurement?
  function isDistSelected(id) {
    return distSel.some(s => s?.type === 'buoy' && s?.id === id);
  }
  function isPoiDistSelected(i) {
    return distSel.some(s => s?.type === 'poi' && s?.id === i);
  }

  // POI positions on schematic: only possible once liveSchematic context is defined
  // Actually POIs are GPS — we can't position them without the course transform here.
  // We'll show them as a row of pins at the bottom of the legend instead,
  // unless we have the courseToGPS transform. Since we don't import it here,
  // we map POIs with a flag — parent will pass schematic coords if available.
  // For now render POI pins at fixed placeholder col if liveSchematic not available.

  return (
    <div className="schematic-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} className="schematic-svg">

        {/* Background */}
        <rect width={W} height={H} fill="#080d1a" />

        {/* Water area */}
        <rect x={CX - 100} y={18} width={200} height={H - 36} rx="6"
          fill="rgba(14,165,233,0.06)" />

        {/* Boat channel corridor */}
        <line x1={CX - 13} y1={72} x2={CX - 13} y2={558}
          stroke="rgba(234,179,8,0.18)" strokeWidth="26" />

        {/* Centreline */}
        <line x1={CX} y1={18} x2={CX} y2={H - 18}
          stroke="rgba(148,163,184,0.15)" strokeWidth="1" strokeDasharray="6 5" />

        {/* Gate cross-bars */}
        <line x1={133} y1={613} x2={167} y2={613} stroke="#22c55e" strokeWidth="1.5" opacity="0.6" />
        <line x1={128} y1={557} x2={172} y2={557} stroke="#ef4444" strokeWidth="2"  opacity="0.5" />
        <line x1={128} y1={75}  x2={172} y2={75}  stroke="#ef4444" strokeWidth="2"  opacity="0.5" />
        <line x1={133} y1={22}  x2={167} y2={22}  stroke="#22c55e" strokeWidth="1.5" opacity="0.6" />

        {/* Skier reach lines */}
        {[5,7,9].map(id => {
          const b  = BUOY_DEFS.find(x => x.id === id);
          const bb = BUOY_DEFS.find(x => x.id === (id===5?11:id===7?15:19));
          return <line key={id} x1={CX} y1={(b.sy+bb.sy)/2} x2={b.sx} y2={b.sy}
            stroke="rgba(239,68,68,0.12)" strokeWidth="1" />;
        })}
        {[6,8,10].map(id => {
          const b  = BUOY_DEFS.find(x => x.id === id);
          const bb = BUOY_DEFS.find(x => x.id === (id===6?13:id===8?17:21));
          return <line key={id} x1={CX} y1={(b.sy+bb.sy)/2} x2={b.sx} y2={b.sy}
            stroke="rgba(239,68,68,0.12)" strokeWidth="1" />;
        })}

        {/* N/S labels */}
        <text x={CX} y={H-6} textAnchor="middle" fontSize="8" fill="rgba(100,116,139,0.7)"
          fontFamily="-apple-system,sans-serif" fontWeight="600">S</text>
        <text x={CX} y={12} textAnchor="middle" fontSize="8" fill="rgba(100,116,139,0.7)"
          fontFamily="-apple-system,sans-serif" fontWeight="600">N</text>

        {/* ── Buoys ── */}
        {BUOY_DEFS.map(b => {
          const isMeasured = !!measured[b.id];
          const status     = statuses[b.id];
          const isSelected = selectedId === b.id;
          const isPosRef   = posRefId   === b.id;
          const isAngleRef = angleRefId === b.id;
          const isDistSel  = isDistSelected(b.id);

          const fillColor = isMeasured ? b.color : 'none';
          const ringColor = status ? STATUS_RING[status.status] : null;
          const R_OUTER = b.type === 'skier' ? 14 : 11;
          const R_INNER = b.type === 'skier' ? 9  : 7;
          const R_TAP   = b.type === 'skier' ? 22 : 20;

          return (
            <g key={b.id}
              onClick={() => {
                if (distMode) { onDistSelect('buoy', b.id); }
                else { onSelect(b.id); }
              }}
              style={{ cursor: 'pointer' }}>

              {/* Tap target */}
              <circle cx={b.sx} cy={b.sy} r={R_TAP} fill="transparent" />

              {/* Dist-mode highlight */}
              {isDistSel && (
                <circle cx={b.sx} cy={b.sy} r={R_OUTER + 8}
                  fill="rgba(96,165,250,0.18)" stroke="#60a5fa" strokeWidth="2" />
              )}

              {/* Status ring */}
              {ringColor && (
                <circle cx={b.sx} cy={b.sy} r={R_OUTER + 4}
                  fill="none" stroke={ringColor} strokeWidth="2.5" opacity="0.85">
                  {status.status !== 'ok' && (
                    <animate attributeName="opacity" values="0.85;0.3;0.85" dur="1.8s" repeatCount="indefinite" />
                  )}
                </circle>
              )}

              {/* Selection highlight */}
              {isSelected && (
                <circle cx={b.sx} cy={b.sy} r={R_OUTER + 9}
                  fill="none" stroke="rgba(255,255,255,0.5)"
                  strokeWidth="2" strokeDasharray="4 3" />
              )}

              {/* Main circle */}
              <circle cx={b.sx} cy={b.sy} r={R_INNER}
                fill={fillColor} stroke={b.color}
                strokeWidth={isMeasured ? 0 : 1.8}
                opacity={isMeasured ? 1 : 0.6} />

              {/* Reference badges */}
              {isPosRef && (
                <circle cx={b.sx + R_INNER - 2} cy={b.sy - R_INNER + 2} r="5"
                  fill="#3b82f6" stroke="#080d1a" strokeWidth="1" />
              )}
              {isAngleRef && (
                <circle cx={b.sx - R_INNER + 2} cy={b.sy - R_INNER + 2} r="5"
                  fill="#a855f7" stroke="#080d1a" strokeWidth="1" />
              )}

              {/* Number label */}
              <text x={b.sx} y={b.sy}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={b.type === 'skier' ? '8' : '6.5'} fontWeight="800"
                fontFamily="-apple-system,BlinkMacSystemFont,sans-serif"
                fill={isMeasured ? '#fff' : b.color}
                opacity={isMeasured ? 1 : 0.8}>
                {b.label}
              </text>
            </g>
          );
        })}

        {/* ── POI markers on schematic ── */}
        {liveSchematic && pois.map((poi, i) => {
          // POI GPS → schematic only if we have course transform available via parent
          // We display them as floating markers along the right edge with index
          const px = W - 18;
          const py = 30 + i * 22;
          const isSel = selectedPoi === i;
          const isDSel = isPoiDistSelected(i);
          return (
            <g key={`poi-${i}`} onClick={() => {
              if (distMode) onDistSelect('poi', i);
              else onPoiSelect(i);
            }} style={{ cursor: 'pointer' }}>
              {isDSel && <circle cx={px} cy={py} r="12" fill="rgba(96,165,250,0.18)" stroke="#60a5fa" strokeWidth="1.5" />}
              {isSel  && <circle cx={px} cy={py} r="12" fill="rgba(245,158,11,0.15)" stroke="#f59e0b" strokeWidth="1.5" />}
              <circle cx={px} cy={py} r="8" fill="#f59e0b" stroke="#080d1a" strokeWidth="1.5" />
              <text x={px} y={py} textAnchor="middle" dominantBaseline="middle"
                fontSize="9" fontWeight="900"
                fontFamily="-apple-system,sans-serif" fill="#080d1a">!</text>
            </g>
          );
        })}

        {/* ── Live GPS position on schematic ── */}
        {liveSchematic && (() => {
          const { sx, sy } = courseToSchematic(liveSchematic.cx, liveSchematic.cy);
          // Only render if within schematic bounds
          if (sx < 0 || sx > W || sy < 0 || sy > H) return null;
          return (
            <g>
              <circle cx={sx} cy={sy} r="8" fill="none" stroke="#3b82f6" strokeWidth="2">
                <animate attributeName="r"       values="8;18;8"   dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.7;0;0.7" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx={sx} cy={sy} r="5" fill="#3b82f6" />
              <circle cx={sx} cy={sy} r="2.5" fill="#fff" opacity="0.85" />
            </g>
          );
        })()}

        {/* Dist-mode overlay hint */}
        {distMode && (
          <rect x="0" y="0" width={W} height={H} fill="none"
            stroke="#60a5fa" strokeWidth="2" opacity="0.3" strokeDasharray="8 6" rx="4" />
        )}

      </svg>

      {/* Legend */}
      <div className="schematic-legend">
        <span className="sl-item"><span className="sl-dot" style={{background:'#ef4444'}} />Gate / Skier</span>
        <span className="sl-item"><span className="sl-dot" style={{background:'#eab308'}} />Boat guide</span>
        <span className="sl-item"><span className="sl-dot" style={{background:'#22c55e'}} />Pre-gate</span>
        <span className="sl-item"><span className="sl-dot" style={{background:'#3b82f6'}} />Pos ref / Live</span>
        <span className="sl-item"><span className="sl-dot" style={{background:'#a855f7'}} />Angle ref</span>
        <span className="sl-item"><span className="sl-dot" style={{background:'#f59e0b'}} />POI</span>
      </div>
    </div>
  );
}
