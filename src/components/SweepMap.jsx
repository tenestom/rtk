/**
 * SweepMap — pure SVG display for the Sweep feature.
 *
 * Props:
 *   boundaryM    [{x,y}]              boundary polygon in local metres
 *   corridors    [[[x,y]×4]]          swept corridor rectangles in local metres
 *   trackM       [{x,y}]              GPS track in local metres
 *   currentM     {x,y} | null         live position in local metres
 *   poisM        [{x,y,desc}]         POIs in local metres
 *   fixedViewport  viewport | null    null = auto-compute from points
 *   heading      number | null        degrees from north (for direction arrow)
 *   showLive     boolean
 *   selectedPoi  number | null
 *   onPoiTap     (index) => void
 *   clipId       string               unique SVG clipPath ID
 */

import { useMemo } from 'react';
import { makeViewport, niceScale } from '../utils/geometry.js';

const W = 400, H = 340;

export default function SweepMap({
  boundaryM    = [],
  corridors    = [],
  trackM       = [],
  currentM     = null,
  poisM        = [],
  fixedViewport = null,
  heading      = null,
  showLive     = true,
  selectedPoi  = null,
  onPoiTap     = null,
  clipId       = 'sweep-clip',
}) {
  // ── Viewport ─────────────────────────────────────────────────────────
  const vp = useMemo(() => {
    if (fixedViewport) return fixedViewport;
    const pts = [...boundaryM, ...(currentM ? [currentM] : [])];
    return pts.length ? makeViewport(pts, W, H) : null;
  }, [fixedViewport, boundaryM, currentM]);

  if (!vp) {
    return (
      <div className="sweep-map-wrap">
        <div className="sweep-map-empty">
          <span className="sme-icon">📍</span>
          <p className="sme-text">Add boundary points to see the map</p>
        </div>
      </div>
    );
  }

  const { toPixel, scale } = vp;

  // ── Pre-compute SVG point strings ─────────────────────────────────
  const bSvg     = boundaryM.map(p => toPixel(p.x, p.y));
  const polyPts  = bSvg.map(p => `${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(' ');
  const trackPts = trackM.length >= 2
    ? trackM.map(p => { const {px,py}=toPixel(p.x,p.y); return `${px.toFixed(1)},${py.toFixed(1)}`; }).join(' ')
    : '';

  // ── Scale bar ─────────────────────────────────────────────────────
  const sbM  = niceScale(scale);
  const sbPx = sbM * scale;
  const sbX  = W - 26 - sbPx;
  const sbY  = H - 11;
  const sbLabel = sbM < 1 ? `${sbM*100} cm` : sbM < 1000 ? `${sbM} m` : `${sbM/1000} km`;

  return (
    <div className="sweep-map-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="sweep-map-svg">

        {/* Background */}
        <rect width={W} height={H} fill="#080d1a" rx="12" />

        {/* Subtle grid */}
        {[1,2,3].map(i => (
          <g key={i}>
            <line x1={28} y1={28+(H-56)*i/4} x2={W-28} y2={28+(H-56)*i/4}
              stroke="rgba(99,179,237,0.05)" strokeWidth="1" />
            <line x1={28+(W-56)*i/4} y1={28} x2={28+(W-56)*i/4} y2={H-28}
              stroke="rgba(99,179,237,0.05)" strokeWidth="1" />
          </g>
        ))}

        {/* ── Clip path (boundary polygon) ── */}
        {boundaryM.length >= 3 && (
          <defs>
            <clipPath id={clipId}>
              <polygon points={polyPts} />
            </clipPath>
          </defs>
        )}

        {/* ── Coverage corridors (clipped to boundary) ── */}
        {boundaryM.length >= 3 && corridors.length > 0 && (
          <g clipPath={`url(#${clipId})`}>
            {corridors.map((rect, i) => {
              // Guard: rect must be a 4-element array of [x,y] pairs
              if (!Array.isArray(rect) || rect.length < 3) return null;
              try {
                const pts = rect
                  .map(([x, y]) => { const {px,py}=toPixel(x,y); return `${px.toFixed(1)},${py.toFixed(1)}`; })
                  .join(' ');
                return <polygon key={i} points={pts} fill="rgba(56,189,248,0.38)" />;
              } catch { return null; }
            })}
          </g>
        )}

        {/* ── Boundary polygon fill ── */}
        {boundaryM.length >= 3 && (
          <polygon points={polyPts}
            fill="rgba(59,130,246,0.07)"
            stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="7 4"
            strokeLinejoin="round" />
        )}

        {/* ── Boundary partial line (< 3 points) ── */}
        {boundaryM.length >= 2 && boundaryM.length < 3 && (
          <polyline points={polyPts}
            fill="none" stroke="#3b82f6" strokeWidth="1.5"
            strokeLinecap="round" />
        )}

        {/* ── Boundary point markers ── */}
        {bSvg.map((p, i) => (
          <g key={i}>
            <circle cx={p.px} cy={p.py} r="7"
              fill="#1e40af" stroke="#3b82f6" strokeWidth="1.5" />
            <text x={p.px} y={p.py}
              textAnchor="middle" dominantBaseline="middle"
              fontSize="7.5" fontWeight="800"
              fontFamily="-apple-system,BlinkMacSystemFont,sans-serif"
              fill="#93c5fd">{i + 1}</text>
          </g>
        ))}

        {/* ── Track path ── */}
        {trackM.length >= 2 && (
          <polyline points={trackPts}
            fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5"
            strokeLinejoin="round" strokeLinecap="round" />
        )}

        {/* ── POI markers ── */}
        {poisM.map((poi, i) => {
          const { px, py } = toPixel(poi.x, poi.y);
          const isSelected = selectedPoi === i;
          const desc = (poi.desc || '').substring(0, 22);
          const labelX = Math.max(45, Math.min(W - 45, px));
          return (
            <g key={i} onClick={() => onPoiTap?.(i)}
              style={{ cursor: 'pointer' }}>
              {isSelected && (
                <>
                  <rect
                    x={labelX - 46} y={py - 36}
                    width="92" height="18" rx="5"
                    fill="rgba(15,23,42,0.92)" stroke="#f59e0b" strokeWidth="1" />
                  <text x={labelX} y={py - 23}
                    textAnchor="middle" fontSize="8" fontWeight="600"
                    fontFamily="-apple-system,sans-serif" fill="#fbbf24">
                    {desc || '(no description)'}
                  </text>
                </>
              )}
              <circle cx={px} cy={py} r="9"
                fill="#f59e0b" stroke="#080d1a" strokeWidth="2" />
              <text x={px} y={py}
                textAnchor="middle" dominantBaseline="middle"
                fontSize="11" fontWeight="900"
                fontFamily="-apple-system,sans-serif" fill="#080d1a">!</text>
            </g>
          );
        })}

        {/* ── Live GPS position + direction arrow ── */}
        {showLive && currentM && (() => {
          const { px, py } = toPixel(currentM.x, currentM.y);
          const arrowRad = heading !== null ? heading * Math.PI / 180 : null;
          return (
            <g>
              <circle cx={px} cy={py} r="10" fill="none" stroke="#22c55e" strokeWidth="2">
                <animate attributeName="r" values="10;24;10" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx={px} cy={py} r="5" fill="#22c55e" />
              <circle cx={px} cy={py} r="2.5" fill="#fff" opacity="0.85" />
              {arrowRad !== null && (
                <line
                  x1={px} y1={py}
                  x2={px + Math.sin(arrowRad) * 18}
                  y2={py - Math.cos(arrowRad) * 18}
                  stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" />
              )}
            </g>
          );
        })()}

        {/* ── North arrow ── */}
        <g transform="translate(18,20)">
          <line x1="0" y1="7" x2="0" y2="-2"
            stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
          <polygon points="0,-7 -3,0 0,-2 3,0" fill="#475569" />
          <text x="0" y="17"
            textAnchor="middle" fontSize="7" fontWeight="700"
            fontFamily="-apple-system,sans-serif" fill="#475569">N</text>
        </g>

        {/* ── Scale bar ── */}
        <g>
          <line x1={sbX} y1={sbY} x2={sbX + sbPx} y2={sbY}
            stroke="#475569" strokeWidth="2" strokeLinecap="round" />
          <line x1={sbX}       y1={sbY-3} x2={sbX}       y2={sbY+3} stroke="#475569" strokeWidth="1.5" />
          <line x1={sbX+sbPx}  y1={sbY-3} x2={sbX+sbPx}  y2={sbY+3} stroke="#475569" strokeWidth="1.5" />
          <text x={sbX + sbPx / 2} y={sbY - 6}
            textAnchor="middle" fontSize="8" fontWeight="500"
            fontFamily="-apple-system,sans-serif" fill="#475569">{sbLabel}</text>
        </g>

        {/* ── Hints ── */}
        {boundaryM.length === 0 && (
          <text x={W/2} y={H/2}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="11" fill="#334155"
            fontFamily="-apple-system,sans-serif">
            Add first boundary point
          </text>
        )}
        {boundaryM.length > 0 && boundaryM.length < 3 && (
          <text x={W/2} y={H-9}
            textAnchor="middle" fontSize="9" fill="#475569"
            fontFamily="-apple-system,sans-serif">
            {3 - boundaryM.length} more point{3 - boundaryM.length > 1 ? 's' : ''} needed
          </text>
        )}

      </svg>
    </div>
  );
}
