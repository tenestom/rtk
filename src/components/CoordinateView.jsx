import { toLocalMeters, formatMetersShort, niceScaleBarMeters } from '../utils/geo';

// SVG canvas dimensions (virtual, scales with CSS)
const W = 400;
const H = 300;
const PAD = 36; // inner padding in SVG units

/**
 * CoordinateView — reusable SVG map component.
 *
 * Props:
 *   points       – Array of { lat, lon, label, color }
 *                  Named points to plot (e.g. Point A, Point B, gate markers, …)
 *   currentPos   – { lat, lon } | null   Live GPS position (pulsing dot)
 *                  Shown only when points.length >= 2 (scale is defined).
 *   distance     – number | null         Distance in metres shown on the A→B line
 *
 * Coordinate system: north is up, east is right.
 * Projection: flat-earth Cartesian (accurate for short distances < few km).
 */
export default function CoordinateView({ points = [], currentPos = null, distance = null }) {
  // ── Collect all geographic points for bounding-box computation ──────────────
  const scaleDefined = points.length >= 2;
  const geoForBounds = [
    ...points,
    ...(scaleDefined && currentPos ? [currentPos] : []),
  ];

  // ── Empty state ─────────────────────────────────────────────────────────────
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

  // ── Reference centroid ──────────────────────────────────────────────────────
  const centerLat = geoForBounds.reduce((s, p) => s + p.lat, 0) / geoForBounds.length;
  const centerLon = geoForBounds.reduce((s, p) => s + p.lon, 0) / geoForBounds.length;

  // ── Convert everything to local metres (x = east, y = north) ───────────────
  const toM = (lat, lon) => toLocalMeters(lat, lon, centerLat, centerLon);

  const namedM = points.map((p) => ({ ...p, ...toM(p.lat, p.lon) }));
  const curM   = scaleDefined && currentPos ? toM(currentPos.lat, currentPos.lon) : null;

  const allM = [...namedM, ...(curM ? [curM] : [])];

  // ── Bounding box ─────────────────────────────────────────────────────────────
  let minX = Math.min(...allM.map((p) => p.x));
  let maxX = Math.max(...allM.map((p) => p.x));
  let minY = Math.min(...allM.map((p) => p.y));
  let maxY = Math.max(...allM.map((p) => p.y));

  // Enforce a minimum range so a single point (or two identical points) isn't
  // squished to a singularity. 4 m is a reasonable minimum for RTK work.
  const MIN_RANGE = 4;
  if (maxX - minX < MIN_RANGE) {
    const cx = (maxX + minX) / 2;
    minX = cx - MIN_RANGE / 2;
    maxX = cx + MIN_RANGE / 2;
  }
  if (maxY - minY < MIN_RANGE) {
    const cy = (maxY + minY) / 2;
    minY = cy - MIN_RANGE / 2;
    maxY = cy + MIN_RANGE / 2;
  }

  // ── Scale: fit bounding box into inner SVG area, preserving aspect ratio ────
  const innerW = W - 2 * PAD;
  const innerH = H - 2 * PAD;
  const rangeX = maxX - minX;
  const rangeY = maxY - minY;
  const scale  = Math.min(innerW / rangeX, innerH / rangeY);   // px per metre

  const drawW = rangeX * scale;
  const drawH = rangeY * scale;
  const ox    = PAD + (innerW - drawW) / 2;
  const oy    = PAD + (innerH - drawH) / 2;

  // ── Coordinate → SVG pixel converter ────────────────────────────────────────
  function toSVG(mx, my) {
    return {
      sx: ox + (mx - minX) * scale,
      sy: H - oy - (my - minY) * scale,   // flip Y: north is up
    };
  }

  // ── Pre-compute SVG positions ────────────────────────────────────────────────
  const svgPts = namedM.map((p) => ({ ...p, ...toSVG(p.x, p.y) }));
  const svgCur = curM ? toSVG(curM.x, curM.y) : null;

  // First two named points for the line
  const ptA = svgPts[0];
  const ptB = svgPts[1];
  const hasLine = ptA && ptB;

  // Mid-point & perpendicular offset for the distance label
  let distLabel = null;
  if (hasLine && distance != null) {
    const mx  = (ptA.sx + ptB.sx) / 2;
    const my  = (ptA.sy + ptB.sy) / 2;
    const dx  = ptB.sx - ptA.sx;
    const dy  = ptB.sy - ptA.sy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    distLabel = { x: mx - (dy / len) * 14, y: my + (dx / len) * 14 };
  }

  // ── Scale bar ────────────────────────────────────────────────────────────────
  const scaleBarM  = niceScaleBarMeters(scale);
  const scaleBarPx = scaleBarM * scale;
  const sbX        = W - PAD - scaleBarPx;
  const sbY        = H - 14;

  // ── Subtle grid ─────────────────────────────────────────────────────────────
  // Draw a sparse grid of horizontal + vertical lines (every 10% of inner area)
  const gridLines = [];
  for (let i = 1; i < 5; i++) {
    const frac = i / 5;
    gridLines.push(
      { x1: PAD, y1: PAD + innerH * frac, x2: PAD + innerW, y2: PAD + innerH * frac, key: `h${i}` },
      { x1: PAD + innerW * frac, y1: PAD, x2: PAD + innerW * frac, y2: PAD + innerH, key: `v${i}` },
    );
  }

  return (
    <div className="coord-view">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="coord-view-svg"
        aria-label="Coordinate map"
      >
        {/* ── Background ── */}
        <rect width={W} height={H} fill="#080d1a" rx="14" />

        {/* ── Grid ── */}
        {gridLines.map((l) => (
          <line
            key={l.key}
            x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke="rgba(99,179,237,0.06)" strokeWidth="1"
          />
        ))}

        {/* ── Line A → B ── */}
        {hasLine && (
          <line
            x1={ptA.sx} y1={ptA.sy} x2={ptB.sx} y2={ptB.sy}
            stroke="#94a3b8" strokeWidth="1.5"
            strokeDasharray="5 4" opacity="0.7"
          />
        )}

        {/* ── Distance label on line ── */}
        {distLabel && (
          <>
            <rect
              x={distLabel.x - 28} y={distLabel.y - 9}
              width="56" height="16" rx="4"
              fill="rgba(15,24,41,0.85)"
            />
            <text
              x={distLabel.x} y={distLabel.y + 1}
              textAnchor="middle" dominantBaseline="middle"
              fontSize="10" fontWeight="600"
              fontFamily="-apple-system,BlinkMacSystemFont,sans-serif"
              fill="#cbd5e1"
            >
              {formatMetersShort(distance)}
            </text>
          </>
        )}

        {/* ── Named points (A, B, …) ── */}
        {svgPts.map((p) => (
          <g key={p.label}>
            {/* Outer glow ring */}
            <circle cx={p.sx} cy={p.sy} r="14" fill={p.color} opacity="0.15" />
            {/* Main dot */}
            <circle cx={p.sx} cy={p.sy} r="9" fill={p.color} />
            {/* Label */}
            <text
              x={p.sx} y={p.sy}
              textAnchor="middle" dominantBaseline="middle"
              fontSize="9" fontWeight="800"
              fontFamily="-apple-system,BlinkMacSystemFont,sans-serif"
              fill="#ffffff"
            >
              {p.label}
            </text>
          </g>
        ))}

        {/* ── Live position (only when scale is defined) ── */}
        {svgCur && scaleDefined && (
          <g>
            {/* Animated pulse rings */}
            <circle cx={svgCur.sx} cy={svgCur.sy} r="8" fill="none"
              stroke="#22c55e" strokeWidth="2">
              <animate attributeName="r"       values="8;20;8"   dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx={svgCur.sx} cy={svgCur.sy} r="5" fill="none"
              stroke="#22c55e" strokeWidth="1.5">
              <animate attributeName="r"       values="5;14;5"   dur="2s" begin="0.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" begin="0.4s" repeatCount="indefinite" />
            </circle>
            {/* Solid inner dot */}
            <circle cx={svgCur.sx} cy={svgCur.sy} r="4" fill="#22c55e" />
            <circle cx={svgCur.sx} cy={svgCur.sy} r="2" fill="#ffffff" opacity="0.8" />
          </g>
        )}

        {/* ── North arrow (top-left) ── */}
        <g transform="translate(20, 26)">
          {/* Arrow shaft */}
          <line x1="0" y1="10" x2="0" y2="-2" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
          {/* Arrowhead */}
          <polygon points="0,-8 -4,0 0,-2 4,0" fill="#475569" />
          {/* N label */}
          <text x="0" y="20" textAnchor="middle"
            fontSize="9" fontWeight="700"
            fontFamily="-apple-system,BlinkMacSystemFont,sans-serif"
            fill="#475569">
            N
          </text>
        </g>

        {/* ── Scale bar (bottom-right) ── */}
        {scaleDefined && (
          <g>
            <line
              x1={sbX} y1={sbY} x2={sbX + scaleBarPx} y2={sbY}
              stroke="#475569" strokeWidth="2" strokeLinecap="round"
            />
            <line x1={sbX} y1={sbY - 4} x2={sbX} y2={sbY + 4}
              stroke="#475569" strokeWidth="1.5" />
            <line x1={sbX + scaleBarPx} y1={sbY - 4} x2={sbX + scaleBarPx} y2={sbY + 4}
              stroke="#475569" strokeWidth="1.5" />
            <text
              x={sbX + scaleBarPx / 2} y={sbY - 7}
              textAnchor="middle"
              fontSize="9" fontWeight="500"
              fontFamily="-apple-system,BlinkMacSystemFont,sans-serif"
              fill="#475569"
            >
              {formatMetersShort(scaleBarM)}
            </text>
          </g>
        )}

        {/* ── Single-point hint ── */}
        {!scaleDefined && svgPts.length === 1 && (
          <text
            x={W / 2} y={H - 14}
            textAnchor="middle"
            fontSize="10"
            fontFamily="-apple-system,BlinkMacSystemFont,sans-serif"
            fill="#475569"
          >
            Move to next location, then save Point B
          </text>
        )}
      </svg>
    </div>
  );
}
