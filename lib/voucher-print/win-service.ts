"use client"

import { amountInArabicWords, cellText, type PrintDocument } from "./document"
import { copyLabelsFor, visibleColumns, type PrintContext } from "./html"
import { paperDimensions, type VoucherPrintSettings } from "./settings"

// CashierWinService (ws://localhost:32999/cashier) draws GDI+ commands in 1/100 inch with fonts
// in points. textFormat is passed as StringFormatFlags: 1 = right-to-left (right aligned), 0 = left
// aligned; there is no centering, so centered text gets an estimated x. One startPrinting = one page.
const SERVICE_URL = "ws://localhost:32999/cashier"
const RTL = 1
const LTR = 0
const BLACK = 2
const GRAY = 3

type Command = Record<string, string | number>
type Page = { commands: Command[]; height: number }

const mmToUnits = (mm: number) => Math.round((mm * 100) / 25.4)
const lineHeight = (pt: number) => pt * 2.05
const charWidth = (pt: number) => pt * 0.78

function estimateLines(text: string, width: number, pt: number) {
  if (!text) return 1
  return text.split(/\r?\n/).reduce((sum, line) => sum + Math.max(1, Math.ceil((line.length * charWidth(pt)) / Math.max(10, width - 6))), 0)
}

function logoBase64(raw: string) {
  const value = String(raw || "").trim()
  if (!value || /^(https?:|\/)/i.test(value)) return ""
  return value
}

function layoutCopy(document: PrintDocument, settings: VoucherPrintSettings, context: PrintContext, copyLabel: string, barcodeId: string): Page[] {
  const paper = paperDimensions(settings)
  const pageWidth = mmToUnits(paper.widthMm)
  const pageHeight = mmToUnits(paper.heightMm)
  const left = mmToUnits(settings.margin_left_mm)
  const right = pageWidth - mmToUnits(settings.margin_right_mm)
  const top = mmToUnits(settings.margin_top_mm)
  const bottomLimit = paper.receipt ? Number.POSITIVE_INFINITY : pageHeight - mmToUnits(settings.margin_bottom_mm) - 22
  const width = right - left
  const compact = paper.widthMm < 120
  const base = Math.max(6, settings.font_size * 0.75 * (compact ? 0.9 : 1))
  const font = settings.font_family || "Arial"

  const pages: Page[] = []
  let commands: Command[] = []
  let y = top

  const text = (value: string, x: number, yy: number, w: number, h: number, pt = base, format = RTL, bold = false, brush = BLACK) => {
    if (!value) return
    commands.push({ type: 6, text: value, fontFamilyName: font, fontSize: Number(pt.toFixed(2)), fontStyle: bold ? 1 : 0, brush, x: Math.round(x), y: Math.round(yy), width: Math.round(w), height: Math.round(h), textFormat: format })
  }
  const centered = (value: string, x: number, yy: number, w: number, pt = base, bold = false, brush = BLACK) => {
    const estimated = Math.min(w, value.length * charWidth(pt) + 12)
    text(value, x + (w - estimated) / 2, yy, estimated, lineHeight(pt) * estimateLines(value, estimated, pt), pt, RTL, bold, brush)
  }
  const line = (x1: number, y1: number, x2: number, y2: number, brush = GRAY) => commands.push({ type: 5, x: Math.round(x1), y: Math.round(y1), width: Math.round(x2), height: Math.round(y2), brush })
  const box = (x: number, yy: number, w: number, h: number, brush = GRAY) => commands.push({ type: 3, x: Math.round(x), y: Math.round(yy), width: Math.round(w), height: Math.round(h), brush })

  const newPage = () => {
    pages.push({ commands, height: pageHeight })
    commands = []
    y = top
    const pt = base * 0.95
    text(`${document.title} ${document.code}`, left, y, width, lineHeight(pt), pt, RTL, true)
    y += lineHeight(pt) + 4
    line(left, y, right, y)
    y += 6
  }
  const ensure = (height: number) => { if (y + height > bottomLimit) newPage() }

  // Header
  const logo = settings.show_logo ? logoBase64(context.company.logo) : ""
  const logoSize = compact ? 55 : 72
  const docBoxWidth = compact ? width : Math.min(230, width * 0.36)
  const brandRight = right
  const brandWidth = compact ? width : width - docBoxWidth - 12
  let brandY = y
  if (logo) {
    const logoX = compact ? left + (width - logoSize) / 2 : brandRight - logoSize
    commands.push({ type: 1, image: logo, x: Math.round(logoX), y: Math.round(brandY), width: logoSize, height: logoSize })
    if (compact) brandY += logoSize + 4
  }
  const textRight = !compact && logo ? brandRight - logoSize - 10 : brandRight
  const textWidth = !compact && logo ? brandWidth - logoSize - 10 : brandWidth
  const nameSize = base * 1.5
  if (compact) centered(context.company.name, left, brandY, width, nameSize, true)
  else text(context.company.name, textRight - textWidth, brandY, textWidth, lineHeight(nameSize), nameSize, RTL, true)
  brandY += lineHeight(nameSize)
  if (settings.show_company_info) {
    const infoLines = [context.company.address, [context.company.phone, context.company.email].filter(Boolean).join(" · "), context.company.taxNumber ? `الرقم الضريبي: ${context.company.taxNumber}` : ""].filter(Boolean)
    for (const info of infoLines) {
      if (compact) centered(info, left, brandY, width, base * 0.85, false, GRAY)
      else text(info, textRight - textWidth, brandY, textWidth, lineHeight(base * 0.85), base * 0.85, RTL, false, GRAY)
      brandY += lineHeight(base * 0.85)
    }
  }
  if (!compact && logo) brandY = Math.max(brandY, y + logoSize)

  let docY = compact ? brandY + 6 : y
  const docX = compact ? left : left
  const docLines: [string, number, boolean, number][] = [
    [document.title, base * 1.2, true, RTL],
    ...(copyLabel ? [[copyLabel, base * 0.85, true, RTL] as [string, number, boolean, number]] : []),
    [document.code, base * 1.05, true, LTR],
    [String(document.date || "").slice(0, 10), base * 0.85, false, LTR],
  ]
  const docHeight = docLines.reduce((sum, [, pt]) => sum + lineHeight(pt), 0) + 10
  box(docX, docY, docBoxWidth, docHeight, BLACK)
  docY += 5
  for (const [value, pt, bold, format] of docLines) {
    centered(value, docX, docY, docBoxWidth, pt, bold, format === LTR && !bold ? GRAY : BLACK)
    docY += lineHeight(pt)
  }
  y = Math.max(brandY, compact ? docY + 5 : y + docHeight) + 8
  line(left, y, right, y, BLACK)
  y += 8

  if (settings.header_text) {
    const lines = estimateLines(settings.header_text, width, base)
    text(settings.header_text, left, y, width, lines * lineHeight(base), base, RTL, true)
    y += lines * lineHeight(base) + 6
  }

  // Header fields
  const fields = settings.show_fields ? (document.fields || []).filter(field => String(field.value ?? "").trim()) : []
  if (fields.length) {
    const perRow = compact ? 2 : 3
    const gap = 12
    const cellWidth = (width - gap * (perRow - 1)) / perRow
    const pt = base * 0.95
    for (let index = 0; index < fields.length; index += perRow) {
      const row = fields.slice(index, index + perRow)
      const lines = Math.max(...row.map(field => estimateLines(`${field.label}: ${field.value ?? ""}`, cellWidth, pt)))
      const height = lines * lineHeight(pt) + 2
      ensure(height)
      row.forEach((field, position) => {
        const x = right - (position + 1) * cellWidth - position * gap
        text(`${field.label}: ${field.value ?? ""}`, x, y, cellWidth, height, pt, RTL, false)
      })
      y += height
    }
    y += 6
  }

  // Lines table
  const columns = visibleColumns(document, settings)
  if (columns.length) {
    const numberWeight = settings.show_row_numbers ? 0.45 : 0
    const totalWeight = columns.reduce((sum, column) => sum + (column.weight || 1), 0) + numberWeight
    const cells = [
      ...(settings.show_row_numbers ? [{ key: "#", label: "#", width: (numberWeight / totalWeight) * width, numeric: true }] : []),
      ...columns.map(column => ({ key: column.key, label: column.label, width: ((column.weight || 1) / totalWeight) * width, numeric: Boolean(column.numeric) })),
    ]
    const tablePt = base * (compact ? 0.82 : 0.9)
    const drawHeader = () => {
      const height = lineHeight(tablePt) + 8
      box(left, y, width, height, BLACK)
      let x = right
      for (const cell of cells) {
        x -= cell.width
        centered(cell.label, x, y + 4, cell.width, tablePt, true)
        if (x > left + 1) line(x, y, x, y + height, BLACK)
      }
      y += height
    }
    ensure(lineHeight(tablePt) * 3)
    drawHeader()
    document.rows.forEach((row, index) => {
      const values = cells.map(cell => cell.key === "#" ? String(index + 1) : cellText(columns.find(column => column.key === cell.key)!, row[cell.key]))
      const lines = Math.max(...values.map((value, position) => estimateLines(value, cells[position].width, tablePt)))
      const height = lines * lineHeight(tablePt) + 8
      if (y + height > bottomLimit) {
        newPage()
        drawHeader()
      }
      let x = right
      values.forEach((value, position) => {
        const cell = cells[position]
        x -= cell.width
        if (cell.numeric) centered(value, x, y + 4, cell.width, tablePt, false)
        else text(value, x + 3, y + 4, cell.width - 6, lines * lineHeight(tablePt), tablePt, RTL)
      })
      line(left, y + height, right, y + height)
      y += height
    })
    y += 8
  }

  // Totals + words + notes
  const totals = settings.show_totals ? document.totals || [] : []
  const words = settings.show_amount_in_words && document.amount !== undefined ? amountInArabicWords(document.amount, document.currencyName) : ""
  const notes = settings.show_notes ? document.notes || "" : ""
  const totalsWidth = compact ? width : Math.min(260, width * 0.42)
  const sideWidth = compact ? width : width - totalsWidth - 12
  const totalsHeight = totals.length ? totals.reduce((sum, total) => sum + lineHeight(total.strong ? base * 1.1 : base) + 2, 0) + 10 : 0
  const wordsLines = words ? estimateLines(words, sideWidth, base) : 0
  const notesLines = notes ? estimateLines(notes, sideWidth, base * 0.95) : 0
  const sideHeight = (words ? wordsLines * lineHeight(base) + 8 : 0) + (notes ? lineHeight(base * 0.75) + notesLines * lineHeight(base * 0.95) + 6 : 0)
  const blockHeight = compact ? totalsHeight + sideHeight + 8 : Math.max(totalsHeight, sideHeight)
  if (blockHeight) {
    ensure(blockHeight)
    const blockTop = y
    if (totals.length) {
      const totalsX = left
      box(totalsX, y, totalsWidth, totalsHeight, BLACK)
      let totalY = y + 5
      for (const total of totals) {
        const pt = total.strong ? base * 1.1 : base
        if (total.strong) line(totalsX + 4, totalY - 1, totalsX + totalsWidth - 4, totalY - 1, BLACK)
        const value = typeof total.value === "number" ? total.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(total.value ?? "")
        text(total.label, totalsX + totalsWidth / 2, totalY, totalsWidth / 2 - 5, lineHeight(pt), pt, RTL, Boolean(total.strong))
        text(value, totalsX + 5, totalY, totalsWidth / 2 - 5, lineHeight(pt), pt, LTR, true)
        totalY += lineHeight(pt) + 2
      }
    }
    let sideY = compact ? blockTop + totalsHeight + 8 : blockTop
    const sideX = right - sideWidth
    if (words) {
      text(words, sideX, sideY, sideWidth, wordsLines * lineHeight(base), base, RTL, true)
      sideY += wordsLines * lineHeight(base) + 8
    }
    if (notes) {
      text("ملاحظات", sideX, sideY, sideWidth, lineHeight(base * 0.75), base * 0.75, RTL, false, GRAY)
      sideY += lineHeight(base * 0.75)
      text(notes, sideX, sideY, sideWidth, notesLines * lineHeight(base * 0.95), base * 0.95, RTL)
    }
    y = blockTop + blockHeight + 10
  }

  if (settings.show_barcode && document.code) {
    const barcodeWidth = compact ? Math.min(width, 200) : 210
    const barcodeHeight = 40
    ensure(barcodeHeight + 6)
    const x = compact ? left + (width - barcodeWidth) / 2 : right - barcodeWidth
    commands.push({ type: 7, image: document.code, text: barcodeId, x: Math.round(x), y: Math.round(y), width: barcodeWidth, height: barcodeHeight, barcodeWidth: barcodeWidth * 2, barcodeHeight: barcodeHeight * 2, barcodeMargin: 2 })
    y += barcodeHeight + 10
  }

  const signatures = settings.show_signatures ? settings.signatures.split(/[,،]/).map(label => label.trim()).filter(Boolean) : []
  if (signatures.length) {
    const space = compact ? 30 : 55
    ensure(space + lineHeight(base) + 6)
    y += space
    const gap = 20
    const slot = (width - gap * (signatures.length - 1)) / signatures.length
    signatures.forEach((label, index) => {
      const x = right - (index + 1) * slot - index * gap
      line(x, y, x + slot, y)
      centered(label, x, y + 4, slot, base * 0.9, true, GRAY)
    })
    y += lineHeight(base * 0.9) + 10
  }

  const footerParts = settings.show_footer ? [
    settings.footer_text,
    [
      settings.show_print_date ? `تاريخ الطباعة: ${(context.printedAt || new Date()).toLocaleString("en-GB", { hour12: false })}` : "",
      settings.show_printed_by && context.printedBy ? `طُبع بواسطة: ${context.printedBy}` : "",
    ].filter(Boolean).join(" · "),
  ].filter(Boolean) : []
  if (footerParts.length) {
    ensure(footerParts.length * lineHeight(base * 0.8) + 8)
    line(left, y, right, y)
    y += 4
    for (const part of footerParts) {
      const lines = estimateLines(part, width, base * 0.8)
      text(part, left, y, width, lines * lineHeight(base * 0.8), base * 0.8, RTL, false, GRAY)
      y += lines * lineHeight(base * 0.8)
    }
  }

  pages.push({ commands, height: paper.receipt ? Math.round(y + mmToUnits(settings.margin_bottom_mm) + 10) : pageHeight })

  if (settings.show_page_numbers && !paper.receipt && pages.length > 0) {
    const pt = base * 0.75
    const numberY = pageHeight - mmToUnits(settings.margin_bottom_mm) - lineHeight(pt)
    pages.forEach((page, index) => {
      const label = `صفحة ${index + 1} من ${pages.length}`
      const estimated = label.length * charWidth(pt) + 12
      page.commands.push({ type: 6, text: label, fontFamilyName: font, fontSize: Number(pt.toFixed(2)), fontStyle: 0, brush: GRAY, x: Math.round(left + (width - estimated) / 2), y: Math.round(numberY), width: Math.round(estimated), height: Math.round(lineHeight(pt)), textFormat: RTL })
    })
  }
  return pages
}

export function buildCashierServicePages(document: PrintDocument, settings: VoucherPrintSettings, context: PrintContext) {
  const safeCode = String(document.code || "voucher").replace(/[^a-z0-9_-]/gi, "")
  return copyLabelsFor(settings, document.copyLabel).flatMap((label, copy) => layoutCopy(document, settings, context, label, `voucher-${safeCode}-${Date.now()}-${copy}`))
}

function openSocket() {
  return new Promise<WebSocket>((resolve, reject) => {
    let socket: WebSocket
    try {
      socket = new WebSocket(SERVICE_URL)
    } catch {
      reject(new Error("تعذر الاتصال بخدمة الطباعة على هذا الجهاز"))
      return
    }
    const timer = window.setTimeout(() => { socket.close(); reject(new Error("لم يتم العثور على خدمة الطباعة في هذا الجهاز")) }, 4000)
    socket.addEventListener("open", () => { window.clearTimeout(timer); resolve(socket) }, { once: true })
    socket.addEventListener("error", () => { window.clearTimeout(timer); reject(new Error("تعذر الاتصال بخدمة الطباعة على هذا الجهاز")) }, { once: true })
  })
}

function request(socket: WebSocket, type: string, data: Record<string, string | number | boolean>) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => { socket.removeEventListener("message", onMessage); reject(new Error("انتهت مهلة استجابة خدمة الطباعة")) }, type === "startPrinting" ? 90_000 : 8_000)
    function onMessage(event: MessageEvent) {
      try {
        const envelope = JSON.parse(String(event.data))
        if (String(envelope.Type || envelope.type || "").toLowerCase() !== type.toLowerCase()) return
        let response = envelope.Data ?? envelope.data
        if (typeof response === "string") response = JSON.parse(response)
        const result = response?.data ?? response
        window.clearTimeout(timer)
        socket.removeEventListener("message", onMessage)
        if (result?.success === false) reject(new Error(String(result.message || "فشلت الطباعة")))
        else resolve()
      } catch (error) {
        if (error instanceof SyntaxError) return
        window.clearTimeout(timer)
        socket.removeEventListener("message", onMessage)
        reject(error)
      }
    }
    socket.addEventListener("message", onMessage)
    socket.send(JSON.stringify(type === "startPrinting" ? { type, ...data } : { type, data }))
  })
}

export async function printWithCashierService(document: PrintDocument, settings: VoucherPrintSettings, context: PrintContext) {
  const pages = buildCashierServicePages(document, settings, context)
  const paper = paperDimensions(settings)
  const socket = await openSocket()
  try {
    for (const page of pages) {
      await request(socket, "initialPrinting", {})
      for (const command of page.commands) await request(socket, "addPrintCommand", command)
      await request(socket, "startPrinting", {
        printerName: settings.printer_name,
        paper: paper.name,
        paperWidth: mmToUnits(paper.widthMm),
        paperHeight: page.height,
        openDrawer: false,
      })
    }
  } finally {
    socket.close()
  }
}
