export default function BatteryIndicator({ bat }) {
  const pct = bat ?? null;

  // Color based on level
  const color =
    pct == null   ? 'var(--text-muted)'
    : pct < 20   ? '#ef4444'
    : pct < 40   ? '#f59e0b'
    : '#22c55e';

  const glow = pct != null ? `0 0 18px ${color}66` : 'none';

  // Inner fill width (leave a little padding inside the battery shell)
  const fillPct = pct != null ? Math.max(2, pct) : 0;

  return (
    <div className="card battery-card">
      <div className="card-header">
        <span className="card-icon">⚡</span>
        <span className="card-title">Battery</span>
      </div>

      <div className="battery-body">
        {/* SVG battery */}
        <div className="battery-svg-wrap">
          <svg viewBox="0 0 220 100" className="battery-svg" aria-label={`Battery ${pct}%`}>
            {/* Shell */}
            <rect x="4" y="14" width="196" height="72" rx="10" ry="10"
              stroke={color} strokeWidth="4" fill="none"
              style={{ filter: `drop-shadow(${glow})` }} />
            {/* Terminal nub */}
            <rect x="200" y="36" width="16" height="28" rx="4" ry="4"
              fill={color} style={{ filter: `drop-shadow(${glow})` }} />
            {/* Fill */}
            <rect
              x="10" y="20"
              width={`${(fillPct / 100) * 184}`} height="60"
              rx="6" ry="6"
              fill={color}
              style={{ transition: 'width 0.6s ease, fill 0.6s ease',
                       filter: `drop-shadow(${glow})` }}
            />
            {/* Percentage text */}
            {pct != null && (
              <text x="102" y="63" textAnchor="middle"
                fontSize="28" fontWeight="700" fontFamily="Inter, sans-serif"
                fill={pct < 30 ? color : '#0f172a'}>
                {pct}%
              </text>
            )}
          </svg>
        </div>

        {/* Numeric readout */}
        <div className="battery-readout">
          <span className="battery-pct" style={{ color, boxShadow: glow }}>
            {pct != null ? `${pct}%` : '—'}
          </span>
          <span className="battery-status" style={{ color }}>
            {pct == null ? 'No data'
              : pct < 20  ? 'Low — charge soon'
              : pct < 40  ? 'Moderate'
              : pct < 75  ? 'Good'
              : 'Excellent'}
          </span>
        </div>
      </div>
    </div>
  );
}
