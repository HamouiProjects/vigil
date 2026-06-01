import WeatherWidget from '../widgets/WeatherWidget.jsx'
import RssFeedWidget from '../widgets/RssFeedWidget.jsx'
import PriceTrackerWidget from '../widgets/PriceTrackerWidget.jsx'
import ChartWidget from '../widgets/ChartWidget.jsx'
import HeatmapWidget from '../widgets/HeatmapWidget.jsx'
import AtlasWidget from '../widgets/AtlasWidget.jsx'

export const SOURCE_BACKED_TYPES = new Set(['rss'])

export const widgetRegistry = {
  weather: WeatherWidget,
  rss: RssFeedWidget,
  prices: PriceTrackerWidget,
  chart: ChartWidget,
  heatmap: HeatmapWidget,
  map: AtlasWidget,
}

export const widgetRegistryMeta = {
  weather: { label: 'Weather', icon: '🌤️' },
  rss: { label: 'RSS', icon: '📡' },
  prices: { label: 'Prices', icon: '📈' },
  chart: { label: 'Chart', icon: '📊' },
  heatmap: { label: 'Heatmap', icon: '🔲' },
  map: { label: 'Atlas', icon: '🌐' },
}

export default widgetRegistry
