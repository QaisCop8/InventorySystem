import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] Search API called")
    const { query } = await request.json()
    console.log("[v0] Search query:", query)

    if (!query || query.trim().length < 2) {
      console.log("[v0] Query too short, returning empty results")
      return NextResponse.json({ results: [] })
    }

    const searchTerm = `%${query.trim()}%`
    const results = []

    console.log("[v0] Searching with term:", searchTerm)

    // البحث في العملاء
    try {
      const customers = await sql`
        SELECT id, customer_name as title, 
               COALESCE(email, mobile1, city) as description,
               'customer' as type,
               customer_code, email, mobile1, city
        FROM customers 
        WHERE customer_name ILIKE ${searchTerm} 
           OR customer_code ILIKE ${searchTerm}
           OR email ILIKE ${searchTerm}
           OR mobile1 ILIKE ${searchTerm}
           OR city ILIKE ${searchTerm}
        LIMIT 5
      `
      console.log("[v0] Found customers:", customers.length)

      customers.forEach((customer) => {
        results.push({
          id: `customer-${customer.id}`,
          title: customer.title,
          description: `${customer.customer_code} - ${customer.description}`,
          type: "customer",
          url: `/customers?id=${customer.id}`,
          metadata: {
            "كود العميل": customer.customer_code,
            المدينة: customer.city,
          },
        })
      })
    } catch (error) {
      console.error("[v0] Error searching customers:", error)
    }

    // البحث في الموردين
    try {
      const suppliers = await sql`
        SELECT id, supplier_name as title,
               COALESCE(email, mobile1, city) as description,
               'supplier' as type,
               supplier_code, email, mobile1, city
        FROM suppliers 
        WHERE supplier_name ILIKE ${searchTerm}
           OR supplier_code ILIKE ${searchTerm}
           OR email ILIKE ${searchTerm}
           OR mobile1 ILIKE ${searchTerm}
           OR city ILIKE ${searchTerm}
        LIMIT 5
      `
      console.log("[v0] Found suppliers:", suppliers.length)

      suppliers.forEach((supplier) => {
        results.push({
          id: `supplier-${supplier.id}`,
          title: supplier.title,
          description: `${supplier.supplier_code} - ${supplier.description}`,
          type: "supplier",
          url: `/suppliers?id=${supplier.id}`,
          metadata: {
            "كود المورد": supplier.supplier_code,
            المدينة: supplier.city,
          },
        })
      })
    } catch (error) {
      console.error("[v0] Error searching suppliers:", error)
    }

    // البحث في المنتجات
    try {
      const products = await sql`
        SELECT id, product_name as title,
               COALESCE(description, category) as description,
               'product' as type,
               product_code, category, last_purchase_price, currency
        FROM products 
        WHERE product_name ILIKE ${searchTerm}
           OR product_code ILIKE ${searchTerm}
           OR barcode ILIKE ${searchTerm}
           OR description ILIKE ${searchTerm}
           OR category ILIKE ${searchTerm}
        LIMIT 5
      `
      console.log("[v0] Found products:", products.length)

      products.forEach((product) => {
        results.push({
          id: `product-${product.id}`,
          title: product.title,
          description: `${product.product_code} - ${product.description}`,
          type: "product",
          url: `/products?id=${product.id}`,
          metadata: {
            "كود المنتج": product.product_code,
            السعر: `${product.last_purchase_price} ${product.currency}`,
          },
        })
      })
    } catch (error) {
      console.error("[v0] Error searching products:", error)
    }

    // البحث في طلبيات المبيعات
    try {
      const salesOrders = await sql`
        SELECT id, order_number as title,
               customer_name as description,
               'sales_order' as type,
               customer_name, total_amount, currency_code, order_status
        FROM sales_orders 
        WHERE order_number ILIKE ${searchTerm}
           OR customer_name ILIKE ${searchTerm}
           OR notes ILIKE ${searchTerm}
        LIMIT 5
      `
      console.log("[v0] Found sales orders:", salesOrders.length)

      salesOrders.forEach((order) => {
        results.push({
          id: `sales-order-${order.id}`,
          title: order.title,
          description: `${order.description} - ${order.order_status}`,
          type: "sales_order",
          url: `/orders/sales?id=${order.id}`,
          metadata: {
            العميل: order.customer_name,
            المبلغ: `${order.total_amount} ${order.currency_code}`,
          },
        })
      })
    } catch (error) {
      console.error("[v0] Error searching sales orders:", error)
    }

    // البحث في طلبيات الشراء
    try {
      const purchaseOrders = await sql`
        SELECT id, order_number as title,
               supplier_name as description,
               'purchase_order' as type,
               supplier_name, total_amount, currency_code, workflow_status
        FROM purchase_orders 
        WHERE order_number ILIKE ${searchTerm}
           OR supplier_name ILIKE ${searchTerm}
           OR notes ILIKE ${searchTerm}
        LIMIT 5
      `
      console.log("[v0] Found purchase orders:", purchaseOrders.length)

      purchaseOrders.forEach((order) => {
        results.push({
          id: `purchase-order-${order.id}`,
          title: order.title,
          description: `${order.description} - ${order.workflow_status}`,
          type: "purchase_order",
          url: `/orders/purchase?id=${order.id}`,
          metadata: {
            المورد: order.supplier_name,
            المبلغ: `${order.total_amount} ${order.currency_code}`,
          },
        })
      })
    } catch (error) {
      console.error("[v0] Error searching purchase orders:", error)
    }

    console.log("[v0] Total results found:", results.length)
    return NextResponse.json({
      results: results.slice(0, 20),
      total: results.length,
    })
  } catch (error) {
    console.error("[v0] Search API error:", error)
    return NextResponse.json(
      {
        error: "حدث خطأ أثناء البحث",
        results: [],
      },
      { status: 500 },
    )
  }
}



