import { generateText } from "ai"
import OpenAI from "openai";
import sql from "@/lib/database"

export default sql


export async function POST(request: Request) {
  try {
    const { analysisType, timeframe = 30 } = await request.json()

    // Gather data based on analysis type
    let data: any = {}
    let prompt = ""
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY, // make sure this is set in your .env
    });
    if (analysisType === "sales") {
      const salesData = await sql`
        SELECT 
          DATE(order_date) as date,
          COUNT(*) as order_count,
          SUM(total_amount) as total_sales,
          AVG(total_amount) as avg_order_value
        FROM sales_orders
        WHERE order_date >= CURRENT_DATE - INTERVAL '1 day' * ${timeframe}
        GROUP BY DATE(order_date)
        ORDER BY date DESC
      `

      const topProducts = await sql`
        SELECT 
          p.product_name,
          SUM(soi.quantity) as total_quantity,
          SUM(soi.total_price) as total_sales
        FROM sales_order_items soi
        JOIN products p ON soi.product_id = p.id
        JOIN sales_orders so ON soi.sales_order_id = so.id
        WHERE so.order_date >= CURRENT_DATE - INTERVAL '1 day' * ${timeframe}
        GROUP BY p.product_name
        ORDER BY total_sales DESC
        LIMIT 10
      `

      data = { salesData, topProducts }
      prompt = `قم بتحليل بيانات المبيعات التالية وقدم رؤى وتوصيات استراتيجية:

بيانات المبيعات اليومية: ${JSON.stringify(salesData)}
أفضل المنتجات مبيعاً: ${JSON.stringify(topProducts)}

قدم تحليلاً شاملاً يتضمن:
1. الاتجاهات العامة للمبيعات
2. الأنماط الملحوظة
3. نقاط القوة والضعف
4. توصيات لتحسين المبيعات
5. تنبؤات قصيرة المدى

اكتب التحليل بالعربية بشكل احترافي ومنظم.`
    } else if (analysisType === "inventory") {
      const inventoryData = await sql`
        SELECT 
          p.product_name,
          p.product_code,
          ps.current_stock,
          ps.reorder_level,
          ps.available_stock,
          ps.reserved_stock
        FROM products p
        LEFT JOIN product_stock ps ON p.id = ps.product_id
        WHERE ps.current_stock IS NOT NULL
        ORDER BY ps.current_stock ASC
        LIMIT 50
      `

      const lowStockCount = await sql`
        SELECT COUNT(*) as count
        FROM product_stock
        WHERE current_stock <= reorder_level AND current_stock > 0
      `

      const outOfStockCount = await sql`
        SELECT COUNT(*) as count
        FROM product_stock
        WHERE current_stock <= 0
      `

      data = { inventoryData, lowStockCount: lowStockCount[0].count, outOfStockCount: outOfStockCount[0].count }
      prompt = `قم بتحليل بيانات المخزون التالية وقدم رؤى وتوصيات:

بيانات المخزون: ${JSON.stringify(inventoryData.slice(0, 20))}
عدد المنتجات منخفضة المخزون: ${lowStockCount[0].count}
عدد المنتجات نفذت من المخزون: ${outOfStockCount[0].count}

قدم تحليلاً يتضمن:
1. تقييم الوضع العام للمخزون
2. المنتجات التي تحتاج اهتمام فوري
3. توصيات لتحسين إدارة المخزون
4. استراتيجيات لتجنب نفاذ المخزون
5. تحسينات مقترحة لمستويات إعادة الطلب

اكتب التحليل بالعربية بشكل احترافي ومنظم.`
    } else if (analysisType === "customers") {
      const customerData = await sql`
        SELECT 
          c.name,
          COUNT(DISTINCT so.id) as order_count,
          SUM(so.total_amount) as total_spent,
          MAX(so.order_date) as last_order_date
        FROM customers c
        LEFT JOIN sales_orders so ON c.id = so.customer_id
        WHERE so.order_date >= CURRENT_DATE - INTERVAL '1 day' * ${timeframe}
        GROUP BY c.id, c.name
        ORDER BY total_spent DESC
        LIMIT 20
      `

      const newCustomers = await sql`
        SELECT COUNT(*) as count
        FROM customers
        WHERE created_at >= CURRENT_DATE - INTERVAL '1 day' * ${timeframe}
      `

      data = { customerData, newCustomers: newCustomers[0].count }
      prompt = `قم بتحليل بيانات العملاء التالية وقدم رؤى وتوصيات:

بيانات أفضل العملاء: ${JSON.stringify(customerData)}
عدد العملاء الجدد: ${newCustomers[0].count}

قدم تحليلاً يتضمن:
1. تقييم قاعدة العملاء
2. أنماط الشراء للعملاء الرئيسيين
3. فرص زيادة المبيعات
4. استراتيجيات للاحتفاظ بالعملاء
5. توصيات لجذب عملاء جدد

اكتب التحليل بالعربية بشكل احترافي ومنظم.`
    } else if (analysisType === "workflow") {
      const workflowData = await sql`
        SELECT 
          ws.stage_name,
          COUNT(*) as order_count,
          AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ows.stage_start_time))/3600) as avg_hours_in_stage,
          SUM(CASE WHEN ows.is_overdue THEN 1 ELSE 0 END) as overdue_count
        FROM order_workflow_status ows
        JOIN workflow_stages ws ON ows.current_stage_id = ws.id
        GROUP BY ws.stage_name
        ORDER BY order_count DESC
      `

      data = { workflowData }
      prompt = `قم بتحليل بيانات سير العمل التالية وقدم رؤى وتوصيات:

بيانات مراحل سير العمل: ${JSON.stringify(workflowData)}

قدم تحليلاً يتضمن:
1. تقييم كفاءة سير العمل
2. المراحل التي تحتاج تحسين
3. الاختناقات المحتملة
4. توصيات لتسريع العمليات
5. استراتيجيات لتقليل التأخيرات

اكتب التحليل بالعربية بشكل احترافي ومنظم.`
    }

    // Generate AI insights
    /*const { text } = await generateText({
      model: "xai/grok-3",
      prompt,
    })*/

    async function generateText(prompt: string) {
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
      });

      return response.choices[0].message?.content;
    }

    // Usage
    const text = await generateText("Hello, write a story.");
    console.log(text);
  }

catch (error) {
  console.error("[v0] AI Analytics error:", error)
  return Response.json({ success: false, error: "فشل في توليد التحليل" }, { status: 500 })
}
}
