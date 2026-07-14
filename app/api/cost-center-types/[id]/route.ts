import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

import { Pool } from "pg"

let sql: any = null

try {
  if (!process.env.DATABASE_URL) {
    console.error("[v0] DATABASE_URL environment variable is not set")
  } else {
    const dbUrl = process.env.DATABASE_URL

    if (dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1")) {
      const pool = new Pool({ connectionString: dbUrl })
      sql = async (strings: TemplateStringsArray, ...values: any[]) => {
        const client = await pool.connect()
        try {
          const query =
            strings.reduce(
              (prev, curr, i) =>
                prev + curr + (i < values.length ? `$${i + 1}` : ""),
              ""
            )
          const result = await client.query(query, values)
          return result.rows
        } finally {
          client.release()
        }
      }
    } else {
      console.log("[v0] Using Neon serverless client")
      sql = neon(dbUrl)
    }

    console.log("[v0] Database client initialized successfully")
  }
} catch (error) {
  console.error("[v0] Failed to initialize DB client:", error)
  sql = null
}

export default sql

export async function GET() {
  try {
    const cities = await sql`
      SELECT * FROM cities
      ORDER BY name
    `
    return NextResponse.json(cities)
  } catch (error) {
    console.error("Error fetching cities:", error)
    return NextResponse.json({ error: "Failed to fetch cities" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    if (!data.name) {
      return NextResponse.json({ error: "اسم المدينة مطلوب" }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO cities (name)
      VALUES (${data.name})
      RETURNING *
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating city:", error)
    return NextResponse.json({ error: "Failed to create city" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()

    if (!data.id || !data.name) {
      return NextResponse.json({ error: "معرف المدينة واسمها مطلوبان" }, { status: 400 })
    }

    const result = await sql`
      UPDATE cities
      SET name = ${data.name}
      WHERE id = ${data.id}
      RETURNING *
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "المدينة غير موجودة" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating city:", error)
    return NextResponse.json({ error: "Failed to update city" }, { status: 500 })
  }
}

