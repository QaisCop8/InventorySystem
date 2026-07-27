import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export async function POST(request: NextRequest) {
  try {
    // Get system settings
    const settingsResult = await sql`
      SELECT setting_key, setting_value 
      FROM general_settings 
      WHERE category = 'reorder_system'
    `

    const settings = settingsResult.reduce((acc: any, setting: any) => {
      acc[setting.setting_key] = setting.setting_value
      return acc
    }, {})

    if (!settings.enabled || settings.enabled === "false") {
      return NextResponse.json({ error: "نظام إعادة الطلب التلقائي غير مفعل" }, { status: 400 })
    }

    // Get active reorder rules with low stock products
    const reorderCandidates = await sql`
      SELECT 
        rr.*,
        p.product_name,
        p.product_code,
        p.last_purchase_price,
        COALESCE(ps.current_stock, 0) as current_stock,
        s.supplier_name
      FROM reorder_rules rr
      JOIN products p ON rr.product_id = p.id
      LEFT JOIN product_stock ps ON p.id = ps.product_id
      LEFT JOIN suppliers s ON rr.supplier_id = s.id
      WHERE 
        rr.is_active = true
        AND p.status = 'نشط'
        AND COALESCE(ps.current_stock, 0) <= rr.reorder_point
    `

    const checkedCount = reorderCandidates.length
    let createdCount = 0

    for (const candidate of reorderCandidates) {
      try {
        // Check if there's already a pending purchase order for this product
        const existingPO = await sql`
          SELECT po.id 
          FROM purchase_orders po
          JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
          WHERE poi.product_id = ${candidate.product_id}
          AND po.workflow_status = 'pending'
          AND po.created_at > NOW() - INTERVAL '7 days'
        `

        if (existingPO.length > 0) {
          continue // Skip if there's already a pending order
        }

        if (candidate.auto_create_po && settings.auto_create_purchase_orders === "true") {
          // Create automatic purchase order
          const orderNumber = `AUTO-${Date.now()}-${candidate.product_id}`

          const newPO = await sql`
            INSERT INTO purchase_orders (
              order_number, order_date, supplier_id, supplier_name,
              total_amount, currency_name, currency_code, exchange_rate,
              workflow_status, notes, created_at
            )
            VALUES (
              ${orderNumber}, CURRENT_DATE, ${candidate.supplier_id}, ${candidate.supplier_name},
              ${candidate.reorder_quantity * candidate.last_purchase_price}, 'ريال سعودي', 'SAR', 1.0,
              'pending', 'طلبية تلقائية من نظام إعادة الطلب', NOW()
            )
            RETURNING id
          `

          // Add order item
          await sql`
            INSERT INTO purchase_order_items (
              purchase_order_id, product_id, product_code, product_name,
              quantity, unit_price, total_price, unit, created_at
            )
            VALUES (
              ${newPO[0].id}, ${candidate.product_id}, ${candidate.product_code}, ${candidate.product_name},
              ${candidate.reorder_quantity}, ${candidate.last_purchase_price}, 
              ${candidate.reorder_quantity * candidate.last_purchase_price}, 'قطعة', NOW()
            )
          `

          createdCount++
        }

        // Create notification if enabled
        if (candidate.notification_enabled) {
          await sql`
            INSERT INTO notifications (
              title, message, notification_type, priority_level,
              related_order_type, recipient_role, created_at
            )
            VALUES (
              'تنبيه: مخزون منخفض', 
              'المنتج ${candidate.product_name} (${candidate.product_code}) وصل لنقطة إعادة الطلب. المخزون الحالي: ${candidate.current_stock}',
              'stock_alert', 'high', 'reorder', 'admin', NOW()
            )
          `
        }

        // Update last triggered time
        await sql`
          UPDATE reorder_rules 
          SET last_triggered = NOW() 
          WHERE id = ${candidate.id}
        `
      } catch (itemError) {
        console.error(`Error processing reorder for product ${candidate.product_id}:`, itemError)
      }
    }

    return NextResponse.json({
      success: true,
      checked: checkedCount,
      created: createdCount,
      message: `تم فحص ${checkedCount} منتج وإنشاء ${createdCount} طلبية جديدة`,
    })
  } catch (error) {
    console.error("Error running reorder check:", error)
    return NextResponse.json({ error: "فشل في تشغيل فحص إعادة الطلب" }, { status: 500 })
  }
}
