import { NextResponse } from "next/server"
import sql from "@/lib/database"

export async function GET() {
  try {
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '[]'::jsonb`
    const rows = await sql`SELECT attributes FROM products WHERE jsonb_typeof(attributes) = 'array'`
    const catalog = new Map<string, { name: string; values: Set<string> }>()
    for (const row of rows as any[]) {
      for (const attribute of Array.isArray(row.attributes) ? row.attributes : []) {
        const name = String(attribute?.name || "").trim()
        if (!name) continue
        const key = name.toLocaleLowerCase()
        if (!catalog.has(key)) catalog.set(key, { name, values: new Set<string>() })
        for (const value of Array.isArray(attribute?.values) ? attribute.values : []) {
          const text = String(value || "").trim()
          if (text) catalog.get(key)!.values.add(text)
        }
      }
    }
    return NextResponse.json(Array.from(catalog.values()).map(({ name, values }) => ({ name, values: Array.from(values) })))
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "تعذر تحميل خصائص الأصناف" }, { status: 500 })
  }
}
