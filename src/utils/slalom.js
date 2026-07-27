/**
 * IWWF Official Slalom Course Specification
 * Source: International Waterski & Wakeboard Federation official rule book
 * Reference: https://thinkwaterski.com/dox/Waterski-slalom-course.pdf
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
 *   cx = across-course (+ = right, − = left)
 *   cy = along-course  (+ = north toward exit gate; 0 = entry gate line)
 */

import { toLocalMeters, haversine } from './geo.js';

// ── Official IWWF dimensions (metres) ─────────────────────────────────
// All values from official IWWF rule book / homologation specification.
export const IWWF = {
  // Longitudinal measurements
  A:    27.0,     // Entry/exit gate → first/last interior boat guide pair
  B:    41.0,     // Between consecutive interior boat guide pairs
  T:   259.0,     // Total course length: entry gate → exit gate
  H:    55.0,     // Pre-gate → entry/exit gate (along course, outward)

  // Lateral measurements
  E:     1.25,    // Half-width of entry/exit gate (centre line → gate buoy)
  F:    11.5,     // Centre line → skier buoy (lateral distance)
  G:     1.15,    // Half-width of boat guide / pre-gate channel

  // Diagonal measurements
  C:    29.347,   // Diagonal: entry gate → first skier buoy
  D:    47.011,   // Diagonal: one skier buoy → next skier buoy (opposite side)

  // ── Tolerances (max absolute error for each buoy type) ───────────────
  // Source: IWWF official tolerances (percentage of nominal value).
  TOL_E:   1.25   * 0.05,   // ±5%   = 0.0625 m  (gate half-width)
  TOL_F:  11.5    * 0.01,   // ±1%   = 0.115  m  (skier buoy lateral)
  TOL_G:   1.15   * 0.10,   // ±10%  = 0.115  m  (boat guide / pre-gate half-width)
  TOL_A:  27.0    * 0.005,  // ±0.5% = 0.135  m  (gate → first boat guide)
  TOL_B:  41.0    * 0.005,  // ±0.5% = 0.205  m  (between boat guides)
  TOL_C:  29.347  * 0.005,  // ±0.5% = 0.1467 m  (diagonal: gate → skier 1)
  TOL_D:  47.011  * 0.005,  // ±0.5% = 0.2351 m  (diagonal: skier → skier)
  TOL_T:  259.0   * 0.0025, // ±0.25% = 0.6475 m (total course length)
  TOL_H:  55.0    * 0.005,  // ±0.5% = 0.275  m  (pre-gate distance)
};

// ── Derived along-course positions ────────────────────────────────────
//
// C (29.347 m) and D (47.011 m) are DIAGONAL distances.
// The along-course (longitudinal) distances are derived using Pythagoras:
//
//   Skier 1 along-course cy₁ = √(C² − F²)
//                            = √(29.347² − 11.5²)
//                            = √(861.246 − 132.25)
//                            = √728.996 ≈ 26.9999 ≈ 27.0 m
//
//   Skier-to-skier along-course Δcy = √(D² − (2F)²)
//                                   = √(47.011² − 23²)
//                                   = √(2210.034 − 529)
//                                   = √1681.034 ≈ 41.000 m  (= B exactly)
//
// So skier buoy along-course positions are:
//   cy_s1 ≈ 27.0 m  (effectively A)
//   cy_s2 = cy_s1 + B = 68.0 m
//   cy_s3 = cy_s1 + 2B = 109.0 m
//   cy_s4 = cy_s1 + 3B = 150.0 m
//   cy_s5 = cy_s1 + 4B = 191.0 m
//   cy_s6 = cy_s1 + 5B = 232.0 m
//
// The longitudinal position derived from C/D matches A and B exactly,
// confirming that the skier buoys are longitudinally aligned with the
// boat guide pairs (both at multiples of A and B from the entry gate).
//
// We store the exact irrational values for maximum accuracy:
const CY_S1 = Math.sqrt(IWWF.C * IWWF.C - IWWF.F * IWWF.F); // ≈ 26.9999 m
const DS_LON = Math.sqrt(IWWF.D * IWWF.D - (2*IWWF.F)*(2*IWWF.F)); // ≈ 41.000 m

// ── Buoy colour palette ───────────────────────────────────────────────
// IWWF: entry/exit gates & skier buoys = red/orange; boat guides = yellow;
// pre-gates = green (recommended contrasting colour).
const C_RED = '#ef4444';  // Entry/exit gates + skier buoys
const C_YEL = '#eab308';  // Interior boat guide pairs
const C_GRN = '#22c55e';  // Pre-gate pairs (alignment gates)

// ── Schematic pixel positions ─────────────────────────────────────────
// All 26 buoy positions are derived from the course-frame (cx, cy) using a
// linear transform so the diagram is geometrically accurate:
//
//   SY_ENTRY = 557  (entry gate row in the 640px viewBox)
//   SY_EXIT  =  75  (exit gate row)
//   PX_PER_M = (557 − 75) / 259 ≈ 1.8919 px / metre  (along-course)
//
// Lateral scaling uses the skier buoy distance (F = 11.5m maps to 90px):
//   PX_PER_M_LAT = 90 / 11.5 ≈ 7.826 px / m
//   Centre: sx = 150; gate E=1.25m → ±10px; boat G=1.15m → ±9px; skier F=11.5m → ±90px
//
// Pre-gates lie outside the 640px viewBox (H=55m → 104px south of entry gate).
// They are clamped to y=630 in the diagram for visual inclusion.

const _SY0  = 557;                       // entry gate y
const _KY   = (557 - 75) / 259;          // px per metre along course
const _KX   = 90 / 11.5;                 // px per metre lateral

function _s(cx, cy) {
  const sy = _SY0 - cy * _KY;
  return { sx: Math.round(150 + cx * _KX), sy: Math.round(sy) };
}

// Pre-gate y is clamped to stay inside the viewBox
const _SY_PREGATE_S = Math.min(630, Math.round(_SY0 + IWWF.H * _KY));
const _SY_PREGATE_N = Math.max(  9, Math.round(_SY0 - (IWWF.T + IWWF.H) * _KY));

// Derived CY_S1 for the S[] table (must match slalom.js value)
const _CY_S1 = Math.sqrt(IWWF.C * IWWF.C - IWWF.F * IWWF.F);
const _DS_LON = Math.sqrt(IWWF.D * IWWF.D - (2 * IWWF.F) * (2 * IWWF.F));

const S = {
   1: _s(+IWWF.E,  0),
   2: _s(-IWWF.E,  0),
   3: { ..._s(+IWWF.G, 0), sy: _SY_PREGATE_S },   // pre-gate south (clamped)
   4: { ..._s(-IWWF.G, 0), sy: _SY_PREGATE_S },
   5: _s(+IWWF.F,  _CY_S1),
   6: _s(-IWWF.F,  _CY_S1 + _DS_LON),
   7: _s(+IWWF.F,  _CY_S1 + _DS_LON * 2),
   8: _s(-IWWF.F,  _CY_S1 + _DS_LON * 3),
   9: _s(+IWWF.F,  _CY_S1 + _DS_LON * 4),
  10: _s(-IWWF.F,  _CY_S1 + _DS_LON * 5),
  11: _s(+IWWF.G,  IWWF.A),
  12: _s(-IWWF.G,  IWWF.A),
  13: _s(+IWWF.G,  IWWF.A + IWWF.B),
  14: _s(-IWWF.G,  IWWF.A + IWWF.B),
  15: _s(+IWWF.G,  IWWF.A + IWWF.B * 2),
  16: _s(-IWWF.G,  IWWF.A + IWWF.B * 2),
  17: _s(+IWWF.G,  IWWF.A + IWWF.B * 3),
  18: _s(-IWWF.G,  IWWF.A + IWWF.B * 3),
  19: _s(+IWWF.G,  IWWF.A + IWWF.B * 4),
  20: _s(-IWWF.G,  IWWF.A + IWWF.B * 4),
  21: _s(+IWWF.G,  IWWF.A + IWWF.B * 5),
  22: _s(-IWWF.G,  IWWF.A + IWWF.B * 5),
  23: _s(+IWWF.E,  IWWF.T),
  24: _s(-IWWF.E,  IWWF.T),
  25: { ..._s(+IWWF.G, IWWF.T), sy: _SY_PREGATE_N },  // pre-gate north (clamped)
  26: { ..._s(-IWWF.G, IWWF.T), sy: _SY_PREGATE_N },
};

// ── Complete buoy definitions ─────────────────────────────────────────
// cx/cy = course-frame coordinates (metres):
//   cx: from centreline (+ = right)
//   cy: from entry gate (+ = toward exit gate)
//
// tol = position tolerance (metres) used for quality assessment.
// For buoys defined by a diagonal dimension (skier buoys), we use TOL_C
// for skier 1 and TOL_D for skiers 2-6 (each is verified against the
// diagonal from the previous buoy). For simplicity in direct GPS
// comparison we use half the total-course tolerance for the gate positions
// and the buoy-type tolerance for each buoy's nearest measurement.
export const BUOY_DEFS = [
  // ── Entry gate (cy = 0) ──────────────────────────────────────────────
  { id:  1, label: '1',  cx: +IWWF.E,  cy:  0,              color: C_RED, type: 'gate',    tol: IWWF.TOL_E, name: 'Entry gate R' },
  { id:  2, label: '2',  cx: -IWWF.E,  cy:  0,              color: C_RED, type: 'gate',    tol: IWWF.TOL_E, name: 'Entry gate L' },

  // ── Pre-gate south (H=55m south of entry gate, cy negative) ──────────
  { id:  3, label: '3',  cx: +IWWF.G,  cy: -IWWF.H,         color: C_GRN, type: 'pregate', tol: IWWF.TOL_H,  name: 'Pre-gate S R' },
  { id:  4, label: '4',  cx: -IWWF.G,  cy: -IWWF.H,         color: C_GRN, type: 'pregate', tol: IWWF.TOL_H,  name: 'Pre-gate S L' },

  // ── Skier buoys (F = 11.5m from centreline, alternating sides) ───────
  // Along-course positions derived from diagonals C and D:
  //   cy_s1 = √(C²−F²) ≈ 27.000 m
  //   cy_s{n} = cy_s1 + (n−1) × √(D²−(2F)²) ≈ cy_s1 + (n−1)×41.000 m
  { id:  5, label: '5',  cx: +IWWF.F,  cy:  CY_S1,               color: C_RED, type: 'skier', tol: IWWF.TOL_F, name: 'Skier 1 R' },
  { id:  6, label: '6',  cx: -IWWF.F,  cy:  CY_S1 + DS_LON,      color: C_RED, type: 'skier', tol: IWWF.TOL_F, name: 'Skier 2 L' },
  { id:  7, label: '7',  cx: +IWWF.F,  cy:  CY_S1 + DS_LON*2,    color: C_RED, type: 'skier', tol: IWWF.TOL_F, name: 'Skier 3 R' },
  { id:  8, label: '8',  cx: -IWWF.F,  cy:  CY_S1 + DS_LON*3,    color: C_RED, type: 'skier', tol: IWWF.TOL_F, name: 'Skier 4 L' },
  { id:  9, label: '9',  cx: +IWWF.F,  cy:  CY_S1 + DS_LON*4,    color: C_RED, type: 'skier', tol: IWWF.TOL_F, name: 'Skier 5 R' },
  { id: 10, label: '10', cx: -IWWF.F,  cy:  CY_S1 + DS_LON*5,    color: C_RED, type: 'skier', tol: IWWF.TOL_F, name: 'Skier 6 L' },

  // ── Interior boat guide pairs (G = 1.15m from centreline) ────────────
  // Pair 1 at cy=A, pairs 2-6 at cy=A+B, A+2B, … A+5B.
  // Layout: entry gate at 0, first guide at A=27m, then B=41m between guides,
  // last guide at A+5B=232m, exit gate at T=259m (= 232+27m ✓).
  { id: 11, label: '11', cx: +IWWF.G,  cy:  IWWF.A,              color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat guide 1 R' },
  { id: 12, label: '12', cx: -IWWF.G,  cy:  IWWF.A,              color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat guide 1 L' },
  { id: 13, label: '13', cx: +IWWF.G,  cy:  IWWF.A + IWWF.B,    color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat guide 2 R' },
  { id: 14, label: '14', cx: -IWWF.G,  cy:  IWWF.A + IWWF.B,    color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat guide 2 L' },
  { id: 15, label: '15', cx: +IWWF.G,  cy:  IWWF.A + IWWF.B*2,  color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat guide 3 R' },
  { id: 16, label: '16', cx: -IWWF.G,  cy:  IWWF.A + IWWF.B*2,  color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat guide 3 L' },
  { id: 17, label: '17', cx: +IWWF.G,  cy:  IWWF.A + IWWF.B*3,  color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat guide 4 R' },
  { id: 18, label: '18', cx: -IWWF.G,  cy:  IWWF.A + IWWF.B*3,  color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat guide 4 L' },
  { id: 19, label: '19', cx: +IWWF.G,  cy:  IWWF.A + IWWF.B*4,  color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat guide 5 R' },
  { id: 20, label: '20', cx: -IWWF.G,  cy:  IWWF.A + IWWF.B*4,  color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat guide 5 L' },
  { id: 21, label: '21', cx: +IWWF.G,  cy:  IWWF.A + IWWF.B*5,  color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat guide 6 R' },
  { id: 22, label: '22', cx: -IWWF.G,  cy:  IWWF.A + IWWF.B*5,  color: C_YEL, type: 'boat',  tol: IWWF.TOL_G, name: 'Boat guide 6 L' },

  // ── Exit gate (cy = T = 259m) ─────────────────────────────────────────
  { id: 23, label: '23', cx: +IWWF.E,  cy:  IWWF.T,              color: C_RED, type: 'gate',    tol: IWWF.TOL_E, name: 'Exit gate R' },
  { id: 24, label: '24', cx: -IWWF.E,  cy:  IWWF.T,              color: C_RED, type: 'gate',    tol: IWWF.TOL_E, name: 'Exit gate L' },

  // ── Pre-gate north (H=55m north of exit gate, cy > T) ────────────────
  { id: 25, label: '25', cx: +IWWF.G,  cy:  IWWF.T + IWWF.H,    color: C_GRN, type: 'pregate', tol: IWWF.TOL_H, name: 'Pre-gate N R' },
  { id: 26, label: '26', cx: -IWWF.G,  cy:  IWWF.T + IWWF.H,    color: C_GRN, type: 'pregate', tol: IWWF.TOL_H, name: 'Pre-gate N L' },
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
 */
export function buildCourseTransform(posRefDef, posRefGPS, angleRefDef, angleRefGPS) {
  const MPD_LAT = 111_320;
  const MPD_LON = Math.cos((posRefGPS.lat * Math.PI) / 180) * 111_320;

  const dE  = (angleRefGPS.lon - posRefGPS.lon) * MPD_LON;
  const dN  = (angleRefGPS.lat - posRefGPS.lat) * MPD_LAT;
  const dx_c = angleRefDef.cx - posRefDef.cx;
  const dy_c = angleRefDef.cy - posRefDef.cy;

  const theta  = Math.atan2(dE, dN) - Math.atan2(dx_c, dy_c);
  const cos_t  = Math.cos(theta);
  const sin_t  = Math.sin(theta);

  const posref_E = posRefDef.cx * cos_t + posRefDef.cy * sin_t;
  const posref_N = -posRefDef.cx * sin_t + posRefDef.cy * cos_t;
  const originLat = posRefGPS.lat - posref_N / MPD_LAT;
  const originLon = posRefGPS.lon - posref_E / MPD_LON;

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

/** Format error in cm/mm with one decimal. */
export function formatError(meters) {
  if (meters < 0.01) return `${(meters * 1000).toFixed(0)} mm`;
  return `${(meters * 100).toFixed(1)} cm`;
}
