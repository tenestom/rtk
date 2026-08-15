import { toLocalMeters, formatMetersShort, niceScaleBarMeters } from '../utils/geo';

const W   = 400;
const H   = 300;
const PAD = 36;

/**
 * CoordinateView — reusable SVG map component.
 *
 * Props:
 *   points    – Array of { lat, lon, label, sublabel?, color }
 *   currentPos – { lat, lon } | null   Live GPS position
 *   distance  – number | null          A↔B distance (2-point mode)
 *   triangle  – { dAB, dBC, dAC, angA, angB, angC } | null  (3-point mode)
 */
export default function CoordinateView({
  points    = [],
  currentPos = null,
  distance   = null,
  triangle   = null,
}) {
  const scaleDefined   = points.length >= 2;
  const geoForBounds   = [...points, ...(scaleDefined && currentPos ? [currentPos] : [])];

  // ── Empty state ────────────────────────────────────────────────────────
  if (geoForBounds.length === 0) {
    return (
      <div className="coord-view">
        <div className="coord-view-empty">
          <span className="cve-icon">🗺️</span>
          <p className="cve-text">Save Point A to begin mapping</p>
        </div>
      </div>
    );
  }

  // ── Flat-earth projection ──────────────────────────────────────────────
  const cLat = geoForBounds.reduce((s, p) => s + p.lat, 0) / geoForBounds.length;
  const cLon = geoForBounds.reduce((s, p) => s + p.lon, 0) / geoForBounds.length;
  const toM  = (lat, lon) => toLocalMeters(lat, lon, cLat, cLon);

  const namedM = points.map(p => ({ ...p, ...toM(p.lat, p.lon) }));
  const curM   = scaleDefined && currentPos ? toM(currentPos.lat, currentPos.lon) : null;
  const allM   = [...namedM, ...(curM ? [curM] : [])];

  // ── Bounding box ──────────────────────────────────────────────────────
  let minX = Math.min(...allM.map(p => p.x));
  let maxX = Math.max(...allM.map(p => p.x));
  let minY = Math.min(...allM.map(p => p.y));
  let maxY = Math.max(...allM.map(p => p.y));

  const MIN_RANGE = 4;
  if (maxX - minX < MIN_RANGE) { const cx=(maxX+minX)/2; minX=cx-MIN_RANGE/2; maxX=cx+MIN_RANGE/2; }
  if (maxY - minY < MIN_RANGE) { const cy=(maxY+minY)/2; minY=cy-MIN_RANGE/2; maxY=cy+MIN_RANGE/2; }

  const innerW = W - 2*PAD, innerH = H - 2*PAD;
  const scale  = Math.min(innerW/(maxX-minX), innerH/(maxY-minY));
  const drawW  = (maxX-minX)*scale, drawH=(maxY-minY)*scale;
  const ox     = PAD + (innerW-drawW)/2;
  const oy     = PAD + (innerH-drawH)/2;

  function toSVG(mx, my) {
    return {
      sx: ox + (mx - minX) * scale,
      sy: H - oy - (my - minY) * scale,
    };
  }

  const svgPts = namedM.map(p => ({ ...p, ...toSVG(p.x, p.y) }));
  const svgCur = curM ? toSVG(curM.x, curM.y) : null;

  // ── Scale bar ─────────────────────────────────────────────────────────
  const sbM  = niceScaleBarMeters(scale);
  const sbPx = sbM * scale;
  const sbX  = W - PAD - sbPx;
  const sbY  = H - 14;

  // ── Grid ──────────────────────────────────────────────────────────────
  const gridLines = [];
  for (let i = 1; i < 5; i++) {
    const f = i / 5;
    gridLines.push(
      { x1: PAD, y1: PAD+innerH*f, x2: PAD+innerW, y2: PAD+innerH*f, key: `h${i}` },
      { x1: PAD+innerW*f, y1: PAD, x2: PAD+innerW*f, y2: PAD+innerH, key: `v${i}` },
    );
  }

  // ── Triangle helpers ──────────────────────────────────────────────────
  const [ptA, ptB, ptC] = svgPts;
  const isTriangle = triangle && ptA && ptB && ptC;

  /**
   * SVG arc path for the angle indicator at vertex `v`,
   * approaching from `from` and `to` (SVG pixel coords).
   * r = arc radius in SVG pixels.
   */
  function angleArcPath(v, from, to, r) {
    function unit(ax, ay, bx, by) {
      const d = Math.sqrt((bx-ax)**2+(by-ay)**2)||1;
      return [(bx-ax)/d, (by-ay)/d];
    }
    const [ux1,uy1] = unit(v.sx, v.sy, from.sx, from.sy);
    const [ux2,uy2] = unit(v.sx, v.sy, to.sx,   to.sy);
    const x1 = v.sx + ux1*r, y1 = v.sy + uy1*r;
    const x2 = v.sx + ux2*r, y2 = v.sy + uy2*r;
    // Determine sweep: cross product of (v→from) and (v→to)
    const cross = ux1*uy2 - uy1*ux2;
    const sweep = cross < 0 ? 1 : 0;
    return `M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 0,${sweep} ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }

  /**
   * Position for an angle label, placed at the vertex offset
   * along the bisector direction.
   */
  function angleLabelPos(v, from, to, r) {
    function unit(ax, ay, bx, by) {
      const d = Math.sqrt((bx-ax)**2+(by-ay)**2)||1;
      return [(bx-ax)/d, (by-ay)/d];
    }
    const [ux1,uy1] = unit(v.sx, v.sy, from.sx, from.sy);
    const [ux2,uy2] = unit(v.sx, v.sy, to.sx,   to.sy);
    const bx = ux1+ux2, by = uy1+uy2;
    const bd = Math.sqrt(bx*bx+by*by)||1;
    return { x: v.sx+(bx/bd)*(r+13), y: v.sy+(by/bd)*(r+13) };
  }

  /**
   * Label position for a side: midpoint offset perpendicular to the line.
   */
  function sideLabelPos(p1, p2, offset=14) {
    const mx=(p1.sx+p2.sx)/2, my=(p1.sy+p2.sy)/2;
    const dx=p2.sx-p1.sx, dy=p2.sy-p1.sy;
    const len=Math.sqrt(dx*dx+dy*dy)||1;
    return { x: mx+(-dy/len)*offset, y: my+(dx/len)*offset };
  }

  const ARC_R = 22;

  return (
    <div className="coord-view">
      <svg viewBox={`0 0 ${W} ${H}`} className="coord-view-svg" aria-label="Coordinate map">

        {/* Background */}
        <rect width={W} height={H} fill="#ffffff" rx="14" />

        {/* Grid */}
        {gridLines.map(l => (
          <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke="rgba(0,0,0,0.10)" strokeWidth="1" />
        ))}

        {/* ── Triangle mode ── */}
        {isTriangle && (() => {
          const labAB  = sideLabelPos(ptA, ptB);
          const labBC  = sideLabelPos(ptB, ptC);
          const labAC  = sideLabelPos(ptA, ptC);
          const angLabelA = angleLabelPos(ptA, ptB, ptC, ARC_R);
          const angLabelB = angleLabelPos(ptB, ptA, ptC, ARC_R);
          const angLabelC = angleLabelPos(ptC, ptA, ptB, ARC_R);

          function SideLabel({ x, y, text }) {
            const w = text.length * 6 + 10;
            return (
              <g>
                <rect x={x - w/2} y={y - 9} width={w} height={16} rx="4"
                  fill="rgba(255,255,255,0.92)" />
                <text x={x} y={y+1} textAnchor="middle" dominantBaseline="middle"
                  fontSize="10" fontWeight="600"
                  fontFamily="-apple-system,BlinkMacSystemFont,sans-serif"
                  fill="#1a1a1a">{text}</text>
              </g>
            );
          }

          function AngleLabel({ x, y, text, color }) {
            return (
              <g>
                <text x={x} y={y} textAnchor="middle" dominantBaseline="middle"
                  fontSize="9" fontWeight="700"
                  fontFamily="-apple-system,BlinkMacSystemFont,sans-serif"
                  fill={color} opacity="0.9">{text}</text>
              </g>
            );
          }

          return (
            <g>
              {/* Triangle sides */}
              <line x1={ptA.sx} y1={ptA.sy} x2={ptB.sx} y2={ptB.sy}
                stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.65" />
              <line x1={ptB.sx} y1={ptB.sy} x2={ptC.sx} y2={ptC.sy}
                stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.65" />
              <line x1={ptA.sx} y1={ptA.sy} x2={ptC.sx} y2={ptC.sy}
                stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.65" />

              {/* Angle arcs */}
              <path d={angleArcPath(ptA, ptB, ptC, ARC_R)}
                fill="none" stroke={ptA.color} strokeWidth="1.5" opacity="0.6" />
              <path d={angleArcPath(ptB, ptA, ptC, ARC_R)}
                fill="none" stroke={ptB.color} strokeWidth="1.5" opacity="0.6" />
              <path d={angleArcPath(ptC, ptA, ptB, ARC_R)}
                fill="none" stroke={ptC.color} strokeWidth="1.5" opacity="0.6" />

              {/* Angle labels */}
              <AngleLabel x={angLabelA.x} y={angLabelA.y}
                text={`${triangle.angA.toFixed(1)}°`} color={ptA.color} />
              <AngleLabel x={angLabelB.x} y={angLabelB.y}
                text={`${triangle.angB.toFixed(1)}°`} color={ptB.color} />
              <AngleLabel x={angLabelC.x} y={angLabelC.y}
                text={`${triangle.angC.toFixed(1)}°`} color={ptC.color} />

              {/* Side distance labels */}
              <SideLabel x={labAB.x} y={labAB.y} text={formatMetersShort(triangle.dAB)} />
              <SideLabel x={labBC.x} y={labBC.y} text={formatMetersShort(triangle.dBC)} />
              <SideLabel x={labAC.x} y={labAC.y} text={formatMetersShort(triangle.dAC)} />
            </g>
          );
        })()}

        {/* ── 2-point mode: single A↔B line ── */}
        {!isTriangle && ptA && ptB && (() => {
          const lab = sideLabelPos(ptA, ptB);
          return (
            <g>
              <line x1={ptA.sx} y1={ptA.sy} x2={ptB.sx} y2={ptB.sy}
                stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.7" />
              {distance != null && (
                <>
                  <rect x={lab.x-28} y={lab.y-9} width="56" height="16" rx="4"
                    fill="rgba(255,255,255,0.92)" />
                  <text x={lab.x} y={lab.y+1} textAnchor="middle" dominantBaseline="middle"
                    fontSize="10" fontWeight="600"
                    fontFamily="-apple-system,BlinkMacSystemFont,sans-serif"
                    fill="#1a1a1a">
                    {formatMetersShort(distance)}
                  </text>
                </>
              )}
            </g>
          );
        })()}

        {/* ── Named points (A, B, C) ── */}
        {svgPts.map(p => (
          <g key={p.label}>
            <circle cx={p.sx} cy={p.sy} r="14" fill={p.color} opacity="0.14" />
            <circle cx={p.sx} cy={p.sy} r="9"  fill={p.color} />
            {/* Sub-label (A/B/C letter always in the dot) */}
            <text x={p.sx} y={p.sy}
              textAnchor="middle" dominantBaseline="middle"
              fontSize="9" fontWeight="800"
              fontFamily="-apple-system,BlinkMacSystemFont,sans-serif"
              fill="#ffffff">
              {p.sublabel ?? p.label}
            </text>
            {/* Custom label above the dot (if different from sublabel) */}
            {p.sublabel && p.label !== p.sublabel && (
              <text x={p.sx} y={p.sy - 16}
                textAnchor="middle" dominantBaseline="middle"
                fontSize="8.5" fontWeight="600"
                fontFamily="-apple-system,BlinkMacSystemFont,sans-serif"
                fill={p.color}>
                {p.label}
              </text>
            )}
          </g>
        ))}

        {/* ── Live position ── */}
        {svgCur && scaleDefined && (
          <g>
            <circle cx={svgCur.sx} cy={svgCur.sy} r="8" fill="none" stroke="#22c55e" strokeWidth="2">
              <animate attributeName="r"       values="8;20;8"   dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx={svgCur.sx} cy={svgCur.sy} r="5" fill="none" stroke="#22c55e" strokeWidth="1.5">
              <animate attributeName="r"       values="5;14;5"   dur="2s" begin="0.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" begin="0.4s" repeatCount="indefinite" />
            </circle>
            <circle cx={svgCur.sx} cy={svgCur.sy} r="4" fill="#22c55e" />
            <circle cx={svgCur.sx} cy={svgCur.sy} r="2" fill="#ffffff" opacity="0.8" />
          </g>
        )}

        {/* ── North arrow ── */}
        <g transform="translate(20,26)">
          <line x1="0" y1="10" x2="0" y2="-2" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
          <polygon points="0,-8 -4,0 0,-2 4,0" fill="#475569" />
          <text x="0" y="20" textAnchor="middle"
            fontSize="9" fontWeight="700"
            fontFamily="-apple-system,BlinkMacSystemFont,sans-serif"
            fill="#475569">N</text>
        </g>

        {/* ── Scale bar ── */}
        {scaleDefined && (
          <g>
            <line x1={sbX} y1={sbY} x2={sbX+sbPx} y2={sbY}
              stroke="#475569" strokeWidth="2" strokeLinecap="round" />
            <line x1={sbX}      y1={sbY-4} x2={sbX}      y2={sbY+4} stroke="#475569" strokeWidth="1.5" />
            <line x1={sbX+sbPx} y1={sbY-4} x2={sbX+sbPx} y2={sbY+4} stroke="#475569" strokeWidth="1.5" />
            <text x={sbX+sbPx/2} y={sbY-7} textAnchor="middle"
              fontSize="9" fontWeight="500"
              fontFamily="-apple-system,BlinkMacSystemFont,sans-serif"
              fill="#475569">
              {formatMetersShort(sbM)}
            </text>
          </g>
        )}

        {/* ── Single-point hint ── */}
        {!scaleDefined && svgPts.length === 1 && (
          <text x={W/2} y={H-14} textAnchor="middle"
            fontSize="10"
            fontFamily="-apple-system,BlinkMacSystemFont,sans-serif"
            fill="#475569">
            Move to next location, then save Point B
          </text>
        )}

      </svg>
    </div>
  );
}
