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
import { lazy } from 'react'

export const SOURCE_BACKED_TYPES = new Set(['rss'])

// Widget types the brief actually gathers (see gatherRoomItems.js): news (feed, rss, browser),
// markets (chart, prices, heatmap), and trends. The "include in brief" toggle renders only for these.
// weather, social, stream, and map are never read by the brief, so the toggle is a dead button there.
export const BRIEF_ELIGIBLE_TYPES = new Set(['feed', 'rss', 'social', 'browser', 'chart', 'prices', 'heatmap', 'trends'])

export const widgetRegistry = {
  weather: lazy(() => import('../widgets/WeatherWidget.jsx')),
  rss: lazy(() => import('../widgets/RssFeedWidget.jsx')),
  prices: lazy(() => import('../widgets/PriceTrackerWidget.jsx')),
  chart: lazy(() => import('../widgets/ChartWidget.jsx')),
  heatmap: lazy(() => import('../widgets/HeatmapWidget.jsx')),
  map: lazy(() => import('../widgets/AtlasWidget.jsx')),
  stream: lazy(() => import('../widgets/LivestreamWidget.jsx')),
  feed: lazy(() => import('../widgets/NewsSearchWidget.jsx')),
  social: lazy(() => import('../widgets/SocialFeedWidget.jsx')),
  browser: lazy(() => import('../widgets/ReaderWidget.jsx')),
  trends: lazy(() => import('../widgets/TrendsWidget.jsx')),
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
