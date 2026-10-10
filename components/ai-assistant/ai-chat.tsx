"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/components/auth/auth-context"
import { saveAIReceiptDraft } from "@/lib/ai-receipt-direct-save"
import { voucherHref } from "@/lib/voucher-links"
import { cn } from "@/lib/utils"
import {
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

interface Message {
  role: "user" | "assistant"
  content: string
  /** نتيجة إنشاء مستند: success = بطاقة خضراء، error = بطاقة تنبيه */
  kind?: "success" | "error"
  /** تفاصيل بطاقة المستند المنشأ */
  details?: { label: string; value: string }[]
  voucherLink?: { id: number; code: string; voucherType: 4 | 5 }
  documentLink?: { section: string; code: string; id?: number }
  at?: number
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
      { icon: ArrowDownCircle, title: "سند قبض نقدي", prompt: "سند قبض من الزبون [اسم الزبون] نقدي [المبلغ]", tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
      { icon: Receipt, title: "سند قبض نقدي وشيكات", prompt: "سند قبض من الزبون [اسم الزبون] نقدي [المبلغ] وشيك رقم [رقم الشيك] بمبلغ [المبلغ] بنك [البنك] فرع [الفرع] تاريخ استحقاق [التاريخ]", tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
      { icon: ArrowUpCircle, title: "سند صرف نقدي", prompt: "سند صرف للمورد [اسم المورد] نقدي [المبلغ]", tone: "bg-rose-50 text-rose-700 ring-rose-100" },
      { icon: ArrowUpCircle, title: "سند صرف شيكات", prompt: "سند صرف شيك للمورد [اسم المورد] من الحساب البنكي [رمز الحساب البنكي] بمبلغ [المبلغ] تاريخ الاستحقاق [YYYY-MM-DD]", tone: "bg-rose-50 text-rose-700 ring-rose-100" },
    ],
  },
  {
    group: "المبيعات والطلبات",
    items: [
      { icon: FilePlus2, title: "مسودة طلبية مبيعات", prompt: "طلبية للزبون [اسم الزبون] [الكمية] [اسم الصنف]", tone: "bg-sky-50 text-sky-700 ring-sky-100" },
      { icon: Truck, title: "طلب بضاعة داخلي", prompt: "طلب بضاعة داخلي من فرع [الفرع] [الكمية] [اسم الصنف]", tone: "bg-amber-50 text-amber-700 ring-amber-100" },
    ],
  },
  {
    group: "استعلامات",
    items: [
      { icon: BarChart3, title: "ملخص المبيعات", prompt: "أعطني ملخص المبيعات خلال آخر 30 يوماً", tone: "bg-violet-50 text-violet-700 ring-violet-100" },
      { icon: Package, title: "الأصناف منخفضة المخزون", prompt: "ما هي المنتجات منخفضة المخزون؟", tone: "bg-lime-50 text-lime-700 ring-lime-100" },
    ],
  },
]

const STORAGE_KEY = "ai_assistant_conversation"

const formatTime = (at?: number) =>
  at ? new Date(at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }) : ""

const formatAmount = (value: number) =>
  Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
      setMessages((prev) => [...prev, { role: "assistant", kind: "success", at: Date.now(), content: `تم إضافة ${result.label} بنجاح`, details: [{ label: "الرقم", value: result.code }], documentLink: { section: result.section, code: result.code, id: result.id } }])
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
    // طلب البضاعة الداخلي يدعم رابط السند المباشر؛ مسودة الطلبية تُفتح داخل التطبيق كما كانت
    if (link.section === "internal-manufacturing-request" && link.id) {
      openInNewTab(link.id, 20)
      return
    }
    sessionStorage.setItem("ai_open_document", JSON.stringify(link))
    window.dispatchEvent(new CustomEvent("OPEN_SECTION", { detail: { section: link.section } }))
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("ai-open-document")), 0)
  }

  const handleSubmit = async (question?: string, options?: { appendUser?: boolean }) => {
    const messageText = question || input
    if (!messageText.trim()) return

    const userMessage: Message = { role: "user", content: messageText, at: Date.now() }
    if (options?.appendUser !== false) setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      const draftResponse = await fetch("/api/ai-assistant/receipt-draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: messageText }),
        })
      const draftData = await draftResponse.json()
      if (!draftResponse.ok && draftData.code === "CUSTOMER_NOT_FOUND") {
        setPendingCustomer({ command: messageText, customer_name: draftData.customer_name, voucher_type: draftData.voucher_type, document_kind: "voucher" })
        pushAssistant({ content: `العميل "${draftData.customer_name}" غير موجود في النظام. هل تريد تعريف العميل ثم إدخال ${draftData.voucher_type === 5 ? "سند الصرف" : "سند القبض"}؟` })
        return
      }
      if (!draftResponse.ok) throw new Error(draftData.error || "تعذر إنشاء المسودة")
      if (draftData.type === "voucher-draft") {
        // يُحفظ السند مباشرة من هنا — لا تُفتح شاشة السند؛ تظهر النتيجة كبطاقة مع زر "عرض السند"
        const draft = draftData.draft
        const label = draft.voucher_type === 5 ? "سند الصرف" : "سند القبض"
        const result = await saveAIReceiptDraft(draft, { userId: user?.id, branchId: activeBranchId })
        if (result.ok) {
          const paymentParts = [
            Number(draft.cash_amount) > 0 ? `نقدي ${formatAmount(draft.cash_amount)}` : "",
            Number(draft.check_amount) > 0 ? `شيكات ${formatAmount(draft.check_amount)}${draft.cheques?.length ? ` (${draft.cheques.length})` : ""}` : "",
            Number(draft.credit_card_amount) > 0 ? `بطاقة ${formatAmount(draft.credit_card_amount)}` : "",
          ].filter(Boolean)
          pushAssistant({
            kind: "success",
            content: `تم حفظ ${label} بنجاح`,
            details: [
              { label: "رقم السند", value: result.code },
              { label: draft.voucher_type === 5 ? "المدفوع له" : "المقبوض منه", value: result.accountName },
              { label: "المبلغ", value: formatAmount(result.amount) },
              ...(paymentParts.length ? [{ label: "طريقة الدفع", value: paymentParts.join(" + ") }] : []),
              { label: "التاريخ", value: draft.vch_date },
            ],
            voucherLink: { id: result.id, code: result.code, voucherType: result.voucherType },
          })
        } else {
          pushAssistant({ kind: "error", content: `تعذر حفظ ${label}: ${result.error}` })
        }
        return
      }
      const orderDraftResponse = await fetch("/api/ai-assistant/order-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: messageText, active_branch_id: activeBranchId, user_id: user?.id }),
      })
      const orderDraftData = await orderDraftResponse.json()
      if (!orderDraftResponse.ok && orderDraftData.code === "CUSTOMER_NOT_FOUND") {
        setPendingCustomer({ command: messageText, customer_name: orderDraftData.customer_name, voucher_type: 4,
          document_kind: "sales_draft", active_branch_id: Number(activeBranchId), user_id: Number(user?.id) })
        pushAssistant({ content: `العميل "${orderDraftData.customer_name}" غير موجود في النظام. هل تريد تعريف العميل ثم إدخال مسودة طلبية المبيعات؟` })
        return
      }
      if (!orderDraftResponse.ok) throw new Error(orderDraftData.error || "تعذر إنشاء المستند")
      if (orderDraftData.type === "sales-draft" || orderDraftData.type === "internal-request") {
        const section = orderDraftData.type === "sales-draft" ? "draft-sales-order" : "internal-manufacturing-request"
        const endpoint = orderDraftData.type === "sales-draft" ? "/api/order-drafts" : "/api/internal-manufacturing-requests"
        const saveResponse = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(orderDraftData.payload) })
        const saved = await saveResponse.json()
        if (!saveResponse.ok) throw new Error(saved.error || "تعذر حفظ المستند")
        const code = String(saved.draft_number || saved.vch_code || "")
        const label = orderDraftData.type === "sales-draft" ? "مسودة طلبية المبيعات" : "طلب البضاعة الداخلي"
        pushAssistant({ kind: "success", content: `تم حفظ ${label} بنجاح`, details: [{ label: "الرقم", value: code }], documentLink: { section, code, id: Number(saved.id) } })
        return
      }
      const response = await fetch("/api/ai-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      })

      if (!response.ok) throw new Error((await response.text()) || "فشل في الحصول على الرد")

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ""

      if (reader) {
        const startedAt = Date.now()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          assistantContent += chunk

          setMessages((prev) => {
            const newMessages = [...prev]
            const lastMessage = newMessages[newMessages.length - 1]
            if (lastMessage?.role === "assistant" && lastMessage.at === startedAt) {
              newMessages[newMessages.length - 1] = { ...lastMessage, content: assistantContent }
            } else {
              newMessages.push({ role: "assistant", content: assistantContent, at: startedAt })
            }
            return newMessages
          })
        }
      }
    } catch (error) {
      console.error("[v0] AI Chat error:", error)
      pushAssistant({
        kind: "error",
        content: error instanceof Error && error.message.includes("GOOGLE_GENERATIVE_AI_API_KEY")
          ? "لم يتم إعداد مفتاح Gemini. أضف GOOGLE_GENERATIVE_AI_API_KEY إلى ملف .env.local ثم أعد تشغيل الخادم."
          : error instanceof Error ? error.message : "عذراً، حدث خطأ في الاتصال. الرجاء المحاولة مرة أخرى.",
      })
    } finally {
      setIsLoading(false)
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
      if (!currencyId) throw new Error("لا توجد عملة افتراضية لتعريف العميل")
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
      if (!response.ok) throw new Error(customer.error || "تعذر تعريف العميل")
      setMessages((prev) => [...prev, { role: "assistant", content: `تم تعريف العميل ${pending.customer_name} بالرقم ${customer.customer_code || ""}. جارٍ استكمال المستند...` }])
    } catch (error) {
      setMessages((prev) => [...prev, { role: "assistant", content: error instanceof Error ? error.message : "تعذر تعريف العميل" }])
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
      setMessages((prev) => [...prev, { role: "assistant", content: "لا يمكن تسجيل الصوت من هذا المتصفح. استخدم ميكروفون لوحة مفاتيح iPhone أو Safari." }])
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
          if (!response.ok) throw new Error(data.error || "تعذر تحويل الصوت إلى نص")
          setInput((current) => `${current}${current ? " " : ""}${data.text}`)
        } catch (error) {
          setMessages((prev) => [...prev, { role: "assistant", content: error instanceof Error ? error.message : "تعذر تحويل التسجيل الصوتي" }])
        }
      }
      mediaRecorderRef.current = recorder
      setIsListening(true)
      recorder.start()
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "اسمح للمتصفح باستخدام الميكروفون ثم حاول مرة أخرى." }])
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
    <section className="flex h-[calc(100dvh-8rem)] min-h-[480px] w-full min-w-0 gap-4" dir="rtl" aria-label="المساعد الذكي">
      {/* ── المحادثة ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-950">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-l from-emerald-600 to-teal-600 px-4 py-3 text-white sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-extrabold">المساعد الذكي</h1>
              <p className="flex items-center gap-1.5 truncate text-xs text-emerald-50/90">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-200" />
                سندات، طلبيات واستعلامات بلغة طبيعية
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
              محادثة جديدة
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/60 px-3 py-5 dark:bg-transparent sm:px-6">
          {messages.length === 0 ? (
            <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center py-6 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20">
                <Bot className="h-7 w-7" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">كيف أساعدك اليوم؟</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-slate-500">
                اكتب طلبك أو أملِه صوتياً — أُنشئ السند وأحفظه مباشرة دون مغادرة هذه الصفحة، أو أجيبك عن أسئلتك حول المبيعات والمخزون.
              </p>
              <div className="mt-6 grid gap-2 text-right sm:grid-cols-2">
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
            <div className="mx-auto max-w-3xl space-y-5" role="log" aria-label="المحادثة" aria-live="polite">
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
                                {message.voucherLink ? "عرض السند" : "عرض المستند"}
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "group relative rounded-2xl px-4 py-2.5 shadow-sm",
                            isUser
                              ? "rounded-br-md bg-emerald-600 text-white"
                              : "rounded-bl-md border border-slate-200 bg-white text-slate-800 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100",
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words text-sm leading-7" dir="auto">{message.content}</p>
                          {isUser && (
                            <button
                              type="button"
                              title="إعادة استخدام الطلب"
                              onClick={() => applyPrompt(message.content)}
                              className="absolute -left-8 top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 group-hover:flex"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                      {message.at && <p className={cn("mt-1 px-1 text-[11px] text-slate-400", isUser ? "text-right" : "text-left")}>{formatTime(message.at)}</p>}
                    </div>
                  </div>
                )
              })}
              {isLoading && (
                <div className="flex flex-row-reverse items-end gap-2.5" role="status">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                    جارٍ معالجة طلبك...
                  </div>
                </div>
              )}
              {pendingCustomer && !isLoading && (
                <div className="flex justify-end gap-2 pl-10" role="group" aria-label="تعريف العميل المفقود">
                  <Button type="button" size="sm" className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void createDefaultCustomerAndContinue()}>
                    نعم، عرّف العميل واحفظ
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-lg"
                    onClick={() => {
                      setPendingCustomer(null)
                      pushAssistant({ content: "تم إلغاء تعريف العميل وإنشاء المستند." })
                    }}
                  >
                    لا، إلغاء
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
                الميكروفون يعمل — تحدّث ثم اضغط إيقاف
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
                title={isListening ? "إيقاف التسجيل" : "إملاء صوتي"}
                className={cn("h-10 w-10 shrink-0 rounded-xl", isListening && "bg-rose-50 text-rose-600 hover:bg-rose-100")}
              >
                {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
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
                placeholder="اكتب طلبك... مثال: سند قبض من الزبون أحمد نقدي 200"
                disabled={isLoading}
                rows={1}
                className="block max-h-[200px] min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-[15px] leading-6 text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-60 dark:text-slate-100"
              />
              <Button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!canSend}
                className="h-10 shrink-0 gap-1.5 rounded-xl bg-emerald-600 px-4 text-white hover:bg-emerald-700"
                aria-label="إرسال"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 -scale-x-100" />}
                <span className="hidden sm:inline">إرسال</span>
              </Button>
            </div>
            <p className="mt-1.5 px-1 text-[11px] text-slate-400">
              Enter للإرسال · Shift+Enter لسطر جديد · السندات المكتملة تُحفظ مباشرة بدفترك الافتراضي
            </p>
          </div>
        </div>
      </div>

      {/* ── اللوحة الجانبية ── */}
      <aside className="hidden w-[300px] shrink-0 flex-col gap-4 overflow-y-auto xl:flex">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-950">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-800 dark:text-slate-100">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            أوامر جاهزة
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
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-right text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5"
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
            ما تم إنشاؤه في هذه الجلسة
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
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-right transition-colors hover:border-emerald-200 hover:bg-emerald-50/50 dark:border-white/10"
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
            <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-400 dark:bg-white/5">لا توجد مستندات بعد</p>
          )}
        </div>

        <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 text-xs leading-6 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/5 dark:text-amber-100">
          <h3 className="mb-1.5 flex items-center gap-2 text-sm font-extrabold">
            <Lightbulb className="h-4 w-4" />
            لنتيجة أدق
          </h3>
          <ul className="list-disc space-y-1 pr-4">
            <li>اذكر نوع السند واسم الزبون أو رمز حسابه والمبلغ.</li>
            <li>شيكات القبض: رقم الشيك، المبلغ، البنك، الفرع وتاريخ الاستحقاق.</li>
            <li>شيكات الصرف: الحساب البنكي، المبلغ وتاريخ الاستحقاق — رقم الشيك يُؤخذ من دفتر الشيكات إن لم يُذكر.</li>
            <li>اذكر العملة إن لم تكن العملة الأساسية.</li>
            <li>يُستخدم دفترك الافتراضي وحساباتك الافتراضية في الفرع النشط.</li>
          </ul>
        </div>
      </aside>
    </section>
  )
}
