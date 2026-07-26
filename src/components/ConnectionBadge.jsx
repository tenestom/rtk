export default function ConnectionBadge({ status }) {
  const map = {
    connected:    { label: 'Connected',    cls: 'badge-connected' },
    connecting:   { label: 'Connecting…', cls: 'badge-connecting' },
    disconnected: { label: 'Disconnected', cls: 'badge-disconnected' },
  };
  const { label, cls } = map[status] ?? map.disconnected;

  return (
    <div className={`connection-badge ${cls}`}>
      <span className="badge-dot" />
      <span className="badge-label">{label}</span>
    </div>
  );
}
