import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { getLotStatistics, updateExpiredLots } from "@/lib/lot-management"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const includeExpired = searchParams.get("include_expired") === "true"

    console.log("[v0] Starting batch summary fetch...")

    // Update expired lots first
    await updateExpiredLots()

    // Get basic statistics
    const stats = await getLotStatistics()

    // Get detailed breakdown by product
    const productBreakdown = await sql`
      SELECT 
        p.id as product_id,
        p.product_name,
        p.product_code,
        COUNT(pl.id) as total_lots,
        COUNT(CASE WHEN pl.status = 'new' THEN 1 END) as new_lots,
        COUNT(CASE WHEN pl.status = 'in_use' THEN 1 END) as in_use_lots,
        COUNT(CASE WHEN pl.status = 'finished' THEN 1 END) as finished_lots,
        COUNT(CASE WHEN pl.status = 'damaged' THEN 1 END) as damaged_lots,
        COALESCE(SUM(CASE WHEN pl.status IN ('new', 'in_use') THEN pl.current_quantity END), 0) as total_quantity,
        COALESCE(SUM(CASE WHEN pl.status IN ('new', 'in_use') THEN pl.available_quantity END), 0) as available_quantity,
        COALESCE(SUM(CASE WHEN pl.status IN ('new', 'in_use') THEN pl.current_quantity * pl.unit_cost END), 0) as total_value
      FROM products p
      LEFT JOIN product_lots pl ON p.id = pl.product_id
      WHERE p.has_batch = true
        AND (${includeExpired} OR pl.status != 'damaged' OR pl.status IS NULL)
      GROUP BY p.id, p.product_name, p.product_code
      HAVING COUNT(pl.id) > 0
      ORDER BY total_value DESC
    `

    const expiryBreakdown = await sql`
      SELECT 
        expiry_status,
        COUNT(*) as lot_count,
        COALESCE(SUM(current_quantity), 0) as total_quantity,
        COALESCE(SUM(total_value), 0) as total_value
      FROM lot_inventory_report
      WHERE status IN ('new', 'in_use')
      GROUP BY expiry_status
      ORDER BY 
        CASE 
          WHEN expiry_status = 'expired' THEN 1
          WHEN expiry_status = 'expiring_soon' THEN 2
          WHEN expiry_status = 'valid' THEN 3
          ELSE 4
        END
    `

    // Get recent movements summary
    const recentMovements = await sql`
      SELECT 
        lt.transaction_type,
        COUNT(*) as movement_count,
        COALESCE(SUM(lt.quantity), 0) as total_quantity,
        COALESCE(SUM(lt.quantity * COALESCE(lt.unit_cost, 0)), 0) as total_value
      FROM lot_transactions lt
      WHERE lt.created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY lt.transaction_type
      ORDER BY movement_count DESC
    `

    console.log("[v0] Batch summary fetch completed successfully")

    return NextResponse.json({
      statistics: stats,
      product_breakdown: productBreakdown,
      expiry_breakdown: expiryBreakdown,
      recent_movements: recentMovements,
      generated_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Error fetching batch summary:", error)
    return NextResponse.json({ error: "فشل في تحميل ملخص الدفعات" }, { status: 500 })
  }
}
