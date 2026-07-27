import { generateText } from "ai"
import { xai } from "@ai-sdk/xai"
import sql from "@/lib/database"
export async function POST(request: Request) {
  try {
    const { productId, analysisType = "reorder" } = await request.json()

    if (analysisType === "reorder") {
      // Get product details and stock history
      const productData = await sql`
        SELECT 
          p.id,
          p.product_name,
          p.product_code,
          ps.current_stock,
          ps.reorder_level,
          ps.available_stock,
          ps.reserved_stock,
          p.unit_price
        FROM products p
        LEFT JOIN product_stock ps ON p.id = ps.product_id
        WHERE p.id = ${productId}
      `

      if (productData.length === 0) {
        return Response.json({ success: false, error: "المنتج غير موجود" }, { status: 404 })
      }

      // Get sales history for the product
      const salesHistory = await sql`
        SELECT 
          DATE(so.order_date) as date,
          SUM(soi.quantity) as quantity_sold,
          COUNT(DISTINCT so.id) as order_count
        FROM sales_order_items soi
        JOIN sales_orders so ON soi.sales_order_id = so.id
        WHERE soi.product_id = ${productId}
          AND so.order_date >= CURRENT_DATE - INTERVAL '90 days'
        GROUP BY DATE(so.order_date)
        ORDER BY date DESC
      `

      // Get purchase history
      const purchaseHistory = await sql`
        SELECT 
          DATE(po.order_date) as date,
          SUM(poi.quantity) as quantity_purchased,
          AVG(poi.unit_price) as avg_price
        FROM purchase_order_items poi
        JOIN purchase_orders po ON poi.purchase_order_id = po.id
        WHERE poi.product_id = ${productId}
          AND po.order_date >= CURRENT_DATE - INTERVAL '90 days'
        GROUP BY DATE(po.order_date)
        ORDER BY date DESC
      `

      const product = productData[0]

      const prompt = `أنت خبير في إدارة المخزون. قم بتحليل البيانات التالية وقدم توصيات دقيقة:

معلومات المنتج:
- الاسم: ${product.product_name}
- الكود: ${product.product_code}
- المخزون الحالي: ${product.current_stock}
- مستوى إعادة الطلب: ${product.reorder_level}
- المخزون المتاح: ${product.available_stock}
- المخزون المحجوز: ${product.reserved_stock}
- سعر الوحدة: ${product.unit_price}

تاريخ المبيعات (آخر 90 يوم):
${JSON.stringify(salesHistory.slice(0, 30))}

تاريخ المشتريات (آخر 90 يوم):
${JSON.stringify(purchaseHistory.slice(0, 10))}

قدم توصيات تتضمن:
1. الكمية المقترحة لإعادة الطلب
2. التوقيت الأمثل لإعادة الطلب
3. تحليل معدل الاستهلاك
4. تقييم مستوى إعادة الطلب الحالي
5. توصيات لتحسين إدارة المخزون
6. تحذيرات أو ملاحظات مهمة

اكتب التوصيات بالعربية بشكل احترافي ومنظم.`

      const { text } = await generateText({
        model: xai("grok-beta", {
          apiKey: process.env.XAI_API_KEY,
        }),
        prompt,
      })

      return Response.json({
        success: true,
        recommendations: text,
        product,
        salesHistory: salesHistory.slice(0, 30),
        purchaseHistory: purchaseHistory.slice(0, 10),
      })
    } else if (analysisType === "bulk") {
      // Get all products with low stock
      const lowStockProducts = await sql`
        SELECT 
          p.id,
          p.product_name,
          p.product_code,
          ps.current_stock,
          ps.reorder_level,
          ps.available_stock,
          p.unit_price
        FROM products p
        LEFT JOIN product_stock ps ON p.id = ps.product_id
        WHERE ps.current_stock <= ps.reorder_level
        ORDER BY (ps.current_stock - ps.reorder_level) ASC
        LIMIT 20
      `

      const prompt = `أنت خبير في إدارة المخزون. قم بتحليل المنتجات التالية التي وصلت أو اقتربت من مستوى إعادة الطلب:

${JSON.stringify(lowStockProducts)}

قدم:
1. ترتيب الأولويات لإعادة الطلب
2. الكميات المقترحة لكل منتج
3. استراتيجية شاملة لإدارة المخزون
4. توصيات لتحسين مستويات إعادة الطلب
5. تحذيرات حول المنتجات الحرجة

اكتب التوصيات بالعربية بشكل احترافي ومنظم.`

      const { text } = await generateText({
        model: xai("grok-beta", {
          apiKey: process.env.XAI_API_KEY,
        }),
        prompt,
      })

      return Response.json({
        success: true,
        recommendations: text,
        products: lowStockProducts,
      })
    }

    return Response.json({ success: false, error: "نوع التحليل غير صحيح" }, { status: 400 })
  } catch (error) {
    console.error("[v0] AI Recommendations error:", error)
    return Response.json({ success: false, error: "فشل في توليد التوصيات" }, { status: 500 })
  }
}
