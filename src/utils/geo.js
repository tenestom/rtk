/**
 * Shared geographic utility functions.
 * Used by DistanceMeasure, CoordinateView, and future feature screens.
 */

/**
 * Haversine great-circle distance in metres between two WGS-84 points.
 */
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Format metres to a human-readable string.
 * < 1000 m  →  "12.34 m"
 * ≥ 1000 m  →  "1.234 km"
 */
export function formatMeters(m) {
  if (m == null) return '—';
  if (m < 1000) return `${m.toFixed(2)} m`;
  return `${(m / 1000).toFixed(3)} km`;
}

/**
 * Compact format used on SVG canvas labels.
 */
export function formatMetersShort(m) {
  if (m == null) return '';
  if (m < 1000) return `${m.toFixed(1)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

/**
 * Convert a lat/lon to local Cartesian metres relative to a reference point.
 *   x = east (+) / west (-)
 *   y = north (+) / south (-)
 * Accurate within a few km (flat-earth projection).
 */
export function toLocalMeters(lat, lon, refLat, refLon) {
  const MPD_LAT = 111_320;
  const MPD_LON = Math.cos((refLat * Math.PI) / 180) * 111_320;
  return {
    x: (lon - refLon) * MPD_LON,
    y: (lat - refLat) * MPD_LAT,
  };
}

/**
 * Choose a nice round scale-bar distance (metres) given how many SVG pixels
 * correspond to one metre.  Targets a bar roughly 50-90 px wide.
 */
export function niceScaleBarMeters(pixelsPerMeter) {
  const candidates = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  const target = 65; // desired bar length in pixels
  for (const d of candidates) {
    if (d * pixelsPerMeter >= target) return d;
  }
  return candidates[candidates.length - 1];
}
