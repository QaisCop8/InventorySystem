import { streamText, tool } from "ai"
import { z } from "zod"
import sql from "@/lib/database"
export async function POST(request: Request) {
  try {
    const { messages } = await request.json()

    const result = streamText({
      model: "xai/grok-3",
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

كن دقيقاً، مفيداً، ومحترفاً في إجاباتك.`,
      tools: {
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
                  WHERE order_date >= CURRENT_DATE - INTERVAL '${sql(days.toString())} days'
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
                  WHERE order_date >= CURRENT_DATE - INTERVAL '${sql(days.toString())} days'
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
