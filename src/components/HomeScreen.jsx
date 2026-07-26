/**
 * HomeScreen — feature selection menu.
 * Add new feature buttons here as the app grows.
 */
export default function HomeScreen({ onNavigate }) {
  return (
    <div className="home-screen">
      <div className="home-header">
        <h1 className="home-title">What would you like to do?</h1>
        <p className="home-subtitle">Select a feature below</p>
      </div>

      <div className="feature-grid">

        {/* ── Measure Distance ──────────────────────────────── */}
        <button
          id="btn-feature-distance"
          className="feature-btn"
          onClick={() => onNavigate('distance')}
        >
          <span className="feature-btn-icon">📏</span>
          <div className="feature-btn-body">
            <span className="feature-btn-title">Measure Distance</span>
            <span className="feature-btn-desc">
              Save two GPS points and calculate the distance between them
            </span>
          </div>
          <span className="feature-btn-arrow">›</span>
        </button>

        {/* ── Slalom Course (coming soon) ───────────────────── */}
        <button className="feature-btn feature-btn--soon" disabled>
          <span className="feature-btn-icon">🏁</span>
          <div className="feature-btn-body">
            <span className="feature-btn-title">Slalom Course</span>
            <span className="feature-btn-desc">
              Mark gates and measure a slalom layout
            </span>
          </div>
          <span className="feature-btn-badge">Soon</span>
        </button>

        {/* ── Sweep Area (coming soon) ──────────────────────── */}
        <button className="feature-btn feature-btn--soon" disabled>
          <span className="feature-btn-icon">🗺️</span>
          <div className="feature-btn-body">
            <span className="feature-btn-title">Sweep Area</span>
            <span className="feature-btn-desc">
              Walk a perimeter and calculate the enclosed area
            </span>
          </div>
          <span className="feature-btn-badge">Soon</span>
        </button>

      </div>
    </div>
  );
}
