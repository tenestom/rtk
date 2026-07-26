import { IS_HTTPS } from '../hooks/useWebSocket';

export default function MixedContentBanner() {
  if (!IS_HTTPS) return null;

  return (
    <div className="mixed-content-banner" role="alert">
      {/* Icon */}
      <div className="mcb-icon-wrap">
        <span className="mcb-icon">⚠️</span>
      </div>

      {/* Text */}
      <div className="mcb-body">
        <p className="mcb-title">Live data unavailable on HTTPS</p>
        <p className="mcb-text">
          Browsers block unencrypted WebSocket connections from HTTPS pages.
          To receive live GPS data, connect your device to the{' '}
          <strong>RTK WiFi network</strong> and open the app directly from
          the rover:
        </p>
        <a
          className="mcb-link"
          href="http://192.168.4.1"
          rel="noopener noreferrer"
        >
          http://192.168.4.1
        </a>
        <p className="mcb-hint">
          The ESP32 serves this app on port&nbsp;80 — no internet required.
        </p>
      </div>
    </div>
  );
}
