import { type NextRequest, NextResponse } from "next/server"
import { isWhatsAppConfigured, sendDocumentFile } from "@/lib/whatsapp-service"
import { getSessionUser } from "@/lib/tenant-auth"

const MAX_BYTES = 15 * 1024 * 1024

// GET: هل الإرسال المباشر عبر WhatsApp Business متاح؟ (وإلا تستخدم الواجهة المشاركة/التنزيل + wa.me)
export async function GET(request: NextRequest) {
  const user = await getSessionUser(request)
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
  return NextResponse.json({ configured: await isWhatsAppConfigured().catch(() => false) })
}

// POST (multipart): phone, file (PDF), filename, caption, recipient
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const form = await request.formData()
    const phone = String(form.get("phone") || "").trim()
    const file = form.get("file")
    if (!phone) return NextResponse.json({ error: "رقم الهاتف مطلوب" }, { status: 400 })
    if (!(file instanceof Blob) || !file.size) return NextResponse.json({ error: "الملف مطلوب" }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "حجم الملف أكبر من المسموح (15MB)" }, { status: 400 })
    const filename = String(form.get("filename") || "report.pdf").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120)
    const caption = String(form.get("caption") || "").slice(0, 1000)
    const recipient = String(form.get("recipient") || "").slice(0, 150) || undefined
    const message = await sendDocumentFile(phone, file, filename, caption, recipient)
    return NextResponse.json({ ok: true, id: message.id })
  } catch (error) {
    console.error("[whatsapp] send-document failed", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر إرسال الملف" }, { status: 500 })
  }
}
