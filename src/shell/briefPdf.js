// PDF export for the brief, extracted from BriefPanel so the jspdf-heavy logic
// lives on its own. buildBriefPdf builds the document and triggers the download.
// Behavior is unchanged from the previous inline handler: same white document
// surface, same layout, same graceful fallbacks on any image or chart failure.
import { relativeTime, cleanExcerpt, fmtPct, trendGlyph, isHttpUrl, hostnameOf, DEG } from '../../shared/briefFormat.js'

function writeBriefItemPdf(doc, item, margin, yRef, contentW, ensure) {
  const title = String(item.title || '').trim()
  if (title) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(33, 33, 33)
    for (const ln of doc.splitTextToSize(title, contentW)) {
      ensure(5)
      doc.text(ln, margin, yRef.y)
      yRef.y += 5
    }
    yRef.y += 0.5
  }
  const excerpt = cleanExcerpt(item.excerpt, item.title)
  if (excerpt) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(80, 80, 80)
    for (const ln of doc.splitTextToSize(excerpt, contentW)) {
      ensure(5)
      doc.text(ln, margin, yRef.y)
      yRef.y += 5
    }
    yRef.y += 0.5
  }
  const outlet = (item.source || '').trim() || hostnameOf(item.url)
  const date = relativeTime(item.publishedAt)
  ensure(5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  let x = margin
  if (outlet) {
    if (isHttpUrl(item.url)) {
      doc.setTextColor(20, 90, 160)
      doc.textWithLink(outlet, x, yRef.y, { url: item.url })
    } else {
      doc.setTextColor(80, 80, 80)
      doc.text(outlet, x, yRef.y)
    }
    x += doc.getTextWidth(outlet) + 3
  }
  if (date) {
    doc.setTextColor(120, 120, 120)
    doc.text(date, x, yRef.y)
  }
  yRef.y += 6
}

const TRENDS_CHART_W = 280
const TRENDS_CHART_H = 72
const TRENDS_PDF_STROKES = ['#0A6B61', '#155E86', '#6F4D08', '#AE2E27', '#0A6B43']

function svgToPngDataUrl(svgEl, strokeOverrides) {
  return new Promise((resolve) => {
    try {
      const clone = svgEl.cloneNode(true)
      const origLines = svgEl.querySelectorAll('polyline')
      const cloneLines = clone.querySelectorAll('polyline')
      origLines.forEach((el, i) => {
        const stroke = strokeOverrides?.[i] || getComputedStyle(el).stroke
        if (stroke && cloneLines[i]) cloneLines[i].setAttribute('stroke', stroke)
      })
      svgEl.querySelectorAll('line').forEach((orig, i) => {
        const el = clone.querySelectorAll('line')[i]
        if (el) {
          const stroke = getComputedStyle(orig).stroke
          if (stroke) el.setAttribute('stroke', stroke)
        }
      })
      if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone))
      const img = new Image()
      img.onload = () => {
        try {
          const vb = svgEl.viewBox?.baseVal
          const w = (vb && vb.width) || Number(svgEl.getAttribute('width')) || TRENDS_CHART_W
          const h = (vb && vb.height) || Number(svgEl.getAttribute('height')) || TRENDS_CHART_H
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          canvas.getContext('2d').drawImage(img, 0, 0, w, h)
          resolve({ dataUrl: canvas.toDataURL('image/png'), width: w, height: h })
        } catch { resolve(null) }
      }
      img.onerror = () => resolve(null)
      img.src = src
    } catch { resolve(null) }
  })
}

// Load a same-origin PNG into a dataURL (with natural dimensions) for jsPDF.
// Resolves null on any failure so the PDF export can fall back gracefully.
function loadPngDataUrl(src) {
  return new Promise((resolve) => {
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          canvas.getContext('2d').drawImage(img, 0, 0)
          resolve({ dataUrl: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight })
        } catch { resolve(null) }
      }
      img.onerror = () => resolve(null)
      img.src = src
    } catch { resolve(null) }
  })
}

// Build and download the brief PDF. trendsChartEl is the live Search Interest
// SVG element (or null); the chart is rasterized when present, with a text-row
// fallback otherwise. Throws are left to the caller to swallow.
export async function buildBriefPdf({ brief, ws, generatedAt, sourceCount, preparedFor, trendsChartEl }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 18
  const contentW = pageW - margin * 2
  let y = margin
  const ensure = (h) => { if (y + h > pageH - margin) { doc.addPage(); y = margin } }
  // White-surface mark at the top margin. On any load failure, fall back to
  // the title-only header (y stays at margin) and never break the export.
  try {
    const logo = await loadPngDataUrl('/email-logo-mark.png')
    if (logo && logo.width && logo.height) {
      const logoH = 14
      const logoW = logoH * (logo.width / logo.height)
      doc.addImage(logo.dataUrl, 'PNG', margin, y, logoW, logoH)
      y += logoH + 5
    }
  } catch { /* title-only header */ }
  const writeWrapped = (text, opts = {}) => {
    const { size = 10, style = 'normal', color = [33, 33, 33], gap = 1.5, lineH = 5 } = opts
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    doc.setTextColor(...color)
    for (const ln of doc.splitTextToSize(text, contentW)) {
      ensure(lineH)
      doc.text(ln, margin, y)
      y += lineH
    }
    y += gap
  }
  writeWrapped(ws?.name || 'Risk Room', { size: 14, style: 'bold', gap: 1 })
  const metaBits = []
  if (generatedAt) {
    metaBits.push('Generated ' + new Date(generatedAt).toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }))
  }
  if (sourceCount != null) {
    metaBits.push(sourceCount + (sourceCount === 1 ? ' source' : ' sources'))
  }
  if (metaBits.length) writeWrapped(metaBits.join('    '), { size: 9, color: [120, 120, 120], gap: 1 })
  if (preparedFor) writeWrapped('Prepared for ' + preparedFor, { size: 10, color: [80, 80, 80], gap: 2 })
  ensure(2)
  doc.setDrawColor(210, 210, 210)
  doc.line(margin, y, pageW - margin, y)
  y += 5
  writeWrapped(brief.headline, { size: 13, style: 'bold', gap: 3 })
  const partIndent = margin + 4
  const writePartLabel = (text) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(80, 80, 80)
    for (const ln of doc.splitTextToSize(text, contentW - 4)) {
      ensure(4.5)
      doc.text(ln, partIndent, y)
      y += 4.5
    }
    y += 0.5
  }
  const writePartEmpty = () => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(120, 120, 120)
    ensure(4.5)
    doc.text('No update this round', partIndent, y)
    y += 5
  }
  for (const section of brief.sections ?? []) {
    const label = section.label?.trim() || 'Source'
    writeWrapped(label, { size: 11, style: 'bold', gap: 1 })
    if (section.parts?.length) {
      for (const part of section.parts) {
        writePartLabel(part.label)
        if (part.items?.length) {
          const yRef = { y }
          for (const item of part.items) {
            writeBriefItemPdf(doc, item, partIndent, yRef, contentW - 4, ensure)
          }
          y = yRef.y
        } else {
          writePartEmpty()
        }
      }
      y += 2
      continue
    }
    if (section.items?.length) {
      const yRef = { y }
      for (const item of section.items) {
        writeBriefItemPdf(doc, item, margin, yRef, contentW, ensure)
      }
      y = yRef.y + 2
      continue
    }
    if (section.status === 'no_update') {
      writeWrapped(`No update from ${label}`, { size: 10, gap: 1.5 })
    } else if (section.summary?.trim()) {
      writeWrapped(section.summary, { size: 10, gap: 1 })
    }
    const url = section.sourceUrl
    if (url && url.startsWith('http')) {
      ensure(5)
      doc.setFontSize(9)
      doc.setTextColor(20, 90, 160)
      doc.textWithLink(label, margin, y, { url })
      y += 6
    }
    y += 2
  }
  const mkp = brief.markets
  if (mkp && ((mkp.rows?.length) || (mkp.heatmaps?.length))) {
    writeWrapped('Markets', { size: 11, style: 'bold', gap: 1 })
    writeWrapped('as of last refresh', { size: 8, color: [120, 120, 120], gap: 1.5 })
    const green = [10, 107, 67], red = [174, 46, 39], grey = [120, 120, 120], neutral = [33, 33, 33]
    const pdfRow = (left, price, pct, dir) => {
      ensure(5)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...neutral)
      doc.text(String(left), margin, y)
      if (price != null) doc.text(String(price), margin + 78, y)
      const col = dir === 'up' ? green : dir === 'down' ? red : grey
      doc.setTextColor(...col); doc.text(fmtPct(pct), margin + 108, y)
      y += 5
    }
    for (const r of (mkp.rows ?? [])) pdfRow(`${r.symbol}  ${r.name}`, r.currency ? `${r.price} ${r.currency}` : r.price, r.changePct, r.dir)
    for (const h of (mkp.heatmaps ?? [])) pdfRow(`${h.label} (${h.symbol})`, null, h.changePct, h.dir)
    y += 2
  }
  const trp = brief.trends
  if (trp && (trp.terms?.length)) {
    writeWrapped('Search Interest', { size: 11, style: 'bold', gap: 1 })
    writeWrapped(`relative search interest${trp.windowLabel ? ` over the last ${trp.windowLabel}` : ''}, not volume`, { size: 8, color: [120, 120, 120], gap: 1.5 })
    let trendsChartAdded = false
    try {
      const svgEl = trendsChartEl
      if (svgEl) {
        const strokeOverrides = []
        ;(trp.terms ?? []).forEach((t, i) => {
          if (Array.isArray(t.series) && t.series.length >= 2) {
            strokeOverrides.push(TRENDS_PDF_STROKES[i % TRENDS_PDF_STROKES.length])
          }
        })
        const chart = await svgToPngDataUrl(svgEl, strokeOverrides.length ? strokeOverrides : null)
        if (chart && chart.width && chart.height) {
          const chartH = 28
          const chartW = Math.min(contentW, chartH * (chart.width / chart.height))
          ensure(chartH + 2)
          doc.addImage(chart.dataUrl, 'PNG', margin, y, chartW, chartH)
          y += chartH + 3
          trendsChartAdded = true
        }
      }
    } catch { /* text rows fallback below */ }
    if (!trendsChartAdded) {
      for (const t of (trp.terms ?? [])) {
        ensure(5)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(33, 33, 33)
        doc.text(String(t.term), margin, y)
        doc.text(String(t.value), margin + 78, y)
        doc.setTextColor(80, 80, 80); doc.text(trendGlyph(t.dir), margin + 108, y)
        y += 5
      }
    }
    if (isHttpUrl(trp.googleTrendsUrl)) {
      ensure(5)
      doc.setFontSize(9)
      doc.setTextColor(20, 90, 160)
      doc.textWithLink('Google Trends', margin, y, { url: trp.googleTrendsUrl })
      y += 6
    }
    y += 2
  }
  const wxp = brief.weather
  if (wxp && wxp.locations && wxp.locations.length) {
    writeWrapped('Weather', { size: 11, style: 'bold', gap: 1 })
    for (const l of wxp.locations) {
      writeWrapped(String(l.name), { size: 10, style: 'bold', gap: 1 })
      writeWrapped(`${l.tempC}${DEG}C, feels ${l.feelsC}${DEG}C, ${l.condition}. Wind ${l.windKph} km/h, humidity ${l.humidity}%.`, { size: 9, color: [60, 60, 60], gap: 1 })
      if (l.todayMaxC != null) writeWrapped(`Today ${l.todayMaxC}${DEG} / ${l.todayMinC}${DEG}. Tomorrow ${l.tomorrowMaxC}${DEG} / ${l.tomorrowMinC}${DEG}, ${l.tomorrowCondition}.`, { size: 8, color: [120, 120, 120], gap: 1.5 })
    }
    y += 2
  }
  ensure(8)
  writeWrapped("Summary of this room's own sources. Vigil tracks, it does not verify.", { size: 8, color: [120, 120, 120] })
  doc.save('brief.pdf')
}
