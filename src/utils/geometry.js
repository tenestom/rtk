/**
 * 2-D geometry utilities for the Sweep feature.
 */

// ── Corridor rectangle ────────────────────────────────────────────────
/**
 * Generate a coverage corridor rectangle (4 vertices) between two positions.
 * The rectangle is centred on the line segment, with width perpendicular to it.
 *
 * @param {number} x1,y1 - previous position in local metres
 * @param {number} x2,y2 - current position in local metres
 * @param {number} width  - total corridor width in metres
 * @returns {[[number,number]]} 4 vertices [[x,y]…] or null if too short
 */
export function corridorRect(x1, y1, x2, y2, width) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) return null;
  const hw = width / 2;
  const px = (-dy / len) * hw;
  const py = ( dx / len) * hw;
  return [
    [x1 + px, y1 + py],
    [x1 - px, y1 - py],
    [x2 - px, y2 - py],
    [x2 + px, y2 + py],
  ];
}

// ── Polygon area (Shoelace) ───────────────────────────────────────────
/**
 * @param {Array<{x:number,y:number}>} pts
 * @returns {number} area in m² (or whatever unit the coords use)
 */
export function polygonAreaM(pts) {
  const n = pts.length;
  if (n < 3) return 0;
  let a = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a) / 2;
}

/** Area of a 4-vertex corridor polygon (via Shoelace). */
export function rectAreaM(rect) {
  const n = rect.length;
  let a = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += rect[i][0] * rect[j][1] - rect[j][0] * rect[i][1];
  }
  return Math.abs(a) / 2;
}

/** Format m² → m² or ha */
export function formatArea(m2) {
  if (m2 < 1000)   return `${m2.toFixed(0)} m²`;
  if (m2 < 10_000) return `${(m2 / 10_000).toFixed(3)} ha`;
  return `${(m2 / 10_000).toFixed(2)} ha`;
}

// ── Viewport ──────────────────────────────────────────────────────────
/**
 * Compute an SVG viewport transform from a set of local-metre points.
 *
 * @param {Array<{x,y}>} pts
 * @param {number} W,H - SVG canvas dimensions
 * @param {number} PAD - pixel padding
 * @returns {{scale, minX, minY, toPixel:(x,y)=>{px,py}}}
 */
export function makeViewport(pts, W = 400, H = 340, PAD = 28) {
  if (pts.length === 0) return null;
  let minX = pts[0].x, maxX = pts[0].x;
  let minY = pts[0].y, maxY = pts[0].y;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const MIN = 10; // minimum range in metres
  if (maxX - minX < MIN) { const cx = (maxX + minX) / 2; minX = cx - MIN / 2; maxX = cx + MIN / 2; }
  if (maxY - minY < MIN) { const cy = (maxY + minY) / 2; minY = cy - MIN / 2; maxY = cy + MIN / 2; }

  const innerW = W - 2 * PAD, innerH = H - 2 * PAD;
  const scale  = Math.min(innerW / (maxX - minX), innerH / (maxY - minY));
  const drawW  = (maxX - minX) * scale, drawH = (maxY - minY) * scale;
  const ox     = PAD + (innerW - drawW) / 2;
  const oy     = PAD + (innerH - drawH) / 2;

  return {
    scale, minX, minY, maxX, maxY,
    toPixel: (x, y) => ({
      px: ox + (x - minX) * scale,
      py: H - oy - (y - minY) * scale,  // north = up → flip Y
    }),
  };
}

/** Pick a nice round scale-bar length (metres) that renders at ~55–90px. */
export function niceScale(pixelsPerMeter) {
  const candidates = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  for (const d of candidates) { if (d * pixelsPerMeter >= 55) return d; }
  return candidates[candidates.length - 1];
}
