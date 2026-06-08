/**
 * @typedef {Object} Workspace
 * @property {string} id
 * @property {string} userId
 * @property {string} name
 * @property {Object} layout
 * @property {Object} settings
 * @property {number} position
 * @property {string|null} shareToken
 * @property {string|null} localId
 */

/**
 * @typedef {Object} Widget
 * @property {string} id          react-grid-layout `i`
 * @property {string} workspaceId
 * @property {string} type
 * @property {Object} config
 */

/**
 * @typedef {Object} Source
 * @property {string} id
 * @property {string} userId
 * @property {string} type
 * @property {string} identifier
 * @property {string} label
 * @property {Object} meta
 */

export const WIDGET_TYPES = [
  'map', 'feed', 'rss', 'stream', 'weather', 'chart', 'browser',
  'heatmap', 'prices', 'social',
]

export const SOURCE_TYPES = [
  'rss', 'x', 'telegram', 'news_keyword', 'price_symbol', 'reddit',
]

export const PLANS = ['free', 'pro', 'team']

export const ADDONS = ['brokerage', 'licensed_data', 'ai_reports', 'premium_layers']
