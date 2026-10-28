import { NextRequest, NextResponse } from "next/server"
import { generateText, Output } from "ai"
import { google } from "@ai-sdk/google"
import { z } from "zod"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { aiCallOptions, aiFailureMessage, isTemporaryAiError, runWithAiRetry } from "@/lib/ai-model"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { ensureManagerAttachmentsTable } from "@/lib/manager-attachments"

// إعادة المحاولة التلقائية عند انشغال الخدمة قد تتجاوز مهلة المسار الافتراضية
export const maxDuration = 150

// مرفق في المساعد الذكي (صورة/PDF لفاتورة مبيعات أو مشتريات أو سند قبض/صرف): Gemini يقرأ المستند ويعيد بيانات
// منظّمة، ثم يُطابَق الطرف (عميل/مورد) والأصناف مع النظام. السندات تُحوَّل لنص أمر يمرّ بمسار سند القبض/الصرف
// الحالي في المحادثة؛ الفواتير تُعاد للمراجعة ثم تُفتح شاشة الفاتورة معبّأة.

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED = /^(image\/(png|jpe?g|webp|heic|heif)|application\/pdf)$/i

const schema = z.object({
  document_type: z.enum(["sales_invoice", "purchase_invoice", "receipt", "payment", "journal_voucher", "unknown"]),
  party_name: z.string().nullish(),
  party_tax_number: z.string().nullish(),
  document_number: z.string().nullish(),
  date: z.string().nullish(),
  currency: z.string().nullish(),
  total: z.coerce.number().nullish(),
  note: z.string().nullish(),
  lines: z.array(z.object({
    code: z.string().nullish(),
    barcode: z.string().nullish(),
    name: z.string().nullish(),
    unit: z.string().nullish(),
    quantity: z.coerce.number().nullish(),
    unit_price: z.coerce.number().nullish(),
    discount_percent: z.coerce.number().nullish(),
    line_total: z.coerce.number().nullish(),
  })).default([]),
  journal_lines: z.array(z.object({
    account_code: z.string().nullish(),
    account_name: z.string().nullish(),
    debit: z.coerce.number().nullish(),
    credit: z.coerce.number().nullish(),
    note: z.string().nullish(),
  })).default([]),
  payment: z.object({
    cash_amount: z.coerce.number().nullish(),
    card_amount: z.coerce.number().nullish(),
    cheques: z.array(z.object({
      number: z.string().nullish(),
      bank: z.string().nullish(),
      due_date: z.string().nullish(),
      amount: z.coerce.number().nullish(),
    })).default([]),
  }).nullish(),
})

const instructions = `أنت تقرأ مستنداً تجارياً (صورة أو PDF) لشركة تستخدم نظام ERP عربياً، وتستخرج بياناته فقط دون اختراع.
- document_type: sales_invoice (فاتورة صادرة منّا لعميل)، purchase_invoice (فاتورة من مورد لنا)، receipt (سند قبض: استلمنا مبلغاً)، payment (سند صرف: دفعنا مبلغاً)، journal_voucher (سند قيد / قيد يومية: جدول حسابات بأعمدة مدين ودائن)، أو unknown.
  ملاحظة نوع الفاتورة: إن ذكر المستخدم النوع في الملاحظة فاعتمده. فاتورة باسم مورد/شركة أخرى كبائع ⇒ purchase_invoice.
- party_name: اسم العميل أو المورد أو الجهة المقبوض منها/المدفوع لها (كما هو مكتوب).
- date بصيغة YYYY-MM-DD. currency: رمز أو اسم العملة كما يظهر (ILS, USD, شيكل...).
- lines: لكل سطر صنف: الرمز/الباركود إن وُجد، الاسم، الوحدة، الكمية، سعر الوحدة، نسبة الخصم، إجمالي السطر. الأرقام كأرقام لا نص.
- payment للسندات: المبلغ النقدي، البطاقة، والشيكات (رقم، بنك، تاريخ استحقاق، مبلغ).
- journal_lines لسند القيد: لكل سطر رقم الحساب واسمه كما يظهران، المدين، الدائن، والبيان. لا تضع الصنف في lines لسند القيد.
- أي حقل غير واضح اتركه فارغاً (null).`

const normalize = (value: unknown) => String(value ?? "")
  .normalize("NFKC")
  .replace(/[ً-ٰٟـ]/g, "")
  .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()

const nameScore = (candidate: string, wanted: string) => {
  const a = normalize(candidate), b = normalize(wanted)
  if (!a || !b) return 0
  if (a === b) return 100
  const words = b.split(" ").filter((word) => word.length > 1)
  if (!words.length) return 0
  const hits = words.filter((word) => a.includes(word)).length
  return hits === words.length ? 80 - Math.min(20, Math.abs(a.length - b.length) / 2) : Math.round((hits / words.length) * 60)
}

/**
 * مطابقة اسم صنف في المستند مع اسم صنف في النظام (أوسع من nameScore): المستند يضيف غالباً الوحدة "(حبة)" أو
 * خاصية "+ حار" أو "غم" — فيُقبل الاحتواء بالاتجاهين (LIKE)، ثم تغطية كلمات اسم الصنف داخل سطر المستند.
 * الأطول تطابقاً يفوز (صنف "ريما 250" أدق من "ريما") عبر مكافأة الطول.
 */
const cleanItemName = (value: string) => String(value || "").replace(/\([^)]*\)|\[[^\]]*\]/g, " ").split(/\s\+\s|\s-\s/)[0]
const itemScore = (productName: string, lineName: string) => {
  const product = normalize(productName)
  if (!product) return 0
  let best = 0
  for (const candidate of [...new Set([normalize(lineName), normalize(cleanItemName(lineName))])]) {
    if (!candidate) continue
    const lengthBonus = Math.min(9, product.length / 6)
    if (candidate === product) return 100
    // اسم الصنف كاملاً داخل سطر المستند (أو العكس) — بحدود كلمات حتى لا يطابق "ريما 25" داخل "ريما 250"
    const padded = ` ${candidate} `
    if (product.length >= 4 && padded.includes(` ${product} `)) best = Math.max(best, 88 + lengthBonus)
    else if (candidate.length >= 4 && ` ${product} `.includes(padded)) best = Math.max(best, 84 + lengthBonus)
    // كل كلمات اسم الصنف موجودة في السطر (بأي ترتيب) — الأرقام يجب أن تتطابق تماماً
    const productWords = product.split(" ").filter(Boolean)
    const lineWords = new Set(candidate.split(" "))
    const hits = productWords.filter((word) => lineWords.has(word) || (!/^\d+$/.test(word) && word.length > 2 && [...lineWords].some((other) => other.startsWith(word) || (word.startsWith(other) && other.length > 2)))).length
    if (productWords.length >= 2 && hits === productWords.length) best = Math.max(best, 78 + lengthBonus)
    else best = Math.max(best, nameScore(productName, cleanItemName(lineName)))
  }
  return best
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return NextResponse.json({ error: "خدمة الذكاء الاصطناعي غير مفعّلة على الخادم" }, { status: 503 })
    const form = await request.formData()
    const hint = String(form.get("hint") || "").slice(0, 500)
    // attachment_id: مرفق من "بريد الرسائل" يُقرأ من قاعدة البيانات مباشرة (بلا تنزيله للمتصفح ثم رفعه مجدداً)
    const attachmentId = Number(form.get("attachment_id") || 0)
    let file: { type: string; size: number; bytes: Uint8Array }
    if (attachmentId > 0) {
      await ensureManagerAttachmentsTable()
      const row = (await sql`SELECT branch_id, mime_type, file_data FROM manager_attachments_tbl WHERE id = ${attachmentId} LIMIT 1`)[0] as any
      if (!row) return NextResponse.json({ error: "المرفق غير موجود (ربما حُذف)" }, { status: 404 })
      const auth = await authorizeTransaction(request, "manager_inbox", "view", row.branch_id)
      if (!auth.ok) return auth.response
      const bytes = new Uint8Array(row.file_data as Buffer)
      // نوع "image/jpg" غير القياسي يُصحَّح حتى يقبله النموذج
      file = { type: String(row.mime_type || "").replace(/^image\/jpg$/i, "image/jpeg"), size: bytes.byteLength, bytes }
    } else {
      const upload = form.get("file")
      if (!(upload instanceof File)) return NextResponse.json({ error: "أرفق ملف صورة أو PDF" }, { status: 400 })
      file = { type: upload.type, size: upload.size, bytes: new Uint8Array(await upload.arrayBuffer()) }
    }
    if (!ALLOWED.test(file.type)) return NextResponse.json({ error: "نوع الملف غير مدعوم — صورة (JPG/PNG/WEBP) أو PDF فقط" }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "حجم الملف أكبر من 10MB" }, { status: 400 })
    if (!file.size) return NextResponse.json({ error: "الملف فارغ" }, { status: 400 })
    const bytes = file.bytes

    let extracted: z.infer<typeof schema> | null = null
    let lastError: unknown = null
    const userContent = (extra = "") => [{
      role: "user" as const,
      content: [
        { type: "text" as const, text: `استخرج بيانات هذا المستند.${hint ? ` ملاحظة المستخدم: ${hint}` : ""}${extra}` },
        { type: "file" as const, data: bytes, mediaType: file.type },
      ],
    }]
    // الانشغال المؤقت ("high demand"/503/429) يُعاد تلقائياً على النموذج الأساسي والاحتياطية بانتظار متزايد
    // (runWithAiRetry) بدل إظهار "مشغولة" من أول محاولة.
    // المحاولة الأولى بتفكير "low" (أدق) حتى 75ث؛ إن تأخرت أو انشغلت الخدمة فالمحاولات التالية بتفكير "minimal" (أسرع بكثير)
    // بدل تكرار نفس الاستدعاء البطيء حتى تنتهي المهلة كلها
    let attempt = 0
    try {
      extracted = await runWithAiRetry(async (modelName, remainingMs) => {
        const thinking = attempt++ === 0 ? "low" as const : "minimal" as const
        const callOptions = () => aiCallOptions(modelName, { timeoutMs: Math.min(thinking === "low" ? 75_000 : 50_000, remainingMs), thinking })
        try {
          const { output } = await generateText({
            ...callOptions(),
            model: google(modelName),
            output: Output.object({ schema }),
            instructions,
            messages: userContent(),
          })
          return schema.parse(output)
        } catch (structuredError) {
          if (isTemporaryAiError(structuredError)) throw structuredError
          // بعض المستندات/النماذج ترفض المخرجات المنظّمة ⇐ JSON نصي ثم تحقق بنفس المخطط
          console.warn("[ai-assistant] document-extract structured output failed, retrying as JSON", structuredError)
          const generated = await generateText({
            ...callOptions(),
            model: google(modelName),
            instructions: `${instructions}\nأعد JSON فقط (بلا أي نص آخر) بالحقول: document_type, party_name, party_tax_number, document_number, date, currency, total, note, lines, journal_lines, payment.`,
            messages: userContent(),
          })
          const clean = String(generated.text || "").replace(/```(?:json)?/gi, "").trim()
          return schema.parse(JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1)))
        }
      }, { deadlineMs: 130_000 })
    } catch (error) {
      lastError = error
    }
    if (!extracted) {
      console.error("[ai-assistant] document-extract failed", lastError)
      const reason = lastError instanceof Error ? lastError.message : String(lastError || "")
      return NextResponse.json({ error: aiFailureMessage(lastError, `تعذر قراءة المستند${reason ? `: ${reason.slice(0, 300)}` : ""}`) }, { status: 502 })
    }

    // الطرف: عملاء (2/5) للمبيعات والقبض، موردون (3) للمشتريات والصرف — مع الرجوع لكل الأنواع
    const partyTypes = extracted.document_type === "purchase_invoice" || extracted.document_type === "payment" ? [3, 2, 5] : [2, 5, 3]
    let party: { id: number; code: string; name: string; score: number } | null = null
    if (extracted.party_tax_number) {
      const byTax = (await sql`
        SELECT a.id, a.code, a.name FROM customers c JOIN account_tbl a ON a.id = c.account_id
        WHERE COALESCE(c.isDeleted, false) = false AND regexp_replace(COALESCE(to_jsonb(c)->>'tax_number', ''), '\\D', '', 'g') = ${String(extracted.party_tax_number).replace(/\D/g, "")}
          AND ${String(extracted.party_tax_number).replace(/\D/g, "")} <> '' LIMIT 1
      `.catch(() => []))[0] as any
      if (byTax) party = { id: Number(byTax.id), code: String(byTax.code), name: String(byTax.name), score: 100 }
    }
    if (!party && extracted.party_name) {
      const candidates = await sql`SELECT id, code, name, type FROM account_tbl WHERE type = ANY(${partyTypes}::int[]) AND COALESCE(status, 1) IN (1, 2)`
      const ranked = (candidates as any[])
        .map((row) => ({ id: Number(row.id), code: String(row.code), name: String(row.name), score: nameScore(row.name, extracted!.party_name!) - partyTypes.indexOf(Number(row.type)) }))
        .filter((row) => row.score >= 60)
        .sort((a, b) => b.score - a.score)
      party = ranked[0] || null
    }

    // الأصناف: باركود ⇐ رقم الصنف ⇐ الاسم
    const lines = extracted.lines.filter((line) => line.name || line.code || line.barcode)
    const barcodes = [...new Set(lines.map((line) => String(line.barcode || line.code || "").trim()).filter(Boolean))]
    const byBarcode = new Map<string, { product_id: number; unit_id: number }>()
    if (barcodes.length) {
      for (const row of await sql`SELECT barcode, product_id, unit_id FROM product_unit_barcodes WHERE barcode = ANY(${barcodes}::text[])` as any[]) {
        byBarcode.set(String(row.barcode), { product_id: Number(row.product_id), unit_id: Number(row.unit_id) })
      }
    }
    const codes = [...new Set(lines.flatMap((line) => {
      const code = String(line.code || "").trim().toUpperCase()
      return code ? [code, /^\d+$/.test(code) ? code.padStart(10, "0") : code.slice(0, 1) + code.slice(1).padStart(9, "0")] : []
    }))]
    const byCode = new Map<string, any>()
    if (codes.length) for (const row of await sql`SELECT id, product_code, product_name FROM products WHERE UPPER(product_code) = ANY(${codes}::text[]) AND COALESCE(status, 1) <> 3` as any[]) byCode.set(String(row.product_code).toUpperCase(), row)
    const needsName = lines.some((line) => !byBarcode.has(String(line.barcode || line.code || "").trim()) && !byCode.size)
    const catalog = needsName || lines.length ? (await sql`SELECT id, product_code, product_name FROM products WHERE COALESCE(status, 1) <> 3 AND COALESCE(type, 1) IN (1, 2)`) as any[] : []
    const productById = new Map(catalog.map((row) => [Number(row.id), row]))

    const matchedLines = lines.map((line) => {
      const key = String(line.barcode || line.code || "").trim()
      let product: any = null, unitId: number | null = null, matchedBy = ""
      const barcodeHit = key ? byBarcode.get(key) : undefined
      if (barcodeHit) { product = productById.get(barcodeHit.product_id); unitId = barcodeHit.unit_id; matchedBy = "barcode" }
      if (!product && line.code) {
        const code = String(line.code).trim().toUpperCase()
        product = byCode.get(code) || byCode.get(/^\d+$/.test(code) ? code.padStart(10, "0") : code.slice(0, 1) + code.slice(1).padStart(9, "0")) || null
        if (product) matchedBy = "code"
      }
      if (!product && line.name) {
        let best: any = null, bestScore = 0
        for (const row of catalog) { const score = itemScore(row.product_name, line.name); if (score > bestScore) { best = row; bestScore = score } }
        if (best && bestScore >= 70) { product = best; matchedBy = "name" }
      }
      return {
        ...line,
        product_id: product ? Number(product.id) : null,
        product_code: product ? String(product.product_code) : null,
        product_name: product ? String(product.product_name) : null,
        unit_id: unitId,
        matched_by: matchedBy || null,
      }
    })

    // سند قيد: مطابقة الحسابات (رقم الحساب ⇐ الاسم) مع الحسابات الفرعية فقط (الرئيسية لا تقبل حركات)
    let journalLines: any[] = []
    if (extracted.document_type === "journal_voucher") {
      const accounts = (await sql`
        SELECT a.id, a.code, a.name FROM account_tbl a
        WHERE COALESCE(a.status, 1) IN (1, 2)
          AND NOT EXISTS (SELECT 1 FROM account_tbl c WHERE c.father_id = a.id AND COALESCE(c.status, 1) <> 3)
      `) as any[]
      const byAccountCode = new Map(accounts.map((row) => [String(row.code).toUpperCase(), row]))
      const padCode = (raw: string) => {
        const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
        const match = /^([A-Z]*)(\d+)$/.exec(code)
        return match && code.length < 10 ? match[1] + match[2].padStart(10 - match[1].length, "0") : code
      }
      journalLines = extracted.journal_lines
        .filter((line) => Number(line.debit) > 0 || Number(line.credit) > 0)
        .map((line) => {
          let account: any = null, matchedBy = ""
          if (line.account_code) {
            account = byAccountCode.get(String(line.account_code).trim().toUpperCase()) || byAccountCode.get(padCode(String(line.account_code))) || null
            if (account) matchedBy = "code"
          }
          if (!account && line.account_name) {
            let best: any = null, bestScore = 0
            for (const row of accounts) { const score = nameScore(row.name, line.account_name); if (score > bestScore) { best = row; bestScore = score } }
            if (best && bestScore >= 70) { account = best; matchedBy = "name" }
          }
          return {
            ...line,
            debit: Number(line.debit) || 0,
            credit: Number(line.credit) || 0,
            account_id: account ? Number(account.id) : null,
            matched_code: account ? String(account.code) : null,
            matched_name: account ? String(account.name) : null,
            matched_by: matchedBy || null,
          }
        })
    }

    // نص أمر لسند قبض/صرف — يمرّ بنفس مسار المحادثة (مطابقة الحساب/العملة/الشيكات/الحفظ وتعريف العميل إن لزم)
    let receiptCommand: string | null = null
    if (extracted.document_type === "receipt" || extracted.document_type === "payment") {
      const amount = Number(extracted.total || 0) || [extracted.payment?.cash_amount, extracted.payment?.card_amount, ...(extracted.payment?.cheques || []).map((cheque) => cheque.amount)].reduce<number>((sum, value) => sum + (Number(value) || 0), 0)
      const parts = [
        `${extracted.document_type === "receipt" ? "سند قبض من" : "سند صرف إلى"} ${party?.name || extracted.party_name || ""}`,
        amount ? `مبلغ ${amount}` : "",
        extracted.currency ? String(extracted.currency) : "",
        extracted.date ? `بتاريخ ${extracted.date}` : "",
        Number(extracted.payment?.cash_amount) > 0 ? `نقداً ${extracted.payment!.cash_amount}` : "",
        Number(extracted.payment?.card_amount) > 0 ? `بطاقة ${extracted.payment!.card_amount}` : "",
        ...(extracted.payment?.cheques || []).filter((cheque) => Number(cheque.amount) > 0).map((cheque) =>
          `شيك رقم ${cheque.number || ""} ${cheque.bank ? `بنك ${cheque.bank}` : ""} ${cheque.due_date ? `استحقاق ${cheque.due_date}` : ""} مبلغ ${cheque.amount}`.replace(/\s+/g, " ").trim()),
        extracted.document_number ? `ملاحظة: مرجع ${extracted.document_number}` : extracted.note ? `ملاحظة: ${extracted.note}` : "",
      ].filter(Boolean)
      receiptCommand = parts.join(" ")
    }

    return NextResponse.json({
      document_type: extracted.document_type,
      party_name: extracted.party_name || null,
      party: party ? { id: party.id, code: party.code, name: party.name } : null,
      document_number: extracted.document_number || null,
      date: extracted.date && /^\d{4}-\d{2}-\d{2}$/.test(extracted.date) ? extracted.date : null,
      currency: extracted.currency || null,
      total: extracted.total ?? null,
      note: extracted.note || null,
      lines: extracted.document_type === "journal_voucher" ? [] : matchedLines,
      journal_lines: journalLines,
      receipt_command: receiptCommand,
    })
  } catch (error) {
    console.error("[ai-assistant] document-extract error", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر معالجة المرفق" }, { status: 500 })
  }
}
