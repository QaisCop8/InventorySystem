import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export default sql

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url)
        const userId = searchParams.get("userId")

        if (!userId) {
            return NextResponse.json({ error: "userId is required" }, { status: 400 })
        }

        // Fetch access_list joined with user_access
        const rows = await sql`
      SELECT 
        al.id AS access_id,
        al.name AS access_name,
        ac.name AS category_name,
        COALESCE(ua.is_granted, FALSE) AS is_granted
      FROM access_list al
      LEFT JOIN access_category ac ON al.category_id = ac.id
      LEFT JOIN user_access ua 
        ON ua.access_id = al.id AND ua.user_id = ${userId}
      ORDER BY ac.id, al.id
    `

        // Normalize rows to plain JS objects
        const data = Array.isArray(rows) ? rows : rows?.rows || []

        return NextResponse.json(data)
    } catch (err) {
        console.error(err)
        return NextResponse.json({ error: "Failed to fetch access" }, { status: 500 })
    }
}
