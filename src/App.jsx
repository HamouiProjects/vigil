import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ReactGridLayout as GridLayout, WidthProvider } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './App.css'
import { supabase } from './lib/supabase'
import { DEFAULT_TEMPLATES, TEMPLATE_KEYWORDS, TEMPLATE_RSS_DEFAULTS, MIGRATION_FLAG } from './constants/templates'
import { WIDGET_CATALOG, WIDGET_DEFAULTS } from './constants/widgetTypes'
import {
  readSettings, readWorkspacesMeta, readWidgets, readLayout, resolveInitialWs,
  WS_META_KEY, ACTIVE_WS_KEY, settingsKey, widgetsKey, wsKey,
} from './utils/workspaceHelpers'
import KeywordFeed, { kfTabsKey } from './components/widgets/NewsSearchWidget'
import AuthScreen from './components/layout/AuthScreen'
import NavBar from './components/layout/NavBar'
import AddWidgetModal from './components/layout/AddWidgetModal'
import AtlasWidget from './components/widgets/AtlasWidget'
import FeedsWidget from './components/widgets/FeedsWidget'
import ConflictFeed from './components/widgets/ConflictFeed'
import RssFeed from './components/widgets/RssFeedWidget'
import PriceTracker from './components/widgets/PriceTrackerWidget'
import Livestream from './components/widgets/LivestreamWidget'
import Weather from './components/widgets/WeatherWidget'
import ChartWidget from './components/widgets/ChartWidget'
import ArticleReaderWidget from './components/widgets/ReaderWidget'
import SocialFeed from './components/widgets/SocialFeedWidget'
import HeatmapWidget from './components/widgets/HeatmapWidget'
import PortfolioWidget from './components/widgets/PortfolioWidget'

const SizedGridLayout = WidthProvider(GridLayout)

// ─── Layout version — bump to force-reset all saved layouts on next load ─────
const LAYOUT_VERSION     = 7
const LAYOUT_VERSION_KEY = 'vigil_layout_version'
;(function initLayoutVersion() {
  try {
    const stored = parseInt(localStorage.getItem(LAYOUT_VERSION_KEY) ?? '0', 10)
    if (stored < LAYOUT_VERSION) {
      const toRemove = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && (k.startsWith('vigil_workspace_') || /vigil_ws\d+_widgets/.test(k) || k.startsWith('vigil_atlas_state_'))) toRemove.push(k)
      }
      toRemove.forEach(k => localStorage.removeItem(k))
      localStorage.setItem(LAYOUT_VERSION_KEY, String(LAYOUT_VERSION))
    }
  } catch {}
})()

// ─── One-time migration v2: write template widgets+layout for empty workspaces ─
;(function applyTemplateDefaults() {
  const FLAG = 'vigil_template_defaults_applied_v2'
  try {
    if (localStorage.getItem(FLAG)) return
    const workspaces = readWorkspacesMeta()
    workspaces.forEach(ws => {
      const tpl = DEFAULT_TEMPLATES[ws.name]
      if (!tpl) return
      const rawW = localStorage.getItem(widgetsKey(ws.id))
      let current = []
      try { current = rawW ? JSON.parse(rawW) : [] } catch {}
      if (Array.isArray(current) && current.length > 0) return
      const now = Date.now()
      const widgetList = []
      const layoutList = []
      tpl.forEach(({ type, x, y, w, h }, idx) => {
        const id = `${type}-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`
        widgetList.push({ id, type })
        layoutList.push({ i: id, x, y, w, h })
      })
      localStorage.setItem(widgetsKey(ws.id), JSON.stringify(widgetList))
      localStorage.setItem(wsKey(ws.id),      JSON.stringify(layoutList))
    })
    localStorage.setItem(WS_META_KEY, JSON.stringify(workspaces))
    localStorage.setItem(FLAG, '1')
  } catch {}
})()

// ─── One-time migration v3: per-workspace news search keywords ────────────────
;(function applyTemplateDefaultsV3() {
  const FLAG = 'vigil_template_defaults_applied_v3'
  try {
    if (localStorage.getItem(FLAG)) return
    const workspaces = readWorkspacesMeta()
    workspaces.forEach(ws => {
      let widgets = []
      try { const r = localStorage.getItem(widgetsKey(ws.id)); if (r) widgets = JSON.parse(r) } catch {}
      const feedWidget    = widgets.find(w => w.type === 'feed')
      const browserWidget = widgets.find(w => w.type === 'browser')
      const mapWidget     = widgets.find(w => w.type === 'map')
      const kwds = TEMPLATE_KEYWORDS[ws.name]
      if (feedWidget && kwds) {
        const tabKey = kfTabsKey(feedWidget.id)
        if (!localStorage.getItem(tabKey)) {
          localStorage.setItem(tabKey, JSON.stringify(kwds.map((kw, i) => ({ id: `kw-${i}`, keyword: kw }))))
        }
      }
      if (ws.name === 'TECH COLD WAR') {
        if (browserWidget && !localStorage.getItem(`vigil_browser_url_${browserWidget.id}`)) {
          localStorage.setItem(`vigil_browser_url_${browserWidget.id}`, 'https://www.reuters.com/technology/')
        }
        if (mapWidget && !localStorage.getItem(`vigil_atlas_state_${mapWidget.id}`)) {
          localStorage.setItem(`vigil_atlas_state_${mapWidget.id}`, JSON.stringify({ center: [25, 115], zoom: 3, showConflicts: true, showNatural: true, showPiracy: true, mapMode: 'leaflet', iframeSrc: '' }))
        }
      }
    })
    localStorage.setItem(FLAG, '1')
  } catch {}
})()

;(function resetRssFeedsEnabled() {
  const FLAG = 'vigil_rss_enabled_reset_v1'
  try {
    if (localStorage.getItem(FLAG)) return
    const toUpdate = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('vigil_rss_feeds_')) toUpdate.push(k)
    }
    toUpdate.forEach(k => {
      try {
        const feeds = JSON.parse(localStorage.getItem(k) || 'null')
        if (Array.isArray(feeds)) {
          localStorage.setItem(k, JSON.stringify(feeds.map(f => ({ ...f, enabled: true }))))
        }
      } catch {}
    })
    localStorage.setItem(FLAG, '1')
  } catch {}
})()

// ─── One-time migration v4: heatmap + per-template RSS sources ───────────────
;(function applyTemplateDefaultsV4() {
  try {
    if (localStorage.getItem(MIGRATION_FLAG)) return
    const workspaces = readWorkspacesMeta()
    const now = Date.now()
    workspaces.forEach(ws => {
      if (ws.name === 'MARKET IMPACT') {
        const widgetList = [
          { id: `prices-${now}-0`,  type: 'prices'  },
          { id: `chart-${now}-1`,   type: 'chart'   },
          { id: `heatmap-${now}-2`, type: 'heatmap' },
          { id: `feed-${now}-3`,    type: 'feed'    },
          { id: `rss-${now}-4`,     type: 'rss'     },
        ]
        const layoutList = [
          { i: widgetList[0].id, x: 0,  y: 0,  w: 12, h: 8 },
          { i: widgetList[1].id, x: 12, y: 0,  w: 12, h: 8 },
          { i: widgetList[2].id, x: 0,  y: 8,  w: 12, h: 8 },
          { i: widgetList[3].id, x: 12, y: 8,  w: 12, h: 8 },
          { i: widgetList[4].id, x: 0,  y: 16, w: 16, h: 8 },
        ]
        localStorage.setItem(widgetsKey(ws.id), JSON.stringify(widgetList))
        localStorage.setItem(wsKey(ws.id),       JSON.stringify(layoutList))
        localStorage.setItem(`vigil_rss_feeds_${widgetList[4].id}`, JSON.stringify(TEMPLATE_RSS_DEFAULTS['MARKET IMPACT']))
        const miKwds = TEMPLATE_KEYWORDS['MARKET IMPACT']
        localStorage.setItem(kfTabsKey(widgetList[3].id), JSON.stringify(miKwds.map((kw, i) => ({ id: `kw-${i}`, keyword: kw }))))
      }
      if (ws.name === 'TECH COLD WAR') {
        let widgets = []
        try { const r = localStorage.getItem(widgetsKey(ws.id)); if (r) widgets = JSON.parse(r) } catch {}
        const rssWidget = widgets.find(w => w.type === 'rss')
        if (rssWidget) {
          localStorage.setItem(`vigil_rss_feeds_${rssWidget.id}`, JSON.stringify(TEMPLATE_RSS_DEFAULTS['TECH COLD WAR']))
        }
      }
    })
    localStorage.setItem(MIGRATION_FLAG, '1')
  } catch {}
})()

function renderWidgetComponent(widget, { onClose, onFullscreen, isFullscreen, onCollapse, collapsed, settings, updateSetting }) {
  const p = { onClose, onFullscreen, isFullscreen, onCollapse, collapsed }
  switch (widget.type) {
    case 'map':       return <AtlasWidget         {...p} widgetId={widget.id} />
    case 'feeds':     return <FeedsWidget         {...p} />
    case 'feed':      return <KeywordFeed         {...p} widgetId={widget.id} />
    case 'rss':       return <RssFeed             {...p} widgetId={widget.id} />
    case 'prices':    return <PriceTracker        {...p} widgetId={widget.id} />
    case 'stream':    return <Livestream          {...p} initialUrl={settings.livestreamUrl}  onUrlChange={url  => updateSetting('livestreamUrl', url)} />
    case 'weather':   return <Weather             {...p} widgetId={widget.id} initialCity={settings.weatherCity} onCityChange={city => updateSetting('weatherCity', city)} />
    case 'conflict':  return <ConflictFeed        {...p} />
    case 'chart':     return <ChartWidget         {...p} widgetId={widget.id} />
    case 'heatmap':   return <HeatmapWidget       {...p} />
    case 'browser':   return <ArticleReaderWidget {...p} widgetId={widget.id} />
    case 'social':    return <SocialFeed          {...p} widgetId={widget.id} />
    case 'portfolio': return <PortfolioWidget     {...p} widgetId={widget.id} />
    default:          return null
  }
}

const _INIT_WS = resolveInitialWs()

export default function App() {
  const [workspaces,   setWorkspaces]   = useState(readWorkspacesMeta)
  const [activeWs,     setActiveWs]     = useState(_INIT_WS)
  const [layout,       setLayout]       = useState(() => readLayout(_INIT_WS))
  const [settings,     setSettings]     = useState(() => readSettings(_INIT_WS))
  const [widgets,      setWidgets]      = useState(() => readWidgets(_INIT_WS))
  const [fullscreenId, setFullscreenId] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [collapseMap,  setCollapseMap]  = useState({})
  const [saved,        setSaved]        = useState(false)
  const [user,         setUser]         = useState(null)
  const [authLoading,  setAuthLoading]  = useState(true)
  const [authView,     setAuthView]     = useState('login')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const saveTimer         = useRef(null)
  const savedTimer        = useRef(null)
  const activeWsRef       = useRef(null)
  const layoutSnapshotRef = useRef(null)
  activeWsRef.current = activeWs

  function enterFullscreen(widgetId) {
    layoutSnapshotRef.current = layout.map(item => ({ ...item }))
    setFullscreenId(widgetId)
  }

  function exitFullscreen() {
    setFullscreenId(null)
    if (layoutSnapshotRef.current) {
      handleLayoutChange(layoutSnapshotRef.current)
      layoutSnapshotRef.current = null
    }
    setTimeout(() => window.dispatchEvent(new Event('resize')), 100)
  }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && fullscreenId) exitFullscreen() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreenId])

  function updateSetting(key, value) {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      localStorage.setItem(settingsKey(activeWsRef.current), JSON.stringify(next))
      return next
    })
  }

  function handleLayoutChange(newLayout) {
    setLayout(newLayout)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      localStorage.setItem(wsKey(activeWsRef.current), JSON.stringify(newLayout))
      setSaved(true)
      if (savedTimer.current) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setSaved(false), 2000)
    }, 1000)
  }

  function switchWorkspace(wsId) {
    if (wsId === activeWsRef.current) return
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
      localStorage.setItem(wsKey(activeWsRef.current), JSON.stringify(layout))
    }
    setActiveWs(wsId)
    localStorage.setItem(ACTIVE_WS_KEY, wsId)
    setLayout(readLayout(wsId))
    setSettings(readSettings(wsId))
    setWidgets(readWidgets(wsId))
    setFullscreenId(null)
    layoutSnapshotRef.current = null
    setCollapseMap({})
  }

  function renameWorkspace(id, name) {
    setWorkspaces(prev => {
      const next = prev.map(w => w.id === id ? { ...w, name } : w)
      localStorage.setItem(WS_META_KEY, JSON.stringify(next))
      return next
    })
    supabase.from('workspaces').update({ name }).eq('id', id).then(() => {})
  }

  function addWorkspace() {
    if (workspaces.length >= 6) return
    const id   = `ws-${Date.now()}`
    const maxN = workspaces.reduce((m, w) => {
      const n = parseInt(w.name.replace('Workspace ', ''), 10)
      return isNaN(n) ? m : Math.max(m, n)
    }, workspaces.length)
    const name = `Workspace ${maxN + 1}`
    const next = [...workspaces, { id, name }]
    setWorkspaces(next)
    localStorage.setItem(WS_META_KEY, JSON.stringify(next))
    localStorage.setItem(widgetsKey(id), JSON.stringify([]))
    localStorage.setItem(wsKey(id),      JSON.stringify([]))
    switchWorkspace(id)
  }

  function deleteWorkspace(wsId) {
    if (workspaces.length <= 1) return
    const next = workspaces.filter(w => w.id !== wsId)
    setWorkspaces(next)
    localStorage.setItem(WS_META_KEY, JSON.stringify(next))
    localStorage.removeItem(wsKey(wsId))
    localStorage.removeItem(settingsKey(wsId))
    localStorage.removeItem(widgetsKey(wsId))
    if (wsId === activeWsRef.current) {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
      const fallback = next[0].id
      setActiveWs(fallback)
      localStorage.setItem(ACTIVE_WS_KEY, fallback)
      setLayout(readLayout(fallback))
      setSettings(readSettings(fallback))
      setWidgets(readWidgets(fallback))
      setFullscreenId(null)
      layoutSnapshotRef.current = null
      setCollapseMap({})
    }
  }

  function duplicateWorkspace(wsId) {
    if (workspaces.length >= 6) return
    const src  = workspaces.find(w => w.id === wsId)
    const id   = `ws-${Date.now()}`
    const next = [...workspaces, { id, name: `${src.name} (copy)` }]
    setWorkspaces(next)
    localStorage.setItem(WS_META_KEY, JSON.stringify(next))
    localStorage.setItem(wsKey(id),       JSON.stringify(readLayout(wsId)))
    localStorage.setItem(settingsKey(id), JSON.stringify(readSettings(wsId)))
    localStorage.setItem(widgetsKey(id),  JSON.stringify(readWidgets(wsId)))
    switchWorkspace(id)
  }

  function addWidget(type) {
    const id          = `${type}-${Date.now()}`
    const nextWidgets = [...widgets, { id, type }]
    setWidgets(nextWidgets)
    localStorage.setItem(widgetsKey(activeWsRef.current), JSON.stringify(nextWidgets))
    const maxY       = layout.reduce((m, item) => Math.max(m, item.y + item.h), 0)
    const dims       = WIDGET_DEFAULTS[type] ?? { w: 4, h: 8 }
    const nextLayout = [...layout, { i: id, x: 0, y: maxY, ...dims }]
    setLayout(nextLayout)
    localStorage.setItem(wsKey(activeWsRef.current), JSON.stringify(nextLayout))
    setShowAddModal(false)
  }

  function removeWidget(widgetId) {
    const nextWidgets = widgets.filter(w => w.id !== widgetId)
    setWidgets(nextWidgets)
    localStorage.setItem(widgetsKey(activeWsRef.current), JSON.stringify(nextWidgets))
    const nextLayout = layout.filter(item => item.i !== widgetId)
    setLayout(nextLayout)
    localStorage.setItem(wsKey(activeWsRef.current), JSON.stringify(nextLayout))
    if (fullscreenId === widgetId) { setFullscreenId(null); layoutSnapshotRef.current = null }
    setCollapseMap(prev => { const next = { ...prev }; delete next[widgetId]; return next })
  }

  function toggleCollapse(widgetId) {
    const isCollapsed = !!collapseMap[widgetId]
    const wType    = widgets.find(w => w.id === widgetId)?.type
    const defaultH = WIDGET_DEFAULTS[wType]?.h ?? 8
    if (isCollapsed) {
      const savedH = (collapseMap[widgetId] > 1) ? collapseMap[widgetId] : defaultH
      setLayout(prev => prev.map(item => item.i === widgetId ? { ...item, h: savedH } : item))
      setCollapseMap(prev => { const next = { ...prev }; delete next[widgetId]; return next })
    } else {
      const item    = layout.find(i => i.i === widgetId)
      const current = item?.h ?? defaultH
      const saveH   = current > 1 ? current : defaultH
      setLayout(prev => prev.map(i => i.i === widgetId ? { ...i, h: 1 } : i))
      setCollapseMap(prev => ({ ...prev, [widgetId]: saveH }))
    }
  }

  const fsWidget  = fullscreenId ? widgets.find(w => w.id === fullscreenId) ?? null : null
  const fsCatalog = fsWidget ? WIDGET_CATALOG.find(c => c.type === fsWidget.type) : null

  // AUTH GATE DISABLED — re-enable for production
  // if (authLoading) return <div className="auth-init-screen"><div className="auth-init-inner"><div className="auth-spinner" /><span className="auth-init-text">INITIALIZING...</span></div></div>
  // if (!user) return <AuthScreen authView={authView} setAuthView={setAuthView} />

  return (
    <div className="app">
      <NavBar
        saved={saved}
        workspaces={workspaces}
        activeWs={activeWs}
        onSwitchWs={switchWorkspace}
        onRenameWs={renameWorkspace}
        onAddWs={addWorkspace}
        onDeleteWs={deleteWorkspace}
        onDuplicateWs={duplicateWorkspace}
        onShowAddModal={() => setShowAddModal(true)}
        user={user}
        onSignOut={() => supabase.auth.signOut()}
      />
      <div style={{ width: '100%', height: 'calc(100vh - 40px)', overflowY: 'auto', position: 'relative' }}>
        <SizedGridLayout
          layout={layout}
          onLayoutChange={handleLayoutChange}
          cols={24}
          rowHeight={32}
          margin={[6, 6]}
          containerPadding={[8, 8]}
          draggableHandle=".widget-header"
          resizeHandles={['se', 'sw', 'ne', 'nw', 's', 'e', 'n', 'w']}
          compactType="vertical"
          preventCollision={false}
          isResizable
          isDraggable
        >
          {widgets.map(widget => (
            <div key={widget.id} style={{ height: '100%', overflow: 'hidden' }}>
              {renderWidgetComponent(widget, {
                onClose:      () => removeWidget(widget.id),
                onFullscreen: () => enterFullscreen(widget.id),
                isFullscreen: false,
                onCollapse:   () => toggleCollapse(widget.id),
                collapsed:    !!collapseMap[widget.id],
                settings,
                updateSetting,
              })}
            </div>
          ))}
        </SizedGridLayout>
        <button className="fab-add" onClick={() => setShowAddModal(true)} title="Add widget">+</button>
      </div>

      {showAddModal && <AddWidgetModal onAdd={addWidget} onClose={() => setShowAddModal(false)} />}

      {fsWidget && createPortal(
        <div className="fullscreen-overlay">
          <div className="fs-bar">
            <span className="fs-bar-title">{fsCatalog?.icon} {fsCatalog?.label ?? 'Widget'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '10px', color: '#3a4a5c', letterSpacing: '0.1em' }}>ESC to exit</span>
              <button className="fs-exit-btn" onClick={exitFullscreen}>⤡ Exit Fullscreen</button>
            </div>
          </div>
          <div className="fs-content">
            {renderWidgetComponent(fsWidget, {
              onClose:      () => { removeWidget(fullscreenId) },
              onFullscreen: exitFullscreen,
              isFullscreen: true,
              onCollapse:   undefined,
              collapsed:    false,
              settings,
              updateSetting,
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
