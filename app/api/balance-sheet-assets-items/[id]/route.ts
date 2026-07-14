import { type NextRequest, NextResponse } from "next/server"
import { getUserPermissions } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: "معرف المستخدم مطلوب" }, { status: 400 })
    }

    const permissions = await getUserPermissions(userId)

    return NextResponse.json({ permissions })
  } catch (error) {
    console.error("Permissions API error:", error)
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 })
  }
}

