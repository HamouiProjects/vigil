import WeatherWidget from '../widgets/WeatherWidget.jsx'
import RssFeedWidget from '../widgets/RssFeedWidget.jsx'
import PriceTrackerWidget from '../widgets/PriceTrackerWidget.jsx'

export const SOURCE_BACKED_TYPES = new Set(['rss'])

export const widgetRegistry = {
  weather: WeatherWidget,
  rss: RssFeedWidget,
  prices: PriceTrackerWidget,
}

export const widgetRegistryMeta = {
  weather: { label: 'Weather', icon: '🌤️' },
  rss: { label: 'RSS', icon: '📡' },
  prices: { label: 'Prices', icon: '📈' },
}

export default widgetRegistry
