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

// ── Inverse course transform ──────────────────────────────────────────
/**
 * Build the inverse of buildCourseTransform:
 * returns gpsToCourse(lat, lon) → {cx, cy} in course-frame metres.
 *
 * Uses the same rotation angle θ and origin as buildCourseTransform.
 * Inverse rotation: [cx,cy] = R^T · [east,north]
 *   cx =  east · cos_t − north · sin_t
 *   cy =  east · sin_t + north · cos_t
 */
export function buildCourseInverseTransform(posRefDef, posRefGPS, angleRefDef, angleRefGPS) {
  const MPD_LAT = 111_320;
  const MPD_LON = Math.cos((posRefGPS.lat * Math.PI) / 180) * 111_320;

  const dE   = (angleRefGPS.lon - posRefGPS.lon) * MPD_LON;
  const dN   = (angleRefGPS.lat - posRefGPS.lat) * MPD_LAT;
  const dx_c = angleRefDef.cx  - posRefDef.cx;
  const dy_c = angleRefDef.cy  - posRefDef.cy;

  const theta  = Math.atan2(dE, dN) - Math.atan2(dx_c, dy_c);
  const cos_t  = Math.cos(theta);
  const sin_t  = Math.sin(theta);

  const posref_E  =  posRefDef.cx * cos_t + posRefDef.cy * sin_t;
  const posref_N  = -posRefDef.cx * sin_t + posRefDef.cy * cos_t;
  const originLat = posRefGPS.lat - posref_N / MPD_LAT;
  const originLon = posRefGPS.lon - posref_E / MPD_LON;

  return function gpsToCourse(lat, lon) {
    const E  = (lon - originLon) * MPD_LON;
    const N  = (lat - originLat) * MPD_LAT;
    return {
      cx:  E * cos_t - N * sin_t,
      cy:  E * sin_t + N * cos_t,
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

// ── IWWF dimension catalog ────────────────────────────────────────────
/**
 * Human-readable definitions of all official IWWF dimensions.
 * Used to populate the "Dimensions" table in the Results tab.
 */
export const IWWF_DIM_DEFS = [
  {
    key: 'E', spec: IWWF.E, tol: IWWF.TOL_E,
    label: 'E — Gate half-width',
    detail: 'Centre line → gate buoy (entry & exit)',
    tolPct: '±5%',
  },
  {
    key: 'G', spec: IWWF.G, tol: IWWF.TOL_G,
    label: 'G — Guide half-width',
    detail: 'Centre line → boat guide buoy (6 pairs)',
    tolPct: '±10%',
  },
  {
    key: 'A', spec: IWWF.A, tol: IWWF.TOL_A,
    label: 'A — Gate → guide 1',
    detail: 'Entry/exit gate to first/last boat guide',
    tolPct: '±0.5%',
  },
  {
    key: 'B', spec: IWWF.B, tol: IWWF.TOL_B,
    label: 'B — Guide spacing',
    detail: 'Between consecutive boat guide pairs (5 gaps)',
    tolPct: '±0.5%',
  },
  {
    key: 'C', spec: IWWF.C, tol: IWWF.TOL_C,
    label: 'C — Gate → skier 1 ∠',
    detail: 'Diagonal: gate buoy → first skier buoy',
    tolPct: '±0.5%',
  },
  {
    key: 'D', spec: IWWF.D, tol: IWWF.TOL_D,
    label: 'D — Skier → skier ∠',
    detail: 'Diagonal: consecutive skier buoys (5 pairs)',
    tolPct: '±0.5%',
  },
  {
    key: 'F', spec: IWWF.F, tol: IWWF.TOL_F,
    label: 'F — Skier lateral',
    detail: 'Centre line → skier buoy (derived from D & B)',
    tolPct: '±1%',
  },
  {
    key: 'H', spec: IWWF.H, tol: IWWF.TOL_H,
    label: 'H — Pre-gate distance',
    detail: 'Gate → pre-gate buoy (all 4 corners)',
    tolPct: '±0.5%',
  },
];

// ── Compute measured values for each IWWF dimension ───────────────────
/**
 * Given a `measured` object {[buoyId]: {lat, lon}}, compute the actual
 * GPS-measured value for each IWWF dimension.
 *
 * For dimensions that have multiple instances (e.g. B has 5 guide gaps),
 * each instance is returned separately so the UI can show all of them.
 *
 * @param {{ [id: number]: { lat: number, lon: number } }} measured
 * @returns {{ [key: string]: Array<{ label: string, value: number }> }}
 */
export function computeMeasuredDimensions(measured) {
  // Shorthand: Haversine between two measured buoys (null if either missing)
  const hav = (a, b) => {
    const pa = measured[a], pb = measured[b];
    if (!pa || !pb) return null;
    return haversine(pa.lat, pa.lon, pb.lat, pb.lon);
  };

  // Midpoint of two measured buoys (null if either missing)
  const mid = (a, b) => {
    const pa = measured[a], pb = measured[b];
    if (!pa || !pb) return null;
    return { lat: (pa.lat + pb.lat) / 2, lon: (pa.lon + pb.lon) / 2 };
  };

  // Haversine between two midpoints (null if either is null)
  const havMid = (m1, m2) => {
    if (!m1 || !m2) return null;
    return haversine(m1.lat, m1.lon, m2.lat, m2.lon);
  };

  // ── E: gate half-width ────────────────────────────────────────────────
  // dist(gate_R, gate_L) = 2E  →  measured E = dist / 2
  const E_vals = [
    { label: 'Entry (1↔2)',    value: hav(1,2)     !== null ? hav(1,2)     / 2 : null },
    { label: 'Exit (23↔24)',   value: hav(23,24)   !== null ? hav(23,24)   / 2 : null },
  ];

  // ── G: boat guide half-width ─────────────────────────────────────────
  // dist(guide_R, guide_L) = 2G  →  measured G = dist / 2
  const G_vals = [
    [11,12,'G1'],[13,14,'G2'],[15,16,'G3'],[17,18,'G4'],[19,20,'G5'],[21,22,'G6'],
  ].map(([r,l,n]) => ({ label: `Guide ${n} (${r}↔${l})`, value: hav(r,l) !== null ? hav(r,l)/2 : null }));

  // ── A: gate → first/last boat guide ──────────────────────────────────
  // Measure as haversine between midpoints of gate pair and guide pair
  const A_vals = [
    { label: 'Entry→G1 (mid)',  value: havMid(mid(1,2),   mid(11,12)) },
    { label: 'Exit→G6 (mid)',   value: havMid(mid(23,24), mid(21,22)) },
  ];

  // ── B: spacing between consecutive guide pairs ────────────────────────
  const B_vals = [
    [11,12,13,14,'G1→G2'],[13,14,15,16,'G2→G3'],[15,16,17,18,'G3→G4'],
    [17,18,19,20,'G4→G5'],[19,20,21,22,'G5→G6'],
  ].map(([a,b,c,d,n]) => ({ label: n, value: havMid(mid(a,b), mid(c,d)) }));

  // ── C: diagonal gate → first skier buoy ──────────────────────────────
  // Four combinations: entry gate R/L → skier 1 R/L; exit gate → skier 6
  const C_vals = [
    { label: '1→5 (entry R→S1 R)', value: hav(1,5)   },
    { label: '2→6 (entry L→S2 L)', value: hav(2,6)   },
    { label: '24→9 (exit L→S5 R)', value: hav(24,9)  },
    { label: '23→10 (exit R→S6 L)',value: hav(23,10) },
  ];

  // ── D: diagonal between consecutive skier buoys ───────────────────────
  const D_vals = [
    { label: 'S1→S2 (5↔6)',  value: hav(5,6)  },
    { label: 'S2→S3 (6↔7)',  value: hav(6,7)  },
    { label: 'S3→S4 (7↔8)',  value: hav(7,8)  },
    { label: 'S4→S5 (8↔9)',  value: hav(8,9)  },
    { label: 'S5→S6 (9↔10)', value: hav(9,10) },
  ];

  // ── F: skier lateral offset ───────────────────────────────────────────
  // Derived from diagonal D and longitudinal component B:
  //   F = √(D² − B²) / 2   (exact when course is straight)
  // Uses each measured D value with the corresponding B value (or nominal).
  const F_vals = [];
  for (const d_entry of D_vals) {
    if (d_entry.value === null) continue;
    // Find the corresponding B at the same along-course segment
    // D[i] is between skier i and i+1; B[i] is between guide i and guide i+1
    const idx = D_vals.indexOf(d_entry);
    const b_entry = B_vals[idx];
    const bVal = (b_entry && b_entry.value !== null) ? b_entry.value : IWWF.B;
    const inner = d_entry.value * d_entry.value - bVal * bVal;
    if (inner < 0) continue;
    const sk = d_entry.label.match(/S(\d+)→S(\d+)/);
    F_vals.push({
      label: `From D(${sk ? sk[0] : idx+1}) & B${idx+1}`,
      value: Math.sqrt(inner) / 2,
    });
  }

  // ── H: pre-gate distance ──────────────────────────────────────────────
  const H_vals = [
    { label: '1→3 (entry R → pre S R)', value: hav(1,3)   },
    { label: '2→4 (entry L → pre S L)', value: hav(2,4)   },
    { label: '23→25 (exit R → pre N R)', value: hav(23,25) },
    { label: '24→26 (exit L → pre N L)', value: hav(24,26) },
  ];

  // Build final object — filter out null values
  return {
    E: E_vals.filter(x => x.value !== null),
    G: G_vals.filter(x => x.value !== null),
    A: A_vals.filter(x => x.value !== null),
    B: B_vals.filter(x => x.value !== null),
    C: C_vals.filter(x => x.value !== null),
    D: D_vals.filter(x => x.value !== null),
    F: F_vals,
    H: H_vals.filter(x => x.value !== null),
  };
}
