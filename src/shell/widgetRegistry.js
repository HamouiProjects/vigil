import WeatherWidget from '../widgets/WeatherWidget.jsx'

export const widgetRegistry = {
  weather: WeatherWidget,
}

export const widgetRegistryMeta = {
  weather: { label: 'Weather', icon: '🌤️' },
}

export default widgetRegistry
