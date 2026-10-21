import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import {
  SMS_DOC_TYPES, SMS_PLACEHOLDERS, docTypeOf, ensureSmsSchema, getSmsBalance, getSmsSettings, logSms,
  previewDocumentSms, saveSmsSettings, sendSmsRaw,
} from "@/lib/sms"

// رسائل SMS — GET: ?scope=settings (الإعدادات بلا كلمة المرور + القوالب + الربط) | log | balance | preview (doc_key,id[,template_id])
// POST {action}: save_settings | save_template | delete_template | save_config | test | send
const userIdOf = (user: any) => String(user?.user_id ?? user?.id ?? "")

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureSmsSchema()
    const params = request.nextUrl.searchParams
    const scope = params.get("scope") || "settings"

    if (scope === "balance") return NextResponse.json(await getSmsBalance())

    if (scope === "preview") {
      const docKey = String(params.get("doc_key") || "")
      const id = Number(params.get("id")) || 0
      if (!docTypeOf(docKey) || !id) return NextResponse.json({ error: "مستند غير صالح" }, { status: 400 })
      const preview = await previewDocumentSms(docKey, id, Number(params.get("template_id")) || null)
      if (!preview) return NextResponse.json({ error: "المستند غير موجود" }, { status: 404 })
      const [settings, templates] = await Promise.all([getSmsSettings(), sql`SELECT id, name FROM sms_templates_tbl ORDER BY name`])
      return NextResponse.json({
        enabled: settings.enabled, mobile: preview.document.mobile, message: preview.message, template: preview.template,
        party_name: preview.document.partyName, code: preview.document.code, templates,
      })
    }

    if (scope === "log") {
      const search = String(params.get("search") || "").trim()
      const rows = await sql`
        SELECT id, doc_key, document_id, document_code, party_name, mobile, message, sent, auto, error, created_by, created_at
        FROM sms_log_tbl
        WHERE (${search} = '' OR mobile ILIKE ${`%${search}%`} OR party_name ILIKE ${`%${search}%`} OR document_code ILIKE ${`%${search}%`})
        ORDER BY created_at DESC, id DESC
        LIMIT 300
      `
      return NextResponse.json({ rows })
    }

    const [settings, templates, configs] = await Promise.all([
      getSmsSettings(),
      sql`SELECT id, name, message_text, updated_at FROM sms_templates_tbl ORDER BY name`,
      sql`SELECT doc_key, template_id, auto_send FROM sms_doc_config_tbl`,
    ])
    const { password, ...publicSettings } = settings
    return NextResponse.json({
      settings: { ...publicSettings, has_password: Boolean(password) },
      templates, configs, doc_types: SMS_DOC_TYPES.map(({ key, label }) => ({ key, label })), placeholders: SMS_PLACEHOLDERS,
    })
  } catch (error) {
    console.error("[sms] GET failed", error)
    return NextResponse.json({ error: "تعذر تحميل بيانات الرسائل" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureSmsSchema()
    const data = await request.json().catch(() => ({}))
    const userId = userIdOf(user)

    switch (data.action) {
      case "save_settings": {
        await saveSmsSettings(data.settings || {}, userId)
        return NextResponse.json({ success: true })
      }
      case "save_template": {
        const name = String(data.name || "").trim().slice(0, 80)
        const text = String(data.message_text || "").trim()
        if (!name || !text) return NextResponse.json({ error: "اسم القالب ونصه مطلوبان" }, { status: 400 })
        const id = Number(data.id) || 0
        const row = id
          ? (await sql`UPDATE sms_templates_tbl SET name = ${name}, message_text = ${text}, updated_at = NOW() WHERE id = ${id} RETURNING id`)[0]
          : (await sql`INSERT INTO sms_templates_tbl (name, message_text, created_by) VALUES (${name}, ${text}, ${userId}) RETURNING id`)[0]
        if (!row) return NextResponse.json({ error: "القالب غير موجود" }, { status: 404 })
        return NextResponse.json({ id: Number((row as any).id) })
      }
      case "delete_template": {
        await sql`DELETE FROM sms_templates_tbl WHERE id = ${Number(data.id) || 0}`
        return NextResponse.json({ success: true })
      }
      case "save_config": {
        const docKey = String(data.doc_key || "")
        if (!docTypeOf(docKey)) return NextResponse.json({ error: "نوع مستند غير صالح" }, { status: 400 })
        const templateId = Number(data.template_id) || null
        await sql`
          INSERT INTO sms_doc_config_tbl (doc_key, template_id, auto_send, updated_at) VALUES (${docKey}, ${templateId}, ${data.auto_send === true && !!templateId}, NOW())
          ON CONFLICT (doc_key) DO UPDATE SET template_id = EXCLUDED.template_id, auto_send = EXCLUDED.auto_send, updated_at = NOW()
        `
        return NextResponse.json({ success: true })
      }
      case "test": {
        const mobile = String(data.mobile || "").trim()
        const message = String(data.message || "رسالة تجريبية من NoonERP System").trim()
        const result = await sendSmsRaw(mobile, message)
        await logSms({ mobile, message, result, userId, partyName: "رسالة تجريبية" })
        return NextResponse.json(result, { status: result.sent ? 200 : 400 })
      }
      case "send": {
        const docKey = String(data.doc_key || "")
        const id = Number(data.id) || 0
        const mobile = String(data.mobile || "").trim()
        const message = String(data.message || "").trim()
        if (!mobile || !message) return NextResponse.json({ error: "رقم الجوال ونص الرسالة مطلوبان" }, { status: 400 })
        const settings = await getSmsSettings()
        if (!settings.enabled) return NextResponse.json({ error: "خدمة الرسائل غير مفعّلة — فعّلها من إعدادات الرسائل SMS" }, { status: 400 })
        const preview = docTypeOf(docKey) && id ? await previewDocumentSms(docKey, id) : null
        const result = await sendSmsRaw(mobile, message, settings)
        await logSms({
          docKey: docTypeOf(docKey) ? docKey : null, documentId: id || null, code: preview?.document.code, accountId: preview?.document.accountId,
          partyName: preview?.document.partyName, mobile, message, result, userId,
        })
        return NextResponse.json(result, { status: result.sent ? 200 : 400 })
      }
      default:
        return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 })
    }
  } catch (error) {
    console.error("[sms] POST failed", error)
    return NextResponse.json({ error: "تعذر تنفيذ العملية" }, { status: 500 })
  }
}
