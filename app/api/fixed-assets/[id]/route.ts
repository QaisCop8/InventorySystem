import { NextRequest, NextResponse } from "next/server"
import { deleteFixedAsset, ensureTables, getFixedAssetById, updateFixedAsset } from "../_lib"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureTables()
    const { id } = await params
    const item = await getFixedAssetById(Number(id))
    if (!item) {
      return NextResponse.json({ error: "الأصل الثابت غير موجود" }, { status: 404 })
    }
    return NextResponse.json(item)
  } catch (error) {
    console.error("Error fetching fixed asset:", error)
    return NextResponse.json({ error: "Failed to fetch fixed asset" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureTables()
    const { id } = await params
    const body = await request.json()

    const updated = await updateFixedAsset(Number(id), body)
    return NextResponse.json(updated)
  } catch (error: any) {
    console.error("Error updating fixed asset:", error)
    return NextResponse.json({ error: error?.message || "Failed to update fixed asset" }, { status: 400 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureTables()
    const { id } = await params
    const deleted = await deleteFixedAsset(Number(id))
    if (!deleted) {
      return NextResponse.json({ error: "الأصل الثابت غير موجود" }, { status: 404 })
    }
    return NextResponse.json({ success: true, id: Number(id) })
  } catch (error) {
    console.error("Error deleting fixed asset:", error)
    return NextResponse.json({ error: "Failed to delete fixed asset" }, { status: 500 })
  }
}
