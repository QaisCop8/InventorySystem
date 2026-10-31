"use client"

// قارئ الشيكات (ChecksReader1000) عبر CashierWinService على جهاز المستخدم (ws://localhost:32999/cashier) —
// نفس بروتوكول الشامل (ShamelWeb Stores/ChequeReaderStore.js):
// → {type:"openChequeReader", data:{banks:[{id,code,name}], branches:[{id,code,name,bankCode}], bankPhysicalAccount, chequeList}}
//   (الأكواد نصوص: الخدمة تأخذ آخر خانتين من كود البنك، وكود البنك للفرع يُكمَّل لأربع خانات)
// ← {Type:"cheqsReaderResult", Data:"{type:'dataResponse', data:'[{checkNo, accountNo, bankNo, branchNo, dueDate, checkAmount, frontBase64, backBase64}]'}"}
// الخدمة غير مشغّلة ⇐ تُطلق عبر رابط cashierService://start/ ثم يُعاد الاتصال.
import { allowExternalProtocolNavigation } from "@/lib/navigation-guard"

const SERVICE_URL = "ws://localhost:32999/cashier"
const START_URL = "cashierService://start/"
const READ_TIMEOUT_MS = 15 * 60_000

export type ChequeReaderBank = { id: number; bank_code?: string; bank_name: string }
export type ChequeReaderBranch = { id: number; branch_code?: string; branch_name: string; bank_id: number | null }

export type ScannedCheque = {
  cheq_num: string
  bank_account: string
  bank_no: string
  branch_no: string
  due_date: string
  amount: number | null
  front_image: string
  back_image: string
}

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim())
const pad4 = (code: unknown) => {
  const value = text(code)
  return /^\d+$/.test(value) ? value.padStart(4, "0") : value
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

function tryOpen(timeoutMs = 1200) {
  return new Promise<WebSocket | null>((resolve) => {
    let socket: WebSocket
    try { socket = new WebSocket(SERVICE_URL) } catch { resolve(null); return }
    let done = false
    const finish = (value: WebSocket | null) => {
      if (done) return
      done = true
      window.clearTimeout(timer)
      if (!value) { try { socket.close() } catch { /* */ } }
      resolve(value)
    }
    const timer = window.setTimeout(() => finish(null), timeoutMs)
    socket.addEventListener("open", () => finish(socket), { once: true })
    socket.addEventListener("error", () => finish(null), { once: true })
    socket.addEventListener("close", () => finish(null), { once: true })
  })
}

/**
 * يطلق CashierWinService عبر رابط البروتوكول — نفس الشامل (window.location.href)؛ المتصفح يمنع روابط
 * البروتوكولات الخارجية من iframe مخفي بصمت، فلا تُطلق الخدمة. لا تُغادر الصفحة (يفتحها نظام التشغيل).
 */
function launchService() {
  allowExternalProtocolNavigation()
  window.location.href = `${START_URL}?languageId=2`
}

export type ChequeReaderPhase = "connecting" | "launching" | "waiting"

async function connect(onPhase?: (phase: ChequeReaderPhase) => void) {
  onPhase?.("connecting")
  const first = await tryOpen(800)
  if (first) return first
  onPhase?.("launching")
  launchService()
  for (let attempt = 0; attempt < 12; attempt++) {
    await sleep(1000)
    const socket = await tryOpen()
    if (socket) return socket
  }
  throw new Error("خطأ في الاتصال بقارئ الشيكات — تأكد من تشغيل خدمة الكاشير (CashierWinService) على هذا الجهاز")
}

const parseDueDate = (value: unknown) => {
  const raw = text(value)
  if (!raw) return ""
  const ms = raw.match(/\/Date\((-?\d+)/)
  const date = ms ? new Date(Number(ms[1])) : new Date(raw)
  if (Number.isNaN(date.getTime())) return ""
  // تاريخ محلي (لا toISOString — منطقة زمنية +2/+3 تُرجع اليوم السابق)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const parseList = (payload: unknown): any[] => {
  let value: any = payload
  for (let depth = 0; depth < 4; depth++) {
    if (typeof value === "string") {
      try { value = JSON.parse(value) } catch { return [] }
      continue
    }
    if (Array.isArray(value)) return value
    if (value && typeof value === "object" && "data" in value) { value = value.data; continue }
    return []
  }
  return Array.isArray(value) ? value : []
}

let activeSocket: WebSocket | null = null

/** يلغي قراءة جارية (إغلاق الاتصال). */
export function cancelChequeReader() {
  try { activeSocket?.close() } catch { /* */ }
  activeSocket = null
}

/**
 * يفتح نافذة قارئ الشيكات (شيكات واردة — سند قبض) وينتظر نتيجة المسح.
 * يُرجع الشيكات المقروءة مع صورها (base64).
 */
export async function readReceivedCheques(banks: ChequeReaderBank[], branches: ChequeReaderBranch[], onPhase?: (phase: ChequeReaderPhase) => void): Promise<ScannedCheque[]> {
  cancelChequeReader()
  const socket = await connect(onPhase)
  activeSocket = socket
  const bankCodeById = new Map(banks.map((bank) => [bank.id, pad4(bank.bank_code)]))
  const message = {
    type: "openChequeReader",
    data: {
      banks: banks.filter((bank) => text(bank.bank_code)).map((bank) => ({ id: bank.id, code: pad4(bank.bank_code), name: text(bank.bank_name) })),
      branches: branches
        .filter((branch) => text(branch.branch_code) && branch.bank_id && bankCodeById.get(branch.bank_id))
        .map((branch) => ({ id: branch.id, code: text(branch.branch_code), name: text(branch.branch_name), bankCode: bankCodeById.get(branch.bank_id!) || "" })),
      bankPhysicalAccount: "",
      chequeList: [],
    },
  }

  return new Promise<ScannedCheque[]>((resolve, reject) => {
    const timer = window.setTimeout(() => { cleanup(); reject(new Error("انتهت مهلة انتظار قارئ الشيكات")) }, READ_TIMEOUT_MS)
    function cleanup() {
      window.clearTimeout(timer)
      socket.removeEventListener("message", onMessage)
      socket.removeEventListener("close", onClose)
      try { socket.close() } catch { /* */ }
      if (activeSocket === socket) activeSocket = null
    }
    function onClose() {
      cleanup()
      reject(new Error("أُغلق الاتصال بقارئ الشيكات قبل استلام النتيجة"))
    }
    function onMessage(event: MessageEvent) {
      let envelope: any
      try { envelope = JSON.parse(String(event.data)) } catch { return }
      if (String(envelope?.Type || envelope?.type || "").toLowerCase() !== "cheqsreaderresult") return
      const list = parseList(envelope.Data ?? envelope.data)
      cleanup()
      resolve(list.map((cheque) => ({
        cheq_num: text(cheque.checkNo ?? cheque.CheckNo),
        bank_account: text(cheque.accountNo ?? cheque.AccountNo),
        bank_no: pad4(cheque.bankNo ?? cheque.BankNo),
        branch_no: text(cheque.branchNo ?? cheque.BranchNo),
        due_date: parseDueDate(cheque.dueDate ?? cheque.DueDate),
        amount: Number.isFinite(Number(cheque.checkAmount ?? cheque.CheckAmount)) && Number(cheque.checkAmount ?? cheque.CheckAmount) > 0
          ? Number(cheque.checkAmount ?? cheque.CheckAmount) : null,
        front_image: text(cheque.frontBase64),
        back_image: text(cheque.backBase64),
      })).filter((cheque) => cheque.cheq_num || cheque.bank_account))
    }
    socket.addEventListener("message", onMessage)
    socket.addEventListener("close", onClose)
    socket.send(JSON.stringify(message))
    onPhase?.("waiting")
    console.info("[cheque-reader] openChequeReader sent", { banks: message.data.banks.length, branches: message.data.branches.length })
  })
}

/** مطابقة كود البنك/الفرع المقروء (قد يأتي بلا أصفار بادئة) مع تعريفات النظام. */
export const sameCode = (a: unknown, b: unknown) => {
  const x = text(a)
  const y = text(b)
  if (!x || !y) return false
  if (/^\d+$/.test(x) && /^\d+$/.test(y)) return Number(x) === Number(y)
  return x.toUpperCase() === y.toUpperCase()
}
