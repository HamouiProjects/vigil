import { ReactGridLayout as GridLayout, WidthProvider } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { useShellStore, isWorkspacePaused } from '../state/shellStore.js'
import { useSources } from '../data/useSources.js'
import WidgetHost from './WidgetHost.jsx'

const SizedGridLayout = WidthProvider(GridLayout)

function mergeLayout(widgets, storedLayout, rglLayout) {
  const rglById = new Map(rglLayout.map(item => [item.i, item]))
  return widgets
    .map(w => rglById.get(w.id) ?? storedLayout.find(item => item.i === w.id))
    .filter(Boolean)
}

export default function Grid() {
  const { sources, addSource, removeSource } = useSources()
  const activeWs = useShellStore(s => s.activeWs)
  const workspaces = useShellStore(s => s.workspaces)
  const globalLive = useShellStore(s => s.globalLive)
  const pausedWorkspaces = useShellStore(s => s.pausedWorkspaces)
  const inactiveTabPause = useShellStore(s => s.inactiveTabPause)
  const entitlements = useShellStore(s => s.entitlements)
  const updateLayout = useShellStore(s => s.updateLayout)
  const updateWidgetConfig = useShellStore(s => s.updateWidgetConfig)
  const removeWidget = useShellStore(s => s.removeWidget)
  const toggleWidgetPause = useShellStore(s => s.toggleWidgetPause)

  const workspace = workspaces.find(ws => ws.id === activeWs)
  if (!workspace) return null

  const pauseState = { globalLive, activeWs, pausedWorkspaces, inactiveTabPause }
  const workspacePaused = isWorkspacePaused(pauseState, activeWs)

  function toggleCollapse(widget, gridItem) {
    if (!widget.config?.collapsed) {
      updateWidgetConfig(activeWs, widget.id, { ...widget.config, collapsed: true, expandedH: gridItem.h })
      updateLayout(activeWs, workspace.layout.map(l => l.i === widget.id ? { ...l, h: 1, isResizable: false } : l))
    } else {
      updateWidgetConfig(activeWs, widget.id, { ...widget.config, collapsed: false })
      updateLayout(activeWs, workspace.layout.map(l => l.i === widget.id ? { ...l, h: (widget.config?.expandedH ?? 6), isResizable: true } : l))
    }
  }

  return (
    <SizedGridLayout
      layout={workspace.layout}
      onLayoutChange={layout => updateLayout(activeWs, mergeLayout(workspace.widgets, workspace.layout, layout))}
      cols={24}
      rowHeight={32}
      margin={[6, 6]}
      containerPadding={[8, 8]}
      draggableHandle=".widget-header"
      resizeHandles={['se', 'sw', 'ne', 'nw', 's', 'e', 'n', 'w']}
      compactType="vertical"
      preventCollision={false}
      useCSSTransforms={false}
      isResizable
      isDraggable
    >
      {workspace.widgets.map(widget => {
        const gridItem = workspace.layout.find(item => item.i === widget.id)
        if (!gridItem) return null
        const collapsed = !!widget.config?.collapsed
        return (
          <div
            key={widget.id}
            data-grid={{ ...gridItem }}
            style={{ height: '100%', overflow: 'hidden' }}
          >
            <WidgetHost
              widget={widget}
              workspacePaused={workspacePaused}
              widgetPaused={widget.paused === true}
              collapsed={collapsed}
              onToggleCollapse={() => toggleCollapse(widget, gridItem)}
              onTogglePause={() => toggleWidgetPause(activeWs, widget.id)}
              entitlements={entitlements}
              onSaveConfig={config => updateWidgetConfig(activeWs, widget.id, config)}
              onRemove={() => removeWidget(activeWs, widget.id)}
              sources={sources}
              onAddSource={addSource}
              onRemoveSource={removeSource}
            />
          </div>
        )
      })}
    </SizedGridLayout>
  )
}
