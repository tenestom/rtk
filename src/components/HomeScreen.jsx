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

        {/* ── Survey Slalom Course ──────────────────────────────── */}
        <button
          id="btn-feature-slalom"
          className="feature-btn"
          onClick={() => onNavigate('slalom')}
        >
          <span className="feature-btn-icon">🏁</span>
          <div className="feature-btn-body">
            <span className="feature-btn-title">Survey Slalom Course</span>
            <span className="feature-btn-desc">
              Measure all 26 buoys against IWWF tolerances
            </span>
          </div>
          <span className="feature-btn-arrow">›</span>
        </button>

        {/* ── Sweep Area ─────────────────────────────────────────── */}
        <button
          id="btn-feature-sweep"
          className="feature-btn"
          onClick={() => onNavigate('sweep')}
        >
          <span className="feature-btn-icon">🗺️</span>
          <div className="feature-btn-body">
            <span className="feature-btn-title">Sweep Area</span>
            <span className="feature-btn-desc">
              Define a polygon and paint coverage as you move through it
            </span>
          </div>
          <span className="feature-btn-arrow">›</span>
        </button>

      </div>
    </div>
  );
}
