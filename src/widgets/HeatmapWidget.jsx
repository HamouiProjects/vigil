const HEATMAP_URL = "https://s.tradingview.com/embed-widget/stock-heatmap/?locale=en#%7B%22exchanges%22%3A%5B%5D%2C%22dataSource%22%3A%22SPX500%22%2C%22grouping%22%3A%22sector%22%2C%22blockSize%22%3A%22market_cap_basic%22%2C%22blockColor%22%3A%22change%22%2C%22locale%22%3A%22en%22%2C%22symbolUrl%22%3A%22%22%2C%22colorTheme%22%3A%22dark%22%2C%22hasTopBar%22%3Afalse%2C%22isDataSetEnabled%22%3Afalse%2C%22isZoomEnabled%22%3Atrue%2C%22hasSymbolTooltip%22%3Atrue%2C%22isMonoSize%22%3Afalse%2C%22width%22%3A%22100%25%22%2C%22height%22%3A%22100%25%22%7D"

export default function HeatmapWidget({ id, paused }) {
  return (
    <div className="widget" data-widget-id={id}>
      <div className="widget-header widget-drag-handle" style={{ cursor: 'default' }}>
        <div className="widget-title-group">
          <span className="widget-title">HEATMAP</span>
        </div>
        {paused && (
          <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            PAUSED
          </span>
        )}
      </div>

      <iframe
        src={paused ? '' : HEATMAP_URL}
        style={{ flex: 1, width: '100%', minHeight: 0, border: 'none', display: 'block' }}
        title="Market Heatmap"
        allow="clipboard-write"
      />

      <div className="attr-line">via TradingView</div>
    </div>
  )
}
