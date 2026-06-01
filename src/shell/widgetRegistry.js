import WeatherWidget from '../widgets/WeatherWidget.jsx'
import RssFeedWidget from '../widgets/RssFeedWidget.jsx'
import PriceTrackerWidget from '../widgets/PriceTrackerWidget.jsx'
import ChartWidget from '../widgets/ChartWidget.jsx'
import HeatmapWidget from '../widgets/HeatmapWidget.jsx'

export const SOURCE_BACKED_TYPES = new Set(['rss'])

export const widgetRegistry = {
  weather: WeatherWidget,
  rss: RssFeedWidget,
  prices: PriceTrackerWidget,
  chart: ChartWidget,
  heatmap: HeatmapWidget,
}

export const widgetRegistryMeta = {
  weather: { label: 'Weather', icon: '🌤️' },
  rss: { label: 'RSS', icon: '📡' },
  prices: { label: 'Prices', icon: '📈' },
  chart: { label: 'Chart', icon: '📊' },
  heatmap: { label: 'Heatmap', icon: '🔲' },
}

export default widgetRegistry
