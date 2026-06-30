export function InfoTooltip({ text, wide }) {
  return (
    <span className="info-tip-wrap">
      <span className="info-tip-btn">?</span>
      <span className={`info-tip-box${wide ? ' info-tip-box-wide' : ''}`}>{text}</span>
    </span>
  )
}
