"use client"

// أجهزة الدفع بالبطاقة (PinPad) عبر CashService على جهاز الكاشير (ws://localhost:32999/cashier) — نفس بروتوكول الشامل:
// → {type:"PassToMachine", machine_id, amount, currency, current_batch}
// ← {Type:"PassToMachine", Data:"{type:'dataResponse', data:{result, response}}"} أو data:"openSettings" إذا لم تُضبط إعدادات الجهاز بعد.
// → {type:"SaveSettings", machine_id, ...إعدادات} ← data:"ok" (البنك العربي لا يرد، فنكتفي بمهلة قصيرة).
// الأجهزة: 1 البنك العربي، 2 بنك فلسطين (Verifone X990)، 3 NeoCash.
const SERVICE_URL = "ws://localhost:32999/cashier"
const PAYMENT_TIMEOUT_MS = 120_000

export const PINPAD_MACHINES: { id: number; name: string }[] = [
  { id: 1, name: "البنك العربي (Arab Bank)" },
  { id: 2, name: "بنك فلسطين (Verifone X990)" },
  { id: 3, name: "NeoCash" },
]
export const pinpadMachineName = (id?: number | null) => PINPAD_MACHINES.find((machine) => machine.id === Number(id))?.name || ""

export type PinpadResult = {
  machine_id: number
  card_number: string
  auth_code: string
  trans_id: string
  terminal_id: string
  merchant: string
  mid: string
}

export type PinpadSettings = {
  port?: string
  baudRate?: number
  ipAddress?: string
  language?: 1 | 2
  slipPrint?: 1 | 2
  protocol?: string
  mid?: string
  tid?: string
}

/** يُرمى عندما يطلب الجهاز ضبط الإعدادات (لا يوجد ملف إعدادات على هذا الجهاز). */
export class PinpadSettingsRequired extends Error {
  constructor() { super("يجب ضبط إعدادات جهاز الدفع على هذا الجهاز أولاً") }
}

function openSocket() {
  return new Promise<WebSocket>((resolve, reject) => {
    let socket: WebSocket
    try { socket = new WebSocket(SERVICE_URL) } catch { reject(new Error("تعذر الاتصال بخدمة الكاشير (CashService) على هذا الجهاز")); return }
    const timer = window.setTimeout(() => { socket.close(); reject(new Error("لم يتم العثور على خدمة الكاشير (CashService) على هذا الجهاز")) }, 4000)
    socket.addEventListener("open", () => { window.clearTimeout(timer); resolve(socket) }, { once: true })
    socket.addEventListener("error", () => { window.clearTimeout(timer); reject(new Error("تعذر الاتصال بخدمة الكاشير (CashService) على هذا الجهاز")) }, { once: true })
  })
}

function waitFor(socket: WebSocket, type: string, timeoutMs: number, timeoutValue?: unknown) {
  return new Promise<any>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      socket.removeEventListener("message", onMessage)
      if (timeoutValue !== undefined) resolve(timeoutValue)
      else reject(new Error("انتهت مهلة انتظار جهاز الدفع — تحقق من الجهاز وأعد المحاولة أو أدخل البيانات يدوياً"))
    }, timeoutMs)
    function onMessage(event: MessageEvent) {
      try {
        const envelope = JSON.parse(String(event.data))
        if (String(envelope.Type || envelope.type || "").toLowerCase() !== type.toLowerCase()) return
        let response = envelope.Data ?? envelope.data
        if (typeof response === "string") { try { response = JSON.parse(response) } catch { /* نص عادي */ } }
        window.clearTimeout(timer)
        socket.removeEventListener("message", onMessage)
        resolve(response && typeof response === "object" && "data" in response ? response.data : response)
      } catch { /* رسالة غير JSON لا تخصنا */ }
    }
    socket.addEventListener("message", onMessage)
  })
}

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim())

function normalize(machineId: number, response: any): PinpadResult {
  const r = response || {}
  if (machineId === 1) {
    return { machine_id: 1, card_number: text(r.CardNum), auth_code: text(r.AuthCode), trans_id: text(r.TransID), terminal_id: text(r.TID), merchant: text(r.MerchantName), mid: text(r.MID) }
  }
  if (machineId === 2) {
    return {
      machine_id: 2, card_number: r.is_qr_pay ? text(r.qr_ref) : text(r.card?.pan), auth_code: text(r.auth_code), trans_id: text(r.seq),
      terminal_id: text(r.pos_code), merchant: text(r.merch || r.outlet), mid: text(r.outlet),
    }
  }
  return { machine_id: 3, card_number: text(r.pan), auth_code: text(r.authCode), trans_id: text(r.invoice), terminal_id: text(r.tid), merchant: text(r.issuerName), mid: text(r.mid) }
}

/** يرسل المبلغ لجهاز الدفع وينتظر تمرير البطاقة. يرمي PinpadSettingsRequired إذا لزم ضبط الإعدادات. */
export async function payWithPinpad(input: { machineId: number; amount: number; currency: string; batch: string | number }): Promise<PinpadResult> {
  const machineId = Number(input.machineId)
  if (![1, 2, 3].includes(machineId)) throw new Error("نوع البطاقة غير مربوط بجهاز دفع")
  if (!(Number(input.amount) > 0)) throw new Error("أدخل مبلغ البطاقة أولاً")
  const socket = await openSocket()
  try {
    const reply = waitFor(socket, "PassToMachine", PAYMENT_TIMEOUT_MS)
    socket.send(JSON.stringify({
      type: "PassToMachine", machine_id: machineId, amount: Math.round(Number(input.amount) * 100) / 100,
      currency: String(input.currency || ""), current_batch: String(input.batch ?? ""),
    }))
    const data = await reply
    if (data === "openSettings") throw new PinpadSettingsRequired()
    if (data?.result === true && data.response) return normalize(machineId, data.response)
    const reason = text(data?.response?.RespDesc || data?.response?.description || data?.response?.message)
    throw new Error(reason ? `رفض جهاز الدفع العملية: ${reason}` : "لم تتم العملية على جهاز الدفع")
  } finally {
    socket.close()
  }
}

/** يحفظ إعدادات جهاز الدفع في CashService على هذا الجهاز. */
export async function savePinpadSettings(machineId: number, settings: PinpadSettings) {
  const socket = await openSocket()
  try {
    // البنك العربي (1) يحفظ الملف دون رد، فنعتبر انتهاء المهلة القصيرة نجاحاً.
    const reply = waitFor(socket, "SaveSettings", machineId === 1 ? 2500 : 10_000, machineId === 1 ? "ok" : undefined)
    const payload: Record<string, unknown> = { type: "SaveSettings", machine_id: machineId }
    if (machineId === 1) Object.assign(payload, { port: settings.port || "", baudRate: Number(settings.baudRate || 9600) })
    if (machineId === 2) Object.assign(payload, { ipAddress: settings.ipAddress || "", port: String(settings.port || ""), language: settings.language || 1, slipPrint: settings.slipPrint || 1 })
    if (machineId === 3) Object.assign(payload, { port: settings.port || "", baudRate: Number(settings.baudRate || 9600), protocol: settings.protocol || "", mid: settings.mid || "", tid: settings.tid || "" })
    socket.send(JSON.stringify(payload))
    const data = await reply
    if (data !== "ok") throw new Error("لم تؤكد خدمة الكاشير حفظ الإعدادات")
  } finally {
    socket.close()
  }
}

/** رقم البطاقة المقنّع للحفظ: آخر 4 أرقام فقط. */
export const maskCard = (value: string) => {
  const digits = String(value || "").replace(/\D/g, "")
  return digits.length >= 4 ? `****${digits.slice(-4)}` : String(value || "").slice(0, 40)
}
