import WeatherWidget from '../widgets/WeatherWidget.jsx'
import RssFeedWidget from '../widgets/RssFeedWidget.jsx'

export const SOURCE_BACKED_TYPES = new Set(['rss'])

export const widgetRegistry = {
  weather: WeatherWidget,
  rss: RssFeedWidget,
}

export const widgetRegistryMeta = {
  weather: { label: 'Weather', icon: '🌤️' },
  rss: { label: 'RSS', icon: '📡' },
}

export default widgetRegistry
