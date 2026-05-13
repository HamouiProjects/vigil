import Widget from './Widget'

export default function Livestream() {
  return (
    <Widget title="Livestream" icon="📹" badge="OFFLINE" badgeActive={false}>
      <div className="stream-body">
        <div className="stream-icon">📹</div>
        <div className="stream-label">No stream configured</div>
        <div className="stream-live-badge">STANDBY</div>
      </div>
    </Widget>
  )
}
