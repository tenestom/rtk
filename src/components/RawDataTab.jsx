import { useState, useEffect, useRef } from 'react';

const MAX_LINES = 100;

/**
 * RawDataTab — scrolling log of incoming WebSocket JSON frames.
 * Newest entries at top. Max 100 lines. Monospace, small text.
 */
export default function RawDataTab({ data, status }) {
  const [log, setLog] = useState([]);
  const topRef = useRef(null);

  // Push each new data frame to the top of the log
  useEffect(() => {
    if (data == null) return;
    const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
    const line = `${ts}  ${JSON.stringify(data)}`;
    setLog(prev => {
      const next = [line, ...prev];
      if (next.length > MAX_LINES) next.length = MAX_LINES;
      return next;
    });
  }, [data]);

  return (
    <div className="raw-tab">
      <div className="raw-tab-toolbar">
        <span className="raw-tab-title">📋 Raw WebSocket Log</span>
        <span className="raw-tab-status">
          {status === 'connected' ? '🟢 Live' : status === 'connecting' ? '🟡 Connecting' : '🔴 Disconnected'}
        </span>
        <button
          className="raw-tab-clear"
          onClick={() => setLog([])}
          disabled={log.length === 0}
        >
          Clear
        </button>
      </div>

      <div className="raw-tab-log" ref={topRef}>
        {log.length === 0 ? (
          <div className="raw-tab-empty">
            {status === 'connected'
              ? 'Waiting for data…'
              : 'Not connected — no data to show'}
          </div>
        ) : (
          log.map((line, i) => (
            <div key={i} className={`raw-log-line${i === 0 ? ' raw-log-line--new' : ''}`}>
              {line}
            </div>
          ))
        )}
      </div>

      <div className="raw-tab-footer">
        {log.length} / {MAX_LINES} lines
        {log.length === MAX_LINES && <span className="raw-tab-overflow"> (oldest dropped)</span>}
      </div>
    </div>
  );
}
