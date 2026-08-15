import { useEffect, useState, useRef } from 'react';
import ConnectionBadge from './ConnectionBadge';

const FIX_COLORS = {
  0: '#ef4444',
  1: '#f59e0b',
  2: '#eab308',
  3: '#84cc16',
  4: '#22c55e',
  5: '#10b981',
  6: '#6366f1',
};

const FIX_LABELS = {
  0: 'No Fix',
  1: 'GPS',
  2: 'DGPS',
  3: 'PPS',
  4: 'RTK Fixed',
  5: 'RTK Float',
  6: 'DR',
};

/**
 * Dot color for fix quality history:
 *   green  = fix 4 (RTK Fixed)
 *   amber  = fix 5 (RTK Float)
 *   red    = fix 1 (plain GPS)
 *   grey   = anything else / unknown
 */
function fixDotColor(fix) {
  if (fix === 4) return '#16a34a'; // green
  if (fix === 5) return '#d97706'; // amber
  if (fix === 1) return '#dc2626'; // red
  return '#9ca3af';                 // grey
}

const HISTORY_MAX = 10;
const ERR_WINDOW_S = 60; // seconds

/**
 * Compact always-visible header.
 * Row 1 — app branding + connection badge
 * Row 2 — fix quality · satellites · HDOP · NMEA error %
 * Row 3 — fix quality history dots (newest on LEFT, oldest on RIGHT)
 */
export default function StatusBar({ status, data }) {
  const fix  = data?.fix;
  const sats = data?.sats;
  const hdop = data?.hdop;

  // ── Fix quality history: newest at index 0 ───────────────────────
  // On each new distinct fix value: unshift to front, drop from end.
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (fix == null) return;
    setHistory(prev => {
      // Skip if same as most-recent (index 0)
      if (prev.length > 0 && prev[0] === fix) return prev;
      const next = [fix, ...prev]; // unshift: newest first
      if (next.length > HISTORY_MAX) next.pop(); // drop oldest (last)
      return next;
    });
  }, [fix]);

  // ── Error rate: sliding window over last 60 s ────────────────────
  // Each received message is a checksum-passing sentence. We track
  // arrival timestamps in a ref and compute the ratio client-side.
  const msgTimestampsRef = useRef([]); // array of Date.now() values
  const [errPct, setErrPct] = useState(null);

  useEffect(() => {
    if (data == null || status !== 'connected') return;

    const now = Date.now();
    const windowMs = ERR_WINDOW_S * 1000;

    // Push this message timestamp
    msgTimestampsRef.current.push(now);

    // Drop entries older than the window
    msgTimestampsRef.current = msgTimestampsRef.current.filter(
      t => now - t <= windowMs
    );

    const received = msgTimestampsRef.current.length;
    const windowSec = Math.min(ERR_WINDOW_S, (now - msgTimestampsRef.current[0] + 1000) / 1000);
    const expected = Math.round(windowSec); // 1 msg/sec expected
    const missed = Math.max(0, expected - received);
    const pct = expected > 0 ? Math.round((missed / expected) * 100) : 0;
    setErrPct(Math.min(pct, 100));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Reset history + timestamps when disconnected
  useEffect(() => {
    if (status !== 'connected') {
      msgTimestampsRef.current = [];
      setErrPct(null);
    }
  }, [status]);

  const fixColor = FIX_COLORS[fix] ?? '#334155';
  const fixLabel = FIX_LABELS[fix] ?? '—';

  const hdopColor =
    hdop == null  ? '#334155'
    : hdop <= 1.0 ? '#16a34a'
    : hdop <= 2.0 ? '#65a30d'
    : hdop <= 5.0 ? '#d97706'
    : '#dc2626';

  const errColor =
    errPct == null ? '#334155'
    : errPct === 0  ? '#16a34a'
    : errPct <= 5   ? '#d97706'
    : '#dc2626';

  return (
    <header className="status-bar">
      {/* Row 1 — branding + connection */}
      <div className="sb-row sb-row-1">
        <div className="sb-brand">
          <span className="sb-logo">📡</span>
          <span className="sb-title">RTK Tracker</span>
        </div>
        <ConnectionBadge status={status} />
      </div>

      {/* Row 2 — GPS stats */}
      <div className="sb-row sb-row-2">
        {/* Fix quality */}
        <div className="sb-chip" style={{ color: fixColor, borderColor: `${fixColor}55` }}>
          <span className="sb-chip-icon">🎯</span>
          <span className="sb-chip-val">{fix ?? '—'}</span>
          <span className="sb-chip-label">{fixLabel}</span>
        </div>

        {/* Satellite count */}
        <div className="sb-chip" style={{ color: '#1d4ed8', borderColor: 'rgba(29,78,216,0.3)' }}>
          <span className="sb-chip-icon">🛰️</span>
          <span className="sb-chip-val">{sats ?? '—'}</span>
          <span className="sb-chip-label">sats</span>
        </div>

        {/* HDOP */}
        <div className="sb-chip" style={{ color: hdopColor, borderColor: `${hdopColor}55` }}>
          <span className="sb-chip-val">{hdop != null ? Number(hdop).toFixed(2) : '—'}</span>
          <span className="sb-chip-label">HDOP</span>
        </div>

        {/* NMEA Error % — calculated client-side */}
        <div className="sb-chip" style={{ color: errColor, borderColor: `${errColor}55` }}>
          <span className="sb-chip-val">{errPct != null ? `${errPct}%` : '—'}</span>
          <span className="sb-chip-label">ERR</span>
        </div>
      </div>

      {/* Row 3 — fix quality history dots (newest LEFT, oldest RIGHT) */}
      {history.length > 0 && (
        <div className="sb-row sb-fix-history">
          <span className="sb-fh-label">Fix history</span>
          <div className="sb-fh-dots">
            {/* Render newest-first (index 0) on the left */}
            {history.map((f, i) => (
              <span
                key={i}
                className="sb-fh-dot"
                style={{ background: fixDotColor(f) }}
                title={`Fix ${f}: ${FIX_LABELS[f] ?? '?'} (${i === 0 ? 'newest' : `${i} ago`})`}
              />
            ))}
            {/* Right-pad with empty placeholders to always show 10 slots */}
            {Array.from({ length: HISTORY_MAX - history.length }).map((_, i) => (
              <span key={`pad-${i}`} className="sb-fh-dot sb-fh-dot--empty" />
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
