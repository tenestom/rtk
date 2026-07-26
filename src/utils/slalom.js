/**
 * IWWF Official Slalom Course Specification
 * Source: International Waterski & Wakeboard Federation
 *
 * Buoy numbering (1–26, south to north):
 *  1  = Entry gate right (default position reference)
 *  2  = Entry gate left
 *  3  = Pre-gate south right
 *  4  = Pre-gate south left
 *  5  = Skier buoy 1 (right)
 *  6  = Skier buoy 2 (left)
 *  7  = Skier buoy 3 (right)
 *  8  = Skier buoy 4 (left)
 *  9  = Skier buoy 5 (right)
 *  10 = Skier buoy 6 (left)
 *  11 = Boat guide 1 right … 22 = Boat guide 6 left
 *  23 = Exit gate right (recommended angle reference)
 *  24 = Exit gate left
 *  25 = Pre-gate north right
 *  26 = Pre-gate north left
 *
 * Course coordinate system:
 *   cx = across-course (+ = right / east-ish, − = left / west-ish)
 *   cy = along-course  (+ = north toward exit gate; 0 = entry gate line)
 */

import { toLocalMeters, haversine } from './geo.js';

// ── Official dimensions (all in metres) ──────────────────────────────
export const IWWF = {
  E:   1.25,    // half-width of entry/exit gate (from centreline)
  G:   1.15,    // half-width of boat-guide / pre-gate channel
  F:  11.5,     // skier buoy lateral distance from centreline
  A:  27.0,     // entry gate → first boat-guide pair (along course)
  B:  41.0,     // boat-guide pair → next pair (along course)
  C:  29.347,   // entry gate → first skier buoy (along course)
  PRE: 55.0,    // entry/exit gate → pre-gate pair (along course, outward)
  LEN: 259.0,   // total course length: entry gate → exit gate

  // Tolerances (max absolute error allowed for each dimension)
  TOL_E:   1.25  * 0.05,   // ±5%   = 0.063 m  ← strictest
  TOL_F:  11.5   * 0.01,   // ±1%   = 0.115 m
  TOL_G:   1.15  * 0.10,   // ±10%  = 0.115 m
  TOL_A:  27.0   * 0.005,  // ±0.5% = 0.135 m
  TOL_B:  41.0   * 0.005,  // ±0.5% = 0.205 m
  TOL_C:  29.347 * 0.005,  // ±0.5% = 0.147 m
  TOL_PRE: 0.275,           // ±0.275 m (distance), ±0.115 m (width)
};

// ── Buoy colour palette ───────────────────────────────────────────────
// IWWF: skier/gate = red, boat guides = yellow, pre-gates = green
const C_RED   = '#ef4444';
const C_YEL   = '#eab308';
const C_GRN   = '#22c55e';

// ── Schematic (diagram) screen positions ──────────────────────────────
// Fixed pixel coords inside viewBox "0 0 300 640". North = top (small sy).
const S = {
   1: { sx: 172, sy: 557 },  // entry gate right
   2: { sx: 128, sy: 557 },  // entry gate left
   3: { sx: 167, sy: 613 },  // pre-gate south right
   4: { sx: 133, sy: 613 },  // pre-gate south left
   5: { sx: 248, sy: 492 },  // skier 1 right
   6: { sx:  52, sy: 420 },  // skier 2 left
   7: { sx: 248, sy: 348 },  // skier 3 right
   8: { sx:  52, sy: 276 },  // skier 4 left
   9: { sx: 248, sy: 204 },  // skier 5 right
  10: { sx:  52, sy: 132 },  // skier 6 left
  11: { sx: 165, sy: 512 },  // boat 1 right
  12: { sx: 135, sy: 512 },  // boat 1 left
  13: { sx: 165, sy: 440 },  // boat 2 right
  14: { sx: 135, sy: 440 },  // boat 2 left
  15: { sx: 165, sy: 368 },  // boat 3 right
  16: { sx: 135, sy: 368 },  // boat 3 left
  17: { sx: 165, sy: 296 },  // boat 4 right
  18: { sx: 135, sy: 296 },  // boat 4 left
  19: { sx: 165, sy: 224 },  // boat 5 right
  20: { sx: 135, sy: 224 },  // boat 5 left
  21: { sx: 165, sy: 152 },  // boat 6 right
  22: { sx: 135, sy: 152 },  // boat 6 left
  23: { sx: 172, sy:  75 },  // exit gate right
  24: { sx: 128, sy:  75 },  // exit gate left
  25: { sx: 167, sy:  22 },  // pre-gate north right
  26: { sx: 133, sy:  22 },  // pre-gate north left
};

// ── Complete buoy definitions ─────────────────────────────────────────
// cx/cy = course-frame coordinates (metres)
// tol   = position tolerance (metres) — smallest applicable IWWF dimension
// color = IWWF buoy colour
export const BUOY_DEFS = [
  // Entry gate
  { id:  1, label: '1',  cx: +IWWF.E, cy:   0,        color: C_RED, type: 'gate',    tol: IWWF.TOL_E, name: 'Entry gate R' },
  { id:  2, label: '2',  cx: -IWWF.E, cy:   0,        color: C_RED, type: 'gate',    tol: IWWF.TOL_E, name: 'Entry gate L' },
  // Pre-gate south (south of entry gate → negative cy)
  { id:  3, label: '3',  cx: +IWWF.G, cy: -IWWF.PRE,  color: C_GRN, type: 'pregate', tol: IWWF.TOL_G,  name: 'Pre-gate S R' },
  { id:  4, label: '4',  cx: -IWWF.G, cy: -IWWF.PRE,  color: C_GRN, type: 'pregate', tol: IWWF.TOL_G,  name: 'Pre-gate S L' },
  // Skier buoys (alternating sides)
  { id:  5, label: '5',  cx: +IWWF.F, cy:  IWWF.C,              color: C_RED, type: 'skier', tol: IWWF.TOL_F, name: 'Skier 1 R' },
  { id:  6, label: '6',  cx: -IWWF.F, cy:  IWWF.C + IWWF.B,    color: C_RED, type: 'skier', tol: IWWF.TOL_F, name: 'Skier 2 L' },
  { id:  7, label: '7',  cx: +IWWF.F, cy:  IWWF.C + IWWF.B*2,  color: C_RED, type: 'skier', tol: IWWF.TOL_F, name: 'Skier 3 R' },
  { id:  8, label: '8',  cx: -IWWF.F, cy:  IWWF.C + IWWF.B*3,  color: C_RED, type: 'skier', tol: IWWF.TOL_F, name: 'Skier 4 L' },
  { id:  9, label: '9',  cx: +IWWF.F, cy:  IWWF.C + IWWF.B*4,  color: C_RED, type: 'skier', tol: IWWF.TOL_F, name: 'Skier 5 R' },
  { id: 10, label: '10', cx: -IWWF.F, cy:  IWWF.C + IWWF.B*5,  color: C_RED, type: 'skier', tol: IWWF.TOL_F, name: 'Skier 6 L' },
  // Boat guide pairs (6 pairs)
  { id: 11, label: '11', cx: +IWWF.G, cy:  IWWF.A,              color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat 1 R' },
  { id: 12, label: '12', cx: -IWWF.G, cy:  IWWF.A,              color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat 1 L' },
  { id: 13, label: '13', cx: +IWWF.G, cy:  IWWF.A + IWWF.B,    color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat 2 R' },
  { id: 14, label: '14', cx: -IWWF.G, cy:  IWWF.A + IWWF.B,    color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat 2 L' },
  { id: 15, label: '15', cx: +IWWF.G, cy:  IWWF.A + IWWF.B*2,  color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat 3 R' },
  { id: 16, label: '16', cx: -IWWF.G, cy:  IWWF.A + IWWF.B*2,  color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat 3 L' },
  { id: 17, label: '17', cx: +IWWF.G, cy:  IWWF.A + IWWF.B*3,  color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat 4 R' },
  { id: 18, label: '18', cx: -IWWF.G, cy:  IWWF.A + IWWF.B*3,  color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat 4 L' },
  { id: 19, label: '19', cx: +IWWF.G, cy:  IWWF.A + IWWF.B*4,  color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat 5 R' },
  { id: 20, label: '20', cx: -IWWF.G, cy:  IWWF.A + IWWF.B*4,  color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat 5 L' },
  { id: 21, label: '21', cx: +IWWF.G, cy:  IWWF.A + IWWF.B*5,  color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat 6 R' },
  { id: 22, label: '22', cx: -IWWF.G, cy:  IWWF.A + IWWF.B*5,  color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat 6 L' },
  // Exit gate
  { id: 23, label: '23', cx: +IWWF.E, cy:  IWWF.LEN,             color: C_RED, type: 'gate',    tol: IWWF.TOL_E, name: 'Exit gate R' },
  { id: 24, label: '24', cx: -IWWF.E, cy:  IWWF.LEN,             color: C_RED, type: 'gate',    tol: IWWF.TOL_E, name: 'Exit gate L' },
  // Pre-gate north (north of exit gate → cy > LEN)
  { id: 25, label: '25', cx: +IWWF.G, cy:  IWWF.LEN + IWWF.PRE, color: C_GRN, type: 'pregate', tol: IWWF.TOL_G,  name: 'Pre-gate N R' },
  { id: 26, label: '26', cx: -IWWF.G, cy:  IWWF.LEN + IWWF.PRE, color: C_GRN, type: 'pregate', tol: IWWF.TOL_G,  name: 'Pre-gate N L' },
];

// Add schematic positions
BUOY_DEFS.forEach(b => { b.sx = S[b.id].sx; b.sy = S[b.id].sy; });

// Quick lookup by id
export const BUOY_BY_ID = Object.fromEntries(BUOY_DEFS.map(b => [b.id, b]));

// ── Course transform builder ──────────────────────────────────────────
/**
 * Build a function that converts course-frame (cx, cy) to GPS {lat, lon}.
 *
 * Maths:
 *   θ = rotation that maps course frame → world (east/north) frame
 *   θ = atan2(dE, dN)[GPS vector] − atan2(dx_c, dy_c)[course vector]
 *
 *   For the common case (posRef=buoy1, angleRef=buoy23):
 *   dx_c = 0, so θ = atan2(dE, dN) = GPS bearing between the two gates.
 */
export function buildCourseTransform(posRefDef, posRefGPS, angleRefDef, angleRefGPS) {
  const MPD_LAT = 111_320;
  const MPD_LON = Math.cos((posRefGPS.lat * Math.PI) / 180) * 111_320;

  // GPS vector (posRef → angleRef) in world metres
  const dE = (angleRefGPS.lon - posRefGPS.lon) * MPD_LON;
  const dN = (angleRefGPS.lat - posRefGPS.lat) * MPD_LAT;

  // Course-frame vector between the same two buoys
  const dx_c = angleRefDef.cx - posRefDef.cx;
  const dy_c = angleRefDef.cy - posRefDef.cy;

  // Rotation angle: world bearing − course bearing
  const theta = Math.atan2(dE, dN) - Math.atan2(dx_c, dy_c);
  const cos_t = Math.cos(theta);
  const sin_t = Math.sin(theta);

  // GPS of course-frame origin (0, 0) — the centreline at the entry gate level
  const posref_E_from_origin = posRefDef.cx * cos_t + posRefDef.cy * sin_t;
  const posref_N_from_origin = -posRefDef.cx * sin_t + posRefDef.cy * cos_t;
  const originLat = posRefGPS.lat - posref_N_from_origin / MPD_LAT;
  const originLon = posRefGPS.lon - posref_E_from_origin / MPD_LON;

  /**
   * @param {number} cx  across-course metres
   * @param {number} cy  along-course metres
   * @returns {{ lat: number, lon: number }}
   */
  return function courseToGPS(cx, cy) {
    const east  =  cx * cos_t + cy * sin_t;
    const north = -cx * sin_t + cy * cos_t;
    return {
      lat: originLat + north / MPD_LAT,
      lon: originLon + east  / MPD_LON,
    };
  };
}

// ── Status calculation ────────────────────────────────────────────────
/**
 * @param {{ lat, lon }} measured
 * @param {{ lat, lon }} theoretical
 * @param {number} tolerance  metres
 * @returns {{ error: number, status: 'ok'|'warn'|'bad' }}
 */
export function computeStatus(measured, theoretical, tolerance) {
  const error = haversine(measured.lat, measured.lon, theoretical.lat, theoretical.lon);
  const status = error < tolerance * 0.8 ? 'ok'
               : error < tolerance        ? 'warn'
               : 'bad';
  return { error, status };
}

/** Format error in cm with one decimal. */
export function formatError(meters) {
  if (meters < 0.01) return `${(meters * 1000).toFixed(0)} mm`;
  return `${(meters * 100).toFixed(1)} cm`;
}
