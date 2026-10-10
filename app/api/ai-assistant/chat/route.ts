import { stepCountIs, streamText, tool } from "ai"
import { google } from "@ai-sdk/google"
import { z } from "zod"
import sql from "@/lib/database"
export async function POST(request: Request) {
  try {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return new Response("لم يتم إعداد GOOGLE_GENERATIVE_AI_API_KEY للمساعد الذكي", { status: 503 })
    }
    const { messages } = await request.json()

    const result = streamText({
      model: google("gemini-2.5-flash"),
      messages,
      system: `أنت مساعد ذكي لنظام ERP عربي متقدم. اسمك "مساعد النظام الذكي".

مهامك:
- الإجابة على أسئلة المستخدمين بالعربية بشكل واضح ومفيد
- مساعدة المستخدمين في فهم واستخدام ميزات النظام
- تحليل البيانات وتقديم رؤى وتوصيات
- البحث في قاعدة البيانات للإجابة على الأسئلة
- تقديم تقارير وإحصائيات فورية

النظام يحتوي على:
- إدارة المنتجات والمخزون
- إدارة العملاء والموردين
- طلبيات المبيعات والمشتريات
- نظام سير العمل (Workflow)
- نظام الإشعارات (WhatsApp/SMS)
- بوابة العملاء
- التقارير والإحصائيات

المبيعات الفعلية مسجّلة كفواتير مبيعات (ومرتجعات مبيعات) — لأي سؤال عن المبيعات أو الإيرادات أو ملخصها أو أفضل
الأصناف/العملاء مبيعاً استخدم الأداة getSalesSummary (وليس getOrdersStats التي تخص الطلبيات فقط).
اعرض الأرقام منسقة بفواصل الآلاف وخانتين عشريتين، ورتّب الملخص بعناوين قصيرة ونقاط. لا تخترع أرقاماً غير موجودة في نتائج الأدوات.
كن دقيقاً، مفيداً، ومحترفاً في إجاباتك.`,
      // AI SDK 6 يتوقف افتراضياً بعد أول خطوة — أي بعد استدعاء الأداة دون كتابة الرد؛ نسمح بخطوات لصياغة الإجابة
      stopWhen: stepCountIs(5),
      tools: {
        getSalesSummary: tool({
          description: "ملخص المبيعات الفعلية (فواتير المبيعات ونقاط البيع ومرتجعات المبيعات) لفترة: الإجمالي، الصافي، عدد الفواتير، المتوسط، أفضل الأصناف والعملاء والأيام",
          inputSchema: z.object({
            days: z.number().optional().describe("عدد الأيام الأخيرة (افتراضي 30) — يُتجاهل إن حُدد from_date"),
            from_date: z.string().optional().describe("من تاريخ YYYY-MM-DD"),
            to_date: z.string().optional().describe("إلى تاريخ YYYY-MM-DD (افتراضي اليوم)"),
          }),
          execute: async ({ days = 30, from_date, to_date }) => {
            try {
              const iso = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null)
              const to = iso(to_date) || new Date().toISOString().slice(0, 10)
              const from = iso(from_date) || new Date(Date.parse(to) - (Math.max(1, Math.floor(Number(days) || 30)) - 1) * 86_400_000).toISOString().slice(0, 10)
              // 12 = فاتورة مبيعات (تشمل نقاط البيع)، 16 = مرتجع مبيعات — المبالغ بعملة الأساس (amount × rate)
              const totals = await sql`
                SELECT vch_type, COUNT(*)::int AS count, COALESCE(SUM(amount * COALESCE(NULLIF(rate, 0), 1)), 0)::float AS total,
                  COUNT(*) FILTER (WHERE pos_point_id IS NOT NULL)::int AS pos_count
                FROM voucher_header_tbl
                WHERE vch_type IN (12, 16) AND status <> 3 AND vch_date::date BETWEEN ${from}::date AND ${to}::date
                GROUP BY vch_type
              `
              const row = (type: number) => (totals as any[]).find((item) => Number(item.vch_type) === type) || { count: 0, total: 0, pos_count: 0 }
              const sales = row(12)
              const returns = row(16)
              const [topProducts, topCustomers, topDays] = await Promise.all([
                sql`
                  SELECT COALESCE(p.product_name, i.item_name, 'صنف') AS name, p.product_code AS code,
                    SUM(i.qnty)::float AS quantity,
                    SUM((COALESCE(i.qnty, 0) * COALESCE(i.price, 0) - COALESCE(i.discount, 0)) * COALESCE(NULLIF(h.rate, 0), 1))::float AS value
                  FROM voucher_items_tbl i
                  JOIN voucher_header_tbl h ON h.id = i.voucher_id
                  LEFT JOIN products p ON p.id = i.item_id
                  WHERE h.vch_type = 12 AND h.status <> 3 AND h.vch_date::date BETWEEN ${from}::date AND ${to}::date
                  GROUP BY 1, 2 ORDER BY value DESC NULLS LAST LIMIT 5
                `,
                sql`
                  SELECT COALESCE(NULLIF(h.customer_name, ''), a.name, 'زبون نقدي') AS name, COUNT(*)::int AS invoices,
                    SUM(h.amount * COALESCE(NULLIF(h.rate, 0), 1))::float AS total
                  FROM voucher_header_tbl h
                  LEFT JOIN account_tbl a ON a.id = h.account_id
                  WHERE h.vch_type = 12 AND h.status <> 3 AND h.vch_date::date BETWEEN ${from}::date AND ${to}::date
                  GROUP BY 1 ORDER BY total DESC NULLS LAST LIMIT 5
                `,
                sql`
                  SELECT h.vch_date::date::text AS day, COUNT(*)::int AS invoices, SUM(h.amount * COALESCE(NULLIF(h.rate, 0), 1))::float AS total
                  FROM voucher_header_tbl h
                  WHERE h.vch_type = 12 AND h.status <> 3 AND h.vch_date::date BETWEEN ${from}::date AND ${to}::date
                  GROUP BY 1 ORDER BY total DESC NULLS LAST LIMIT 3
                `,
              ])
              const round = (value: number) => Math.round(Number(value || 0) * 100) / 100
              const periodDays = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1
              return {
                period: { from, to, days: periodDays },
                sales: { invoices: sales.count, pos_invoices: sales.pos_count, total: round(sales.total), average_invoice: sales.count ? round(sales.total / sales.count) : 0 },
                returns: { count: returns.count, total: round(returns.total) },
                net_sales: round(sales.total - returns.total),
                daily_average: round((sales.total - returns.total) / Math.max(1, periodDays)),
                top_products: (topProducts as any[]).map((item) => ({ ...item, quantity: round(item.quantity), value: round(item.value) })),
                top_customers: (topCustomers as any[]).map((item) => ({ ...item, total: round(item.total) })),
                best_days: (topDays as any[]).map((item) => ({ ...item, total: round(item.total) })),
                currency_note: "المبالغ بعملة الأساس",
              }
            } catch (error) {
              console.error("[ai] Error getting sales summary:", error)
              return { error: "فشل في جلب ملخص المبيعات" }
            }
          },
        }),

        getOrdersStats: tool({
          description: "الحصول على إحصائيات الطلبيات (المبيعات والمشتريات)",
          inputSchema: z.object({
            orderType: z.enum(["sales", "purchase", "both"]).optional().describe("نوع الطلبيات"),
            days: z.number().optional().describe("عدد الأيام للتحليل (افتراضي 30)"),
          }),
          execute: async ({ orderType = "both", days = 30 }) => {
            try {
              const results: any = {}

              if (orderType === "sales" || orderType === "both") {
                const salesStats = await sql`
                  SELECT 
                    COUNT(*) as total_orders,
                    SUM(total_amount) as total_amount,
                    AVG(total_amount) as avg_amount,
                    COUNT(DISTINCT customer_id) as unique_customers
                  FROM sales_orders
                  WHERE order_date >= CURRENT_DATE - ${Math.max(1, Math.floor(Number(days) || 30))}::int
                `
                results.sales = salesStats[0]
              }

              if (orderType === "purchase" || orderType === "both") {
                const purchaseStats = await sql`
                  SELECT 
                    COUNT(*) as total_orders,
                    SUM(total_amount) as total_amount,
                    AVG(total_amount) as avg_amount,
                    COUNT(DISTINCT supplier_id) as unique_suppliers
                  FROM purchase_orders
                  WHERE order_date >= CURRENT_DATE - ${Math.max(1, Math.floor(Number(days) || 30))}::int
                `
                results.purchase = purchaseStats[0]
              }

              return results
            } catch (error) {
              console.error("[v0] Error getting orders stats:", error)
              return { error: "فشل في جلب إحصائيات الطلبيات" }
            }
          },
        }),

        getInventoryStatus: tool({
          description: "الحصول على حالة المخزون والمنتجات",
          inputSchema: z.object({
            status: z.enum(["low", "out", "all"]).optional().describe("حالة المخزون"),
          }),
          execute: async ({ status = "all" }) => {
            try {
              let results

              if (status === "low") {
                results = await sql`
                  SELECT 
                    p.product_name,
                    p.product_code,
                    ps.current_stock,
                    ps.reorder_level,
                    ps.available_stock,
                    ps.reserved_stock
                  FROM products p
                  LEFT JOIN product_stock ps ON p.id = ps.product_id
                  WHERE ps.current_stock <= ps.reorder_level AND ps.current_stock > 0
                  ORDER BY ps.current_stock ASC 
                  LIMIT 20
                `
              } else if (status === "out") {
                results = await sql`
                  SELECT 
                    p.product_name,
                    p.product_code,
                    ps.current_stock,
                    ps.reorder_level,
                    ps.available_stock,
                    ps.reserved_stock
                  FROM products p
                  LEFT JOIN product_stock ps ON p.id = ps.product_id
                  WHERE ps.current_stock <= 0
                  ORDER BY ps.current_stock ASC 
                  LIMIT 20
                `
              } else {
                results = await sql`
                  SELECT 
                    p.product_name,
                    p.product_code,
                    ps.current_stock,
                    ps.reorder_level,
                    ps.available_stock,
                    ps.reserved_stock
                  FROM products p
                  LEFT JOIN product_stock ps ON p.id = ps.product_id
                  ORDER BY ps.current_stock ASC 
                  LIMIT 20
                `
              }

              return results
            } catch (error) {
              console.error("[v0] Error getting inventory status:", error)
              return { error: "فشل في جلب حالة المخزون" }
            }
          },
        }),

        getTopProducts: tool({
          description: "الحصول على أفضل المنتجات مبيعاً",
          inputSchema: z.object({
            limit: z.number().optional().describe("عدد المنتجات (افتراضي 10)"),
            days: z.number().optional().describe("عدد الأيام للتحليل (افتراضي 30)"),
          }),
          execute: async ({ limit = 10, days = 30 }) => {
            try {
              const results = await sql`
                SELECT 
                  p.product_name,
                  p.product_code,
                  SUM(soi.quantity) as total_quantity,
                  SUM(soi.total_price) as total_sales,
                  COUNT(DISTINCT soi.sales_order_id) as order_count
                FROM sales_order_items soi
                JOIN products p ON soi.product_id = p.id
                JOIN sales_orders so ON soi.sales_order_id = so.id
                WHERE so.order_date >= CURRENT_DATE - INTERVAL '${sql(days.toString())} days'
                GROUP BY p.id, p.product_name, p.product_code
                ORDER BY total_sales DESC
                LIMIT ${limit}
              `
              return results
            } catch (error) {
              console.error("[v0] Error getting top products:", error)
              return { error: "فشل في جلب أفضل المنتجات" }
            }
          },
        }),

        getCustomerInfo: tool({
          description: "الحصول على معلومات عميل محدد",
          inputSchema: z.object({
            searchTerm: z.string().describe("اسم العميل أو رقمه أو كوده"),
          }),
          execute: async ({ searchTerm }) => {
            try {
              const results = await sql`
                SELECT 
                  c.*,
                  COUNT(DISTINCT so.id) as total_orders,
                  SUM(so.total_amount) as total_spent
                FROM customers c
                LEFT JOIN sales_orders so ON c.id = so.customer_id
                WHERE 
                  c.name ILIKE ${"%" + searchTerm + "%"}
                  OR c.customer_code ILIKE ${"%" + searchTerm + "%"}
                  OR c.mobile1 ILIKE ${"%" + searchTerm + "%"}
                GROUP BY c.id
                LIMIT 5
              `
              return results
            } catch (error) {
              console.error("[v0] Error getting customer info:", error)
              return { error: "فشل في جلب معلومات العميل" }
            }
          },
        }),

        getWorkflowStatus: tool({
          description: "الحصول على حالة سير العمل للطلبيات",
          inputSchema: z.object({
            orderType: z.enum(["sales", "purchase"]).optional(),
          }),
          execute: async ({ orderType }) => {
            try {
              let results

              if (orderType) {
                results = await sql`
                  SELECT 
                    ows.order_number,
                    ows.order_type,
                    ws.stage_name,
                    ows.assigned_to_department,
                    ows.stage_start_time,
                    ows.is_overdue,
                    ows.priority_level
                  FROM order_workflow_status ows
                  JOIN workflow_stages ws ON ows.current_stage_id = ws.id
                  WHERE ows.order_type = ${orderType}
                  ORDER BY ows.stage_start_time DESC
                  LIMIT 20
                `
              } else {
                results = await sql`
                  SELECT 
                    ows.order_number,
                    ows.order_type,
                    ws.stage_name,
                    ows.assigned_to_department,
                    ows.stage_start_time,
                    ows.is_overdue,
                    ows.priority_level
                  FROM order_workflow_status ows
                  JOIN workflow_stages ws ON ows.current_stage_id = ws.id
                  ORDER BY ows.stage_start_time DESC
                  LIMIT 20
                `
              }

              return results
            } catch (error) {
              console.error("[v0] Error getting workflow status:", error)
              return { error: "فشل في جلب حالة سير العمل" }
            }
          },
        }),

        searchProducts: tool({
          description: "البحث عن منتجات",
          inputSchema: z.object({
            searchTerm: z.string().describe("كلمة البحث"),
          }),
          execute: async ({ searchTerm }) => {
            try {
              const results = await sql`
                SELECT 
                  p.*,
                  ps.current_stock,
                  ps.available_stock
                FROM products p
                LEFT JOIN product_stock ps ON p.id = ps.product_id
                WHERE 
                  p.product_name ILIKE ${"%" + searchTerm + "%"}
                  OR p.product_code ILIKE ${"%" + searchTerm + "%"}
                  OR p.barcode ILIKE ${"%" + searchTerm + "%"}
                LIMIT 10
              `
              return results
            } catch (error) {
              console.error("[v0] Error searching products:", error)
              return { error: "فشل في البحث عن المنتجات" }
            }
          },
        }),
      },
    })

    return result.toTextStreamResponse()
  } catch (error) {
    console.error("[v0] AI Assistant error:", error)
    return new Response("فشل في معالجة الطلب", { status: 500 })
  }
}
