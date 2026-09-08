"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/components/auth/auth-context"



import { Loader2, Send, Bot, Mic, MicOff, Sparkles, ArrowUpLeft, Receipt, BarChart3, Package } from "lucide-react"

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
  voucherLink?: { id: number; code: string; voucherType: 4 | 5 }
  documentLink?: { section: string; code: string; id?: number }
}

interface PendingCustomerVoucher {
  command: string
  customer_name: string
  voucher_type: 4 | 5
  document_kind?: "voucher" | "sales_draft"
  active_branch_id?: number
  user_id?: number
}

export function AIChat() {
  const { user, activeBranchId } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [pendingCustomer, setPendingCustomer] = useState<PendingCustomerVoucher | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const keepListeningRef = useRef(false)

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
      setMessages((prev) => [...prev, { role: "assistant", content: `تم إضافة ${result.label} بنجاح ${result.code}`, documentLink: { section: result.section, code: result.code, id: result.id } }])
    } finally {
      sessionStorage.removeItem("ai_document_save_result")
    }
  }, [])
  const mediaRecorderRef = useRef<MediaRecorderLike | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  useEffect(() => {
    const showReceiptSaveResult = (result: { ok: boolean; error?: string; voucherType?: 4 | 5; id?: number; code?: string }) => {
      const label = result?.voucherType === 5 ? "سند الصرف" : "سند القبض"
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result?.ok
            ? `تم إضافة ${label} بنجاح ${result.code || ""}`.trim()
            : `تعذر حفظ ${label}: ${result?.error || "خطأ غير معروف"}`,
          voucherLink: result.ok && result.id && result.code
            ? { id: result.id, code: result.code, voucherType: result.voucherType === 5 ? 5 : 4 }
            : undefined,
        },
      ])
      sessionStorage.removeItem("ai_voucher_save_result")
    }
    const handleReceiptSaveResult = (event: Event) => {
      showReceiptSaveResult((event as CustomEvent<{ ok: boolean; error?: string; voucherType?: 4 | 5; id?: number; code?: string }>).detail)
    }
    window.addEventListener("ai-receipt-save-result", handleReceiptSaveResult)
    const storedResult = sessionStorage.getItem("ai_voucher_save_result")
    if (storedResult) {
      try { showReceiptSaveResult(JSON.parse(storedResult)) }
      catch { sessionStorage.removeItem("ai_voucher_save_result") }
    }
    return () => window.removeEventListener("ai-receipt-save-result", handleReceiptSaveResult)
  }, [])

  const conversationEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ block: "nearest" })
  }, [messages, isLoading])

  const suggestions = [
    { icon: Receipt, title: "إنشاء سند قبض", description: "نقدي، شيكات أو بطاقة", prompt: "سند قبض للزبون [اسم الزبون] نقدي 200 وشيكات 300" },
    { icon: BarChart3, title: "ملخص المبيعات", description: "نظرة على أداء عملك", prompt: "أعطني ملخص المبيعات خلال آخر 30 يوماً" },
    { icon: Package, title: "متابعة المخزون", description: "تعرف على المنتجات الناقصة", prompt: "ما هي المنتجات منخفضة المخزون؟" },
  ]

  const handleSubmit = async (question?: string, options?: { appendUser?: boolean }) => {
    const messageText = question || input
    if (!messageText.trim()) return

    const userMessage: Message = { role: "user", content: messageText }
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
        setMessages((prev) => [...prev, { role: "assistant", content: `العميل "${draftData.customer_name}" غير موجود في النظام. هل تريد تعريف العميل ثم إدخال ${draftData.voucher_type === 5 ? "سند الصرف" : "سند القبض"}؟` }])
        return
      }
      if (!draftResponse.ok) throw new Error(draftData.error || "تعذر إنشاء المسودة")
      if (draftData.type === "voucher-draft") {
        draftData.draft.directSave = true
        sessionStorage.setItem("ai_receipt_draft", JSON.stringify(draftData.draft))
        window.dispatchEvent(new CustomEvent("ai-receipt-draft", { detail: draftData.draft }))
        window.dispatchEvent(new CustomEvent("OPEN_SECTION", { detail: { section: draftData.draft.voucher_type === 5 ? "payment-vouchers" : "receipt-vouchers" } }))
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
        setMessages((prev) => [...prev, { role: "assistant", content: `العميل "${orderDraftData.customer_name}" غير موجود في النظام. هل تريد تعريف العميل ثم إدخال مسودة طلبية المبيعات؟` }])
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
        setMessages((prev) => [...prev, { role: "assistant", content: `تم إضافة ${label} بنجاح ${code}`, documentLink: { section, code, id: Number(saved.id) } }])
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
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          assistantContent += chunk

          setMessages((prev) => {
            const newMessages = [...prev]
            const lastMessage = newMessages[newMessages.length - 1]
            if (lastMessage?.role === "assistant") {
              lastMessage.content = assistantContent
            } else {
              newMessages.push({ role: "assistant", content: assistantContent })
            }
            return newMessages
          })
        }
      }
    } catch (error) {
      console.error("[v0] AI Chat error:", error)
      const errorMessage: Message = {
        role: "assistant",
        content: error instanceof Error && error.message.includes("GOOGLE_GENERATIVE_AI_API_KEY")
          ? "لم يتم إعداد مفتاح Gemini. أضف GOOGLE_GENERATIVE_AI_API_KEY إلى ملف .env.local ثم أعد تشغيل الخادم."
          : error instanceof Error ? error.message : "عذراً، حدث خطأ في الاتصال. الرجاء المحاولة مرة أخرى.",
      }
      setMessages((prev) => [...prev, errorMessage])
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
      const currencyId = currencies.reduce<number | null>((lowest, row) => {
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
          father_id: settings?.default_customer_parent_account || null,
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

  return (
    <section className="flex h-[calc(100dvh-8rem)] min-h-[420px] w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm" dir="rtl" aria-label="المساعد الذكي">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white"><Sparkles className="h-5 w-5" /></div>
          <div><h1 className="text-base font-bold text-foreground">مساعد أعمالك</h1><p className="mt-0.5 text-xs text-muted-foreground">سندات، مبيعات ومخزون في محادثة واحدة</p></div>
        </div>
        <span className="hidden rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground sm:inline-flex">المساعد الذكي</span>
      </header>

      <div className="order-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-6 sm:px-6">
        {messages.length === 0 ? (
          <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center py-4 sm:py-8">
            <div className="mb-7 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"><Bot className="h-8 w-8" /></div>
              <p className="mb-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">طلباتك اليومية في مكان واحد</p>
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">بماذا نبدأ اليوم؟</h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-muted-foreground">اكتب طلبك في الأعلى أو استخدم الميكروفون.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {suggestions.map(({ icon: Icon, title, description, prompt }) => (
                <button key={title} type="button" onClick={() => setInput(prompt)} className="group rounded-2xl border border-border bg-card p-4 text-right transition-colors hover:border-emerald-400 hover:bg-emerald-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-emerald-950/30">
                  <div className="mb-3 flex items-center justify-between"><Icon className="h-5 w-5 text-emerald-600" /><ArrowUpLeft className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-x-1" /></div>
                  <p className="text-sm font-semibold text-card-foreground">{title}</p><p className="mt-1 text-xs leading-6 text-muted-foreground">{description}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6" role="log" aria-label="المحادثة" aria-live="polite">
            {messages.map((message, index) => (
              <div key={index} className={message.role === "user" ? "flex justify-start" : "flex justify-end"}>
                <div className="max-w-[92%] sm:max-w-[85%]">
                  <p className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">{message.role === "user" ? "أنت" : "مساعد أعمالك"}</p>
                  <div className={message.role === "user" ? "rounded-2xl rounded-tr-sm bg-emerald-600 px-4 py-3 text-white" : "rounded-2xl rounded-tl-sm border border-border bg-muted/40 px-4 py-3 text-foreground"}>
                    <p className="whitespace-pre-wrap break-words text-sm leading-7" dir="auto">{message.content}</p>
                    {message.voucherLink && (
                      <button type="button" className="mt-2 font-mono text-sm font-bold text-blue-600 underline underline-offset-4 hover:text-blue-800" onClick={() => {
                        sessionStorage.setItem("ai_open_saved_voucher", JSON.stringify({ id: message.voucherLink!.id, voucher_type: message.voucherLink!.voucherType }))
                        window.dispatchEvent(new CustomEvent("OPEN_SECTION", { detail: { section: message.voucherLink!.voucherType === 5 ? "payment-vouchers" : "receipt-vouchers" } }))
                        window.setTimeout(() => window.dispatchEvent(new CustomEvent("ai-open-saved-voucher")), 0)
                      }}>عرض السند {message.voucherLink.code}</button>
                    )}
                    {message.documentLink && (
                      <button type="button" className="mt-2 block font-mono text-sm font-bold text-blue-600 underline underline-offset-4 hover:text-blue-800" onClick={() => {
                        sessionStorage.setItem("ai_open_document", JSON.stringify(message.documentLink))
                        window.dispatchEvent(new CustomEvent("OPEN_SECTION", { detail: { section: message.documentLink!.section } }))
                        window.setTimeout(() => window.dispatchEvent(new CustomEvent("ai-open-document")), 0)
                      }}>عرض المستند {message.documentLink.code}</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" />جارٍ معالجة طلبك...</div>}
            {pendingCustomer && !isLoading && (
              <div className="flex justify-end gap-2" role="group" aria-label="تعريف العميل المفقود">
                <Button type="button" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void createDefaultCustomerAndContinue()}>
                  نعم، تعريف وحفظ مباشرة
                </Button>
                <Button type="button" variant="outline" onClick={() => {
                  setPendingCustomer(null)
                  setMessages((prev) => [...prev, { role: "assistant", content: "تم إلغاء تعريف العميل وإنشاء السند." }])
                }}>لا، إلغاء</Button>
              </div>
            )}
          </div>
        )}
        <div ref={conversationEndRef} />
      </div>

      <div className="order-1 shrink-0 border-b border-border bg-background px-3 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <label htmlFor="ai-chat-message" className="mb-2 block text-base font-semibold text-foreground">اكتب طلبك هنا</label>
          {isListening && <div className="mb-2 flex items-center gap-2 text-xs text-rose-600" role="status"><span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />الميكروفون يعمل · اضغط عليه عند الانتهاء</div>}
          <div className="rounded-2xl border border-border bg-muted/30 p-2 transition-shadow focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/10">
            <textarea id="ai-chat-message" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !isLoading && !isListening) { e.preventDefault(); void handleSubmit() }
            }} placeholder="مثال: سند قبض للزبون أحمد بمبلغ نقدي 200..." disabled={isLoading} rows={3} className="block max-h-48 min-h-28 w-full resize-y border-0 bg-transparent px-3 py-3 text-lg leading-8 text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60" />
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="ghost" onClick={toggleListening} disabled={isLoading} aria-pressed={isListening} aria-label={isListening ? "إيقاف التسجيل" : "بدء الإملاء الصوتي"} className="h-11 gap-2 rounded-xl px-3">
                {isListening ? <MicOff className="h-5 w-5 text-rose-600" /> : <Mic className="h-5 w-5" />}<span className="text-xs">{isListening ? "إيقاف" : "تحدث"}</span>
              </Button>
              <Button type="button" onClick={() => void handleSubmit()} disabled={isLoading || isListening || !input.trim()} className="h-11 gap-2 rounded-xl bg-emerald-600 px-4 text-white hover:bg-emerald-700" aria-label="إرسال الطلب">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}<span>إرسال</span>
              </Button>
            </div>
          </div>
          <p className="mt-2 text-center text-xs leading-5 text-muted-foreground">طلبات إنشاء السندات المكتملة تُحفظ تلقائياً بعد التحقق من البيانات.</p>
        </div>
      </div>
    </section>
  )
}
