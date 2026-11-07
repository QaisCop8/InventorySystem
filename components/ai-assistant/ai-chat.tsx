"use client"
import { tr, appDir } from "@/lib/i18n"
import { amountFractionOptions } from "@/lib/decimals"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/components/auth/auth-context"
import { saveAIReceiptDraft } from "@/lib/ai-receipt-direct-save"
import { voucherHref } from "@/lib/voucher-links"
import { cn } from "@/lib/utils"
import { voucherPrefillSessionItems, type VoucherPrefill } from "@/lib/ai-voucher-prefill"
import { openSectionInNewTab } from "@/lib/new-tab-handoff"
import { useSectionIntent } from "@/lib/section-intents"
import { saveAIJournalDraft } from "@/lib/ai-journal-direct-save"
import {
  Paperclip,
  FileSearch,
  Save,
  Loader2,
  Send,
  Bot,
  Mic,
  MicOff,
  Sparkles,
  Receipt,
  BarChart3,
  Package,
  ArrowDownCircle,
  ArrowUpCircle,
  FilePlus2,
  Truck,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RotateCcw,
  Lightbulb,
  User,
  Copy,
  History,
  Building2,
  Square,
} from "lucide-react"

type SpeechRecognitionEventLike = Event & { resultIndex: number; results: { length: number; [index: number]: { isFinal: boolean; [index: number]: { transcript: string } } } }
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike
type MediaRecorderLike = {
  mimeType: string
  start: () => void
  stop: () => void
  ondataavailable: ((event: { data: Blob }) => void) | null
  onstop: (() => void) | null
  onerror: (() => void) | null
}

// المساعد يختم رده بسطر "تأكيد: <أمر>" حين يفهم طلب مستند (سند قبض/صرف) — يُعرض كزر "تأكيد" ينفّذ الأمر فعلياً
const CONFIRM_LINE = /^\s*[*_`]*تأكيد\s*[:：][*_`]*\s*(.+?)\s*[*_`]*\s*$/m
const confirmCommandOf = (content: string) => content.match(CONFIRM_LINE)?.[1]?.replace(/[*_`]/g, "").trim() || null
const withoutConfirmLine = (content: string) => content.replace(CONFIRM_LINE, "").trim()
// ردود الموافقة المكتوبة ("نعم"، "تأكيد"، "اعتمد"...) تنفّذ آخر أمر مقترح
const CONFIRM_WORDS = /^\s*(?:نعم|ايوه|أيوه|ايوا|اكيد|أكيد|اكد|أكد|تأكيد|تاكيد|اعتمد|موافق|احفظ|نفذ|نفّذ|تمام|ok|okay|yes)(?:\s|[.!،,]|$)/i

// سطر "اقتراحات: س1 | س2 | س3" في آخر رد الاستعلام ⇐ أزرار أسئلة متابعة
const SUGGESTIONS_LINE = /^\s*[*_`]*اقتراحات\s*[:：][*_`]*\s*(.+?)\s*$/m
const suggestionsOf = (content: string) =>
  (content.match(SUGGESTIONS_LINE)?.[1] || "").split("|").map((item) => item.replace(/[*_`]/g, "").trim()).filter((item) => item.length > 1).slice(0, 4)
const withoutSuggestionsLine = (content: string) => content.replace(SUGGESTIONS_LINE, "").trim()

// سؤال/استعلام واضح بلا طلب مستند ⇐ يُرسل للمحادثة مباشرة دون تحليل السند/الطلبية (استدعاءا ذكاء اصطناعي أقل = رد أسرع)
const DOCUMENT_WORDS = /سند|قبض|قبص|صرف|دفع|دفعت|استلم|قبضت|شيك|طلبي|اطلب|أطلب|مسود|بضاع|سجّل|سجل/
const QUESTION_START = /^\s*(?:كم|ما|ماذا|من|مين|هل|أين|وين|متى|لماذا|ليش|كيف|شو|أعطني|اعطني|اعرض|عرض|أظهر|اظهر|ملخص|لخص|حلل|حلّل|قارن|ابحث|رصيد|أكبر|اكبر|أفضل|افضل|أكثر|اكثر|أقل|اقل)/
const isPlainQuestion = (text: string) => !DOCUMENT_WORDS.test(text) && (QUESTION_START.test(text) || /[؟?]\s*$/.test(text))

const renderInline = (text: string) =>
  text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) =>
    /^\*\*[^*]+\*\*$/.test(part) ? <strong key={index}>{part.slice(2, -2)}</strong> : <span key={index}>{part.replace(/\*\*/g, "")}</span>)

// تنسيق ردود المساعد: **عريض**، النقاط والترقيم، عناوين ###، وجداول markdown (| أ | ب |)
function renderAssistantText(text: string) {
  const lines = text.split("\n")
  const out: ReactNode[] = []
  const isTableLine = (line: string) => /^\s*\|.*\|\s*$/.test(line)
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (isTableLine(line)) {
      const rows: string[][] = []
      const start = index
      while (index < lines.length && isTableLine(lines[index])) {
        const cells = lines[index].trim().slice(1, -1).split("|").map((cell) => cell.trim())
        if (!cells.every((cell) => /^:?-{2,}:?$/.test(cell))) rows.push(cells)
        index++
      }
      index--
      const [head, ...body] = rows
      out.push(
        <div key={`t${start}`} className="my-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-white/10">
          <table className="w-full text-xs">
            {head && <thead className="bg-emerald-50 text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-100"><tr>{head.map((cell, cellIndex) => <th key={cellIndex} className="whitespace-nowrap px-2.5 py-1.5 text-start font-bold">{renderInline(cell)}</th>)}</tr></thead>}
            <tbody>{body.map((row, rowIndex) => <tr key={rowIndex} className="border-t border-slate-100 dark:border-white/10">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-2.5 py-1.5 tabular-nums" dir="auto">{renderInline(cell)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      )
      continue
    }
    const heading = line.match(/^\s*#{1,4}\s+(.*)$/)
    if (heading) {
      out.push(<span key={index} className="mt-2 block font-extrabold text-emerald-800 dark:text-emerald-200">{renderInline(heading[1])}</span>)
      continue
    }
    const bullet = /^\s*[*-]\s+/.test(line)
    const numbered = line.match(/^\s*(\d+)[.)]\s+/)
    const body = bullet ? line.replace(/^\s*[*-]\s+/, "") : numbered ? line.slice(numbered[0].length) : line
    out.push(<span key={index} className={cn("block min-h-[1em]", (bullet || numbered) && "ps-3")}>{bullet ? "• " : numbered ? `${numbered[1]}. ` : null}{renderInline(body)}</span>)
  }
  return out
}

interface Message {
  role: "user" | "assistant"
  content: string
  /** نتيجة إنشاء مستند: success = بطاقة خضراء، error = بطاقة تنبيه */
  kind?: "success" | "error"
  /** تفاصيل بطاقة المستند المنشأ */
  details?: { label: string; value: string }[]
  voucherLink?: { id: number; code: string; voucherType: 4 | 5 }
  documentLink?: { section: string; code: string; id?: number }
  /** فاتورة مقروءة من مرفق: زر فتح شاشة الفاتورة معبّأة للمراجعة */
  invoicePrefill?: VoucherPrefill
  at?: number
  /** زر "تأكيد" استُخدم لهذا الرد */
  confirmed?: boolean
}

interface PendingCustomerVoucher {
  command: string
  customer_name: string
  voucher_type: 4 | 5
  document_kind?: "voucher" | "sales_draft"
  active_branch_id?: number
  user_id?: number
}

// أوامر جاهزة مصنّفة — الضغط يضع النص في مربع الكتابة لاستكمال الأقواس ثم الإرسال
const QUICK_ACTIONS: { group: string; items: { icon: any; title: string; prompt: string; tone: string }[] }[] = [
  {
    group: "السندات",
    items: [
      { icon: ArrowDownCircle, title: tr("سند قبض نقدي"), prompt: "سند قبض من الزبون [اسم الزبون] نقدي [المبلغ]", tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
      { icon: Receipt, title: tr("سند قبض نقدي وشيكات"), prompt: "سند قبض من الزبون [اسم الزبون] نقدي [المبلغ] وشيك رقم [رقم الشيك] بمبلغ [المبلغ] بنك [البنك] فرع [الفرع] تاريخ استحقاق [التاريخ]", tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
      { icon: ArrowUpCircle, title: tr("سند صرف نقدي"), prompt: "سند صرف للمورد [اسم المورد] نقدي [المبلغ]", tone: "bg-rose-50 text-rose-700 ring-rose-100" },
      { icon: ArrowUpCircle, title: tr("سند صرف شيكات"), prompt: "سند صرف شيك للمورد [اسم المورد] من الحساب البنكي [رمز الحساب البنكي] بمبلغ [المبلغ] تاريخ الاستحقاق [YYYY-MM-DD]", tone: "bg-rose-50 text-rose-700 ring-rose-100" },
    ],
  },
  {
    group: "المبيعات والطلبات",
    items: [
      { icon: FilePlus2, title: tr("مسودة طلبية مبيعات"), prompt: "طلبية للزبون [اسم الزبون] [الكمية] [اسم الصنف]", tone: "bg-sky-50 text-sky-700 ring-sky-100" },
      { icon: Truck, title: tr("طلب بضاعة داخلي"), prompt: "طلب بضاعة داخلي من فرع [الفرع] [الكمية] [اسم الصنف]", tone: "bg-amber-50 text-amber-700 ring-amber-100" },
    ],
  },
  {
    group: "استعلامات",
    items: [
      { icon: BarChart3, title: tr("ملخص المبيعات"), prompt: "أعطني ملخص المبيعات خلال آخر 30 يوماً", tone: "bg-violet-50 text-violet-700 ring-violet-100" },
      { icon: Package, title: tr("الأصناف منخفضة المخزون"), prompt: "ما هي الأصناف التي ستنفد خلال أسبوع؟", tone: "bg-lime-50 text-lime-700 ring-lime-100" },
      { icon: User, title: tr("رصيد زبون"), prompt: "كم رصيد الزبون [اسم الزبون]؟", tone: "bg-violet-50 text-violet-700 ring-violet-100" },
      { icon: AlertCircle, title: tr("أكبر الذمم"), prompt: "من أكبر 10 زبائن عليهم ذمم؟", tone: "bg-rose-50 text-rose-700 ring-rose-100" },
      { icon: Package, title: tr("رصيد صنف"), prompt: "كم رصيد الصنف [اسم الصنف]؟", tone: "bg-lime-50 text-lime-700 ring-lime-100" },
      { icon: BarChart3, title: tr("مقارنة المبيعات"), prompt: "قارن مبيعات هذا الشهر بالشهر الماضي", tone: "bg-violet-50 text-violet-700 ring-violet-100" },
    ],
  },
]

const STORAGE_KEY = "ai_assistant_conversation"

const formatTime = (at?: number) =>
  at ? new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : ""

const formatAmount = (value: number) =>
  Number(value || 0).toLocaleString("en-US", amountFractionOptions())

export function AIChat() {
  const { user, activeBranchId, activeBranchName } = useAuth()
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === "undefined") return []
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      return stored ? (JSON.parse(stored) as Message[]) : []
    } catch {
      return []
    }
  })
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [pendingCustomer, setPendingCustomer] = useState<PendingCustomerVoucher | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const keepListeningRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [copiedAt, setCopiedAt] = useState<number | null>(null)
  const copyReply = (message: Message) => {
    void navigator.clipboard?.writeText(withoutSuggestionsLine(withoutConfirmLine(message.content))).then(() => {
      setCopiedAt(message.at ?? null)
      window.setTimeout(() => setCopiedAt(null), 1500)
    }).catch(() => undefined)
  }

  // المحادثة تبقى عند التنقل بين الشاشات خلال الجلسة
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-80)))
    } catch {}
  }, [messages])

  useEffect(() => () => {
    keepListeningRef.current = false
    const recognition = recognitionRef.current
    if (recognition) {
      recognition.onend = null
      recognition.onresult = null
      recognition.onerror = null
      recognition.stop()
    }
  }, [])

  useEffect(() => {
    const storedResult = sessionStorage.getItem("ai_document_save_result")
    if (!storedResult) return
    try {
      const result = JSON.parse(storedResult) as { label: string; code: string; section: string; id?: number }
      setMessages((prev) => [...prev, { role: "assistant", kind: "success", at: Date.now(), content: tr("تم إضافة {0} بنجاح", result.label), details: [{ label: tr("الرقم"), value: result.code }], documentLink: { section: result.section, code: result.code, id: result.id } }])
    } finally {
      sessionStorage.removeItem("ai_document_save_result")
    }
  }, [])
  const mediaRecorderRef = useRef<MediaRecorderLike | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const conversationEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [messages, isLoading])

  // ارتفاع مربع الكتابة يتبع النص
  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = "auto"
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`
  }, [input])

  const createdDocuments = useMemo(
    () => messages.filter((message) => message.kind === "success" && (message.voucherLink || message.documentLink)).reverse(),
    [messages],
  )

  const pushAssistant = (message: Omit<Message, "role">) =>
    setMessages((prev) => [...prev, { role: "assistant", at: Date.now(), ...message }])

  const applyPrompt = (prompt: string) => {
    setInput(prompt)
    requestAnimationFrame(() => {
      const element = textareaRef.current
      if (!element) return
      element.focus()
      // تحديد أول قوس لاستبداله مباشرة بالكتابة
      const start = prompt.indexOf("[")
      const end = prompt.indexOf("]", start)
      if (start >= 0 && end > start) element.setSelectionRange(start, end + 1)
    })
  }

  // عرض السند/المستند يفتح في تبويب متصفح جديد (نفس روابط السندات في التقارير) — تبقى المحادثة كما هي
  const openInNewTab = (id: number, type: number) =>
    window.open(voucherHref(id, type, sessionStorage.getItem("active_company_id")), "_blank", "noopener,noreferrer")

  const openVoucher = (link: NonNullable<Message["voucherLink"]>) => openInNewTab(link.id, link.voucherType)

  const openDocument = (link: NonNullable<Message["documentLink"]>) => {
    // طلب البضاعة الداخلي وسند القيد يدعمان رابط السند المباشر
    if (link.section === "internal-manufacturing-request" && link.id) {
      openInNewTab(link.id, 20)
      return
    }
    if (link.section === "journal-vouchers" && link.id) {
      openInNewTab(link.id, 1)
      return
    }
    // بقية المستندات (مسودة طلبية...) ⇐ تبويب جديد يستلم المستند عبر sessionStorage (ai_open_document)
    openSectionInNewTab(link.section, { ai_open_document: JSON.stringify(link) })
  }

  // ── مرفق: صورة/PDF لفاتورة مبيعات أو مشتريات أو سند قبض/صرف ──────────────────────
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // hintOverride: مرفق مُمرَّر من شاشة أخرى (بريد الرسائل ⇐ معالجة) مع وصفه بدل نص خانة الكتابة
  // file = ملف مرفق هنا، أو { attachmentId } = مرفق محفوظ في بريد الرسائل يقرؤه الخادم من قاعدة البيانات مباشرة
  const handleAttach = async (file: File | { attachmentId: number; name: string; documentType?: string } | null, hintOverride?: string) => {
    if (!file || isLoading) return
    const hint = (hintOverride ?? input).trim()
    setMessages((prev) => [...prev, { role: "user", content: `📎 ${file.name}${hint ? `\n${hint}` : ""}`, at: Date.now() }])
    setInput("")
    setIsLoading(true)
    let continueWith: string | null = null
    try {
      const body = new FormData()
      if ("attachmentId" in file) {
        body.append("attachment_id", String(file.attachmentId))
        if (file.documentType) body.append("document_type", file.documentType)
      }
      else body.append("file", file)
      if (hint) body.append("hint", hint)
      // الخادم يعيد المحاولة تلقائياً عند انشغال الخدمة حتى ~130 ثانية ⇐ مهلة أطول قليلاً هنا
      const response = await fetch("/api/ai-assistant/document-extract", { method: "POST", body, signal: AbortSignal.timeout(145_000) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || tr("تعذر قراءة المرفق"))
      if ((data.document_type === "receipt" || data.document_type === "payment") && data.receipt_command) {
        pushAssistant({ content: tr("قرأت {0} من المرفق:\n{1}", data.document_type === "receipt" ? "سند قبض" : "سند صرف", data.receipt_command) })
        continueWith = data.receipt_command
      } else if (data.document_type === "journal_voucher") {
        // سند قيد: كل الحسابات مطابقة ومتوازن ⇐ يُحفظ مباشرة (غير مرحّل) للمراجعة والترحيل من شاشة سند القيد
        const lines = (Array.isArray(data.journal_lines) ? data.journal_lines : []) as any[]
        const unmatched = lines.filter((line) => !line.account_id)
        const debit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0)
        const credit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0)
        if (!lines.length) {
          pushAssistant({ kind: "error", content: tr("قرأت سند قيد لكن لم أجد أسطر حسابات فيه") })
        } else if (unmatched.length) {
          pushAssistant({
            kind: "error",
            content: tr("قرأت سند قيد ({0} سطر) لكن لم أطابق بعض الحسابات مع دليل الحسابات — لم يُحفظ", lines.length),
            details: unmatched.slice(0, 8).map((line, index) => ({ label: tr("حساب {0}", index + 1), value: `${line.account_code || ""} ${line.account_name || ""}`.trim() || "—" })),
          })
        } else {
          const result = await saveAIJournalDraft(
            // رقم المستند المرفق لا يُنقل للسند (لا رقم ولا سند يدوي) — السند يأخذ رقماً جديداً من دفتر السندات
            { vch_date: data.date, currency: data.currency, manual_voucher: "", note: data.note, lines: lines.map((line) => ({ account_id: Number(line.account_id), debit: Number(line.debit) || 0, credit: Number(line.credit) || 0, note: line.note })) },
            { userId: user?.id, branchId: activeBranchId },
          )
          if (result.ok) {
            pushAssistant({
              kind: "success",
              content: tr("تم حفظ سند القيد من المرفق (غير معتمد) — راجعه ثم رحّله"),
              details: [
                { label: tr("رقم السند"), value: result.code },
                { label: tr("الأسطر"), value: String(lines.length) },
                { label: tr("المدين = الدائن"), value: formatAmount(result.amount) },
                ...(data.date ? [{ label: tr("التاريخ"), value: String(data.date) }] : []),
              ],
              documentLink: { section: "journal-vouchers", code: result.code, id: result.id },
            })
          } else {
            pushAssistant({
              kind: "error",
              content: tr("تعذر حفظ سند القيد: {0}", result.error),
              details: [{ label: tr("المدين"), value: formatAmount(debit) }, { label: tr("الدائن"), value: formatAmount(credit) }],
            })
          }
        }
      } else if (data.document_type === "sales_invoice" || data.document_type === "purchase_invoice") {
        const vchType: 12 | 17 = data.document_type === "purchase_invoice" ? 17 : 12
        const lines = (Array.isArray(data.lines) ? data.lines : []) as any[]
        const matched = lines.filter((line) => line.product_id)
        const unmatched = lines.filter((line) => !line.product_id)
        const prefill: VoucherPrefill = {
          vch_type: vchType,
          account_id: data.party?.id ?? null,
          account_name: data.party?.name || data.party_name || "",
          vch_date: data.date || null,
          // رقم المستند المرفق يُعرض في المحادثة فقط — الفاتورة الجديدة تأخذ رقمها من دفتر السندات بلا سند يدوي منقول
          manual_voucher: "",
          note: data.note || "",
          lines: matched.map((line) => ({
            product_id: Number(line.product_id), unit_id: line.unit_id ?? null,
            quantity: Number(line.quantity) || 1, unit_price: line.unit_price ?? null, discount_percent: line.discount_percent ?? null,
          })),
          unmatched: unmatched.map((line) => String(line.name || line.code || line.barcode || "")).filter(Boolean),
        }
        const label = vchType === 17 ? tr("فاتورة مشتريات") : tr("فاتورة مبيعات")
        pushAssistant({
          kind: matched.length ? "success" : "error",
          content: matched.length ? tr("قرأت {0} من المرفق — راجعها ثم احفظها", label) : tr("قرأت {0} لكن لم أطابق أي صنف مع النظام", label),
          details: [
            { label: vchType === 17 ? tr("المورد") : tr("العميل"), value: data.party ? `${data.party.name} (${data.party.code})` : `${data.party_name || "—"} — غير موجود، اختره في الفاتورة` },
            ...(data.date ? [{ label: tr("التاريخ"), value: String(data.date) }] : []),
            ...(data.document_number ? [{ label: tr("رقم المستند"), value: String(data.document_number) }] : []),
            { label: tr("الأصناف"), value: `${matched.length} مطابق من ${lines.length}` },
            ...(unmatched.length ? [{ label: tr("غير موجودة"), value: prefill.unmatched!.slice(0, 6).join("، ") + (unmatched.length > 6 ? " …" : "") }] : []),
            ...(data.total != null ? [{ label: tr("الإجمالي بالمستند"), value: formatAmount(Number(data.total)) }] : []),
          ],
          invoicePrefill: matched.length ? prefill : undefined,
        })
      } else {
        pushAssistant({ kind: "error", content: tr("لم أتعرّف على نوع المستند. اكتب نوعه في الرسالة (فاتورة مبيعات / فاتورة مشتريات / سند قبض / سند صرف / سند قيد) ثم أرفقه مجدداً.") })
      }
    } catch (error) {
      pushAssistant({ kind: "error", content: error instanceof Error ? error.message : tr("تعذر قراءة المرفق") })
    } finally {
      setIsLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
    if (continueWith) void handleSubmit(continueWith, { appendUser: false, command: continueWith })
  }

  // بريد الرسائل ⇐ "معالجة": يفتح المساعد ويعالج المرفق كأنه أُرفق هنا (openSectionWith("ai-assistant", { file, hint }))
  const handleAttachRef = useRef(handleAttach)
  handleAttachRef.current = handleAttach
  useSectionIntent<{ file?: File; attachment?: { attachmentId: number; name: string }; hint?: string }>("ai-assistant", (data) => {
    const source = data?.attachment || data?.file
    if (source) void handleAttachRef.current(source, data.hint || "")
  }, !isLoading)

  // نفس المعالجة عند الفتح في تبويب جديد من بريد الرسائل (openSectionInNewTab ⇐ sessionStorage) — مرة واحدة
  useEffect(() => {
    const stored = sessionStorage.getItem("ai_process_attachment")
    if (!stored) return
    // الصفحة ستُعيد اختيار الشركة وتُحدّث نفسها (?company= لا يطابق التبويب) ⇐ نترك الطلب لما بعد التحديث
    const companyParam = new URLSearchParams(window.location.search).get("company")
    if (companyParam && sessionStorage.getItem("active_company_id") !== companyParam) return
    sessionStorage.removeItem("ai_process_attachment")
    try {
      const data = JSON.parse(stored) as { attachmentId?: number; name?: string; hint?: string; documentType?: string }
      if (Number(data.attachmentId) > 0) void handleAttachRef.current({ attachmentId: Number(data.attachmentId), name: String(data.name || "مرفق"), documentType: data.documentType }, data.hint || "")
    } catch { /* ignore */ }
  }, [])

  // الفاتورة المعبّأة تُفتح في تبويب متصفح جديد (تبقى المحادثة كما هي) — شاشة الفاتورة تقرأ المعبّأ عند فتحها
  const openInvoicePrefill = (prefill: VoucherPrefill) =>
    openSectionInNewTab(prefill.vch_type === 17 ? "purchase-invoices" : "sales-invoices", voucherPrefillSessionItems(prefill))

  const handleSubmit = async (question?: string, options?: { appendUser?: boolean; command?: string }) => {
    const messageText = question || input
    if (!messageText.trim()) return

    const userMessage: Message = { role: "user", content: messageText, at: Date.now() }
    if (options?.appendUser !== false) setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)
    // "نعم/تأكيد..." بعد رد يقترح أمراً ⇒ يُنفَّذ الأمر المقترح (لا تُرسل كلمة الموافقة وحدها للتحليل)
    const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant")
    const suggested = !options?.command && lastAssistant && !lastAssistant.kind && !lastAssistant.confirmed && CONFIRM_WORDS.test(messageText) ? confirmCommandOf(lastAssistant.content) : null
    if (suggested && lastAssistant) setMessages((prev) => prev.map((message) => (message === lastAssistant ? { ...message, confirmed: true } : message)))
    const commandText = options?.command || suggested || messageText

    try {
      if (!options?.command && !suggested && isPlainQuestion(messageText)) {
        await streamChat(userMessage)
        return
      }
      // تحليل السند وتحليل الطلبية يعملان بالتوازي (كانا متتاليين: انتظار الأول كاملاً ثم بدء الثاني)، مع مهلة
      // قصوى لكل منهما حتى لا يبقى "جاري معالجة طلبك" معلّقاً عند انشغال خدمة الذكاء الاصطناعي.
      const postJson = (url: string, body: unknown, timeoutMs: number) =>
        fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })
          .then(async (response) => ({ response, data: await response.json().catch(() => ({})) }))
      const orderDraftPromise = postJson("/api/ai-assistant/order-draft", { command: commandText, active_branch_id: activeBranchId, user_id: user?.id }, 30_000)
      orderDraftPromise.catch(() => undefined)
      const { response: draftResponse, data: draftData } = await postJson("/api/ai-assistant/receipt-draft", { command: commandText }, 30_000)
      if (!draftResponse.ok && draftData.code === "CUSTOMER_NOT_FOUND") {
        setPendingCustomer({ command: commandText, customer_name: draftData.customer_name, voucher_type: draftData.voucher_type, document_kind: "voucher" })
        pushAssistant({ content: tr("العميل \"{0}\" غير موجود في النظام. هل تريد تعريف العميل ثم إدخال {1}؟", draftData.customer_name, draftData.voucher_type === 5 ? "سند الصرف" : "سند القبض") })
        return
      }
      if (!draftResponse.ok) throw new Error(draftData.error || tr("تعذر إنشاء المسودة"))
      if (draftData.type === "voucher-draft") {
        // يُحفظ السند مباشرة من هنا — لا تُفتح شاشة السند؛ تظهر النتيجة كبطاقة مع زر "عرض السند"
        const draft = draftData.draft
        const label = draft.voucher_type === 5 ? tr("سند الصرف") : tr("سند القبض")
        const result = await saveAIReceiptDraft(draft, { userId: user?.id, branchId: activeBranchId })
        if (result.ok) {
          const paymentParts = [
            Number(draft.cash_amount) > 0 ? `نقدي ${formatAmount(draft.cash_amount)}` : "",
            Number(draft.check_amount) > 0 ? `شيكات ${formatAmount(draft.check_amount)}${draft.cheques?.length ? ` (${draft.cheques.length})` : ""}` : "",
            Number(draft.credit_card_amount) > 0 ? `بطاقة ${formatAmount(draft.credit_card_amount)}` : "",
          ].filter(Boolean)
          pushAssistant({
            kind: "success",
            content: tr("تم حفظ {0} بنجاح", label),
            details: [
              { label: tr("رقم السند"), value: result.code },
              { label: draft.voucher_type === 5 ? tr("المدفوع له") : tr("المقبوض منه"), value: result.accountName },
              { label: tr("المبلغ"), value: formatAmount(result.amount) },
              ...(paymentParts.length ? [{ label: tr("طريقة الدفع"), value: paymentParts.join(" + ") }] : []),
              { label: tr("التاريخ"), value: draft.vch_date },
            ],
            voucherLink: { id: result.id, code: result.code, voucherType: result.voucherType },
          })
        } else {
          pushAssistant({ kind: "error", content: tr("تعذر حفظ {0}: {1}", label, result.error) })
        }
        return
      }
      const { response: orderDraftResponse, data: orderDraftData } = await orderDraftPromise
      if (!orderDraftResponse.ok && orderDraftData.code === "CUSTOMER_NOT_FOUND") {
        setPendingCustomer({ command: commandText, customer_name: orderDraftData.customer_name, voucher_type: 4,
          document_kind: "sales_draft", active_branch_id: Number(activeBranchId), user_id: Number(user?.id) })
        pushAssistant({ content: tr("العميل \"{0}\" غير موجود في النظام. هل تريد تعريف العميل ثم إدخال مسودة طلبية المبيعات؟", orderDraftData.customer_name) })
        return
      }
      if (!orderDraftResponse.ok) throw new Error(orderDraftData.error || tr("تعذر إنشاء المستند"))
      if (orderDraftData.type === "sales-draft" || orderDraftData.type === "internal-request") {
        const section = orderDraftData.type === "sales-draft" ? "draft-sales-order" : "internal-manufacturing-request"
        const endpoint = orderDraftData.type === "sales-draft" ? "/api/order-drafts" : "/api/internal-manufacturing-requests"
        const saveResponse = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(orderDraftData.payload) })
        const saved = await saveResponse.json()
        if (!saveResponse.ok) throw new Error(saved.error || tr("تعذر حفظ المستند"))
        const code = String(saved.draft_number || saved.vch_code || "")
        const label = orderDraftData.type === "sales-draft" ? tr("مسودة طلبية المبيعات") : tr("طلب البضاعة الداخلي")
        pushAssistant({ kind: "success", content: tr("تم حفظ {0} بنجاح", label), details: [{ label: tr("الرقم"), value: code }], documentLink: { section, code, id: Number(saved.id) } })
        return
      }
      await streamChat(userMessage)
    } catch (error) {
      // إيقاف بزر "إيقاف": يبقى ما وصل من الرد كما هو
      if (error instanceof DOMException && error.name === "AbortError") return
      console.error("[ai] AI Chat error:", error)
      pushAssistant({
        kind: "error",
        content: error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")
          ? tr("تأخرت خدمة الذكاء الاصطناعي في الرد (قد تكون مشغولة الآن). أعد إرسال الطلب بعد لحظات.")
          : error instanceof Error && error.message.includes("GOOGLE_GENERATIVE_AI_API_KEY")
          ? tr("لم يتم إعداد مفتاح Gemini. أضف GOOGLE_GENERATIVE_AI_API_KEY إلى ملف .env.local ثم أعد تشغيل الخادم.")
          : error instanceof Error ? error.message : tr("عذراً، حدث خطأ في الاتصال. الرجاء المحاولة مرة أخرى."),
      })
    } finally {
      setIsLoading(false)
    }
  }

  // المحادثة الحرة (أسئلة واستعلامات): آخر الرسائل للسياق، والرد يُعرض أثناء وصوله ويمكن إيقافه.
  // انتهاء المهلة يُرمى TimeoutError (رسالة "تأخرت الخدمة")، والإيقاف اليدوي AbortError (يبقى ما وصل).
  const streamChat = async (userMessage: Message) => {
    const controller = new AbortController()
    abortRef.current = controller
    let timedOut = false
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort() }, 60_000)
    try {
      const history = [...messages, userMessage].filter((m) => !m.kind).slice(-20)
      const response = await fetch("/api/ai-assistant/chat", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", ...(activeBranchId ? { "x-branch-id": String(activeBranchId) } : {}) },
        body: JSON.stringify({
          branch_id: activeBranchId || null,
          branch_name: activeBranchName || "",
          messages: history.map((m) => ({ role: m.role, content: m.role === "assistant" ? withoutSuggestionsLine(m.content) : m.content })),
        }),
      })
      if (!response.ok) throw new Error((await response.text()) || tr("فشل في الحصول على الرد"))
      const reader = response.body?.getReader()
      if (!reader) return
      // stream: true — حرف عربي (بايتان) قد ينقسم بين دفعتين؛ بدونه يظهر "�" داخل الرد
      const decoder = new TextDecoder()
      let assistantContent = ""
      const startedAt = Date.now()
      setStreaming(true)
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        assistantContent += decoder.decode(value, { stream: true })
        const content = assistantContent
        setMessages((prev) => {
          const newMessages = [...prev]
          const lastMessage = newMessages[newMessages.length - 1]
          if (lastMessage?.role === "assistant" && lastMessage.at === startedAt) newMessages[newMessages.length - 1] = { ...lastMessage, content }
          else newMessages.push({ role: "assistant", content, at: startedAt })
          return newMessages
        })
      }
      if (!assistantContent.trim()) pushAssistant({ kind: "error", content: tr("لم يصل رد من المساعد. أعد صياغة السؤال أو حاول مرة أخرى.") })
    } catch (error) {
      if (timedOut) throw new DOMException("timeout", "TimeoutError")
      throw error
    } finally {
      window.clearTimeout(timeout)
      abortRef.current = null
      setStreaming(false)
    }
  }

  const createDefaultCustomerAndContinue = async () => {
    if (!pendingCustomer || isLoading) return
    const pending = pendingCustomer
    setPendingCustomer(null)
    setIsLoading(true)
    try {
      const [settingsResponse, currenciesResponse, pricesResponse] = await Promise.all([
        fetch("/api/settings/system"), fetch("/api/exchange-rates"), fetch("/api/pricecategory"),
      ])
      const [settings, currenciesData, pricesData] = await Promise.all([
        settingsResponse.ok ? settingsResponse.json() : {},
        currenciesResponse.ok ? currenciesResponse.json() : { rates: [] },
        pricesResponse.ok ? pricesResponse.json() : [],
      ])
      const currencies = Array.isArray(currenciesData?.rates) ? currenciesData.rates : []
      const currencyId = (currencies as any[]).reduce<number | null>((lowest: number | null, row: any) => {
        const id = Number(row.currency_id ?? row.id)
        return Number.isFinite(id) && (lowest === null || id < lowest) ? id : lowest
      }, null)
      if (!currencyId) throw new Error(tr("لا توجد عملة افتراضية لتعريف العميل"))
      const prices = Array.isArray(pricesData) ? pricesData.filter((row) => Number(row.status ?? 1) !== 3) : []
      const priceCategoryId = prices.sort((left, right) => Number(left.id) - Number(right.id))[0]?.id || 1
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: 0,
          customer_name: pending.customer_name,
          name: pending.customer_name,
          type: 1,
          status: "نشط",
          registration_date: new Date().toISOString().slice(0, 10),
          payment_terms: "نقدي",
          currency_id: currencyId,
          pricecategory: Number(priceCategoryId),
          father_id: (settings as any)?.default_customer_parent_account || null,
          allow_trans_with_diff_curr: 0,
          iscalc_curr_diff_rates: false,
          branch_ids: [],
          classifications: [],
          account_classifications: [],
          cost_centers: [],
          stop_transactions: [],
          voucher: [],
        }),
      })
      const customer = await response.json()
      if (!response.ok) throw new Error(customer.error || tr("تعذر تعريف العميل"))
      setMessages((prev) => [...prev, { role: "assistant", content: tr("تم تعريف العميل {0} بالرقم {1}. جارٍ استكمال المستند...", pending.customer_name, customer.customer_code || "") }])
    } catch (error) {
      setMessages((prev) => [...prev, { role: "assistant", content: error instanceof Error ? error.message : tr("تعذر تعريف العميل") }])
      return
    } finally {
      setIsLoading(false)
    }
    await handleSubmit(pending.command, { appendUser: false })
  }

  const toggleListening = () => {
    if (isListening) {
      keepListeningRef.current = false
      if (recognitionRef.current) recognitionRef.current.stop()
      else mediaRecorderRef.current?.stop()
      setIsListening(false)
      return
    }
    const speechWindow = window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
    if (!Recognition) {
      void startAudioTranscription()
      return
    }
    const recognition = new Recognition()
    recognition.lang = "ar-SA"
    recognition.continuous = true
    recognition.interimResults = false
    recognition.onresult = (event) => {
      const parts: string[] = []
      for (let index = event.resultIndex; index < event.results.length; index++) {
        if (event.results[index].isFinal) parts.push(event.results[index][0].transcript)
      }
      const transcript = parts.join(" ").trim()
      if (transcript) setInput((current) => `${current}${current ? " " : ""}${transcript}`)
    }
    recognition.onend = () => {
      if (keepListeningRef.current && recognitionRef.current === recognition) {
        try {
          recognition.start()
          return
        } catch {
          keepListeningRef.current = false
        }
      }
      setIsListening(false)
    }
    recognition.onerror = (event) => {
      if (event.error === "no-speech") return
      keepListeningRef.current = false
      setIsListening(false)
    }
    recognitionRef.current = recognition
    keepListeningRef.current = true
    setIsListening(true)
    try {
      recognition.start()
    } catch {
      keepListeningRef.current = false
      setIsListening(false)
    }
  }

  const startAudioTranscription = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessages((prev) => [...prev, { role: "assistant", content: tr("لا يمكن تسجيل الصوت من هذا المتصفح. استخدم ميكروفون لوحة مفاتيح iPhone أو Safari.") }])
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const preferredType = MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : ""
      const recorder = new MediaRecorder(stream, preferredType ? { mimeType: preferredType } : undefined) as unknown as MediaRecorderLike
      audioChunksRef.current = []
      recorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data) }
      recorder.onerror = () => { stream.getTracks().forEach((track) => track.stop()); setIsListening(false) }
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        setIsListening(false)
        const audio = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" })
        const body = new FormData()
        body.append("audio", audio, `voice.${audio.type.includes("mp4") ? "mp4" : "webm"}`)
        try {
          const response = await fetch("/api/ai-assistant/transcribe", { method: "POST", body })
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || tr("تعذر تحويل الصوت إلى نص"))
          setInput((current) => `${current}${current ? " " : ""}${data.text}`)
        } catch (error) {
          setMessages((prev) => [...prev, { role: "assistant", content: error instanceof Error ? error.message : tr("تعذر تحويل التسجيل الصوتي") }])
        }
      }
      mediaRecorderRef.current = recorder
      setIsListening(true)
      recorder.start()
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: tr("اسمح للمتصفح باستخدام الميكروفون ثم حاول مرة أخرى.") }])
    }
  }

  const resetConversation = () => {
    if (isLoading) return
    setMessages([])
    setPendingCustomer(null)
    setInput("")
    textareaRef.current?.focus()
  }

  const canSend = !isLoading && !isListening && Boolean(input.trim())

  return (
    <section className="flex h-[calc(100dvh-8rem)] min-h-[480px] w-full min-w-0 gap-4" dir={appDir()} aria-label={tr("المساعد الذكي")}>
      {/* ── المحادثة ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-950">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-l from-emerald-600 to-teal-600 px-4 py-3 text-white sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-extrabold">{tr("المساعد الذكي")}</h1>
              <p className="flex items-center gap-1.5 truncate text-xs text-emerald-50/90">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-200" />
                {tr("سندات، طلبيات واستعلامات بلغة طبيعية")}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {activeBranchName && (
              <span className="hidden items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold ring-1 ring-white/20 md:inline-flex">
                <Building2 className="h-3.5 w-3.5" />
                {activeBranchName}
              </span>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={resetConversation}
              disabled={isLoading || !messages.length}
              className="h-8 gap-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 hover:text-white disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {tr("محادثة جديدة")}
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/60 px-3 py-5 dark:bg-transparent sm:px-6">
          {messages.length === 0 ? (
            <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center py-6 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20">
                <Bot className="h-7 w-7" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">{tr("كيف أساعدك اليوم؟")}</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-slate-500">
                {tr("اكتب طلبك أو أملِه صوتياً — أُنشئ السند وأحفظه مباشرة دون مغادرة هذه الصفحة، أو أجيبك عن أسئلتك حول المبيعات والمخزون.")}
              </p>
              <div className="mt-6 grid gap-2 text-start sm:grid-cols-2">
                {QUICK_ACTIONS.flatMap((group) => group.items).slice(0, 4).map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => applyPrompt(item.prompt)}
                    className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-emerald-300 hover:bg-emerald-50/40 dark:border-white/10 dark:bg-white/5"
                  >
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1", item.tone)}>
                      <item.icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">{item.title}</span>
                      <span className="block truncate text-xs text-slate-500">{item.prompt}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-5" role="log" aria-label={tr("المحادثة")} aria-live="polite">
              {messages.map((message, index) => {
                const isUser = message.role === "user"
                return (
                  <div key={index} className={cn("flex items-end gap-2.5", isUser ? "flex-row" : "flex-row-reverse")}>
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        isUser ? "bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300" : "bg-emerald-600 text-white",
                      )}
                    >
                      {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                    </span>
                    <div className={cn("min-w-0 max-w-[88%] sm:max-w-[78%]", isUser ? "items-start" : "items-end")}>
                      {message.kind ? (
                        <div
                          className={cn(
                            "overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-slate-900",
                            message.kind === "success" ? "border-emerald-200 dark:border-emerald-400/30" : "border-rose-200 dark:border-rose-400/30",
                          )}
                        >
                          <div
                            className={cn(
                              "flex items-start gap-2 px-4 py-2.5 text-sm font-bold",
                              message.kind === "success" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200" : "bg-rose-50 text-rose-800 dark:bg-rose-400/10 dark:text-rose-200",
                            )}
                          >
                            {message.kind === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                            <span className="whitespace-pre-wrap break-words leading-6">{message.content}</span>
                          </div>
                          {message.details?.length ? (
                            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-4 py-3 text-sm">
                              {message.details.map((detail) => (
                                <div key={detail.label} className="contents">
                                  <dt className="text-slate-500">{detail.label}</dt>
                                  <dd className={cn("font-semibold text-slate-800 dark:text-slate-100", /رقم|الرقم/.test(detail.label) && "font-mono text-emerald-700 dark:text-emerald-300")} dir="auto">{detail.value}</dd>
                                </div>
                              ))}
                            </dl>
                          ) : null}
                          {message.invoicePrefill && (
                            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-3 py-2 dark:border-white/10">
                              {/* حفظ مباشر غير معتمد: فقط إن طوبق الطرف وكل الأصناف (وإلا المراجعة أولاً) */}
                              {message.invoicePrefill.account_id && !message.invoicePrefill.unmatched?.length && (
                                <Button type="button" size="sm" className="h-8 gap-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => openInvoicePrefill({ ...message.invoicePrefill!, autoSave: true })}>
                                  <Save className="h-3.5 w-3.5" />{tr("حفظ غير معتمد")}
                                </Button>
                              )}
                              <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 rounded-lg border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => openInvoicePrefill(message.invoicePrefill!)}>
                                <FileSearch className="h-3.5 w-3.5" />{tr("فتح الفاتورة للمراجعة")}
                              </Button>
                            </div>
                          )}
                          {(message.voucherLink || message.documentLink) && (
                            <div className="flex justify-end border-t border-slate-100 px-3 py-2 dark:border-white/10">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1.5 rounded-lg border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                onClick={() => (message.voucherLink ? openVoucher(message.voucherLink) : openDocument(message.documentLink!))}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                {message.voucherLink ? tr("عرض السند") : tr("عرض المستند")}
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "group relative rounded-2xl px-4 py-2.5 shadow-sm",
                            isUser
                              ? "rounded-es-md bg-emerald-600 text-white"
                              : "rounded-ee-md border border-slate-200 bg-white text-slate-800 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100",
                          )}
                        >
                          {isUser ? (
                            <p className="whitespace-pre-wrap break-words text-sm leading-7" dir="auto">{message.content}</p>
                          ) : (
                            <div className="break-words text-sm leading-7" dir="auto">{renderAssistantText(withoutSuggestionsLine(withoutConfirmLine(message.content)))}</div>
                          )}
                          {!isUser && confirmCommandOf(message.content) && (
                            <div className="mt-2 space-y-2 border-t border-slate-100 pt-2 dark:border-white/10">
                              <p className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200" dir="auto">{confirmCommandOf(message.content)}</p>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={isLoading || message.confirmed}
                                  className="h-8 gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700"
                                  onClick={() => {
                                    const command = confirmCommandOf(message.content)
                                    if (!command) return
                                    setMessages((prev) => prev.map((item) => (item === message ? { ...item, confirmed: true } : item)))
                                    void handleSubmit("تأكيد", { command })
                                  }}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />{message.confirmed ? tr("تم التأكيد") : tr("تأكيد")}
                                </Button>
                                {!message.confirmed && (
                                  <Button type="button" size="sm" variant="outline" disabled={isLoading} className="h-8 rounded-lg" onClick={() => applyPrompt(confirmCommandOf(message.content) || "")}>
                                    {tr("تعديل")}
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                          {!isUser && !(streaming && index === messages.length - 1) && suggestionsOf(message.content).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2 dark:border-white/10">
                              {suggestionsOf(message.content).map((suggestion) => (
                                <button
                                  key={suggestion}
                                  type="button"
                                  disabled={isLoading}
                                  onClick={() => void handleSubmit(suggestion)}
                                  className="rounded-full border border-emerald-200 bg-emerald-50/60 px-3 py-1 text-start text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200"
                                >
                                  {suggestion}
                                </button>
                              ))}
                            </div>
                          )}
                          {!isUser && message.content.trim() && (
                            <button
                              type="button"
                              title={tr("نسخ الرد")}
                              onClick={() => copyReply(message)}
                              className="absolute -start-8 top-1 hidden h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 group-hover:flex"
                            >
                              {copiedAt && copiedAt === message.at ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          )}
                          {isUser && (
                            <button
                              type="button"
                              title={tr("إعادة استخدام الطلب")}
                              onClick={() => applyPrompt(message.content)}
                              className="absolute -end-8 top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 group-hover:flex"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                      {message.at && <p className={cn("mt-1 px-1 text-[11px] text-slate-400", isUser ? "text-start" : "text-end")}>{formatTime(message.at)}</p>}
                    </div>
                  </div>
                )
              })}
              {isLoading && !streaming && (
                <div className="flex flex-row-reverse items-end gap-2.5" role="status">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div className="flex items-center gap-2 rounded-2xl rounded-ee-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                    {tr("جارٍ معالجة طلبك...")}
                  </div>
                </div>
              )}
              {pendingCustomer && !isLoading && (
                <div className="flex justify-end gap-2 pe-10" role="group" aria-label={tr("تعريف العميل المفقود")}>
                  <Button type="button" size="sm" className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void createDefaultCustomerAndContinue()}>
                    {tr("نعم، عرّف العميل واحفظ")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-lg"
                    onClick={() => {
                      setPendingCustomer(null)
                      pushAssistant({ content: tr("تم إلغاء تعريف العميل وإنشاء المستند.") })
                    }}
                  >
                    {tr("لا، إلغاء")}
                  </Button>
                </div>
              )}
            </div>
          )}
          <div ref={conversationEndRef} />
        </div>

        {/* مربع الكتابة */}
        <div className="shrink-0 border-t border-slate-100 bg-white px-3 py-3 dark:border-white/10 dark:bg-slate-950 sm:px-5">
          <div className="mx-auto max-w-3xl">
            {isListening && (
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-rose-600" role="status">
                <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
                {tr("الميكروفون يعمل — تحدّث ثم اضغط إيقاف")}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 transition-shadow focus-within:border-emerald-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500/15 dark:border-white/10 dark:bg-white/5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggleListening}
                disabled={isLoading}
                aria-pressed={isListening}
                title={isListening ? tr("إيقاف التسجيل") : tr("إملاء صوتي")}
                className={cn("h-10 w-10 shrink-0 rounded-xl", isListening && "bg-rose-50 text-rose-600 hover:bg-rose-100")}
              >
                {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(event) => void handleAttach(event.target.files?.[0] || null)} />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                title={tr("إرفاق فاتورة أو سند (صورة/PDF) لإدخاله — يمكنك كتابة نوعه في الرسالة")}
                className="h-10 w-10 shrink-0 rounded-xl"
              >
                <Paperclip className="h-5 w-5" />
              </Button>
              <textarea
                id="ai-chat-message"
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && canSend) {
                    e.preventDefault()
                    void handleSubmit()
                  }
                }}
                placeholder={tr("اكتب طلبك... مثال: سند قبض من الزبون أحمد نقدي 200")}
                disabled={isLoading}
                rows={1}
                className="block max-h-[200px] min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-[15px] leading-6 text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-60 dark:text-slate-100"
              />
              {streaming ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => abortRef.current?.abort()}
                  className="h-10 shrink-0 gap-1.5 rounded-xl border-rose-200 px-4 text-rose-700 hover:bg-rose-50"
                  aria-label={tr("إيقاف")}
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                  <span className="hidden sm:inline">{tr("إيقاف")}</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={!canSend}
                  className="h-10 shrink-0 gap-1.5 rounded-xl bg-emerald-600 px-4 text-white hover:bg-emerald-700"
                  aria-label={tr("إرسال")}
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 -scale-x-100" />}
                  <span className="hidden sm:inline">{tr("إرسال")}</span>
                </Button>
              )}
            </div>
            <p className="mt-1.5 px-1 text-[11px] text-slate-400">
              {tr("Enter للإرسال · Shift+Enter لسطر جديد · 📎 أرفق فاتورة أو سند (صورة/PDF) لإدخاله · السندات المكتملة تُحفظ مباشرة بدفترك الافتراضي")}
            </p>
          </div>
        </div>
      </div>

      {/* ── اللوحة الجانبية ── */}
      <aside className="hidden w-[300px] shrink-0 flex-col gap-4 overflow-y-auto xl:flex">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-950">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-800 dark:text-slate-100">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            {tr("أوامر جاهزة")}
          </h3>
          <div className="space-y-4">
            {QUICK_ACTIONS.map((group) => (
              <div key={group.group}>
                <p className="mb-1.5 text-[11px] font-bold text-slate-400">{group.group}</p>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => applyPrompt(item.prompt)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5"
                    >
                      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1", item.tone)}>
                        <item.icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="truncate">{item.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-950">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-800 dark:text-slate-100">
            <History className="h-4 w-4 text-emerald-600" />
            {tr("ما تم إنشاؤه في هذه الجلسة")}
          </h3>
          {createdDocuments.length ? (
            <div className="space-y-1.5">
              {createdDocuments.slice(0, 8).map((message, index) => {
                const code = message.voucherLink?.code || message.documentLink?.code || ""
                return (
                  <button
                    key={`${code}-${index}`}
                    type="button"
                    onClick={() => (message.voucherLink ? openVoucher(message.voucherLink) : openDocument(message.documentLink!))}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-start transition-colors hover:border-emerald-200 hover:bg-emerald-50/50 dark:border-white/10"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-slate-700 dark:text-slate-200">{message.content.replace(/^تم حفظ | بنجاح$/g, "")}</span>
                      <span className="block font-mono text-xs text-emerald-700 dark:text-emerald-300">{code}</span>
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-400 dark:bg-white/5">{tr("لا توجد مستندات بعد")}</p>
          )}
        </div>

        <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 text-xs leading-6 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/5 dark:text-amber-100">
          <h3 className="mb-1.5 flex items-center gap-2 text-sm font-extrabold">
            <Lightbulb className="h-4 w-4" />
            {tr("لنتيجة أدق")}
          </h3>
          <ul className="list-disc space-y-1 ps-4">
            <li>{tr("اذكر نوع السند واسم الزبون أو رمز حسابه والمبلغ.")}</li>
            <li>{tr("شيكات القبض: رقم الشيك، المبلغ، البنك، الفرع وتاريخ الاستحقاق.")}</li>
            <li>{tr("شيكات الصرف: الحساب البنكي، المبلغ وتاريخ الاستحقاق — رقم الشيك يُؤخذ من دفتر الشيكات إن لم يُذكر.")}</li>
            <li>{tr("اذكر العملة إن لم تكن العملة الأساسية.")}</li>
            <li>{tr("يُستخدم دفترك الافتراضي وحساباتك الافتراضية في الفرع النشط.")}</li>
          </ul>
        </div>
      </aside>
    </section>
  )
}
