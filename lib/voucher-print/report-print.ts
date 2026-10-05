"use client"

import type { CompanyInfo } from "./document"
import { logoSource } from "./html"
import { normalizeReportSettings, reportPaper, type ReportPrintSettings } from "./report-settings"

export type ReportPrintInput = {
  title: string
  subtitle?: string
  summary?: { label: string; value: string }[]
  tablesHtml: string[]
}

type Bundle = { settings: ReportPrintSettings; company: CompanyInfo }
let cache: { at: number; promise: Promise<Bundle> } | null = null

export function loadReportPrintSettings(force = false): Promise<Bundle> {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.promise
  const promise = fetch("/api/settings/voucher-print?scope=report", { cache: "no-store" }).then(async response => {
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "تعذر تحميل إعدادات طباعة التقارير")
    return { settings: normalizeReportSettings(data.settings), company: data.company as CompanyInfo }
  })
  promise.catch(() => { cache = null })
  cache = { at: Date.now(), promise }
  return promise
}

export const invalidateReportPrintSettings = () => { cache = null }

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string)
const cssString = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ")}"`
const MM_TO_PX = 96 / 25.4

function currentUserName() {
  try {
    const raw = sessionStorage.getItem("erp_user") || localStorage.getItem("erp_user")
    const user = raw ? JSON.parse(raw) : null
    return String(user?.fullName || user?.full_name || user?.username || "")
  } catch {
    return ""
  }
}

export function renderReportHtml(input: ReportPrintInput, settings: ReportPrintSettings, company: CompanyInfo, options: { landscape: boolean; preview?: boolean; previewScale?: number; printedBy?: string; printedAt?: Date }) {
  const paper = reportPaper(settings, options.landscape)
  const accent = settings.accent_color
  const printedAt = (options.printedAt ?? new Date()).toLocaleString("en-GB", { hour12: false })
  const printedBy = options.printedBy ?? ""
  const meta = [settings.show_print_date ? `تاريخ الطباعة: ${printedAt}` : "", settings.show_printed_by && printedBy ? `طُبع بواسطة: ${printedBy}` : ""].filter(Boolean).join(" · ")
  const footerOn = settings.show_footer
  const logo = settings.show_logo ? logoSource(company.logo) : ""
  const underline = { none: "0", single: `1px solid #334155`, double: `3px double #334155`, thick: `3px solid ${accent}` }[settings.header_underline]

  const textHeader = `<div class="brand">${logo ? `<img class="logo" src="${escapeHtml(logo)}" alt="">` : ""}<div class="brand-text">
    ${settings.show_company_name && company.name ? `<h1 style="font-size:${settings.company_name_font_size}pt">${escapeHtml(company.name)}</h1>` : ""}
    ${settings.show_company_address && (company.address || company.phone || company.email) ? `<p style="font-size:${settings.company_address_font_size}pt">${escapeHtml([company.address, company.phone, company.email].filter(Boolean).join(" · "))}</p>` : ""}
    ${settings.show_tax_number && company.taxNumber ? `<p style="font-size:${settings.tax_number_font_size}pt">مشتغل مرخص / الرقم الضريبي: ${escapeHtml(company.taxNumber)}</p>` : ""}
  </div></div>`
  const imageHeader = settings.header_image ? `<img class="header-image" src="${escapeHtml(settings.header_image)}" alt="">` : textHeader
  const header = settings.show_header ? `<header class="head">${settings.header_type === "image" ? imageHeader : textHeader}${settings.header_text ? `<p class="header-text">${escapeHtml(settings.header_text)}</p>` : ""}</header>` : ""
  const title = settings.show_report_title ? `<div class="title"><h2>${escapeHtml(input.title)}</h2>${input.subtitle ? `<p>${escapeHtml(input.subtitle)}</p>` : ""}</div>` : ""
  const summary = input.summary?.length ? `<div class="summary">${input.summary.map(item => `<div><small>${escapeHtml(item.label)}</small><b dir="ltr">${escapeHtml(item.value)}</b></div>`).join("")}</div>` : ""
  const marginBoxes = footerOn && !options.preview ? [
    settings.show_page_numbers ? `@bottom-center{content:"صفحة " counter(page) " من " counter(pages);font:8pt ${settings.font_family},Tahoma,sans-serif;color:#475569}` : "",
    settings.footer_text ? `@bottom-right{content:${cssString(settings.footer_text)};font:8pt ${settings.font_family},Tahoma,sans-serif;color:#475569}` : "",
    meta ? `@bottom-left{content:${cssString(meta)};font:8pt ${settings.font_family},Tahoma,sans-serif;color:#475569}` : "",
  ].join("") : ""
  const previewFooter = footerOn && options.preview ? `<footer class="preview-foot"><span>${escapeHtml(settings.footer_text)}</span><span>${settings.show_page_numbers ? "صفحة 1 من 1" : ""}</span><span>${escapeHtml(meta)}</span></footer>` : ""
  const pad = settings.cell_padding_mm

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(input.title)}</title><style>
@page{size:${paper.widthMm}mm ${paper.receipt ? "auto" : `${paper.heightMm}mm`};margin:${settings.margin_top_mm}mm ${settings.margin_right_mm}mm ${settings.margin_bottom_mm}mm ${settings.margin_left_mm}mm;${marginBoxes}}
*{box-sizing:border-box;margin:0;padding:0}
html{background:${options.preview ? "#e2e8f0" : "#fff"}}
${options.preview && options.previewScale ? `html{zoom:${options.previewScale.toFixed(3)}}` : ""}
body{font-family:"${settings.font_family}",Cairo,Tahoma,Arial,sans-serif;color:#0f172a;font-size:${settings.data_font_size}pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{display:flex;flex-direction:column;gap:3mm}
${options.preview ? `.sheet{width:${paper.widthMm}mm;min-height:${paper.heightMm}mm;margin:6mm auto;padding:${settings.margin_top_mm}mm ${settings.margin_right_mm}mm ${settings.margin_bottom_mm}mm ${settings.margin_left_mm}mm;background:#fff;box-shadow:0 6px 24px rgb(15 23 42/18%);position:relative}` : ""}
${settings.border_frame ? (options.preview ? `.sheet{outline:1px solid #111;outline-offset:-4mm}` : `.frame{position:fixed;inset:0;border:1px solid #111;pointer-events:none}`) : ""}
.head{padding-bottom:2.5mm;border-bottom:${underline}}
.brand{display:flex;align-items:center;gap:4mm}
.logo{width:20mm;height:20mm;object-fit:contain}
.brand-text h1{font-weight:800;color:${accent};line-height:1.25}
.brand-text p{color:#475569;line-height:1.5}
.header-image{display:block;width:100%;height:${settings.header_image_height_mm}mm;object-fit:contain}
.header-text{margin-top:1.5mm;text-align:center;font-weight:700;white-space:pre-wrap}
.title{text-align:center}
.title h2{font-size:${settings.data_font_size + 5}pt;font-weight:800}
.title p{color:#475569;font-size:${settings.data_font_size}pt}
.summary{display:flex;flex-wrap:wrap;gap:2mm 6mm;justify-content:center}
.summary small{color:#64748b;margin-inline-end:1.5mm}
table{width:100%;border-collapse:collapse;font-size:${settings.data_font_size}pt}
thead{display:table-header-group}
tfoot{display:table-footer-group}
tr{break-inside:avoid}
th{padding:${pad}mm;background:${accent};color:#fff;font-weight:700;text-align:right;white-space:nowrap}
td{padding:${pad}mm;border-bottom:1px solid #e2e8f0;vertical-align:top}
${settings.zebra_rows ? "tbody tr:nth-child(even) td{background:#f8fafc}" : ""}
td.n,th.n{text-align:left;direction:ltr;font-variant-numeric:tabular-nums;white-space:nowrap}
tfoot td{font-weight:800;background:#f1f5f9;border-top:1.5px solid #334155}
.table-gap{height:4mm}
.preview-foot{position:absolute;inset-inline:${settings.margin_right_mm}mm;bottom:3mm;display:flex;justify-content:space-between;gap:4mm;color:#475569;font-size:8pt}
</style></head><body>${settings.border_frame && !options.preview ? `<div class="frame"></div>` : ""}<div class="sheet">${header}${title}${summary}${input.tablesHtml.join(`<div class="table-gap"></div>`)}${previewFooter}</div></body></html>`
}

// Copies the visible report tables (without buttons, inputs and screen styling) so the print is
// rendered only with the report print settings.
function captureTables(root: HTMLElement) {
  const tables = Array.from(root.querySelectorAll<HTMLTableElement>("table")).filter(table =>
    table.offsetParent !== null && !table.closest("aside, [role=dialog], .print\\:hidden, .wj-flexgrid"))
  let widest = 0
  const html = tables.map(table => {
    widest = Math.max(widest, table.scrollWidth)
    const clone = table.cloneNode(true) as HTMLTableElement
    const originals = Array.from(table.querySelectorAll<HTMLTableCellElement>("th, td"))
    Array.from(clone.querySelectorAll<HTMLTableCellElement>("th, td")).forEach((cell, index) => {
      const source = originals[index]
      const numeric = source && (source.getAttribute("dir") === "ltr" || getComputedStyle(source).direction === "ltr" || /^[\s\-−+()0-9.,٠-٩%]+$/.test(source.textContent || "") && (source.textContent || "").trim() !== "")
      cell.querySelectorAll("button, input, select, textarea, svg, [aria-hidden=true]").forEach(node => node.remove())
      for (const attribute of Array.from(cell.attributes)) if (!["colspan", "rowspan"].includes(attribute.name)) cell.removeAttribute(attribute.name)
      if (numeric) cell.className = "n"
    })
    clone.querySelectorAll("tr, thead, tbody, tfoot").forEach(node => { node.removeAttribute("class"); node.removeAttribute("style") })
    clone.removeAttribute("class")
    clone.removeAttribute("style")
    return clone.outerHTML
  })
  return { html, widest }
}

function findReportRoot(from: HTMLElement | null) {
  const page = from?.closest<HTMLElement>(".report-page")
  if (page) return page
  let node = from
  while (node && !node.querySelector("table")) node = node.parentElement
  return node ?? document.querySelector<HTMLElement>(".report-page") ?? document.body
}

function printInFrame(html: string) {
  const frame = document.createElement("iframe")
  frame.setAttribute("aria-hidden", "true")
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0", visibility: "hidden" })
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc || !frame.contentWindow) { frame.remove(); window.print(); return }
  doc.open()
  doc.write(html)
  doc.close()
  const run = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    window.setTimeout(() => frame.remove(), 60_000)
  }
  void (doc.fonts?.ready ?? Promise.resolve()).then(() => window.setTimeout(run, 200))
}

export function sampleReportInput(): ReportPrintInput {
  const rows = [["1101", "الصندوق الرئيسي", "15,250.00", "4,100.00", "11,150.00"], ["1102", "البنك العربي", "82,400.00", "60,000.00", "22,400.00"], ["2101", "شركة الأمل للتجارة", "3,000.00", "9,750.50", "-6,750.50"], ["4101", "المبيعات", "0.00", "124,980.00", "-124,980.00"]]
  const table = `<table><thead><tr><th>رقم الحساب</th><th>اسم الحساب</th><th class="n">مدين</th><th class="n">دائن</th><th class="n">الرصيد</th></tr></thead><tbody>${rows.map(row => `<tr><td>${row[0]}</td><td>${row[1]}</td><td class="n">${row[2]}</td><td class="n">${row[3]}</td><td class="n">${row[4]}</td></tr>`).join("")}</tbody><tfoot><tr><td>الإجمالي</td><td></td><td class="n">100,650.00</td><td class="n">198,830.50</td><td class="n">-98,180.50</td></tr></tfoot></table>`
  return { title: "ميزان المراجعة", subtitle: "من 2026-01-01 إلى 2026-12-31", summary: [{ label: "إجمالي المدين", value: "100,650.00" }, { label: "إجمالي الدائن", value: "198,830.50" }], tablesHtml: [table] }
}

export function printReportSample(settings: ReportPrintSettings, company: CompanyInfo) {
  printInFrame(renderReportHtml(sampleReportInput(), settings, company, { landscape: settings.orientation === "landscape", printedBy: currentUserName() }))
}

/** Prints the report that contains `from` (usually the clicked print button) using report print settings. */
export async function printReportFrom(from: HTMLElement | null) {
  const root = findReportRoot(from)
  const { html: tablesHtml, widest } = captureTables(root)
  if (!tablesHtml.length) { window.print(); return }
  const title = root.querySelector(".report-header h1, h1")?.textContent?.trim() || document.title
  const subtitle = root.querySelector(".report-header p")?.textContent?.trim() || ""
  const summary = Array.from(root.querySelectorAll<HTMLElement>(".report-summary-card"))
    .filter(card => card.offsetParent !== null)
    .map(card => ({ label: card.querySelector(".report-summary-label")?.textContent?.trim() || "", value: card.querySelector(".report-summary-value")?.textContent?.trim() || "" }))
  let bundle: Bundle
  try {
    bundle = await loadReportPrintSettings()
  } catch {
    window.print()
    return
  }
  const { settings, company } = bundle
  const portrait = reportPaper(settings, false)
  const printableWidthPx = (portrait.widthMm - settings.margin_left_mm - settings.margin_right_mm) * MM_TO_PX
  const landscape = settings.orientation === "landscape" || (settings.auto_landscape && widest > printableWidthPx)
  printInFrame(renderReportHtml({ title, subtitle, summary, tablesHtml }, settings, company, { landscape, printedBy: currentUserName() }))
}
