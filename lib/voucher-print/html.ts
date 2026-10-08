import { amountInArabicWords, cellText, type CompanyInfo, type PrintDocument } from "./document"
import { paperDimensions, type VoucherPrintSettings } from "./settings"

export type PrintContext = { company: CompanyInfo; printedBy?: string; printedAt?: Date; barcodeSvg?: string }

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string)
const safeImage = (value: string) => /^(data:image\/[a-z+]+;base64,[a-z0-9+/=\s]+|https?:\/\/[^"'\s]+|\/[^"'\s]*)$/i.test(value) ? value : ""

export function visibleColumns(document: PrintDocument, settings: VoucherPrintSettings) {
  return document.columns.filter(column => !settings.hidden_columns.includes(column.key))
}

export function copyLabelsFor(settings: VoucherPrintSettings, documentLabel?: string) {
  const labels = settings.copy_labels.split(/[,،]/).map(label => label.trim()).filter(Boolean)
  return Array.from({ length: settings.copies }, (_, index) => {
    if (index === 0 && documentLabel) return documentLabel
    return labels[index] || (settings.copies > 1 && labels.length ? labels[labels.length - 1] : documentLabel ? "نسخة" : "")
  })
}

export function logoSource(raw: string) {
  const value = String(raw || "").trim()
  if (!value) return ""
  return safeImage(/^(data:|https?:|\/)/i.test(value) ? value : `data:image/png;base64,${value}`)
}

function copyHtml(document: PrintDocument, settings: VoucherPrintSettings, context: PrintContext, copyLabel: string) {
  const { company } = context
  const columns = visibleColumns(document, settings)
  const weights = columns.reduce((sum, column) => sum + (column.weight || 1), 0) + (settings.show_row_numbers ? 0.45 : 0)
  const logo = settings.show_logo ? logoSource(company.logo) : ""
  const companyLines = settings.show_company_info
    ? [company.address, [company.phone, company.email].filter(Boolean).join(" · "), company.taxNumber ? `الرقم الضريبي: ${company.taxNumber}` : ""].filter(Boolean)
    : []
  const fields = settings.show_fields ? (document.fields || []).filter(field => String(field.value ?? "").trim()) : []
  const signatures = settings.show_signatures ? settings.signatures.split(/[,،]/).map(label => label.trim()).filter(Boolean) : []
  const printedAt = context.printedAt || new Date()
  const meta = [
    settings.show_print_date ? `تاريخ الطباعة: ${printedAt.toLocaleString("en-GB", { hour12: false })}` : "",
    settings.show_printed_by && context.printedBy ? `طُبع بواسطة: ${context.printedBy}` : "",
  ].filter(Boolean)

  return `<section class="copy">
  <header class="head">
    <div class="brand">${logo ? `<img class="logo" src="${escapeHtml(logo)}" alt="">` : ""}<div><h1>${escapeHtml(company.name)}</h1>${companyLines.map(line => `<p>${escapeHtml(line)}</p>`).join("")}</div></div>
    <div class="doc"><span class="doc-title">${escapeHtml(document.title)}</span>${copyLabel ? `<span class="copy-label">${escapeHtml(copyLabel)}</span>` : ""}<b dir="ltr">${escapeHtml(document.code)}</b><small>${escapeHtml(String(document.date || "").slice(0, 10))}</small></div>
  </header>
  ${settings.header_text ? `<p class="header-text">${escapeHtml(settings.header_text)}</p>` : ""}
  ${fields.length ? `<div class="fields">${fields.map(field => `<div><small>${escapeHtml(field.label)}:</small> <b>${escapeHtml(field.value)}</b></div>`).join("")}</div>` : ""}
  ${columns.length ? `<table class="lines"><colgroup>${settings.show_row_numbers ? `<col style="width:${(0.45 / weights) * 100}%">` : ""}${columns.map(column => `<col style="width:${((column.weight || 1) / weights) * 100}%">`).join("")}</colgroup>
    <thead><tr>${settings.show_row_numbers ? "<th>#</th>" : ""}${columns.map(column => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr></thead>
    <tbody>${document.rows.map((row, index) => `<tr>${settings.show_row_numbers ? `<td class="num">${index + 1}</td>` : ""}${columns.map(column => `<td class="${column.numeric ? "num" : column.align === "center" ? "center" : ""}"${column.numeric ? ' dir="ltr"' : ""}>${escapeHtml(cellText(column, row[column.key]))}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>` : ""}
  <div class="summary">
    <div class="summary-side">
      ${settings.show_amount_in_words && document.amount !== undefined ? `<p class="words">${escapeHtml(amountInArabicWords(document.amount, document.currencyName))}</p>` : ""}
      ${settings.show_notes && document.notes ? `<div class="notes"><small>ملاحظات</small><p>${escapeHtml(document.notes)}</p></div>` : ""}
      ${settings.show_barcode && context.barcodeSvg ? `<div class="barcode">${context.barcodeSvg}</div>` : ""}
    </div>
    ${settings.show_totals && document.totals?.length ? `<div class="totals">${document.totals.map(total => `<div class="${total.strong ? "strong" : ""}"><span>${escapeHtml(total.label)}</span><b dir="ltr">${escapeHtml(typeof total.value === "number" ? total.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : total.value)}</b></div>`).join("")}</div>` : ""}
  </div>
  ${signatures.length ? `<div class="signatures">${signatures.map(label => `<div><span></span><small>${escapeHtml(label)}</small></div>`).join("")}</div>` : ""}
  ${settings.show_footer && (settings.footer_text || meta.length) ? `<footer class="foot">${settings.footer_text ? `<p>${escapeHtml(settings.footer_text)}</p>` : ""}${meta.length ? `<small>${escapeHtml(meta.join(" · "))}</small>` : ""}</footer>` : ""}
</section>`
}

export function renderPrintHtml(document: PrintDocument, settings: VoucherPrintSettings, context: PrintContext, options: { preview?: boolean; previewScale?: number } = {}) {
  const paper = paperDimensions(settings)
  const accent = settings.accent_color
  const base = settings.font_size
  const compact = paper.widthMm < 120
  const pageSize = paper.receipt ? `${paper.widthMm}mm auto` : `${paper.widthMm}mm ${paper.heightMm}mm`
  const pageNumbers = settings.show_page_numbers && !paper.receipt ? `@bottom-center{content:"صفحة " counter(page) " من " counter(pages);font:9px ${settings.font_family},Arial,sans-serif;color:#64748b}` : ""
  const templateCss = settings.template === "classic"
    ? `.head{border:2px solid #111;border-radius:0;padding:3mm}.lines th{background:#e5e7eb;color:#111}.lines th,.lines td{border:1px solid #111}.totals{border-radius:0;border-color:#111}`
    : settings.template === "minimal"
      ? `.head{border:0;border-bottom:1px solid #cbd5e1;padding:0 0 3mm}.lines th{background:transparent;color:#111;border-bottom:1.5px solid #111}.lines td{border-bottom:1px solid #e2e8f0}.totals{border:0;background:#f8fafc}`
      : ""
  const copies = copyLabelsFor(settings, document.copyLabel)
  const body = copies.map(label => copyHtml(document, settings, context, label)).join("")

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(document.title)} ${escapeHtml(document.code)}</title>
<style>
@page{size:${pageSize};margin:${settings.margin_top_mm}mm ${settings.margin_right_mm}mm ${settings.margin_bottom_mm}mm ${settings.margin_left_mm}mm;${pageNumbers}}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:${options.preview ? "#e2e8f0" : "#fff"}}
${options.preview && options.previewScale ? `html{zoom:${options.previewScale.toFixed(3)}}` : ""}
body{font-family:"${settings.font_family}",Cairo,Tahoma,Arial,sans-serif;font-size:${base}px;color:#0f172a;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.copy{display:flex;flex-direction:column;gap:${compact ? 2 : 3.5}mm;break-after:page}
.copy:last-child{break-after:auto}
${options.preview ? `.copy{width:${paper.widthMm}mm;min-height:${paper.receipt ? 120 : paper.heightMm}mm;margin:6mm auto;padding:${settings.margin_top_mm}mm ${settings.margin_right_mm}mm ${settings.margin_bottom_mm}mm ${settings.margin_left_mm}mm;background:#fff;box-shadow:0 6px 24px rgb(15 23 42/18%)}` : ""}
.head{display:flex;${compact ? "flex-direction:column;align-items:stretch;text-align:center;" : "align-items:center;justify-content:space-between;"}gap:3mm;padding:3mm 4mm;border:1px solid ${accent}33;border-top:4px solid ${accent};border-radius:3mm}
.brand{display:flex;align-items:center;gap:3mm;${compact ? "flex-direction:column;" : ""}min-width:0}
.logo{width:${compact ? 14 : 20}mm;height:${compact ? 14 : 20}mm;object-fit:contain}
.brand h1{font-size:${base * 1.5}px;font-weight:800;color:${accent}}
.brand p{font-size:${base * 0.85}px;color:#475569}
.doc{display:flex;flex-direction:column;align-items:${compact ? "center" : "flex-end"};gap:1px;flex-shrink:0}
.doc-title{padding:1mm 4mm;border-radius:999px;color:#fff;background:${accent};font-weight:800;font-size:${base * 1.15}px}
.copy-label{font-size:${base * 0.8}px;font-weight:700;color:${accent}}
.doc b{font-size:${base * 1.1}px;font-variant-numeric:tabular-nums}
.doc small{color:#64748b;font-size:${base * 0.85}px}
.header-text{text-align:center;font-weight:700;white-space:pre-wrap}
.fields{display:grid;grid-template-columns:repeat(${compact ? 2 : 3},minmax(0,1fr));gap:1mm 4mm}
.fields>div{min-width:0;overflow-wrap:anywhere}
.fields small{color:#64748b;font-size:${base * 0.85}px}
.fields b{font-size:${base * 0.95}px}
.lines{width:100%;border-collapse:collapse;table-layout:fixed;font-size:${base * (compact ? 0.82 : 0.9)}px}
.lines thead{display:table-header-group}
.lines tr{break-inside:avoid}
.lines th{padding:1.6mm 1.2mm;color:#fff;background:${accent};font-weight:700;text-align:center;vertical-align:middle;line-height:1.25;white-space:normal;word-break:normal;overflow-wrap:break-word;hyphens:none}
.lines td{padding:1.4mm 1.2mm;border-bottom:1px solid #e2e8f0;overflow-wrap:anywhere;vertical-align:top}
.lines tbody tr:nth-child(even) td{background:#f8fafc}
.lines .num{text-align:center;font-variant-numeric:tabular-nums;white-space:nowrap}
.lines .center{text-align:center}
.summary{display:flex;${compact ? "flex-direction:column;" : ""}gap:3mm;align-items:flex-start;break-inside:avoid}
.summary-side{flex:1;display:flex;flex-direction:column;gap:2mm;min-width:0}
.words{padding:2mm 3mm;border-inline-start:3px solid ${accent};background:${accent}10;font-weight:700}
.notes small{color:#64748b;font-size:${base * 0.8}px}
.notes p{white-space:pre-wrap}
.barcode svg{max-width:60mm;height:auto}
.totals{${compact ? "width:100%;" : "min-width:62mm;"}padding:2mm 3mm;border:1px solid #e2e8f0;border-radius:2mm}
.totals>div{display:flex;justify-content:space-between;gap:4mm;padding:0.8mm 0}
.totals>div.strong{margin-top:1mm;padding-top:1.5mm;border-top:1.5px solid ${accent};color:${accent};font-size:${base * 1.15}px;font-weight:800}
.signatures{display:grid;grid-template-columns:repeat(auto-fit,minmax(${compact ? 22 : 35}mm,1fr));gap:6mm;margin-top:${compact ? 4 : 10}mm;break-inside:avoid}
.signatures>div{display:flex;flex-direction:column;align-items:center;gap:1.5mm}
.signatures span{width:100%;border-bottom:1px dashed #94a3b8;height:${compact ? 6 : 10}mm}
.signatures small{color:#475569;font-weight:700}
.foot{margin-top:auto;padding-top:2mm;border-top:1px solid #e2e8f0;text-align:center;color:#475569;font-size:${base * 0.8}px}
${templateCss}
</style></head><body>${body}</body></html>`
}
