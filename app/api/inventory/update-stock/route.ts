import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { checkAndNotifyReorderPoint } from "@/lib/inventory-notifications"

/**
 * POST: Update product stock and check for reorder notifications
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { product_id, quantity_change, transaction_type, notes, reference_type, reference_id } = body

    if (!product_id || quantity_change === undefined) {
      return NextResponse.json(
        {
          success: false,
          message: "يجب تحديد product_id و quantity_change",
        },
        { status: 400 },
      )
    }

    // Start transaction
    // Update product stock
    const updateResult = await sql`
      UPDATE product_stock
      SET 
        current_stock = current_stock + ${quantity_change},
        available_stock = available_stock + ${quantity_change},
        last_updated = NOW()
      WHERE product_id = ${product_id}
      RETURNING *
    `

    if (updateResult.length === 0) {
      // If no stock record exists, create one
      await sql`
        INSERT INTO product_stock (
          product_id,
          current_stock,
          available_stock,
          reserved_stock,
          reorder_level,
          last_updated
        )
        VALUES (
          ${product_id},
          ${Math.max(0, quantity_change)},
          ${Math.max(0, quantity_change)},
          0,
          0,
          NOW()
        )
      `
    }

    // Log the inventory transaction
    await sql`
      INSERT INTO inventory_transactions (
        product_id,
        quantity,
        transaction_type,
        notes,
        reference_type,
        reference_id,
        created_at
      )
      VALUES (
        ${product_id},
        ${quantity_change},
        ${transaction_type || "adjustment"},
        ${notes || null},
        ${reference_type || null},
        ${reference_id || null},
        NOW()
      )
    `

    // This runs asynchronously to not block the response
    checkAndNotifyReorderPoint(product_id).catch((error) => {
      console.error("[v0] Error in background notification check:", error)
    })

    return NextResponse.json({
      success: true,
      message: "تم تحديث المخزون بنجاح",
      updated_stock: updateResult[0] || null,
    })
  } catch (error) {
    console.error("[v0] Error updating stock:", error)
    return NextResponse.json(
      {
        success: false,
        message: "حدث خطأ أثناء تحديث المخزون",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
