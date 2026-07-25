import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

// الجدول الفعلي في القاعدة كان بحقول أقدم بكثير (id, user_id, color_scheme, primary_color,
// accent_color, font_size, font_family, border_radius, shadows, animations, compact_mode,
// created_at, updated_at فقط) — بلا organization_id ولا معظم الحقول التي يفترضها هذا الملف
// أصلاً (dark_mode، secondary_color، rtl_support...)، فكان كل حفظ (POST/PUT) يفشل بـ500 دائماً.
// إضافات فقط هنا (لا حذف/إعادة تسمية) لمطابقة الحقول التي يتوقعها الكود أدناه فعلياً.
let tableEnsured: Promise<void> | null = null
function ensureThemeSettingsColumns(): Promise<void> {
  if (!tableEnsured) {
    tableEnsured = (async () => {
      await sql`ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS organization_id INTEGER DEFAULT 1`
      await sql`ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS theme_name VARCHAR(50) DEFAULT 'default'`
      await sql`ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(20) DEFAULT '#64748b'`
      await sql`ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS background_color VARCHAR(20) DEFAULT '#ffffff'`
      await sql`ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS text_color VARCHAR(20) DEFAULT '#1f2937'`
      await sql`ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS font_weight INTEGER DEFAULT 400`
      await sql`ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS line_height NUMERIC DEFAULT 1.5`
      await sql`ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS letter_spacing NUMERIC DEFAULT 0.0`
      await sql`ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS sidebar_width INTEGER DEFAULT 256`
      await sql`ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS header_height INTEGER DEFAULT 64`
      await sql`ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS dark_mode BOOLEAN DEFAULT false`
      await sql`ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS rtl_support BOOLEAN DEFAULT true`
      await sql`ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS card_style VARCHAR(20) DEFAULT 'elevated'`
      await sql`ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS button_style VARCHAR(20) DEFAULT 'rounded'`
      await sql`ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS animation_speed VARCHAR(20) DEFAULT 'normal'`
      await sql`ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS high_contrast BOOLEAN DEFAULT false`
    })()
  }
  return tableEnsured
}

const getDefaultSettings = (organizationId = 1, userId: string | null = null) => ({
  id: null,
  organization_id: organizationId,
  user_id: userId,
  theme_name: "default",
  primary_color: "#059669",
  secondary_color: "#64748b",
  accent_color: "#10b981",
  background_color: "#ffffff",
  text_color: "#1f2937",
  font_family: "var(--font-geist-sans)",
  font_size: 14,
  font_weight: 400,
  line_height: 1.5,
  letter_spacing: 0.0,
  border_radius: 8,
  sidebar_width: 256,
  header_height: 64,
  dark_mode: false,
  rtl_support: true,
  card_style: "elevated",
  button_style: "rounded",
  animation_speed: "normal",
  compact_mode: false,
  high_contrast: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
})

export async function GET(request: NextRequest) {
  try {
    await ensureThemeSettingsColumns()
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("user_id")
    const organizationId = Number.parseInt(searchParams.get("organization_id") || "1")

    console.log("[v0] Theme API GET - userId:", userId, "organizationId:", organizationId)

    let themeSettings = []

    try {
      if (userId) {
        console.log("[v0] Fetching user-specific theme settings...")
        themeSettings = await sql`
          SELECT * FROM theme_settings 
          WHERE user_id = ${userId} 
          AND organization_id = ${organizationId}
          ORDER BY updated_at DESC
          LIMIT 1
        `
        console.log("[v0] User-specific theme settings found:", themeSettings.length)
      }

      if (themeSettings.length === 0) {
        console.log("[v0] Fetching organization default theme settings...")
        themeSettings = await sql`
          SELECT * FROM theme_settings 
          WHERE organization_id = ${organizationId}
          AND user_id IS NULL
          ORDER BY created_at DESC
          LIMIT 1
        `
        console.log("[v0] Organization theme settings found:", themeSettings.length)
      }
    } catch (dbError) {
      console.error("[v0] Database query failed:", dbError instanceof Error ? dbError.message : String(dbError))

      // Check if it's a table not found error
      if (dbError instanceof Error && dbError.message.includes('relation "theme_settings" does not exist')) {
        console.warn(
          "[v0] theme_settings table does not exist. Please run the initialization script: scripts/25-initialize-theme-settings.sql",
        )
      }

      const defaultSettings = getDefaultSettings(organizationId, userId)
      console.log("[v0] Returning default settings due to database error")
      return NextResponse.json(defaultSettings, {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      })
    }

    const result = themeSettings.length > 0 ? themeSettings[0] : getDefaultSettings(organizationId, userId)
    console.log("[v0] Returning theme settings with theme_name:", result.theme_name)

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, max-age=60",
      },
    })
  } catch (error) {
    console.error("[v0] Theme API error:", error)

    const defaultSettings = getDefaultSettings()
    console.log("[v0] Using default settings due to error")

    return NextResponse.json(defaultSettings, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureThemeSettingsColumns()
    const data = await request.json()
    console.log("[v0] Theme API POST - data received:", Object.keys(data))

    const userId = data.user_id
    const organizationId = data.organization_id || 1

    const result = await sql`
      INSERT INTO theme_settings (
        organization_id, user_id, theme_name, primary_color, secondary_color, accent_color,
        background_color, text_color, font_family, font_size, font_weight,
        line_height, letter_spacing, border_radius, sidebar_width, header_height,
        dark_mode, rtl_support, card_style, button_style, animation_speed,
        compact_mode, high_contrast
      ) VALUES (
        ${organizationId}, ${userId}, ${data.theme_name || "default"}, 
        ${data.primary_color || "#059669"}, ${data.secondary_color || "#64748b"}, 
        ${data.accent_color || "#10b981"}, ${data.background_color || "#ffffff"}, 
        ${data.text_color || "#1f2937"}, ${data.font_family || "var(--font-geist-sans)"}, 
        ${data.font_size || 14}, ${data.font_weight || 400}, 
        ${data.line_height || 1.5}, ${data.letter_spacing || 0.0}, 
        ${data.border_radius || 8}, ${data.sidebar_width || 256}, 
        ${data.header_height || 64}, ${data.dark_mode || false}, 
        ${data.rtl_support !== undefined ? data.rtl_support : true},
        ${data.card_style || "elevated"}, ${data.button_style || "rounded"},
        ${data.animation_speed || "normal"}, ${data.compact_mode || false},
        ${data.high_contrast || false}
      )
      RETURNING *
    `

    console.log("[v0] Theme settings saved successfully")
    return NextResponse.json(result[0])
  } catch (error) {
    console.error("[v0] Database insert error:", error)
    return NextResponse.json({ error: "Failed to create theme settings" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await ensureThemeSettingsColumns()
    const data = await request.json()
    console.log("[v0] Theme API PUT - data received:", Object.keys(data))

    const userId = data.user_id
    const organizationId = data.organization_id || 1

    if (!data.theme_name) {
      console.error("[v0] Missing theme_name in request data")
      return NextResponse.json({ error: "theme_name is required" }, { status: 400 })
    }

    let result

    if (userId) {
      console.log("[v0] Checking for existing user settings...")
      const existing = await sql`
        SELECT id FROM theme_settings 
        WHERE user_id = ${userId} AND organization_id = ${organizationId}
      `
      console.log("[v0] Existing user settings found:", existing.length)

      if (existing.length > 0) {
        console.log("[v0] Updating existing user settings...")
        result = await sql`
          UPDATE theme_settings 
          SET 
            theme_name = ${data.theme_name || "default"},
            primary_color = ${data.primary_color || "#059669"},
            secondary_color = ${data.secondary_color || "#64748b"},
            accent_color = ${data.accent_color || "#10b981"},
            background_color = ${data.background_color || "#ffffff"},
            text_color = ${data.text_color || "#1f2937"},
            font_family = ${data.font_family || "var(--font-geist-sans)"},
            font_size = ${data.font_size || 14},
            font_weight = ${data.font_weight || 400},
            line_height = ${data.line_height || 1.5},
            letter_spacing = ${data.letter_spacing || 0.0},
            border_radius = ${data.border_radius || 8},
            sidebar_width = ${data.sidebar_width || 256},
            header_height = ${data.header_height || 64},
            dark_mode = ${data.dark_mode || false},
            rtl_support = ${data.rtl_support !== undefined ? data.rtl_support : true},
            card_style = ${data.card_style || "elevated"},
            button_style = ${data.button_style || "rounded"},
            animation_speed = ${data.animation_speed || "normal"},
            compact_mode = ${data.compact_mode || false},
            high_contrast = ${data.high_contrast || false},
            updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ${userId} AND organization_id = ${organizationId}
          RETURNING *
        `
      } else {
        console.log("[v0] Inserting new user settings...")
        result = await sql`
          INSERT INTO theme_settings (
            organization_id, user_id, theme_name, primary_color, secondary_color, accent_color,
            background_color, text_color, font_family, font_size, font_weight,
            line_height, letter_spacing, border_radius, sidebar_width, header_height,
            dark_mode, rtl_support, card_style, button_style, animation_speed,
            compact_mode, high_contrast
          ) VALUES (
            ${organizationId}, ${userId}, ${data.theme_name || "default"}, 
            ${data.primary_color || "#059669"}, ${data.secondary_color || "#64748b"}, 
            ${data.accent_color || "#10b981"}, ${data.background_color || "#ffffff"}, 
            ${data.text_color || "#1f2937"}, ${data.font_family || "var(--font-geist-sans)"}, 
            ${data.font_size || 14}, ${data.font_weight || 400}, 
            ${data.line_height || 1.5}, ${data.letter_spacing || 0.0}, 
            ${data.border_radius || 8}, ${data.sidebar_width || 256}, 
            ${data.header_height || 64}, ${data.dark_mode || false}, 
            ${data.rtl_support !== undefined ? data.rtl_support : true},
            ${data.card_style || "elevated"}, ${data.button_style || "rounded"},
            ${data.animation_speed || "normal"}, ${data.compact_mode || false},
            ${data.high_contrast || false}
          )
          RETURNING *
        `
      }
    } else {
      console.log("[v0] Updating organization default theme settings...")
      result = await sql`
        UPDATE theme_settings 
        SET 
          theme_name = ${data.theme_name || "default"},
          primary_color = ${data.primary_color || "#059669"},
          secondary_color = ${data.secondary_color || "#64748b"},
          accent_color = ${data.accent_color || "#10b981"},
          background_color = ${data.background_color || "#ffffff"},
          text_color = ${data.text_color || "#1f2937"},
          font_family = ${data.font_family || "var(--font-geist-sans)"},
          font_size = ${data.font_size || 14},
          font_weight = ${data.font_weight || 400},
          line_height = ${data.line_height || 1.5},
          letter_spacing = ${data.letter_spacing || 0.0},
          border_radius = ${data.border_radius || 8},
          sidebar_width = ${data.sidebar_width || 256},
          header_height = ${data.header_height || 64},
          dark_mode = ${data.dark_mode || false},
          rtl_support = ${data.rtl_support !== undefined ? data.rtl_support : true},
          card_style = ${data.card_style || "elevated"},
          button_style = ${data.button_style || "rounded"},
          animation_speed = ${data.animation_speed || "normal"},
          compact_mode = ${data.compact_mode || false},
          high_contrast = ${data.high_contrast || false},
          updated_at = CURRENT_TIMESTAMP
        WHERE organization_id = ${organizationId} AND user_id IS NULL
        RETURNING *
      `
    }

    if (result && result.length > 0) {
      console.log("[v0] Theme settings updated successfully")
      return NextResponse.json(result[0])
    } else {
      console.log("[v0] No rows affected, creating new record...")
      const newResult = await sql`
        INSERT INTO theme_settings (
          organization_id, user_id, theme_name, primary_color, secondary_color, accent_color,
          background_color, text_color, font_family, font_size, font_weight,
          line_height, letter_spacing, border_radius, sidebar_width, header_height,
          dark_mode, rtl_support, card_style, button_style, animation_speed,
          compact_mode, high_contrast
        ) VALUES (
          ${organizationId}, ${userId}, ${data.theme_name || "default"}, 
          ${data.primary_color || "#059669"}, ${data.secondary_color || "#64748b"}, 
          ${data.accent_color || "#10b981"}, ${data.background_color || "#ffffff"}, 
          ${data.text_color || "#1f2937"}, ${data.font_family || "var(--font-geist-sans)"}, 
          ${data.font_size || 14}, ${data.font_weight || 400}, 
          ${data.line_height || 1.5}, ${data.letter_spacing || 0.0}, 
          ${data.border_radius || 8}, ${data.sidebar_width || 256}, 
          ${data.header_height || 64}, ${data.dark_mode || false}, 
          ${data.rtl_support !== undefined ? data.rtl_support : true},
          ${data.card_style || "elevated"}, ${data.button_style || "rounded"},
          ${data.animation_speed || "normal"}, ${data.compact_mode || false},
          ${data.high_contrast || false}
        )
        RETURNING *
      `
      return NextResponse.json(newResult[0])
    }
  } catch (error) {
    console.error("[v0] Database update error:", error)
    return NextResponse.json(
      {
        error: "Failed to update theme settings",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
