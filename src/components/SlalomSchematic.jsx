/**
 * SlalomSchematic — interactive top-down diagram of all 26 buoys.
 *
 * Props:
 *   measured   { [id]: {lat,lon} }
 *   statuses   { [id]: {error, status} | null }
 *   posRefId   number
 *   angleRefId number
 *   selectedId number | null
 *   onSelect   (id) => void
 */

import { BUOY_DEFS } from '../utils/slalom.js';

const W  = 300;
const H  = 640;
const CX = 150; // centreline x

const STATUS_RING = { ok: '#22c55e', warn: '#f97316', bad: '#ef4444' };

export default function SlalomSchematic({
  measured, statuses, posRefId, angleRefId, selectedId, onSelect,
}) {
  return (
    <div className="schematic-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} className="schematic-svg">

        {/* ── Background ── */}
        <rect width={W} height={H} fill="#080d1a" />

        {/* ── Water area ── */}
        <rect x={CX - 100} y={18} width={200} height={H - 36} rx="6"
          fill="rgba(14,165,233,0.06)" />

        {/* ── Boat channel corridor ── */}
        <line x1={CX - 13} y1={72} x2={CX - 13} y2={558}
          stroke="rgba(234,179,8,0.18)" strokeWidth="26" />

        {/* ── Centreline ── */}
        <line x1={CX} y1={18} x2={CX} y2={H - 18}
          stroke="rgba(148,163,184,0.15)" strokeWidth="1"
          strokeDasharray="6 5" />

        {/* ── Gate cross-bars ── */}
        {/* Pre-gate south */}
        <line x1={133} y1={613} x2={167} y2={613}
          stroke="#22c55e" strokeWidth="1.5" opacity="0.6" />
        {/* Entry gate */}
        <line x1={128} y1={557} x2={172} y2={557}
          stroke="#ef4444" strokeWidth="2" opacity="0.5" />
        {/* Exit gate */}
        <line x1={128} y1={75} x2={172} y2={75}
          stroke="#ef4444" strokeWidth="2" opacity="0.5" />
        {/* Pre-gate north */}
        <line x1={133} y1={22} x2={167} y2={22}
          stroke="#22c55e" strokeWidth="1.5" opacity="0.6" />

        {/* ── Skier buoy reach lines (faint) ── */}
        {[5,7,9].map((id) => {
          const b = BUOY_DEFS.find(x => x.id === id);
          const boat_id = id === 5 ? 11 : id === 7 ? 15 : 19;
          const bb = BUOY_DEFS.find(x => x.id === boat_id);
          return (
            <line key={id}
              x1={CX} y1={(b.sy + bb.sy) / 2} x2={b.sx} y2={b.sy}
              stroke="rgba(239,68,68,0.12)" strokeWidth="1" />
          );
        })}
        {[6,8,10].map((id) => {
          const b = BUOY_DEFS.find(x => x.id === id);
          const boat_id = id === 6 ? 13 : id === 8 ? 17 : 21;
          const bb = BUOY_DEFS.find(x => x.id === boat_id);
          return (
            <line key={id}
              x1={CX} y1={(b.sy + bb.sy) / 2} x2={b.sx} y2={b.sy}
              stroke="rgba(239,68,68,0.12)" strokeWidth="1" />
          );
        })}

        {/* ── Direction arrow (N label at top) ── */}
        <text x={CX} y={H - 6} textAnchor="middle"
          fontSize="8" fill="rgba(100,116,139,0.7)"
          fontFamily="-apple-system,sans-serif" fontWeight="600">S</text>
        <text x={CX} y={12} textAnchor="middle"
          fontSize="8" fill="rgba(100,116,139,0.7)"
          fontFamily="-apple-system,sans-serif" fontWeight="600">N</text>

        {/* ── Buoys ── */}
        {BUOY_DEFS.map((b) => {
          const isMeasured  = !!measured[b.id];
          const status      = statuses[b.id];
          const isSelected  = selectedId === b.id;
          const isPosRef    = posRefId   === b.id;
          const isAngleRef  = angleRefId === b.id;

          const fillColor  = isMeasured ? b.color : 'none';
          const ringColor  = status ? STATUS_RING[status.status] : null;

          const R_OUTER = b.type === 'skier' ? 14 : 11;
          const R_INNER = b.type === 'skier' ? 9  : 7;
          const R_TAP   = b.type === 'skier' ? 22 : 20;

          return (
            <g key={b.id} onClick={() => onSelect(b.id)} style={{ cursor: 'pointer' }}>
              {/* Tap target (invisible large circle) */}
              <circle cx={b.sx} cy={b.sy} r={R_TAP} fill="transparent" />

              {/* Status ring (when computed) */}
              {ringColor && (
                <circle cx={b.sx} cy={b.sy} r={R_OUTER + 4}
                  fill="none" stroke={ringColor} strokeWidth="2.5" opacity="0.85">
                  {status.status !== 'ok' && (
                    <animate attributeName="opacity"
                      values="0.85;0.3;0.85" dur="1.8s" repeatCount="indefinite" />
                  )}
                </circle>
              )}

              {/* Selection highlight */}
              {isSelected && (
                <circle cx={b.sx} cy={b.sy} r={R_OUTER + 9}
                  fill="none" stroke="rgba(255,255,255,0.5)"
                  strokeWidth="2" strokeDasharray="4 3" />
              )}

              {/* Main buoy circle */}
              <circle cx={b.sx} cy={b.sy} r={R_INNER}
                fill={fillColor}
                stroke={b.color}
                strokeWidth={isMeasured ? 0 : 1.8}
                opacity={isMeasured ? 1 : 0.6}
              />

              {/* Reference badges */}
              {isPosRef && (
                <circle cx={b.sx + R_INNER - 2} cy={b.sy - R_INNER + 2} r="5"
                  fill="#3b82f6" stroke="#080d1a" strokeWidth="1" />
              )}
              {isAngleRef && (
                <circle cx={b.sx - R_INNER + 2} cy={b.sy - R_INNER + 2} r="5"
                  fill="#a855f7" stroke="#080d1a" strokeWidth="1" />
              )}

              {/* Buoy number label */}
              <text x={b.sx} y={b.sy}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={b.type === 'skier' ? '8' : '6.5'}
                fontWeight="800"
                fontFamily="-apple-system,BlinkMacSystemFont,sans-serif"
                fill={isMeasured ? '#fff' : b.color}
                opacity={isMeasured ? 1 : 0.8}
              >{b.label}</text>
            </g>
          );
        })}

      </svg>

      {/* Legend */}
      <div className="schematic-legend">
        <span className="sl-item"><span className="sl-dot" style={{background:'#ef4444'}} />Gate / Skier</span>
        <span className="sl-item"><span className="sl-dot" style={{background:'#eab308'}} />Boat guide</span>
        <span className="sl-item"><span className="sl-dot" style={{background:'#22c55e'}} />Pre-gate</span>
        <span className="sl-item"><span className="sl-dot" style={{background:'#3b82f6'}} />Pos ref</span>
        <span className="sl-item"><span className="sl-dot" style={{background:'#a855f7'}} />Angle ref</span>
      </div>
    </div>
  );
}
