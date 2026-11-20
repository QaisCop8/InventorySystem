"use client"
import { amountFractionOptions } from "@/lib/decimals"

import { amountInArabicWords, cellText, headerPrintFields, type PrintCell, type PrintColumn, type PrintDocument } from "./document"
import { copyLabelsFor, visibleColumns, type PrintContext } from "./html"
import { paperDimensions, type VoucherPrintSettings } from "./settings"
import { printPagesDirect } from "@/lib/local-print"
import { userPrinter } from "@/lib/user-printers"

// CashService (ws://localhost:32999/cashier) — or the NoonERP Windows launcher itself (lib/local-print.ts) — draws GDI+ commands in 1/100 inch with fonts
// in points. textFormat is passed as StringFormatFlags: 1 = right-to-left (right aligned), 0 = left
// aligned; there is no centering, so centered text gets an estimated x. One startPrinting = one page.
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
  const fields = headerPrintFields(document, settings)
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

  // مربعات المعلومات (تفاصيل الدفع…) ومربع "بالكلمات" — نمط سندات القبض/الصرف
  const boxPt = base * 0.95
  for (const infoBox of document.boxes || []) {
    const items = infoBox.items.filter(item => String(item.value ?? "").trim())
    if (!items.length) continue
    const perRow = compact ? 2 : 4
    const cellWidth = (width - 12) / perRow
    const rowsCount = Math.ceil(items.length / perRow)
    const height = (infoBox.title ? lineHeight(boxPt) : 0) + rowsCount * lineHeight(boxPt) + 10
    ensure(height + 6)
    box(left, y, width, height, BLACK)
    let boxY = y + 5
    if (infoBox.title) { text(infoBox.title, left + 6, boxY, width - 12, lineHeight(boxPt), boxPt, RTL, true); boxY += lineHeight(boxPt) }
    items.forEach((item, index) => {
      const column = index % perRow
      if (index && column === 0) boxY += lineHeight(boxPt)
      text(`${item.label} : ${item.value ?? ""}`, right - 6 - (column + 1) * cellWidth, boxY, cellWidth, lineHeight(boxPt), boxPt, RTL, true)
    })
    y += height + 8
  }
  const boxedWords = document.wordsInBox && settings.show_amount_in_words && document.amount !== undefined ? `بالكلمات : ${amountInArabicWords(document.amount, document.currencyName)}` : ""
  if (boxedWords) {
    const lines = estimateLines(boxedWords, width - 12, boxPt)
    const height = lines * lineHeight(boxPt) + 10
    ensure(height + 6)
    box(left, y, width, height, BLACK)
    text(boxedWords, left + 6, y + 5, width - 12, lines * lineHeight(boxPt), boxPt, RTL, true)
    y += height + 10
  }

  // Lines table (والجداول الإضافية بعنوان: تفاصيل الشيكات…)
  const drawTable = (columns: PrintColumn[], rows: Record<string, PrintCell>[], title?: string) => {
    if (!columns.length) return
    if (title) {
      ensure(lineHeight(base) * 4)
      text(title, left, y, width, lineHeight(base), base, RTL, true)
      y += lineHeight(base) + 2
    }
    const numberWeight = settings.show_row_numbers ? 0.45 : 0
    const totalWeight = columns.reduce((sum, column) => sum + (column.weight || 1), 0) + numberWeight
    const cells = [
      ...(settings.show_row_numbers ? [{ key: "#", label: "#", width: (numberWeight / totalWeight) * width, numeric: true }] : []),
      ...columns.map(column => ({ key: column.key, label: column.label, width: ((column.weight || 1) / totalWeight) * width, numeric: Boolean(column.numeric) })),
    ]
    const tablePt = base * (compact ? 0.82 : 0.9)
    // عناوين الأعمدة: تُقسَّم على حدود الكلمات (لا يكسر الطابعة كلمة في منتصفها)، ويُصغَّر الخط حتى
    // 70% إن كانت أطول كلمة أعرض من العمود، ويتسع ارتفاع صف العناوين لأطول عنوان ويتوسطه كل عنوان.
    const boldWidth = (value: string, pt: number) => value.length * charWidth(pt) * 1.15
    const headerLayouts = cells.map(cell => {
      const available = Math.max(10, cell.width - 6)
      const words = cell.label.split(/\s+/).filter(Boolean)
      const longest = words.reduce((max, word) => Math.max(max, boldWidth(word, 1)), 0)
      const pt = longest > 0 ? Math.max(tablePt * 0.7, Math.min(tablePt, available / longest)) : tablePt
      const lines: string[] = []
      for (const word of words) {
        const candidate = lines.length ? `${lines[lines.length - 1]} ${word}` : word
        if (lines.length && boldWidth(candidate, pt) <= available) lines[lines.length - 1] = candidate
        else lines.push(word)
      }
      return { pt, lines: lines.length ? lines : [""] }
    })
    const headerHeight = Math.max(...headerLayouts.map(layout => layout.lines.length * lineHeight(layout.pt))) + 8
    const drawHeader = () => {
      box(left, y, width, headerHeight, BLACK)
      let x = right
      cells.forEach((cell, position) => {
        x -= cell.width
        const { pt, lines } = headerLayouts[position]
        let lineY = y + (headerHeight - lines.length * lineHeight(pt)) / 2
        for (const label of lines) {
          const estimated = Math.min(cell.width - 2, boldWidth(label, pt) + 14)
          text(label, x + (cell.width - estimated) / 2, lineY, estimated, lineHeight(pt), pt, RTL, true)
          lineY += lineHeight(pt)
        }
        if (x > left + 1) line(x, y, x, y + headerHeight, BLACK)
      })
      y += headerHeight
    }
    ensure(lineHeight(tablePt) * 3)
    drawHeader()
    rows.forEach((row, index) => {
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
  drawTable(visibleColumns(document, settings), document.rows)
  for (const section of document.sections || []) if (section.rows.length) drawTable(section.columns, section.rows, section.title)

  // Totals + words + notes
  const totals = settings.show_totals ? document.totals || [] : []
  const words = !document.wordsInBox && settings.show_amount_in_words && document.amount !== undefined ? amountInArabicWords(document.amount, document.currencyName) : ""
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
        const value = typeof total.value === "number" ? total.value.toLocaleString("en-US", amountFractionOptions()) : String(total.value ?? "")
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

// قسيمة المطبخ: مقروءة من مسافة — شريط القسم، الطاولة بخط كبير داخل إطار مزدوج، رقم الطلب والوقت،
// ثم كل صنف بمربع كمية بارز واسم عريض، وخياراته/إضافاته تحته بخط أصغر، والملاحظة على خلفية رمادية.
function layoutKitchen(document: PrintDocument, settings: VoucherPrintSettings, context: PrintContext): Page[] {
  // العربية أضيق من تقدير charWidth العام (المصمم للأرقام/اللاتينية) — تقدير أدق هنا يمنع الفراغات تحت الأصناف وانزياح النص الموسّط
  const kChar = (size: number) => size * 0.5
  // ارتفاع سطر أدق من lineHeight العام (2.05) — Arial يحتاج ~1.6، مع هامش بسيط
  const kLh = (size: number) => size * 1.8
  const kLines = (value: string, w: number, size: number) => !value ? 1 : value.split(/\r?\n/).reduce((sum, part) => sum + Math.max(1, Math.ceil((part.length * kChar(size)) / Math.max(10, w - 6))), 0)
  const slip = document.kitchen!
  const paper = paperDimensions(settings)
  const pageWidth = mmToUnits(paper.widthMm)
  const left = mmToUnits(settings.margin_left_mm)
  const right = pageWidth - mmToUnits(settings.margin_right_mm)
  const width = right - left
  const font = settings.font_family || "Arial"
  const scale = paper.widthMm < 70 ? 0.85 : 1
  const pt = (size: number) => size * scale
  const commands: Command[] = []
  let y = mmToUnits(settings.margin_top_mm)

  const text = (value: string, x: number, yy: number, w: number, h: number, size: number, format = RTL, bold = false, brush = BLACK) => {
    if (!value) return
    commands.push({ type: 6, text: value, fontFamilyName: font, fontSize: Number(size.toFixed(2)), fontStyle: bold ? 1 : 0, brush, x: Math.round(x), y: Math.round(yy), width: Math.round(w), height: Math.round(h), textFormat: format })
  }
  const centered = (value: string, x: number, yy: number, w: number, size: number, bold = false, brush = BLACK) => {
    const boldFactor = bold ? 1.12 : 1
    const estimated = Math.min(w, value.length * kChar(size) * boldFactor + 14)
    text(value, x + (w - estimated) / 2, yy, estimated, kLh(size) * kLines(value, estimated, size), size, RTL, bold, brush)
  }
  const line = (x1: number, y1: number, x2: number, y2: number, brush = GRAY) => commands.push({ type: 5, x: Math.round(x1), y: Math.round(y1), width: Math.round(x2), height: Math.round(y2), brush })
  const box = (x: number, yy: number, w: number, h: number, brush = BLACK) => commands.push({ type: 3, x: Math.round(x), y: Math.round(yy), width: Math.round(w), height: Math.round(h), brush })
  const fill = (x: number, yy: number, w: number, h: number) => commands.push({ type: 4, x: Math.round(x), y: Math.round(yy), width: Math.round(w), height: Math.round(h) })
  const dashed = (yy: number) => { for (let x = left; x < right; x += 9) line(x, yy, Math.min(x + 5, right), yy, BLACK) }

  // اسم الشركة صغيراً
  if (context.company.name) {
    centered(context.company.name, left, y, width, pt(8), false, GRAY)
    y += kLh(pt(8)) + 2
  }

  // شريط القسم
  const stationPt = pt(13)
  const stationHeight = kLh(stationPt) * kLines(slip.station, width - 10, stationPt) + 8
  fill(left, y, width, stationHeight)
  centered(slip.station, left + 4, y + 4, width - 8, stationPt, true)
  y += stationHeight + 7

  // الطاولة / السفري بخط كبير داخل إطار مزدوج
  const placePt = pt(slip.place.length > 14 ? 17 : 22)
  const placeLines = kLines(slip.place, width - 16, placePt)
  const placeHeight = placeLines * kLh(placePt) + 10
  box(left, y, width, placeHeight)
  box(left + 2, y + 2, width - 4, placeHeight - 4)
  centered(slip.place, left + 6, y + 5, width - 12, placePt, true)
  y += placeHeight + 7

  // رقم الطلب (يسار) والوقت (يمين)
  const metaPt = pt(10)
  const [datePart, timePart] = String(slip.time || "").split(" ")
  text(`#${document.code}`, left, y, width / 2, kLh(metaPt), metaPt, LTR, true)
  text(timePart || datePart || "", left + width / 2, y, width / 2, kLh(metaPt), pt(12), RTL, true)
  y += kLh(pt(12)) + 1
  if (timePart && datePart) { text(datePart, left + width / 2, y, width / 2, kLh(pt(8)), pt(8), RTL, false, GRAY); y += kLh(pt(8)) }

  // الموقع والنادل — كل منهما بسطر كامل حتى لا ينكسر البريد/الاسم في منتصفه
  const infoPt = pt(9)
  for (const [label, value] of [["الموقع", slip.location], ["النادل", slip.waiter]] as const) {
    if (!value) continue
    const content = `${label}: ${value}`
    const lines = kLines(content, width, infoPt)
    text(content, left, y, width, lines * kLh(infoPt), infoPt, RTL)
    y += lines * kLh(infoPt)
  }
  y += 5
  dashed(y)
  y += 8

  // الأصناف
  const qtyPt = pt(14)
  const namePt = pt(11.5)
  const subPt = pt(9.5)
  const qtyWidth = Math.round(kLh(qtyPt) * 1.35)
  const nameWidth = width - qtyWidth - 8
  slip.items.forEach((item, index) => {
    const nameLines = kLines(item.name, nameWidth, namePt)
    const rowHeight = Math.max(nameLines * kLh(namePt), kLh(qtyPt) + 4)
    // مربع الكمية على اليمين
    box(right - qtyWidth, y, qtyWidth, kLh(qtyPt) + 4)
    centered(item.quantity, right - qtyWidth, y + 2, qtyWidth, qtyPt, true)
    text(item.name, left, y + (rowHeight > nameLines * kLh(namePt) ? 3 : 0), nameWidth, nameLines * kLh(namePt), namePt, RTL, true)
    y += rowHeight + 3
    const subLines = [
      ...(item.options ? [`◦ ${item.options}`] : []),
      ...(item.extras || []).map((extra) => `+ ${extra}`),
    ]
    for (const sub of subLines) {
      const lines = kLines(sub, nameWidth, subPt)
      text(sub, left, y, nameWidth, lines * kLh(subPt), subPt, RTL)
      y += lines * kLh(subPt)
    }
    if (item.note) {
      const note = `ملاحظة: ${item.note}`
      const lines = kLines(note, nameWidth - 8, subPt)
      const noteHeight = lines * kLh(subPt) + 4
      fill(left, y + 1, nameWidth, noteHeight)
      text(note, left + 4, y + 3, nameWidth - 8, lines * kLh(subPt), subPt, RTL, true)
      y += noteHeight + 3
    }
    y += 4
    if (index < slip.items.length - 1) { line(left, y, right, y); y += 6 }
  })

  // الخلاصة
  y += 2
  line(left, y, right, y, BLACK)
  line(left, y + 2, right, y + 2, BLACK)
  y += 8
  const totalQty = slip.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
  centered(`عدد الأصناف: ${slip.items.length}   ·   مجموع الكميات: ${Math.round(totalQty * 1000) / 1000}`, left, y, width, pt(9), true)
  y += kLh(pt(9))

  return [{ commands, height: Math.round(y + mmToUnits(settings.margin_bottom_mm) + 12) }]
}

export function buildCashierServicePages(document: PrintDocument, settings: VoucherPrintSettings, context: PrintContext) {
  const safeCode = String(document.code || "voucher").replace(/[^a-z0-9_-]/gi, "")
  if (document.kitchen) return copyLabelsFor(settings, document.copyLabel).flatMap(() => layoutKitchen(document, settings, context))
  return copyLabelsFor(settings, document.copyLabel).flatMap((label, copy) => layoutCopy(document, settings, context, label, `voucher-${safeCode}-${Date.now()}-${copy}`))
}

export async function printWithCashierService(document: PrintDocument, settings: VoucherPrintSettings, context: PrintContext) {
  const paper = paperDimensions(settings)
  // طابعة المستخدم الافتراضية (عامة أو كاشير ومطاعم) تتقدّم على طابعة إعدادات الطباعة، إلا الطابعة المحددة (fixed)
  const scope = settings.printer_scope || "general"
  const printerName = scope === "fixed" ? settings.printer_name : (await userPrinter(scope)) || settings.printer_name
  await printPagesDirect(buildCashierServicePages(document, settings, context).map((page) => ({
    commands: page.commands,
    printerName,
    paper: paper.name,
    paperWidth: mmToUnits(paper.widthMm),
    paperHeight: page.height,
    openDrawer: false,
  })))
}
