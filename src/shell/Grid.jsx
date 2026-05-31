import { ReactGridLayout as GridLayout, WidthProvider } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { useShellStore, isWorkspacePaused } from '../state/shellStore.js'
import WidgetHost from './WidgetHost.jsx'

const SizedGridLayout = WidthProvider(GridLayout)

export default function Grid() {
  const activeWs = useShellStore(s => s.activeWs)
  const workspaces = useShellStore(s => s.workspaces)
  const globalLive = useShellStore(s => s.globalLive)
  const pausedWorkspaces = useShellStore(s => s.pausedWorkspaces)
  const inactiveTabPause = useShellStore(s => s.inactiveTabPause)
  const entitlements = useShellStore(s => s.entitlements)
  const updateLayout = useShellStore(s => s.updateLayout)
  const updateWidgetConfig = useShellStore(s => s.updateWidgetConfig)

  const workspace = workspaces.find(ws => ws.id === activeWs)
  if (!workspace) return null

  const pauseState = { globalLive, activeWs, pausedWorkspaces, inactiveTabPause }
  const workspacePaused = isWorkspacePaused(pauseState, activeWs)

  return (
    <SizedGridLayout
      layout={workspace.layout}
      onLayoutChange={layout => updateLayout(activeWs, layout)}
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
      {workspace.widgets.map(widget => (
        <div key={widget.id} style={{ height: '100%', overflow: 'hidden' }}>
          <WidgetHost
            widget={widget}
            workspacePaused={workspacePaused}
            entitlements={entitlements}
            onSaveConfig={config => updateWidgetConfig(activeWs, widget.id, config)}
          />
        </div>
      ))}
    </SizedGridLayout>
  )
}
