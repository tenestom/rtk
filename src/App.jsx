import './index.css';
import { useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import StatusBar from './components/StatusBar';
import MixedContentBanner from './components/MixedContentBanner';
import HomeScreen from './components/HomeScreen';
import DistanceMeasure from './components/DistanceMeasure';
import SlalomSurvey from './components/SlalomSurvey';
import SweepScreen from './components/SweepScreen';
import RawDataTab from './components/RawDataTab';

/**
 * Root component.
 * Owns the WebSocket connection (lifted from GpsDashboard) so that:
 *   - StatusBar always has live signal data
 *   - Feature screens receive GPS data as props
 *   - RawDataTab can log every incoming frame
 */
function App() {
  const { status, data } = useWebSocket();
  const [screen, setScreen] = useState('home');

  return (
    <div className="app-shell">
      {/* Always-visible compact status bar */}
      <StatusBar status={status} data={data} />

      {/* HTTPS mixed-content warning (renders only when on https://) */}
      <MixedContentBanner />

      {/* Routed screen content — scrolls independently */}
      <div className="screen-content">
        {screen === 'home' && (
          <HomeScreen onNavigate={setScreen} />
        )}
        {screen === 'distance' && (
          <DistanceMeasure
            data={data}
            onBack={() => setScreen('home')}
          />
        )}
        {screen === 'slalom' && (
          <SlalomSurvey
            data={data}
            onBack={() => setScreen('home')}
          />
        )}
        {screen === 'sweep' && (
          <SweepScreen
            data={data}
            onBack={() => setScreen('home')}
          />
        )}
        {screen === 'raw' && (
          <div className="raw-screen">
            <div className="screen-nav">
              <button className="nav-back" onClick={() => setScreen('home')}>← Back</button>
              <span className="screen-nav-title">Raw Data</span>
            </div>
            <RawDataTab data={data} status={status} />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
