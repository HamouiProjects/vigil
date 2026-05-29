import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { DEFAULT_TEMPLATES, TEMPLATE_KEYWORDS, TEMPLATE_RSS_DEFAULTS, MIGRATION_FLAG } from '../constants/templates'
import { WIDGET_DEFAULTS } from '../constants/widgetTypes'
import {
  readSettings, readWorkspacesMeta, readWidgets, readLayout, resolveInitialWs,
  WS_META_KEY, ACTIVE_WS_KEY, settingsKey, widgetsKey, wsKey, collapseKey,
} from '../utils/workspaceHelpers'
import { kfTabsKey } from '../components/widgets/NewsSearchWidget'

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

const _INIT_WS = resolveInitialWs()

export default function useWorkspaces() {
  const [workspaces,   setWorkspaces]   = useState(readWorkspacesMeta)
  const [activeWs,     setActiveWs]     = useState(_INIT_WS)
  const [fullscreenId, setFullscreenId] = useState(null)
  const [saved,        setSaved]        = useState(false)
  const [mountedWs,    setMountedWs]    = useState(() => new Set([_INIT_WS]))
  const [wsLayouts,    setWsLayouts]    = useState(() => {
    const wss = readWorkspacesMeta()
    return Object.fromEntries(wss.map(ws => [ws.id, readLayout(ws.id)]))
  })
  const [wsWidgets,    setWsWidgets]    = useState(() => {
    const wss = readWorkspacesMeta()
    return Object.fromEntries(wss.map(ws => [ws.id, readWidgets(ws.id)]))
  })
  const [wsSettings,   setWsSettings]   = useState(() => {
    const wss = readWorkspacesMeta()
    return Object.fromEntries(wss.map(ws => [ws.id, readSettings(ws.id)]))
  })
  const [wsCollapse,   setWsCollapse]   = useState(() => {
    const wss = readWorkspacesMeta()
    return Object.fromEntries(wss.map(ws => {
      try {
        const raw = localStorage.getItem(collapseKey(ws.id))
        return [ws.id, raw ? JSON.parse(raw) : {}]
      } catch { return [ws.id, {}] }
    }))
  })

  const saveTimers        = useRef({})
  const savedTimer        = useRef(null)
  const activeWsRef       = useRef(null)
  const layoutSnapshotRef = useRef(null)
  const wsLayoutsRef      = useRef(wsLayouts)
  activeWsRef.current  = activeWs
  wsLayoutsRef.current = wsLayouts

  useEffect(() => {
    setMountedWs(prev => {
      if (prev.has(activeWs)) return prev
      return new Set([...prev, activeWs])
    })
  }, [activeWs])

  function updateSetting(key, value) {
    const wsId = activeWsRef.current
    setWsSettings(prev => {
      const next = { ...prev, [wsId]: { ...(prev[wsId] ?? {}), [key]: value } }
      localStorage.setItem(settingsKey(wsId), JSON.stringify(next[wsId]))
      return next
    })
  }

  function handleLayoutChange(wsId, newLayout) {
    setWsLayouts(prev => ({ ...prev, [wsId]: newLayout }))
    if (saveTimers.current[wsId]) clearTimeout(saveTimers.current[wsId])
    saveTimers.current[wsId] = setTimeout(() => {
      localStorage.setItem(wsKey(wsId), JSON.stringify(newLayout))
      delete saveTimers.current[wsId]
      if (wsId === activeWsRef.current) {
        setSaved(true)
        if (savedTimer.current) clearTimeout(savedTimer.current)
        savedTimer.current = setTimeout(() => setSaved(false), 2000)
      }
    }, 1000)
  }

  function enterFullscreen(widgetId) {
    layoutSnapshotRef.current = (wsLayoutsRef.current[activeWsRef.current] ?? []).map(item => ({ ...item }))
    setFullscreenId(widgetId)
  }

  function exitFullscreen() {
    setFullscreenId(null)
    if (layoutSnapshotRef.current) {
      handleLayoutChange(activeWsRef.current, layoutSnapshotRef.current)
      layoutSnapshotRef.current = null
    }
    setTimeout(() => window.dispatchEvent(new Event('resize')), 100)
  }

  function switchWorkspace(wsId) {
    if (wsId === activeWsRef.current) return
    const currentWs = activeWsRef.current
    if (saveTimers.current[currentWs]) {
      clearTimeout(saveTimers.current[currentWs])
      delete saveTimers.current[currentWs]
      localStorage.setItem(wsKey(currentWs), JSON.stringify(wsLayoutsRef.current[currentWs] ?? []))
    }
    setActiveWs(wsId)
    localStorage.setItem(ACTIVE_WS_KEY, wsId)
    setFullscreenId(null)
    layoutSnapshotRef.current = null
    setTimeout(() => window.dispatchEvent(new Event('resize')), 100)
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
    setWsLayouts(prev  => ({ ...prev, [id]: [] }))
    setWsWidgets(prev  => ({ ...prev, [id]: [] }))
    setWsSettings(prev => ({ ...prev, [id]: {} }))
    setWsCollapse(prev => ({ ...prev, [id]: {} }))
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
    localStorage.removeItem(collapseKey(wsId))
    if (saveTimers.current[wsId]) { clearTimeout(saveTimers.current[wsId]); delete saveTimers.current[wsId] }
    setMountedWs(prev  => { const s = new Set(prev); s.delete(wsId); return s })
    setWsLayouts(prev  => { const n = { ...prev }; delete n[wsId]; return n })
    setWsWidgets(prev  => { const n = { ...prev }; delete n[wsId]; return n })
    setWsSettings(prev => { const n = { ...prev }; delete n[wsId]; return n })
    setWsCollapse(prev => { const n = { ...prev }; delete n[wsId]; return n })
    if (wsId === activeWsRef.current) {
      const fallback = next[0].id
      setActiveWs(fallback)
      localStorage.setItem(ACTIVE_WS_KEY, fallback)
      setFullscreenId(null)
      layoutSnapshotRef.current = null
      setTimeout(() => window.dispatchEvent(new Event('resize')), 100)
    }
  }

  function duplicateWorkspace(wsId) {
    if (workspaces.length >= 6) return
    const src         = workspaces.find(w => w.id === wsId)
    const id          = `ws-${Date.now()}`
    const next        = [...workspaces, { id, name: `${src.name} (copy)` }]
    const srcLayout   = wsLayouts[wsId]  ?? readLayout(wsId)
    const srcSettings = wsSettings[wsId] ?? readSettings(wsId)
    const srcWidgets  = wsWidgets[wsId]  ?? readWidgets(wsId)
    setWorkspaces(next)
    localStorage.setItem(WS_META_KEY,     JSON.stringify(next))
    localStorage.setItem(wsKey(id),       JSON.stringify(srcLayout))
    localStorage.setItem(settingsKey(id), JSON.stringify(srcSettings))
    localStorage.setItem(widgetsKey(id),  JSON.stringify(srcWidgets))
    setWsLayouts(prev  => ({ ...prev, [id]: srcLayout }))
    setWsWidgets(prev  => ({ ...prev, [id]: [...srcWidgets] }))
    setWsSettings(prev => ({ ...prev, [id]: { ...srcSettings } }))
    setWsCollapse(prev => ({ ...prev, [id]: {} }))
    switchWorkspace(id)
  }

  function addWidget(type) {
    const wsId = activeWsRef.current
    const id   = `${type}-${Date.now()}`
    setWsWidgets(prev => {
      const next = [...(prev[wsId] ?? []), { id, type }]
      localStorage.setItem(widgetsKey(wsId), JSON.stringify(next))
      return { ...prev, [wsId]: next }
    })
    setWsLayouts(prev => {
      const cur  = prev[wsId] ?? []
      const maxY = cur.reduce((m, item) => Math.max(m, item.y + item.h), 0)
      const dims = WIDGET_DEFAULTS[type] ?? { w: 4, h: 8 }
      const next = [...cur, { i: id, x: 0, y: maxY, ...dims }]
      localStorage.setItem(wsKey(wsId), JSON.stringify(next))
      return { ...prev, [wsId]: next }
    })
  }

  function removeWidget(wsId, widgetId) {
    setWsWidgets(prev => {
      const next = (prev[wsId] ?? []).filter(w => w.id !== widgetId)
      localStorage.setItem(widgetsKey(wsId), JSON.stringify(next))
      return { ...prev, [wsId]: next }
    })
    setWsLayouts(prev => {
      const next = (prev[wsId] ?? []).filter(item => item.i !== widgetId)
      localStorage.setItem(wsKey(wsId), JSON.stringify(next))
      return { ...prev, [wsId]: next }
    })
    if (fullscreenId === widgetId) {
      setFullscreenId(null)
      layoutSnapshotRef.current = null
    }
    setWsCollapse(prev => {
      const next = { ...(prev[wsId] ?? {}) }
      delete next[widgetId]
      try { localStorage.setItem(collapseKey(wsId), JSON.stringify(next)) } catch {}
      return { ...prev, [wsId]: next }
    })
  }

  function toggleCollapse(wsId, widgetId) {
    const collapseMap = wsCollapse[wsId] ?? {}
    const isCollapsed = !!collapseMap[widgetId]
    const wType       = (wsWidgets[wsId] ?? []).find(w => w.id === widgetId)?.type
    const defaultH    = WIDGET_DEFAULTS[wType]?.h ?? 8
    if (isCollapsed) {
      const savedH = (collapseMap[widgetId] > 1) ? collapseMap[widgetId] : defaultH
      setWsLayouts(prev => ({
        ...prev,
        [wsId]: (prev[wsId] ?? []).map(item => item.i === widgetId ? { ...item, h: savedH } : item),
      }))
      const nextCollapse = { ...collapseMap }
      delete nextCollapse[widgetId]
      setWsCollapse(prev => ({ ...prev, [wsId]: nextCollapse }))
      try { localStorage.setItem(collapseKey(wsId), JSON.stringify(nextCollapse)) } catch {}
    } else {
      const item    = (wsLayouts[wsId] ?? []).find(i => i.i === widgetId)
      const current = item?.h ?? defaultH
      const saveH   = current > 1 ? current : defaultH
      setWsLayouts(prev => ({
        ...prev,
        [wsId]: (prev[wsId] ?? []).map(i => i.i === widgetId ? { ...i, h: 1 } : i),
      }))
      const nextCollapse = { ...collapseMap, [widgetId]: saveH }
      setWsCollapse(prev => ({ ...prev, [wsId]: nextCollapse }))
      try { localStorage.setItem(collapseKey(wsId), JSON.stringify(nextCollapse)) } catch {}
    }
  }

  return {
    workspaces, activeWs, mountedWs, wsLayouts, wsWidgets, wsSettings, wsCollapse,
    saved, fullscreenId,
    activeWsRef, layoutSnapshotRef, wsLayoutsRef,
    switchWorkspace, renameWorkspace, addWorkspace, deleteWorkspace, duplicateWorkspace,
    handleLayoutChange, addWidget, removeWidget, updateSetting, toggleCollapse,
    enterFullscreen, exitFullscreen,
  }
}
