const FIX_INFO = {
  0: { label: 'No Fix',      color: '#ef4444', emoji: '✖' },
  1: { label: 'GPS',         color: '#f59e0b', emoji: '◎' },
  2: { label: 'DGPS',        color: '#eab308', emoji: '◉' },
  3: { label: 'PPS',         color: '#84cc16', emoji: '◉' },
  4: { label: 'RTK Fixed',   color: '#22c55e', emoji: '✔' },
  5: { label: 'RTK Float',   color: '#10b981', emoji: '⊕' },
  6: { label: 'Dead Reckoning', color: '#6366f1', emoji: '↻' },
};

export default function FixQualityCard({ fix }) {
  const info = FIX_INFO[fix] ?? { label: '—', color: 'var(--text-muted)', emoji: '?' };

  return (
    <div className="card fix-card">
      <div className="card-header">
        <span className="card-icon">🎯</span>
        <span className="card-title">Fix Quality</span>
      </div>
      <div className="fix-body">
        <span
          className="fix-number"
          style={{ color: info.color, textShadow: `0 0 20px ${info.color}66` }}
        >
          {fix ?? '—'}
        </span>
        <div className="fix-meta">
          <span className="fix-emoji">{info.emoji}</span>
          <span className="fix-label" style={{ color: info.color }}>
            {info.label}
          </span>
        </div>
      </div>
    </div>
  );
}
