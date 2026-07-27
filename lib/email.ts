import nodemailer from "nodemailer"

let transporter: nodemailer.Transporter | null | undefined = undefined

// عميل البريد يُبنى مرة واحدة عند أول استخدام فقط (lazy) — لا عند تحميل الوحدة، حتى لا تفشل بقية
// النظام إن لم تُضبط متغيرات SMTP بعد بيئة التطوير المحلية.
function getTransporter(): nodemailer.Transporter | null {
  if (transporter !== undefined) return transporter

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn("[email] SMTP env vars not configured — emails will be logged instead of sent")
    transporter = null
    return null
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT || 587) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
  return transporter
}

// أفضل جهد (best-effort) دوماً — فشل إرسال بريد (أو عدم ضبط SMTP بعد) يجب ألا يُسقط أي تدفّق
// عمل أساسي (تسجيل مستخدم، طلب إنشاء شركة، إلخ)، نفس نمط safeNotify المعتمد بالمشروع.
export async function sendMail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<void> {
  const client = getTransporter()
  if (!client) {
    console.log(`[email] (not sent — SMTP not configured) to=${to} subject=${subject}`)
    return
  }

  try {
    await client.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
    })
  } catch (error) {
    console.error("[email] Failed to send mail (non-blocking):", error)
  }
}
