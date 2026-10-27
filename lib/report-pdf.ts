"use client"

import type { BuiltReport } from "@/lib/voucher-print/report-print"

const MM_TO_PX = 96 / 25.4

/**
 * يحوّل HTML تقرير (من buildReportFrom) إلى PDF: يُرسم في إطار مخفي ثم يُقسَّم صفحات عند حدود
 * الصفوف (لا يُقطع سطر جدول بين صفحتين)، مع ترقيم الصفحات.
 */
export async function reportPdfBlob(report: BuiltReport): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")])
  const { paper, margins } = report
  const contentWidthMm = Math.max(40, paper.widthMm - margins.left - margins.right)
  const contentHeightMm = Math.max(40, paper.heightMm - margins.top - margins.bottom - 6)
  const widthPx = Math.round(contentWidthMm * MM_TO_PX)

  const frame = document.createElement("iframe")
  frame.setAttribute("aria-hidden", "true")
  Object.assign(frame.style, { position: "fixed", left: "-20000px", top: "0", width: `${widthPx}px`, height: "1200px", border: "0" })
  document.body.appendChild(frame)
  try {
    const doc = frame.contentDocument
    if (!doc) throw new Error("تعذر تجهيز ملف PDF")
    doc.open()
    doc.write(report.html)
    doc.close()
    await Promise.all(Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).map((node) => new Promise<void>((resolve) => {
      const link = node as HTMLLinkElement
      if (link.sheet) { resolve(); return }
      const finish = () => { window.clearTimeout(timeout); resolve() }
      const timeout = window.setTimeout(finish, 4000)
      link.addEventListener("load", finish, { once: true })
      link.addEventListener("error", finish, { once: true })
    })))
    await (doc.fonts?.ready ?? Promise.resolve())
    await Promise.all(Array.from(doc.images).map((image) => image.decode?.().catch(() => undefined) ?? Promise.resolve()))
    await new Promise(resolve => setTimeout(resolve, 250))

    const body = doc.body
    body.style.background = "#fff"
    const totalHeightPx = Math.ceil(body.scrollHeight)
    frame.style.height = `${totalHeightPx + 20}px`
    const scale = 2
    const canvas = await html2canvas(body, {
      scale,
      backgroundColor: "#ffffff",
      useCORS: true,
      width: widthPx,
      height: totalHeightPx,
      windowWidth: widthPx,
      windowHeight: totalHeightPx,
    })

    // نقاط القطع المسموحة: نهاية كل صف جدول وكل عنصر رئيسي
    const bodyTop = body.getBoundingClientRect().top
    const breaks = Array.from(doc.querySelectorAll("tr, .head, .title, .summary, .table-gap"))
      .map(element => Math.round(element.getBoundingClientRect().bottom - bodyTop))
      .filter(value => value > 0)
      .sort((a, b) => a - b)

    const pagePx = contentHeightMm * MM_TO_PX
    const slices: Array<[number, number]> = []
    let start = 0
    while (start < totalHeightPx - 1) {
      const limit = start + pagePx
      if (limit >= totalHeightPx) { slices.push([start, totalHeightPx]); break }
      const candidate = [...breaks].reverse().find(value => value <= limit && value > start + pagePx * 0.3)
      const end = candidate ?? Math.floor(limit)
      slices.push([start, end])
      start = end
    }

    const pdf = new jsPDF({ orientation: paper.widthMm > paper.heightMm ? "l" : "p", unit: "mm", format: [paper.widthMm, paper.heightMm] })
    slices.forEach(([from, to], index) => {
      if (index > 0) pdf.addPage([paper.widthMm, paper.heightMm], paper.widthMm > paper.heightMm ? "l" : "p")
      const sliceHeight = Math.max(1, Math.round((to - from) * scale))
      const part = document.createElement("canvas")
      part.width = canvas.width
      part.height = sliceHeight
      const context = part.getContext("2d")
      if (!context) return
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, part.width, part.height)
      context.drawImage(canvas, 0, Math.round(from * scale), canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)
      pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", margins.left, margins.top, contentWidthMm, (to - from) / MM_TO_PX)
      pdf.setFontSize(8)
      pdf.setTextColor(100)
      pdf.text(`${index + 1} / ${slices.length}`, paper.widthMm / 2, paper.heightMm - Math.max(4, margins.bottom / 2), { align: "center" })
    })
    return pdf.output("blob")
  } finally {
    frame.remove()
  }
}

export const pdfFileName = (title: string) =>
  `${(title || "report").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80)} ${new Date().toISOString().slice(0, 10)}.pdf`
