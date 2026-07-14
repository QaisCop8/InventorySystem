import { type NextRequest, NextResponse } from "next/server"
import { getAvailableBatches, calculateFIFOAllocation, reserveBatches } from "@/lib/batch-utils"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get("product_id")
    const requestedQuantity = Number(searchParams.get("quantity")) || 0

    if (!productId) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 })
    }

    const lots = await getAvailableBatches(Number(productId))

    if (requestedQuantity > 0) {
      const allocation = await calculateFIFOAllocation(Number(productId), requestedQuantity)
      return NextResponse.json({
        lots,
        allocation,
        totalAvailable: lots.reduce((sum, lot) => sum + lot.availableQuantity, 0),
      })
    }

    return NextResponse.json({
      lots,
      totalAvailable: lots.reduce((sum, lot) => sum + lot.availableQuantity, 0),
    })
  } catch (error) {
    console.error("[v0] Error fetching available lots:", error)
    return NextResponse.json({ error: "Failed to fetch available lots" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { product_id, quantity, sales_order_id, created_by } = await request.json()

    if (!product_id || !quantity) {
      return NextResponse.json({ error: "Product ID and quantity are required" }, { status: 400 })
    }

    const allocation = await calculateFIFOAllocation(product_id, quantity)

    if (!allocation.canFulfill) {
      return NextResponse.json(
        {
          error: "Insufficient stock",
          available: allocation.totalAllocated,
          needed: quantity,
        },
        { status: 400 },
      )
    }

    await reserveBatches(allocation.allocations, "sales_order", sales_order_id, created_by || "system")

    return NextResponse.json({
      success: true,
      reservations: allocation.allocations,
      message: "Lots reserved successfully using FIFO method",
    })
  } catch (error) {
    console.error("[v0] Error reserving lots:", error)
    return NextResponse.json({ error: "Failed to reserve lots" }, { status: 500 })
  }
}

