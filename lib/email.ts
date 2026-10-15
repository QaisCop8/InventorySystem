// إرسال البريد (رموز استعادة/تعيين كلمة المرور، دعوات المستخدمين، إشعارات الشركات).
//
// المزوّد يُختار حسب متغيرات البيئة، بالأولوية:
//   1) BREVO_API_KEY  — Brevo عبر HTTP (يعمل على Cloudflare Workers؛ يقبل بريد Hotmail/Gmail كمرسِل بعد التحقق منه في Brevo)
//   2) RESEND_API_KEY — Resend عبر HTTP (يتطلب نطاقاً موثَّقاً للمرسِل)
//   3) SMTP_HOST/SMTP_USER/SMTP_PASS — nodemailer (مناسب للتشغيل المحلي/خادم Node). ملاحظة: Hotmail/Outlook.com أوقف
//      تسجيل الدخول بكلمة المرور لـSMTP (خطأ 535 5.7.139)، وSMTP على Workers يعتمد على مقابس TCP غير مضمونة.
// المرسِل: MAIL_FROM أو SMTP_FROM أو SMTP_USER، واسم العرض MAIL_FROM_NAME (افتراضياً ARAAK ERP).

type Provider = "brevo" | "resend" | "smtp" | null

function provider(): Provider {
  if (process.env.BREVO_API_KEY) return "brevo"
  if (process.env.RESEND_API_KEY) return "resend"
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return "smtp"
  return null
}

// MAIL_FROM/SMTP_FROM قد يُضبط باسم عرض بدل بريد (مثل "ARAAK ERP System") — يُستخدم حينها كاسم العرض والمرسِل يبقى البريد
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
const senderEmail = () => [process.env.MAIL_FROM, process.env.SMTP_FROM, process.env.SMTP_USER].map((value) => String(value || "").trim()).find(isEmail) || ""
const senderName = () => {
  const named = [process.env.MAIL_FROM_NAME, process.env.MAIL_FROM, process.env.SMTP_FROM].map((value) => String(value || "").trim()).find((value) => value && !isEmail(value))
  return named || "ARAAK ERP"
}

export function isMailConfigured() {
  return provider() !== null && Boolean(senderEmail())
}

let smtpTransport: any = null
async function sendSmtp(to: string, subject: string, html: string) {
  if (!smtpTransport) {
    // استيراد متأخر: nodemailer يُحمَّل فقط عند استخدام SMTP فعلاً (لا عند استخدام مزوّد HTTP)
    const nodemailer = (await import("nodemailer")).default
    const port = Number(process.env.SMTP_PORT || 587)
    smtpTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      requireTLS: port === 587,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  }
  await smtpTransport.sendMail({ from: { name: senderName(), address: senderEmail() }, to, subject, html })
}

async function sendBrevo(to: string, subject: string, html: string) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": String(process.env.BREVO_API_KEY), "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { email: senderEmail(), name: senderName() }, to: [{ email: to }], subject, htmlContent: html }),
  })
  if (!response.ok) throw new Error(`Brevo HTTP ${response.status}: ${(await response.text().catch(() => "")).slice(0, 300)}`)
}

async function sendResend(to: string, subject: string, html: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: `${senderName()} <${senderEmail()}>`, to: [to], subject, html }),
  })
  if (!response.ok) throw new Error(`Resend HTTP ${response.status}: ${(await response.text().catch(() => "")).slice(0, 300)}`)
}

// أفضل جهد دوماً — فشل الإرسال لا يُسقط التدفّق الأساسي. يُعيد true عند الإرسال الفعلي فقط؛ التدفقات التي يعتمد عليها
// المستخدم (رمز استعادة كلمة المرور، دعوة مستخدم) تفحص القيمة لتعرض خطأً واضحاً بدل رسالة نجاح مضلِّلة.
export async function sendMail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<boolean> {
  const selected = provider()
  if (!selected || !senderEmail()) {
    console.log(`[email] (not sent — email provider not configured) to=${to} subject=${subject}`)
    return false
  }
  try {
    if (selected === "brevo") await sendBrevo(to, subject, html)
    else if (selected === "resend") await sendResend(to, subject, html)
    else await sendSmtp(to, subject, html)
    return true
  } catch (error) {
    // السبب الفعلي يظهر في سجلات الخادم (wrangler tail / سجلات Cloudflare)
    console.error(`[email] Failed to send via ${selected} to=${to}:`, error instanceof Error ? error.message : error)
    return false
  }
}
