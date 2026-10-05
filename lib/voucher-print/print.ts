"use client"

import JsBarcode from "jsbarcode"
import type { CompanyInfo, PrintDocument } from "./document"
import { renderPrintHtml, type PrintContext } from "./html"
import { normalizePrintSettings, paperDimensions, type VoucherPrintSettings } from "./settings"
import { printWithCashierService } from "./win-service"

type SettingsBundle = { settings: VoucherPrintSettings; company: CompanyInfo }
const cache = new Map<number, { at: number; promise: Promise<SettingsBundle> }>()
const CACHE_MS = 60_000

export const isMobilePrintDevice = () =>
  typeof navigator !== "undefined" && (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1))

export function loadVoucherPrintSettings(voucherTypeId: number, force = false): Promise<SettingsBundle> {
  const cached = cache.get(voucherTypeId)
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.promise
  const promise = fetch(`/api/settings/voucher-print?voucher_type_id=${voucherTypeId}`, { cache: "no-store" })
    .then(async response => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل إعدادات الطباعة")
      return { settings: normalizePrintSettings(data.settings), company: data.company as CompanyInfo }
    })
  promise.catch(() => cache.delete(voucherTypeId))
  cache.set(voucherTypeId, { at: Date.now(), promise })
  return promise
}

export const invalidateVoucherPrintSettings = () => cache.clear()

export function barcodeSvg(code: string) {
  if (!code || typeof document === "undefined") return ""
  try {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    JsBarcode(svg, code, { format: "CODE128", height: 38, width: 1.6, fontSize: 12, margin: 0, displayValue: true })
    return svg.outerHTML
  } catch {
    return ""
  }
}

function currentUserName() {
  try {
    const raw = sessionStorage.getItem("erp_user") || localStorage.getItem("erp_user")
    const user = raw ? JSON.parse(raw) : null
    return String(user?.fullName || user?.full_name || user?.username || "")
  } catch {
    return ""
  }
}

export function buildPrintContext(document: PrintDocument, company: CompanyInfo, settings: VoucherPrintSettings): PrintContext {
  return { company, printedBy: currentUserName(), printedAt: new Date(), barcodeSvg: settings.show_barcode ? barcodeSvg(document.code) : "" }
}

function printHtmlInIframe(html: string) {
  return new Promise<void>((resolve, reject) => {
    const frame = window.document.createElement("iframe")
    frame.setAttribute("aria-hidden", "true")
    Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0", visibility: "hidden" })
    window.document.body.appendChild(frame)
    const frameWindow = frame.contentWindow
    const frameDocument = frame.contentDocument || frameWindow?.document
    if (!frameWindow || !frameDocument) {
      frame.remove()
      reject(new Error("تعذر تجهيز صفحة الطباعة"))
      return
    }
    const cleanup = () => window.setTimeout(() => frame.remove(), 1000)
    frameWindow.addEventListener("afterprint", cleanup, { once: true })
    frameDocument.open()
    frameDocument.write(html)
    frameDocument.close()
    const run = () => {
      frameWindow.focus()
      frameWindow.print()
      window.setTimeout(cleanup, 60_000)
      resolve()
    }
    void (frameDocument.fonts?.ready ?? Promise.resolve()).then(() => window.setTimeout(run, 150))
  })
}

function printHtmlInWindow(target: Window, html: string) {
  target.document.open()
  target.document.write(html)
  target.document.close()
  target.focus()
  window.setTimeout(() => target.print(), 500)
}

export type PrintResult = { method: "service" | "browser"; warning?: string }

/**
 * Prints a voucher using the saved settings of its voucher type.
 * Call it directly from the click handler: on phones/tablets the print window must be
 * opened before the first await or the browser blocks it as a popup.
 */
export function printVoucher(document: PrintDocument): Promise<PrintResult> {
  return printVoucherWith(document, () => loadVoucherPrintSettings(document.voucherTypeId))
}

export function printVoucherWithSettings(document: PrintDocument, settings: VoucherPrintSettings, company: CompanyInfo): Promise<PrintResult> {
  return printVoucherWith(document, async () => ({ settings, company }))
}

async function printVoucherWith(document: PrintDocument, resolve: () => Promise<SettingsBundle>): Promise<PrintResult> {
  const mobile = isMobilePrintDevice()
  const mobileWindow = mobile ? window.open("", "_blank") : null
  try {
    const { settings, company } = await resolve()
    const context = buildPrintContext(document, company, settings)
    const html = () => renderPrintHtml(document, settings, context)

    if (mobile) {
      if (mobileWindow) printHtmlInWindow(mobileWindow, html())
      else await printHtmlInIframe(html())
      return { method: "browser" }
    }

    if (settings.print_method !== "browser") {
      try {
        await printWithCashierService(document, settings, context)
        return { method: "service" }
      } catch (error) {
        if (settings.print_method === "service") throw error
        await printHtmlInIframe(html())
        return { method: "browser", warning: error instanceof Error ? error.message : undefined }
      }
    }

    await printHtmlInIframe(html())
    return { method: "browser" }
  } catch (error) {
    mobileWindow?.close()
    throw error
  }
}

export function previewHtml(document: PrintDocument, settings: VoucherPrintSettings, company: CompanyInfo, previewScale?: number) {
  return renderPrintHtml(document, settings, buildPrintContext(document, company, settings), { preview: true, previewScale })
}

export { paperDimensions }
