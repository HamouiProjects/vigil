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

export const PLANS = ['free', 'pro', 'team']

export const ADDONS = ['brokerage', 'licensed_data', 'ai_reports', 'premium_layers']
