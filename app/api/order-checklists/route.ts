import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureOrderDraftTables } from "@/lib/order-drafts"

export async function GET() {
  await ensureOrderDraftTables()
  const templates = await sql`SELECT * FROM order_checklist_templates ORDER BY created_at DESC`
  const fields = await sql`SELECT * FROM order_checklist_fields ORDER BY position, id`
  return NextResponse.json(templates.map((t: any) => ({ ...t, fields: fields.filter((f: any) => f.template_id === t.id) })))
}

export async function POST(request: NextRequest) {
  try {
    await ensureOrderDraftTables()
    const data = await request.json()
    if (!String(data.name || "").trim() || !Array.isArray(data.fields) || !data.fields.length) return NextResponse.json({ error: "اسم القائمة وحقل واحد على الأقل مطلوبان" }, { status: 400 })
    const normalizedName = String(data.name).trim()
    const duplicate = await sql`SELECT id FROM order_checklist_templates WHERE LOWER(TRIM(name)) = LOWER(${normalizedName}) LIMIT 1`
    if (duplicate.length) return NextResponse.json({ error: "اسم قائمة التحقق مستخدم مسبقاً" }, { status: 409 })
    const [template] = await sql`INSERT INTO order_checklist_templates (name, description) VALUES (${normalizedName}, ${data.description || null}) RETURNING *`
    for (let i = 0; i < data.fields.length; i++) {
      const f = data.fields[i]
      if (!f.label?.trim()) continue
      await sql`INSERT INTO order_checklist_fields (template_id,label,field_type,max_length,is_required,position) VALUES (${template.id},${f.label.trim()},${f.field_type || "text"},${f.max_length ? Number(f.max_length) : null},${Boolean(f.is_required)},${i})`
    }
    return NextResponse.json(template, { status: 201 })
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

export async function PUT(request: NextRequest) {
  try {
    await ensureOrderDraftTables()
    const data = await request.json()
    const id = Number(data.id)
    if (!id || !String(data.name || "").trim() || !Array.isArray(data.fields) || !data.fields.length) {
      return NextResponse.json({ error: "القائمة واسمها وحقل واحد على الأقل مطلوبة" }, { status: 400 })
    }
    const normalizedName = String(data.name).trim()
    const duplicate = await sql`SELECT id FROM order_checklist_templates WHERE LOWER(TRIM(name)) = LOWER(${normalizedName}) AND id <> ${id} LIMIT 1`
    if (duplicate.length) return NextResponse.json({ error: "اسم قائمة التحقق مستخدم مسبقاً" }, { status: 409 })
    const updated = await sql`
      UPDATE order_checklist_templates
      SET name=${normalizedName}, description=${data.description || null}, updated_at=CURRENT_TIMESTAMP
      WHERE id=${id}
      RETURNING *
    `
    if (!updated.length) return NextResponse.json({ error: "قائمة التحقق غير موجودة" }, { status: 404 })

    await sql`DELETE FROM order_checklist_fields WHERE template_id=${id}`
    for (let index = 0; index < data.fields.length; index++) {
      const field = data.fields[index]
      if (!String(field.label || "").trim()) continue
      await sql`
        INSERT INTO order_checklist_fields (template_id,label,field_type,max_length,is_required,position)
        VALUES (${id},${field.label.trim()},${field.field_type || "text"},${field.max_length ? Number(field.max_length) : null},${Boolean(field.is_required)},${index})
      `
    }
    return NextResponse.json(updated[0])
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
