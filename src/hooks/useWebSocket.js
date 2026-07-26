import { useState, useEffect, useRef, useCallback } from 'react';

const WS_URL = 'ws://192.168.4.1:81';
const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 10000;

// Browsers block ws:// connections from https:// pages (mixed content).
// Detect this early so we never attempt a doomed connection.
export const IS_HTTPS = typeof window !== 'undefined' && window.location.protocol === 'https:';

export function useWebSocket() {
  const [status, setStatus] = useState(IS_HTTPS ? 'https-blocked' : 'disconnected');
  const [data, setData] = useState(null);
  const wsRef = useRef(null);
  const retryTimerRef = useRef(null);
  const retryDelayRef = useRef(INITIAL_RETRY_MS);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    // Never attempt a ws:// connection from an https:// page.
    if (IS_HTTPS) return;

    setStatus('connecting');

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setStatus('connected');
      retryDelayRef.current = INITIAL_RETRY_MS; // reset back-off on success
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const parsed = JSON.parse(event.data);
        setData(parsed);
      } catch {
        console.warn('Invalid JSON from WebSocket:', event.data);
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror, handle retry there
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setStatus('disconnected');
      wsRef.current = null;

      // Exponential back-off reconnect
      const delay = retryDelayRef.current;
      retryDelayRef.current = Math.min(delay * 2, MAX_RETRY_MS);

      retryTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(retryTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent retry on intentional close
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { status, data };
}
