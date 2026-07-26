import ConnectionBadge from './ConnectionBadge';
import CoordinatesCard from './CoordinatesCard';
import FixQualityCard from './FixQualityCard';
import SatelliteCard from './SatelliteCard';
import BatteryIndicator from './BatteryIndicator';
import { useWebSocket } from '../hooks/useWebSocket';

export default function GpsDashboard() {
  const { status, data } = useWebSocket();

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <span className="logo-icon">📡</span>
          <div>
            <h1 className="app-title">RTK Tracker</h1>
            <p className="app-subtitle">Real-time GPS Monitor</p>
          </div>
        </div>
        <ConnectionBadge status={status} />
      </header>

      {/* Main content */}
      <main className="dashboard-main">
        {/* Coordinates — full width */}
        <CoordinatesCard lat={data?.lat} lon={data?.lon} />

        {/* Fix + Satellites row */}
        <div className="card-row">
          <FixQualityCard fix={data?.fix} />
          <SatelliteCard sats={data?.sats} />
        </div>

        {/* Battery */}
        <BatteryIndicator bat={data?.bat} />
      </main>

      {/* Footer timestamp */}
      <footer className="dashboard-footer">
        {data
          ? `Last update: ${new Date().toLocaleTimeString()}`
          : status === 'connecting'
          ? 'Connecting to ws://192.168.4.1:81 …'
          : 'Waiting for connection …'}
      </footer>
    </div>
  );
}
