import { NextRequest, NextResponse } from "next/server"
import { generateText, Output } from "ai"
import { google } from "@ai-sdk/google"
import { z } from "zod"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { aiCallOptions, geminiModels, isTemporaryAiError } from "@/lib/ai-model"

// مرفق في المساعد الذكي (صورة/PDF لفاتورة مبيعات أو مشتريات أو سند قبض/صرف): Gemini يقرأ المستند ويعيد بيانات
// منظّمة، ثم يُطابَق الطرف (عميل/مورد) والأصناف مع النظام. السندات تُحوَّل لنص أمر يمرّ بمسار سند القبض/الصرف
// الحالي في المحادثة؛ الفواتير تُعاد للمراجعة ثم تُفتح شاشة الفاتورة معبّأة.

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED = /^(image\/(png|jpe?g|webp|heic|heif)|application\/pdf)$/i

const schema = z.object({
  document_type: z.enum(["sales_invoice", "purchase_invoice", "receipt", "payment", "unknown"]),
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
- document_type: sales_invoice (فاتورة صادرة منّا لعميل)، purchase_invoice (فاتورة من مورد لنا)، receipt (سند قبض: استلمنا مبلغاً)، payment (سند صرف: دفعنا مبلغاً)، أو unknown.
  ملاحظة نوع الفاتورة: إن ذكر المستخدم النوع في الملاحظة فاعتمده. فاتورة باسم مورد/شركة أخرى كبائع ⇒ purchase_invoice.
- party_name: اسم العميل أو المورد أو الجهة المقبوض منها/المدفوع لها (كما هو مكتوب).
- date بصيغة YYYY-MM-DD. currency: رمز أو اسم العملة كما يظهر (ILS, USD, شيكل...).
- lines: لكل سطر صنف: الرمز/الباركود إن وُجد، الاسم، الوحدة، الكمية، سعر الوحدة، نسبة الخصم، إجمالي السطر. الأرقام كأرقام لا نص.
- payment للسندات: المبلغ النقدي، البطاقة، والشيكات (رقم، بنك، تاريخ استحقاق، مبلغ).
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

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return NextResponse.json({ error: "خدمة الذكاء الاصطناعي غير مفعّلة على الخادم" }, { status: 503 })
    const form = await request.formData()
    const file = form.get("file")
    const hint = String(form.get("hint") || "").slice(0, 500)
    if (!(file instanceof File)) return NextResponse.json({ error: "أرفق ملف صورة أو PDF" }, { status: 400 })
    if (!ALLOWED.test(file.type)) return NextResponse.json({ error: "نوع الملف غير مدعوم — صورة (JPG/PNG/WEBP) أو PDF فقط" }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "حجم الملف أكبر من 10MB" }, { status: 400 })
    const bytes = new Uint8Array(await file.arrayBuffer())

    let extracted: z.infer<typeof schema> | null = null
    let lastError: unknown = null
    for (const modelName of geminiModels()) {
      try {
        const { output } = await generateText({
          ...aiCallOptions(modelName, { timeoutMs: 60_000, thinking: "low" }),
          model: google(modelName),
          output: Output.object({ schema }),
          instructions,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: `استخرج بيانات هذا المستند.${hint ? ` ملاحظة المستخدم: ${hint}` : ""}` },
              { type: "file", data: bytes, mediaType: file.type },
            ],
          }],
        })
        extracted = schema.parse(output)
        break
      } catch (error) {
        lastError = error
        if (!isTemporaryAiError(error)) break
      }
    }
    if (!extracted) {
      console.error("[ai-assistant] document-extract failed", lastError)
      return NextResponse.json({ error: "تعذر قراءة المستند — جرّب صورة أوضح" }, { status: 502 })
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
        for (const row of catalog) { const score = nameScore(row.product_name, line.name); if (score > bestScore) { best = row; bestScore = score } }
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
      lines: matchedLines,
      receipt_command: receiptCommand,
    })
  } catch (error) {
    console.error("[ai-assistant] document-extract error", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر معالجة المرفق" }, { status: 500 })
  }
}
