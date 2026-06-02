import WeatherWidget from '../widgets/WeatherWidget.jsx'
import RssFeedWidget from '../widgets/RssFeedWidget.jsx'
import PriceTrackerWidget from '../widgets/PriceTrackerWidget.jsx'
import ChartWidget from '../widgets/ChartWidget.jsx'
import HeatmapWidget from '../widgets/HeatmapWidget.jsx'
import AtlasWidget from '../widgets/AtlasWidget.jsx'
import LivestreamWidget from '../widgets/LivestreamWidget.jsx'
import NewsSearchWidget from '../widgets/NewsSearchWidget.jsx'
import SocialFeedWidget from '../widgets/SocialFeedWidget.jsx'

export const SOURCE_BACKED_TYPES = new Set(['rss'])

export const widgetRegistry = {
  weather: WeatherWidget,
  rss: RssFeedWidget,
  prices: PriceTrackerWidget,
  chart: ChartWidget,
  heatmap: HeatmapWidget,
  map: AtlasWidget,
  stream: LivestreamWidget,
  feed: NewsSearchWidget,
  social: SocialFeedWidget,
}

export const widgetRegistryMeta = {
  weather: { label: 'Weather', icon: '🌤️' },
  rss: { label: 'RSS', icon: '📡' },
  prices: { label: 'Prices', icon: '📈' },
  chart: { label: 'Chart', icon: '📊' },
  heatmap: { label: 'Heatmap', icon: '🔲' },
  map: { label: 'Atlas', icon: '🌐' },
  stream: { label: 'Livestream', icon: '📺' },
  feed: { label: 'News Search', icon: '🔍' },
  social: { label: 'Social', icon: '💬' },
}

export default widgetRegistry
