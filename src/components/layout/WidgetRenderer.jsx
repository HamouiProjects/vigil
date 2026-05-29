import KeywordFeed      from '../widgets/NewsSearchWidget'
import AtlasWidget      from '../widgets/AtlasWidget'
import RssFeed          from '../widgets/RssFeedWidget'
import PriceTracker     from '../widgets/PriceTrackerWidget'
import Livestream       from '../widgets/LivestreamWidget'
import Weather          from '../widgets/WeatherWidget'
import ChartWidget      from '../widgets/ChartWidget'
import ArticleReaderWidget from '../widgets/ReaderWidget'
import SocialFeed       from '../widgets/SocialFeedWidget'
import HeatmapWidget    from '../widgets/HeatmapWidget'
import PortfolioWidget  from '../widgets/PortfolioWidget'

export default function WidgetRenderer({ widget, onClose, onFullscreen, isFullscreen, onCollapse, collapsed, settings, updateSetting, workspacePaused }) {
  const p = { onClose, onFullscreen, isFullscreen, onCollapse, collapsed, workspacePaused }
  switch (widget.type) {
    case 'map':       return <AtlasWidget         {...p} widgetId={widget.id} />
    case 'feed':      return <KeywordFeed         {...p} widgetId={widget.id} />
    case 'rss':       return <RssFeed             {...p} widgetId={widget.id} />
    case 'prices':    return <PriceTracker        {...p} widgetId={widget.id} />
    case 'stream':    return <Livestream          {...p} widgetId={widget.id} />
    case 'weather':   return <Weather             {...p} widgetId={widget.id} initialCity={settings.weatherCity} onCityChange={city => updateSetting('weatherCity', city)} />
    case 'chart':     return <ChartWidget         {...p} widgetId={widget.id} />
    case 'heatmap':   return <HeatmapWidget       {...p} />
    case 'browser':   return <ArticleReaderWidget {...p} widgetId={widget.id} />
    case 'social':    return <SocialFeed          {...p} widgetId={widget.id} />
    case 'portfolio': return <PortfolioWidget     {...p} widgetId={widget.id} />
    default:          return null
  }
}
