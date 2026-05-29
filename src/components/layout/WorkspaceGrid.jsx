import { ReactGridLayout as GridLayout, WidthProvider } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import WidgetRenderer from './WidgetRenderer'

const SizedGridLayout = WidthProvider(GridLayout)

export default function WorkspaceGrid({
  layout, widgets, collapseMap, settings, workspacePaused, isActiveWs,
  fullscreenId, onLayoutChange, onClose, onFullscreen, onCollapse, updateSetting,
}) {
  return (
    <SizedGridLayout
      layout={layout}
      onLayoutChange={onLayoutChange}
      cols={24}
      rowHeight={32}
      margin={[6, 6]}
      containerPadding={[8, 8]}
      draggableHandle=".widget-header"
      resizeHandles={['se', 'sw', 'ne', 'nw', 's', 'e', 'n', 'w']}
      compactType="vertical"
      preventCollision={false}
      isResizable={isActiveWs}
      isDraggable={isActiveWs}
    >
      {widgets.map(widget => (
        <div
          key={widget.id}
          style={{ height: '100%', overflow: 'hidden', visibility: fullscreenId === widget.id ? 'hidden' : undefined }}
        >
          <WidgetRenderer
            widget={widget}
            onClose={() => onClose(widget.id)}
            onFullscreen={() => onFullscreen(widget.id)}
            isFullscreen={false}
            onCollapse={() => onCollapse(widget.id)}
            collapsed={!!(collapseMap[widget.id])}
            settings={settings}
            updateSetting={updateSetting}
            workspacePaused={workspacePaused}
          />
        </div>
      ))}
    </SizedGridLayout>
  )
}
