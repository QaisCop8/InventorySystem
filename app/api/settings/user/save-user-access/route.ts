import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export default sql

interface AccessPayload {
  userId: number
  accesses: { access_id: number; is_granted: boolean }[]
}

export async function POST(req: NextRequest) {
  try {
    const body: AccessPayload = await req.json()

    if (!body.userId || !Array.isArray(body.accesses)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const { userId, accesses } = body

    // For each access, either insert or update
    for (const access of accesses) {
      await sql`
        INSERT INTO user_access (user_id, access_id, is_granted)
        VALUES (${userId}, ${access.access_id}, ${access.is_granted})
        ON CONFLICT (user_id, access_id) DO UPDATE
        SET is_granted = EXCLUDED.is_granted
      `
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Failed to save user access" }, { status: 500 })
  }
}
