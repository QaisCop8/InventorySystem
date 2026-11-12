"use client"

// طباعة مباشرة على طابعة الجهاز (بلا نافذة طباعة) بأوامر رسم GDI+ (وحدة 1/100 بوصة، الخط بالنقاط):
//   • داخل مشغّل ويندوز NoonERP (launchers/windows — WebView2): المشغّل نفسه يطبع عبر رسالة chrome.webview، فلا حاجة
//     لخدمة CashService على الجهاز.
//   • غير ذلك: خدمة CashService المحلية ws://localhost:32999/cashier (نفس البروتوكول: initialPrinting ثم addPrintCommand لكل
//     أمر ثم startPrinting لكل صفحة).
// أنواع الأوامر: 1 صورة (base64/data URL)، 3 مستطيل، 4 مستطيل مظلل، 5 خط (x,y ← width,height)، 6 نص، 7 باركود Code128.

export type PrintCommand = Record<string, string | number>
export type PrintPage = {
  commands: PrintCommand[]
  printerName: string
  paper: string
  paperWidth: number
  paperHeight: number
  openDrawer: boolean
}

const SERVICE_URL = "ws://localhost:32999/cashier"

type LauncherWebView = { postMessage: (message: unknown) => void; addEventListener: (type: "message", listener: (event: { data: any }) => void) => void; removeEventListener: (type: "message", listener: (event: { data: any }) => void) => void }

function launcherWebView(): LauncherWebView | null {
  if (typeof window === "undefined") return null
  const host = window as any
  // المشغّل يحقن __noonLauncher عند إنشاء كل صفحة — WebView2 في برامج أخرى لا يُعامل كمشغّل
  if (!host.__noonLauncher?.print || !host.chrome?.webview) return null
  return host.chrome.webview as LauncherWebView
}

/** هل الطباعة المباشرة تتم عبر مشغّل ويندوز (لا تحتاج CashService) */
export const isLauncherPrinting = () => Boolean(launcherWebView())

function printThroughLauncher(webview: LauncherWebView, pages: PrintPage[]) {
  return new Promise<void>((resolve, reject) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const timer = window.setTimeout(() => { webview.removeEventListener("message", onMessage); reject(new Error("انتهت مهلة الطباعة")) }, 120_000)
    function onMessage(event: { data: any }) {
      const data = typeof event.data === "string" ? (() => { try { return JSON.parse(event.data) } catch { return null } })() : event.data
      if (!data || data.type !== "noon-print-result" || data.id !== id) return
      window.clearTimeout(timer)
      webview.removeEventListener("message", onMessage)
      if (data.success) resolve()
      else reject(new Error(String(data.message || "فشلت الطباعة")))
    }
    webview.addEventListener("message", onMessage)
    webview.postMessage({ type: "noon-print", id, pages })
  })
}

function openServiceSocket() {
  return new Promise<WebSocket>((resolve, reject) => {
    let socket: WebSocket
    try {
      socket = new WebSocket(SERVICE_URL)
    } catch {
      reject(new Error("تعذر الاتصال بخدمة الطباعة على هذا الجهاز"))
      return
    }
    const timer = window.setTimeout(() => { socket.close(); reject(new Error("لم يتم العثور على خدمة الطباعة في هذا الجهاز")) }, 5000)
    socket.addEventListener("open", () => { window.clearTimeout(timer); resolve(socket) }, { once: true })
    socket.addEventListener("error", () => { window.clearTimeout(timer); reject(new Error("تعذر الاتصال بخدمة الطباعة على هذا الجهاز")) }, { once: true })
  })
}

function serviceRequest(socket: WebSocket, type: string, data: Record<string, string | number | boolean>) {
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

async function printThroughService(pages: PrintPage[]) {
  const socket = await openServiceSocket()
  try {
    for (const page of pages) {
      await serviceRequest(socket, "initialPrinting", {})
      for (const command of page.commands) await serviceRequest(socket, "addPrintCommand", command)
      await serviceRequest(socket, "startPrinting", {
        printerName: page.printerName,
        paper: page.paper,
        paperWidth: page.paperWidth,
        paperHeight: page.paperHeight,
        openDrawer: page.openDrawer,
      })
    }
  } finally {
    socket.close()
  }
}

/** يطبع الصفحات مباشرة: عبر مشغّل ويندوز إن كانت الصفحة داخله، وإلا عبر CashService */
export async function printPagesDirect(pages: PrintPage[]) {
  if (!pages.length) return
  const webview = launcherWebView()
  if (webview) return printThroughLauncher(webview, pages)
  return printThroughService(pages)
}
