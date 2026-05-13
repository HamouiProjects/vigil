import Widget from './Widget'

const WINDY_URL =
  'https://embed.windy.com/embed2.html' +
  '?lat=30&lon=10&zoom=3&level=surface&overlay=wind' +
  '&menu=&message=&marker=&forecast=12&calendar=now' +
  '&pressure=&type=map&location=coordinates' +
  '&detail=&detailLat=30&detailLon=10' +
  '&metricWind=default&metricTemp=default&radarRange=-1'

export default function MapWidget() {
  return (
    <Widget title="Live Weather Map" icon="🌍" badge="LIVE" badgeActive>
      <iframe
        src={WINDY_URL}
        width="100%"
        height="100%"
        frameBorder="0"
        style={{ display: 'block', border: 'none' }}
        onMouseDown={e => e.stopPropagation()}
      />
    </Widget>
  )
}
