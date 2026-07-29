import { NextRequest, NextResponse } from "next/server"

import sql, { getTenantPool } from "@/lib/database"


export async function GET(request: NextRequest) {
  try {
    const settings = await sql`
      SELECT * FROM print_settings 
      ORDER BY id
    `

    // Return first record or default values if none exists
    const result = settings
    return NextResponse.json(result)
  } catch (error) {
    console.error("Database query error:", error)
    return NextResponse.json({ error: "Failed to fetch print settings" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const voucherId = data.voucher_id ?? 0
    const companyId = 1 // adjust as needed

    // Upsert: insert if not exists, update if exists
    const result = await sql`
      INSERT INTO print_settings (
        voucher_id,
        paper_size,
        orientation,
        margin_top,
        margin_bottom,
        margin_left,
        margin_right,
        font_family,
        font_size,
        show_header,
        show_footer,
        header_text,
        footer_text,
        template,
        custom_width,
        custom_height,
        created_at,
        updated_at
      ) VALUES (
        ${voucherId},
        ${data.paper_size ?? "A4"},
        ${data.orientation ?? "portrait"},
        ${data.margin_top ?? 20},
        ${data.margin_bottom ?? 20},
        ${data.margin_left ?? 20},
        ${data.margin_right ?? 20},
        ${data.font_family ?? "Arial"},
        ${data.font_size ?? 12},
        ${data.show_header ?? true},
        ${data.show_footer ?? true},
        ${data.header_text ?? ""},
        ${data.footer_text ?? ""},
        ${data.template ?? "standard"},
        ${data.custom_width ?? null},
        ${data.custom_height ?? null},
        NOW(),
        NOW()
      )
      ON CONFLICT (voucher_id) 
      DO UPDATE SET
        paper_size = EXCLUDED.paper_size,
        orientation = EXCLUDED.orientation,
        margin_top = EXCLUDED.margin_top,
        margin_bottom = EXCLUDED.margin_bottom,
        margin_left = EXCLUDED.margin_left,
        margin_right = EXCLUDED.margin_right,
        font_family = EXCLUDED.font_family,
        font_size = EXCLUDED.font_size,
        show_header = EXCLUDED.show_header,
        show_footer = EXCLUDED.show_footer,
        header_text = EXCLUDED.header_text,
        footer_text = EXCLUDED.footer_text,
        template = EXCLUDED.template,
        custom_width = EXCLUDED.custom_width,
        custom_height = EXCLUDED.custom_height,
        updated_at = NOW()
      RETURNING *
    `

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error saving print settings:", error)
    return NextResponse.json({ error: "Failed to save print settings" }, { status: 500 })
  }
}