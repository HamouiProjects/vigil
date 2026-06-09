import {
  Newspaper,
  Rss,
  BookOpen,
  Globe,
  CloudSun,
  MessagesSquare,
  TrendingUp,
  Tv,
  CandlestickChart,
  Grid3x3,
  DollarSign,
} from 'lucide-react'
import WeatherWidget from '../widgets/WeatherWidget.jsx'
import RssFeedWidget from '../widgets/RssFeedWidget.jsx'
import PriceTrackerWidget from '../widgets/PriceTrackerWidget.jsx'
import ChartWidget from '../widgets/ChartWidget.jsx'
import HeatmapWidget from '../widgets/HeatmapWidget.jsx'
import AtlasWidget from '../widgets/AtlasWidget.jsx'
import LivestreamWidget from '../widgets/LivestreamWidget.jsx'
import NewsSearchWidget from '../widgets/NewsSearchWidget.jsx'
import SocialFeedWidget from '../widgets/SocialFeedWidget.jsx'
import ReaderWidget from '../widgets/ReaderWidget.jsx'
import TrendsWidget from '../widgets/TrendsWidget.jsx'

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
  browser: ReaderWidget,
  trends: TrendsWidget,
}

export const widgetRegistryMeta = {
  feed: {
    label: 'News Search',
    Icon: Newspaper,
    category: 'News & Feeds',
    desc: 'Search world news by keyword',
  },
  rss: {
    label: 'RSS',
    Icon: Rss,
    category: 'News & Feeds',
    desc: 'Live headlines from any feed',
  },
  browser: {
    label: 'Reader',
    Icon: BookOpen,
    category: 'News & Feeds',
    desc: 'Read a full article in place',
  },
  map: {
    label: 'Atlas',
    Icon: Globe,
    category: 'Maps & Geo',
    desc: 'Live world map and geo layers',
  },
  weather: {
    label: 'Weather',
    Icon: CloudSun,
    category: 'Maps & Geo',
    desc: 'Conditions for any location',
  },
  social: {
    label: 'Social',
    Icon: MessagesSquare,
    category: 'Social & Signals',
    desc: 'Reddit, YouTube, Bluesky and more',
  },
  trends: {
    label: 'Trends',
    Icon: TrendingUp,
    category: 'Social & Signals',
    desc: 'Relative Google search interest',
  },
  stream: {
    label: 'Livestream',
    Icon: Tv,
    category: 'Social & Signals',
    desc: 'Embed a live YouTube stream',
  },
  chart: {
    label: 'Chart',
    Icon: CandlestickChart,
    category: 'Markets',
    desc: 'Live price chart for any market',
  },
  heatmap: {
    label: 'Heatmap',
    Icon: Grid3x3,
    category: 'Markets',
    desc: 'Market heatmap by sector',
  },
  prices: {
    label: 'Prices',
    Icon: DollarSign,
    category: 'Markets',
    desc: 'Quote ticker for symbols',
  },
}

export const WIDGET_CATEGORIES = [
  { label: 'News & Feeds', types: ['feed', 'rss', 'browser'] },
  { label: 'Maps & Geo', types: ['map', 'weather'] },
  { label: 'Social & Signals', types: ['social', 'trends', 'stream'] },
  { label: 'Markets', types: ['chart', 'heatmap', 'prices'] },
]

export default widgetRegistry
