import { generateText, Output } from "ai"
import { google } from "@ai-sdk/google"
import { z } from "zod"
import sql from "@/lib/database"

const schema = z.object({
  intent: z.enum(["create_sales_draft", "create_internal_request", "other"]),
  customer: z.string().nullish(),
  order_date: z.string().nullish(),
  delivery_date: z.string().nullish(),
  deposit_amount: z.number().nullish(),
  notes: z.string().nullish(),
  priority: z.enum(["low", "normal", "high", "urgent"]).nullish(),
  source_warehouse: z.string().nullish(),
  destination_branch: z.string().nullish(),
  destination_warehouse: z.string().nullish(),
  items: z.array(z.object({
    product: z.string(), quantity: z.number(), price: z.number().nullish(), discount: z.number().nullish(),
  })).default([]),
})

const normalize = (value: unknown) => String(value || "").normalize("NFKC")
  .replace(/[ً-ٰٟـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/\s+/g, " ").trim().toLowerCase()
// نفس توحيد الحروف داخل SQL (بحث المرشحين قبل الترتيب الدقيق في JS)
const SQL_NORMALIZE_FROM = "أإآى"
const SQL_NORMALIZE_TO = "اااي"

const words = (term: string) => [...new Set(term.split(" ").filter((word) => word.length > 0))]

// درجة مطابقة الاسم: تطابق تام > الاسم يبدأ بالنص > يحتوي كل الكلمات (الأقصر أقرب). null = لا يطابق
const scoreName = (name: unknown, term: string) => {
  const value = normalize(name)
  if (!value || !term) return null
  if (value === term) return 1000
  const termWords = words(term)
  if (!termWords.every((word) => value.includes(word))) return null
  return (value.startsWith(term) ? 500 : 300) - Math.min(200, value.length - term.length)
}

type Pick<T> = { match: T } | { ambiguous: T[] } | { none: true }
// أفضل مرشح واحد واضح؛ تساوي أعلى درجة بين أكثر من مرشح ⇐ يُطلب من المستخدم التحديد
const pickBest = <T,>(rows: T[], term: string, name: (row: T) => unknown, code?: (row: T) => unknown): Pick<T> => {
  const exactCode = code ? rows.filter((row) => normalize(code(row)) === term) : []
  if (exactCode.length === 1) return { match: exactCode[0] }
  const scored = rows.map((row) => ({ row, score: scoreName(name(row), term) })).filter((entry) => entry.score !== null) as { row: T; score: number }[]
  if (!scored.length) return { none: true }
  scored.sort((a, b) => b.score - a.score)
  const top = scored.filter((entry) => entry.score === scored[0].score)
  return top.length === 1 ? { match: top[0].row } : { ambiguous: top.slice(0, 6).map((entry) => entry.row) }
}

// مرشحو الأصناف من القاعدة مباشرة (بدل تحميل كل الأصناف — قد تكون عشرات الآلاف): كل كلمات الاسم، أو رمز/باركود مطابق
const findProductCandidates = async (term: string) => sql`
  SELECT p.id, p.product_code, p.product_name, pu.id AS product_unit_id, pu.unit_id, u.unit_name,
         COALESCE((SELECT pub.barcode FROM product_unit_barcodes pub WHERE pub.product_id = p.id AND pub.unit_id = pu.id ORDER BY pub.id LIMIT 1), '') AS barcode
  FROM products p
  LEFT JOIN LATERAL (SELECT * FROM product_units x WHERE x.product_id = p.id ORDER BY x.id LIMIT 1) pu ON true
  LEFT JOIN units u ON u.id = pu.unit_id
  WHERE COALESCE(p.status, 1) != 3 AND COALESCE(p.deleted, false) = false
    AND (
      lower(p.product_code) = ${term}
      OR EXISTS (SELECT 1 FROM product_unit_barcodes b WHERE b.product_id = p.id AND lower(b.barcode) = ${term})
      OR (SELECT bool_and(translate(lower(p.product_name), ${SQL_NORMALIZE_FROM}, ${SQL_NORMALIZE_TO}) LIKE '%' || w || '%') FROM unnest(${words(term)}::text[]) w)
    )
  ORDER BY length(p.product_name), p.id
  LIMIT 200
` as Promise<any[]>

const findCustomerCandidates = async (term: string) => sql`
  SELECT a.id, a.code, a.name,
         (SELECT c.pricecategory FROM customers c WHERE c.account_id = a.id AND COALESCE(c.isdeleted, false) = false ORDER BY c.id DESC LIMIT 1) AS pricecategory
  FROM account_tbl a
  WHERE a.type IN (2, 3, 5) AND COALESCE(a.status::text, '1') IN ('1', '2', 'active', 'ACTIVE', 'نشط')
    AND (
      lower(a.code) = ${term}
      OR (SELECT bool_and(translate(lower(a.name), ${SQL_NORMALIZE_FROM}, ${SQL_NORMALIZE_TO}) LIKE '%' || w || '%') FROM unnest(${words(term)}::text[]) w)
    )
  ORDER BY length(a.name), a.id
  LIMIT 200
` as Promise<any[]>

// سعر الصنف بالوحدة الأولى: فئة سعر العميل إن وُجدت، وإلا أول فئة سعر (كالسابق)
const productPrice = async (productId: number, unitId: number, priceCategoryId: number | null) => {
  const rows = await sql`
    SELECT price FROM product_prices
    WHERE product_id = ${productId} AND unit_id = ${unitId}
    ORDER BY CASE WHEN price_category_id = ${priceCategoryId ?? 0} THEN 0 ELSE 1 END, price_category_id, id
    LIMIT 1
  `
  return Number(rows[0]?.price || 0)
}

const listChoices = (rows: any[], label: (row: any) => string) => rows.map((row) => `• ${label(row)}`).join("\n")

export async function POST(request: Request) {
  try {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return Response.json({ error: "لم يتم إعداد مفتاح المساعد الذكي" }, { status: 503 })
    const { command, active_branch_id, user_id } = await request.json()
    const text = String(command || "").trim()
    if (!text) return Response.json({ error: "الأمر مطلوب" }, { status: 400 })
    // سؤال/تقرير بلا كلمات طلبيات ⇐ ليس أمر إنشاء — يُمرَّر للمحادثة مباشرة
    if (!/(?:طلبي|طلب|مسود|مسوّد|اوردر|order)/i.test(text)) return Response.json({ type: "other" })
    const today = new Date().toISOString().slice(0, 10)

    let parsed: z.infer<typeof schema>
    const instructions = `حلل طلب المستخدم كاملاً واستخرج الحقول المطلوبة.
intent=create_sales_draft لطلب إنشاء مسودة طلبية مبيعات (مثل: "طلبية للزبون فلان 10 صنف كذا")، intent=create_internal_request لطلب بضاعة داخلي بين الفروع، وإلا other. لا تعتبر السؤال أو المثال أو النفي أمراً بالإنشاء.
customer: اسم العميل أو رمزه فقط، بدون كلمات مثل "للزبون" أو "للعميل" أو "لـ". order_date وdelivery_date بصيغة YYYY-MM-DD؛ اليوم ${today}. deposit_amount العربون وإلا 0. notes وpriority.
للطلب الداخلي: source_warehouse مستودع مقدم الطلب، destination_branch الفرع المطلوب منه البضاعة، destination_warehouse مستودعه.
items: لكل صنف product وquantity (رقم موجب) وprice وdiscount إن ذُكرا. product هو اسم أو رمز الصنف كما قاله المستخدم بدون الكمية أو الوحدة. حوّل الأرقام العربية (٠-٩) والمكتوبة بالحروف إلى أرقام. لا تخترع صنفاً أو كمية أو فرعاً أو مستودعاً.`
    try {
      let raw: unknown
      try {
        // إخراج منظَّم وفق المخطط (أدق) …
        const { output } = await generateText({ model: google("gemini-2.5-flash"), output: Output.object({ schema }), instructions, prompt: text })
        raw = output
      } catch (structuredError) {
        // … وإن رُفض المخطط أو فشل التوليد المنظَّم: نص JSON عادي كالسابق
        console.error("AI order draft: structured output failed, retrying as text", structuredError)
        const generated = await generateText({ model: google("gemini-2.5-flash"), instructions: `${instructions}\nأعد JSON فقط بالحقول: intent, customer, order_date, delivery_date, deposit_amount, notes, priority, source_warehouse, destination_branch, destination_warehouse, items.`, prompt: text })
        const clean = generated.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
        raw = JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1))
      }
      const result = schema.safeParse(raw)
      if (!result.success) return Response.json({ type: "other" })
      parsed = result.data
    } catch (aiError) {
      // خطأ خدمة الذكاء الاصطناعي نفسها — تُعرض رسالتها الفعلية (مفتاح غير صالح، تجاوز الحصة، الموقع غير مدعوم…)
      console.error("AI order draft: model call failed", aiError)
      const detail = aiError instanceof Error ? aiError.message.replace(/\s+/g, " ").slice(0, 220) : ""
      const status = Number((aiError as { statusCode?: number })?.statusCode) || 0
      return Response.json({
        error: `تعذر الاتصال بخدمة الذكاء الاصطناعي${status ? ` (HTTP ${status})` : ""}${detail ? `: ${detail}` : ""}`,
      }, { status: 502 })
    }

    if (parsed.intent === "other") return Response.json({ type: "other" })
    const requestedItems = parsed.items.filter((item) => String(item.product || "").trim() && Number(item.quantity) > 0)
    if (!requestedItems.length) return Response.json({ error: "اذكر صنفاً واحداً على الأقل وكمية كل صنف" }, { status: 422 })
    const branchId = Number(active_branch_id)
    if (!branchId) return Response.json({ error: "اختر الفرع النشط أولاً" }, { status: 422 })

    // العميل أولاً (لمسودة المبيعات) — فئة سعره تحدد أسعار الأصناف
    let account: any = null
    if (parsed.intent === "create_sales_draft") {
      const accountTerm = normalize(parsed.customer)
      if (!accountTerm) return Response.json({ error: "اذكر اسم العميل أو رقم حسابه" }, { status: 422 })
      const picked = pickBest(await findCustomerCandidates(accountTerm), accountTerm, (row: any) => row.name, (row: any) => row.code)
      if ("none" in picked) return Response.json({ error: `العميل "${parsed.customer}" غير موجود في النظام`, code: "CUSTOMER_NOT_FOUND", customer_name: parsed.customer, document_kind: "sales_draft" }, { status: 404 })
      if ("ambiguous" in picked) return Response.json({ error: `يوجد أكثر من عميل باسم "${parsed.customer}". اذكر الاسم كاملاً أو رقم الحساب:\n${listChoices(picked.ambiguous, (row) => `${row.name} (${row.code})`)}` }, { status: 422 })
      account = picked.match
    }

    const items = []
    for (const requested of requestedItems) {
      const term = normalize(requested.product)
      const picked = pickBest(await findProductCandidates(term), term, (row: any) => row.product_name, (row: any) => row.product_code)
      if ("none" in picked) return Response.json({ error: `الصنف "${requested.product}" غير موجود. استخدم اسم الصنف كما هو معرّف أو رمزه` }, { status: 422 })
      if ("ambiguous" in picked) return Response.json({ error: `يوجد أكثر من صنف يطابق "${requested.product}". حدّد الصنف بالاسم الكامل أو الرمز:\n${listChoices(picked.ambiguous, (row) => `${row.product_name} (${row.product_code})`)}` }, { status: 422 })
      const product = picked.match
      if (!product.unit_id) return Response.json({ error: `لا توجد وحدة معرفة للصنف ${product.product_name}` }, { status: 422 })
      const price = requested.price != null && requested.price >= 0
        ? requested.price
        : await productPrice(Number(product.id), Number(product.unit_id), account?.pricecategory != null ? Number(account.pricecategory) : null)
      items.push({ product_id: Number(product.id), product_name: product.product_name, quantity: Number(requested.quantity),
        unit_id: Number(product.unit_id), unit_name: product.unit_name, barcode: product.barcode || "",
        price, discount: Math.max(0, Number(requested.discount || 0)) })
    }
    const orderDate = /^\d{4}-\d{2}-\d{2}$/.test(parsed.order_date || "") ? parsed.order_date! : today
    const warehouses = await sql`SELECT id,warehouse_name,branch_id,status,is_active FROM warehouses WHERE COALESCE(status,1) != 3 ORDER BY id` as any[]
    const branchWarehouse = (name: unknown) => {
      const local = warehouses.filter((row: any) => Number(row.branch_id) === branchId)
      const term = normalize(name)
      const picked = term ? pickBest(local, term, (row: any) => row.warehouse_name) : null
      return (picked && "match" in picked ? picked.match : null)
        || local.find((row: any) => Number(row.status) === 1 && row.is_active !== false)
    }

    if (parsed.intent === "create_sales_draft") {
      const store = branchWarehouse(parsed.source_warehouse)
      if (!store) return Response.json({ error: "لا يوجد مستودع نشط للفرع الحالي" }, { status: 422 })
      const deliveryDate = /^\d{4}-\d{2}-\d{2}$/.test(parsed.delivery_date || "") ? parsed.delivery_date! : orderDate
      return Response.json({ type: "sales-draft", payload: { account_id: Number(account.id), customer_name: account.name,
        order_date: orderDate, requested_delivery_date: deliveryDate, deposit_amount: Math.max(0, Number(parsed.deposit_amount || 0)),
        notes: parsed.notes || "", priority: parsed.priority || "normal", attachments: [], created_by: Number(user_id) || null,
        branch_id: branchId, items: items.map(item => ({ ...item, store_id: Number(store.id), specifications: {} })) } })
    }

    const source = branchWarehouse(parsed.source_warehouse)
    const branches = await sql`SELECT id,branch_code,branch_name,status FROM branches WHERE COALESCE(status,1) != 3 ORDER BY id` as any[]
    const branchTerm = normalize(parsed.destination_branch)
    const branchPick = branchTerm ? pickBest(branches, branchTerm, (row: any) => row.branch_name, (row: any) => row.branch_code) : null
    const destinationBranch = branchPick && "match" in branchPick ? branchPick.match : null
    if (!destinationBranch) return Response.json({ error: "اذكر اسم أو رمز الفرع المطلوب منه البضاعة بشكل محدد" }, { status: 422 })
    const destinationTerm = normalize(parsed.destination_warehouse)
    const destinationPick = destinationTerm ? pickBest(warehouses.filter((row: any) => Number(row.branch_id) === Number(destinationBranch.id)), destinationTerm, (row: any) => row.warehouse_name) : null
    const destination = destinationPick && "match" in destinationPick ? destinationPick.match : null
    if (!source || !destination) return Response.json({ error: "اذكر مستودع المصدر ومستودع الوجهة بشكل صحيح" }, { status: 422 })
    if (Number(source.id) === Number(destination.id)) return Response.json({ error: "لا يمكن أن يكون مستودع المصدر والوجهة متطابقين" }, { status: 422 })
    return Response.json({ type: "internal-request", payload: { vch_date: orderDate, branch_id: branchId,
      source_warehouse_id: Number(source.id), manufacturing_branch_id: Number(destinationBranch.id), destination_warehouse_id: Number(destination.id),
      note: parsed.notes || "", items: items.map(({ price: _price, discount: _discount, ...item }) => item) } })
  } catch (error) {
    console.error("AI order draft error", error)
    const reason = error instanceof Error && error.message ? ` (${error.message.slice(0, 160)})` : ""
    return Response.json({ error: `تعذر إنشاء المسودة من الطلب${reason}. اذكر نوع المستند والأصناف والكميات بوضوح` }, { status: 400 })
  }
}
