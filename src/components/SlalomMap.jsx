/**
 * SlalomMap — GPS coordinate map showing measured vs theoretical buoy positions.
 *
 * Props:
 *   measured    { [id]: {lat,lon} }
 *   theoretical { [id]: {lat,lon} }
 *   statuses    { [id]: {error,status} | null }
 *   currentPos  {lat,lon} | null
 *   buoyDefs    BUOY_DEFS array
 */

import { toLocalMeters, formatMetersShort, niceScaleBarMeters } from '../utils/geo.js';

const W   = 400;
const H   = 340;
const PAD = 32;

const STATUS_COLOR = { ok: '#22c55e', warn: '#f97316', bad: '#ef4444' };

export default function SlalomMap({
  measured, theoretical, statuses, currentPos, buoyDefs,
}) {
  // ── Collect all lat/lon points for the bounding box ─────────────────
  const allGeo = [
    ...Object.values(measured),
    ...Object.values(theoretical),
    ...(currentPos ? [currentPos] : []),
  ];

  if (allGeo.length === 0) {
    return (
      <div className="coord-view coord-view--map">
        <div className="coord-view-empty">
          <span className="cve-icon">📍</span>
          <p className="cve-text">Measure at least one buoy to see the map</p>
        </div>
      </div>
    );
  }

  // ── Flat-earth projection centred on the data ────────────────────────
  const refLat = allGeo.reduce((s, p) => s + p.lat, 0) / allGeo.length;
  const refLon = allGeo.reduce((s, p) => s + p.lon, 0) / allGeo.length;

  function toM(lat, lon) { return toLocalMeters(lat, lon, refLat, refLon); }

  const measuredM    = {};
  const theoreticalM = {};
  buoyDefs.forEach(b => {
    if (measured[b.id])    measuredM[b.id]    = toM(measured[b.id].lat,    measured[b.id].lon);
    if (theoretical[b.id]) theoreticalM[b.id] = toM(theoretical[b.id].lat, theoretical[b.id].lon);
  });
  const curM = currentPos ? toM(currentPos.lat, currentPos.lon) : null;

  // ── Bounding box ─────────────────────────────────────────────────────
  const allM = [
    ...Object.values(measuredM),
    ...Object.values(theoreticalM),
    ...(curM ? [curM] : []),
  ];

  let minX = Math.min(...allM.map(p => p.x));
  let maxX = Math.max(...allM.map(p => p.x));
  let minY = Math.min(...allM.map(p => p.y));
  let maxY = Math.max(...allM.map(p => p.y));

  const MIN_RANGE = 5;
  if (maxX - minX < MIN_RANGE) { const cx = (maxX+minX)/2; minX=cx-MIN_RANGE/2; maxX=cx+MIN_RANGE/2; }
  if (maxY - minY < MIN_RANGE) { const cy = (maxY+minY)/2; minY=cy-MIN_RANGE/2; maxY=cy+MIN_RANGE/2; }

  const innerW = W - 2*PAD;
  const innerH = H - 2*PAD;
  const scale  = Math.min(innerW / (maxX-minX), innerH / (maxY-minY));

  const drawW  = (maxX-minX) * scale;
  const drawH  = (maxY-minY) * scale;
  const ox     = PAD + (innerW - drawW) / 2;
  const oy     = PAD + (innerH - drawH) / 2;

  function toSVG(mx, my) {
    return {
      sx: ox + (mx - minX) * scale,
      sy: H - oy - (my - minY) * scale,
    };
  }

  // ── Scale bar ─────────────────────────────────────────────────────────
  const sbM  = niceScaleBarMeters(scale);
  const sbPx = sbM * scale;
  const sbX  = W - PAD - sbPx;
  const sbY  = H - 12;

  const hasTheoretical = Object.keys(theoretical).length > 0;

  return (
    <div className="coord-view coord-view--map">
      <svg viewBox={`0 0 ${W} ${H}`} className="coord-view-svg">

        {/* Background */}
        <rect width={W} height={H} fill="#080d1a" rx="12" />

        {/* Grid */}
        {[1,2,3,4].map(i => (
          <g key={i}>
            <line x1={PAD} y1={PAD+innerH*i/5} x2={PAD+innerW} y2={PAD+innerH*i/5}
              stroke="rgba(99,179,237,0.05)" strokeWidth="1" />
            <line x1={PAD+innerW*i/5} y1={PAD} x2={PAD+innerW*i/5} y2={PAD+innerH}
              stroke="rgba(99,179,237,0.05)" strokeWidth="1" />
          </g>
        ))}

        {/* ── Error lines: measured → theoretical ── */}
        {buoyDefs.map(b => {
          const mSVG = measuredM[b.id]    ? toSVG(measuredM[b.id].x,    measuredM[b.id].y)    : null;
          const tSVG = theoreticalM[b.id] ? toSVG(theoreticalM[b.id].x, theoreticalM[b.id].y) : null;
          const st   = statuses[b.id];
          if (!mSVG || !tSVG || !st || st.status === 'ok') return null;
          return (
            <line key={b.id}
              x1={tSVG.sx} y1={tSVG.sy} x2={mSVG.sx} y2={mSVG.sy}
              stroke={STATUS_COLOR[st.status]} strokeWidth="1.5" opacity="0.6"
              strokeDasharray="3 3" />
          );
        })}

        {/* ── Theoretical positions (ghost outline) ── */}
        {hasTheoretical && buoyDefs.map(b => {
          const tM = theoreticalM[b.id];
          if (!tM) return null;
          const { sx, sy } = toSVG(tM.x, tM.y);
          return (
            <circle key={b.id} cx={sx} cy={sy} r="5"
              fill="none" stroke={b.color} strokeWidth="1.2"
              opacity="0.35" strokeDasharray="2 2" />
          );
        })}

        {/* ── Measured positions ── */}
        {buoyDefs.map(b => {
          const mM = measuredM[b.id];
          if (!mM) return null;
          const { sx, sy } = toSVG(mM.x, mM.y);
          const st = statuses[b.id];
          const ringColor = st ? STATUS_COLOR[st.status] : null;

          return (
            <g key={b.id}>
              {/* Status ring */}
              {ringColor && (
                <circle cx={sx} cy={sy} r="9"
                  fill="none" stroke={ringColor} strokeWidth="2" opacity="0.8">
                  {st.status !== 'ok' && (
                    <animate attributeName="opacity"
                      values="0.8;0.2;0.8" dur="2s" repeatCount="indefinite" />
                  )}
                </circle>
              )}
              {/* Buoy dot */}
              <circle cx={sx} cy={sy} r="5" fill={b.color} />
              {/* Number label — only for skier/gate buoys, space permitting */}
              {(b.type === 'skier' || b.type === 'gate') && (
                <text x={sx} y={sy - 10}
                  textAnchor="middle" fontSize="7" fontWeight="700"
                  fontFamily="-apple-system,sans-serif" fill={b.color} opacity="0.9">
                  {b.label}
                </text>
              )}
            </g>
          );
        })}

        {/* ── Live GPS position ── */}
        {curM && (() => {
          const { sx, sy } = toSVG(curM.x, curM.y);
          return (
            <g>
              <circle cx={sx} cy={sy} r="8" fill="none" stroke="#22c55e" strokeWidth="2">
                <animate attributeName="r" values="8;20;8" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx={sx} cy={sy} r="4" fill="#22c55e" />
              <circle cx={sx} cy={sy} r="2" fill="#fff" opacity="0.8" />
            </g>
          );
        })()}

        {/* ── North arrow ── */}
        <g transform="translate(18,22)">
          <line x1="0" y1="8" x2="0" y2="-2" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
          <polygon points="0,-7 -3.5,0 0,-2 3.5,0" fill="#475569" />
          <text x="0" y="18" textAnchor="middle" fontSize="8" fontWeight="700"
            fontFamily="-apple-system,sans-serif" fill="#475569">N</text>
        </g>

        {/* ── Scale bar ── */}
        <g>
          <line x1={sbX} y1={sbY} x2={sbX+sbPx} y2={sbY}
            stroke="#475569" strokeWidth="2" strokeLinecap="round" />
          <line x1={sbX} y1={sbY-3} x2={sbX} y2={sbY+3} stroke="#475569" strokeWidth="1.5" />
          <line x1={sbX+sbPx} y1={sbY-3} x2={sbX+sbPx} y2={sbY+3} stroke="#475569" strokeWidth="1.5" />
          <text x={sbX+sbPx/2} y={sbY-6} textAnchor="middle"
            fontSize="8" fontWeight="500" fontFamily="-apple-system,sans-serif" fill="#475569">
            {formatMetersShort(sbM)}
          </text>
        </g>

        {/* ── Legend chips ── */}
        <g transform={`translate(${PAD}, ${PAD + 4})`}>
          {hasTheoretical && (
            <>
              <circle cx="5" cy="5" r="4" fill="none" stroke="#94a3b8" strokeWidth="1"
                strokeDasharray="2 2" opacity="0.5" />
              <text x="13" y="9" fontSize="7" fontFamily="-apple-system,sans-serif"
                fill="#64748b">theoretical</text>
            </>
          )}
        </g>

      </svg>
    </div>
  );
}
