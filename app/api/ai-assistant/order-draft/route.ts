import { generateText } from "ai"
import { google } from "@ai-sdk/google"
import { z } from "zod"
import sql from "@/lib/database"

const schema = z.object({
  intent: z.enum(["create_sales_draft", "create_internal_request", "other"]),
  customer: z.string().nullish(),
  order_date: z.string().nullish(),
  delivery_date: z.string().nullish(),
  deposit_amount: z.number().nonnegative().nullish(),
  notes: z.string().nullish(),
  priority: z.enum(["low", "normal", "high", "urgent"]).nullish(),
  source_warehouse: z.string().nullish(),
  destination_branch: z.string().nullish(),
  destination_warehouse: z.string().nullish(),
  items: z.array(z.object({
    product: z.string(), quantity: z.number().positive(), price: z.number().nonnegative().nullish(), discount: z.number().nonnegative().nullish(),
  })).default([]),
})

const normalize = (value: unknown) => String(value || "").normalize("NFKC")
  .replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/\s+/g, " ").trim().toLowerCase()

const extractJson = (text: string) => {
  const clean = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
  return JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1))
}

const matchOne = (rows: any[], value: unknown, nameKey: string, codeKey?: string) => {
  const term = normalize(value)
  if (!term) return null
  const exact = rows.filter(row => normalize(row[nameKey]) === term || (codeKey && normalize(row[codeKey]) === term))
  const matches = exact.length ? exact : rows.filter(row => term.split(" ").every(word => normalize(row[nameKey]).includes(word)))
  return matches.length === 1 ? matches[0] : null
}

export async function POST(request: Request) {
  try {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return Response.json({ error: "لم يتم إعداد مفتاح المساعد الذكي" }, { status: 503 })
    const { command, active_branch_id, user_id } = await request.json()
    const text = String(command || "").trim()
    if (!text) return Response.json({ error: "الأمر مطلوب" }, { status: 400 })
    const today = new Date().toISOString().slice(0, 10)
    const generated = await generateText({
      model: google("gemini-2.5-flash"),
      system: `حلل طلب المستخدم كاملاً وأعد JSON فقط.
intent=create_sales_draft لطلب إنشاء مسودة طلبية مبيعات، intent=create_internal_request لطلب بضاعة داخلي، وإلا other. لا تعتبر السؤال أو المثال أو النفي أمراً بالإنشاء.
customer اسم العميل أو رمزه لمسودة المبيعات. order_date وdelivery_date بصيغة YYYY-MM-DD؛ اليوم ${today}. deposit_amount العربون وإلا 0. notes وpriority.
للطلب الداخلي: source_warehouse مستودع مقدم الطلب، destination_branch الفرع المطلوب منه البضاعة، destination_warehouse مستودعه.
items مصفوفة product وquantity وprice وdiscount. حافظ على اسم/رمز الصنف كما قاله المستخدم، وحول الأرقام العربية والمكتوبة إلى أرقام. لا تخترع صنفاً أو كمية أو فرعاً أو مستودعاً.`,
      prompt: text,
    })
    const parsed = schema.parse(extractJson(generated.text))
    if (parsed.intent === "other") return Response.json({ type: "other" })
    if (!parsed.items.length) return Response.json({ error: "اذكر صنفاً واحداً على الأقل وكمية كل صنف" }, { status: 422 })
    const branchId = Number(active_branch_id)
    if (!branchId) return Response.json({ error: "اختر الفرع النشط أولاً" }, { status: 422 })

    const [products, warehouses, branches] = await Promise.all([
      sql`SELECT p.id,p.product_code,p.product_name,pu.unit_id,u.unit_name,
            COALESCE((SELECT pub.barcode FROM product_unit_barcodes pub WHERE pub.product_id=p.id AND pub.unit_id=pu.id ORDER BY pub.id LIMIT 1),'') barcode,
            COALESCE((SELECT pp.price FROM product_prices pp WHERE pp.product_id=p.id AND pp.unit_id=pu.unit_id ORDER BY pp.price_category_id,pp.id LIMIT 1),0) price
          FROM products p LEFT JOIN LATERAL (SELECT * FROM product_units x WHERE x.product_id=p.id ORDER BY x.id LIMIT 1) pu ON true
          LEFT JOIN units u ON u.id=pu.unit_id WHERE COALESCE(p.status,1) != 3 ORDER BY p.id`,
      sql`SELECT id,warehouse_name,branch_id,status,is_active FROM warehouses WHERE COALESCE(status,1) != 3 ORDER BY id`,
      sql`SELECT id,branch_code,branch_name,status FROM branches WHERE COALESCE(status,1) != 3 ORDER BY id`,
    ])
    const items = []
    for (const requested of parsed.items) {
      const product = matchOne(products, requested.product, "product_name", "product_code")
      if (!product) return Response.json({ error: `الصنف "${requested.product}" غير موجود أو الاسم يطابق أكثر من صنف. استخدم رمز الصنف` }, { status: 422 })
      if (!product.unit_id) return Response.json({ error: `لا توجد وحدة معرفة للصنف ${product.product_name}` }, { status: 422 })
      items.push({ product_id: Number(product.id), product_name: product.product_name, quantity: requested.quantity,
        unit_id: Number(product.unit_id), unit_name: product.unit_name, barcode: product.barcode || "",
        price: requested.price ?? Number(product.price || 0), discount: requested.discount ?? 0 })
    }
    const orderDate = /^\d{4}-\d{2}-\d{2}$/.test(parsed.order_date || "") ? parsed.order_date! : today

    if (parsed.intent === "create_sales_draft") {
      const accountTerm = normalize(parsed.customer)
      if (!accountTerm) return Response.json({ error: "اذكر اسم العميل أو رقم حسابه" }, { status: 422 })
      const accounts = await sql`SELECT id,code,name FROM account_tbl WHERE type=2 AND COALESCE(status::text,'1') IN ('1','2','active','ACTIVE','نشط') ORDER BY id`
      const account = matchOne(accounts, accountTerm, "name", "code")
      if (!account) return Response.json({ error: `العميل "${accountTerm}" غير موجود في النظام`, code: "CUSTOMER_NOT_FOUND", customer_name: accountTerm, document_kind: "sales_draft" }, { status: 404 })
      const store = matchOne(warehouses.filter((row: any) => Number(row.branch_id) === branchId), parsed.source_warehouse, "warehouse_name")
        || warehouses.find((row: any) => Number(row.branch_id) === branchId && Number(row.status) === 1 && row.is_active !== false)
      if (!store) return Response.json({ error: "لا يوجد مستودع نشط للفرع الحالي" }, { status: 422 })
      const deliveryDate = /^\d{4}-\d{2}-\d{2}$/.test(parsed.delivery_date || "") ? parsed.delivery_date! : orderDate
      return Response.json({ type: "sales-draft", payload: { account_id: Number(account.id), customer_name: account.name,
        order_date: orderDate, requested_delivery_date: deliveryDate, deposit_amount: parsed.deposit_amount || 0,
        notes: parsed.notes || "", priority: parsed.priority || "normal", attachments: [], created_by: Number(user_id) || null,
        branch_id: branchId, items: items.map(item => ({ ...item, store_id: Number(store.id), specifications: {} })) } })
    }

    const source = matchOne(warehouses.filter((row: any) => Number(row.branch_id) === branchId), parsed.source_warehouse, "warehouse_name")
      || warehouses.find((row: any) => Number(row.branch_id) === branchId && Number(row.status) === 1 && row.is_active !== false)
    const destinationBranch = matchOne(branches, parsed.destination_branch, "branch_name", "branch_code")
    if (!destinationBranch) return Response.json({ error: "اذكر اسم أو رمز الفرع المطلوب منه البضاعة بشكل محدد" }, { status: 422 })
    const destination = matchOne(warehouses.filter((row: any) => Number(row.branch_id) === Number(destinationBranch.id)), parsed.destination_warehouse, "warehouse_name")
    if (!source || !destination) return Response.json({ error: "اذكر مستودع المصدر ومستودع الوجهة بشكل صحيح" }, { status: 422 })
    if (Number(source.id) === Number(destination.id)) return Response.json({ error: "لا يمكن أن يكون مستودع المصدر والوجهة متطابقين" }, { status: 422 })
    return Response.json({ type: "internal-request", payload: { vch_date: orderDate, branch_id: branchId,
      source_warehouse_id: Number(source.id), manufacturing_branch_id: Number(destinationBranch.id), destination_warehouse_id: Number(destination.id),
      note: parsed.notes || "", items: items.map(({ price: _price, discount: _discount, ...item }) => item) } })
  } catch (error) {
    console.error("AI order draft error", error)
    return Response.json({ error: "تعذر تحليل الطلب. اذكر نوع المستند والأصناف والكميات بوضوح" }, { status: 400 })
  }
}
