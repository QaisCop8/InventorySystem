"use client"

// فاتورة QR للكاشير: رمز QR واحد يحمل كل بيانات الفاتورة كنص مقروء — مسحه بكاميرا أي جوال يُظهر الفاتورة كاملة
// (الشركة، الرقم الضريبي، الرقم والتاريخ، العميل، الأصناف، الخصومات، الضريبة، الإجمالي، الدفعات).
// سعة رمز QR محدودة (~2900 بايت، والحرف العربي 2-3 بايت): عند تجاوزها تُختصر أسماء الأصناف ثم تُجمَع
// آخر الأصناف في سطر "و N أصناف أخرى" — الإجماليات والدفعات تبقى كاملة دائماً.

export type QrInvoiceLine = { name: string; quantity: number; price: number; discount?: number; campaign_discount?: number; gift?: boolean }
export type QrInvoice = {
  title: string
  code: string
  date: string
  companyName?: string
  // ترويسة الطباعة فقط (لا تدخل في نص الرمز): الشعار وسطر العنوان/الهاتف
  companyLogo?: string
  companyInfo?: string
  taxNumber?: string
  customerName?: string
  customerPhone?: string
  cashierName?: string
  currencyCode?: string
  lines: QrInvoiceLine[]
  subtotal: number
  itemDiscount?: number
  invoiceDiscount?: number
  tax?: number
  total: number
  payments?: Array<{ label: string; amount: number; reference?: string }>
  change?: number
  note?: string
}

const money = (value: number) => Number(value || 0).toFixed(2)
const shorten = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

function invoiceText(invoice: QrInvoice, nameMax: number, maxLines: number) {
  const currency = invoice.currencyCode ? ` ${invoice.currencyCode}` : ""
  const rows: string[] = []
  if (invoice.companyName) rows.push(invoice.companyName)
  if (invoice.taxNumber) rows.push(`الرقم الضريبي: ${invoice.taxNumber}`)
  rows.push(`${invoice.title} رقم: ${invoice.code}`)
  rows.push(`التاريخ: ${invoice.date}`)
  if (invoice.customerName) rows.push(`العميل: ${invoice.customerName}${invoice.customerPhone ? ` (${invoice.customerPhone})` : ""}`)
  if (invoice.cashierName) rows.push(`الكاشير: ${invoice.cashierName}`)
  rows.push("— الأصناف —")
  const shown = invoice.lines.slice(0, maxLines)
  shown.forEach((line, index) => {
    const amount = line.gift ? 0 : line.quantity * line.price * (1 - (line.discount || 0) / 100) - (line.campaign_discount || 0)
    const discount = line.discount ? ` خصم ${Number(line.discount).toFixed(2).replace(/\.00$/, "")}%` : ""
    rows.push(`${index + 1}) ${shorten(line.name, nameMax)} | ${line.quantity} × ${money(line.price)}${discount} = ${money(amount)}`)
  })
  if (invoice.lines.length > shown.length) rows.push(`… و ${invoice.lines.length - shown.length} أصناف أخرى`)
  rows.push(`عدد الأصناف: ${invoice.lines.length}`)
  rows.push("——")
  rows.push(`المجموع: ${money(invoice.subtotal)}`)
  if (invoice.itemDiscount) rows.push(`خصم الأصناف: ${money(invoice.itemDiscount)}`)
  if (invoice.invoiceDiscount) rows.push(`خصم الفاتورة: ${money(invoice.invoiceDiscount)}`)
  if (invoice.tax) rows.push(`الضريبة: ${money(invoice.tax)}`)
  rows.push(`الإجمالي: ${money(invoice.total)}${currency}`)
  for (const payment of invoice.payments || []) rows.push(`${payment.label}: ${money(payment.amount)}${payment.reference ? ` (${payment.reference})` : ""}`)
  if (invoice.change) rows.push(`الباقي للعميل: ${money(invoice.change)}`)
  if (invoice.note) rows.push(`ملاحظة: ${shorten(invoice.note, 120)}`)
  return rows.join("\n")
}

/** صورة PNG (data URL) لرمز QR يحمل الفاتورة كاملة، مع النص المُرمَّز فعلاً. */
export async function invoiceQrDataUrl(invoice: QrInvoice, size = 360): Promise<{ dataUrl: string; text: string; truncated: boolean }> {
  const QRCode = (await import("qrcode")).default
  const attempts: Array<[number, number]> = [[60, Infinity], [28, Infinity], [18, Infinity]]
  for (let keep = invoice.lines.length - 1; keep >= 0; keep -= Math.max(1, Math.ceil(invoice.lines.length / 10))) attempts.push([16, keep])
  for (const [nameMax, maxLines] of attempts) {
    const text = invoiceText(invoice, nameMax, maxLines)
    for (const errorCorrectionLevel of ["M", "L"] as const) {
      try {
        const dataUrl = await QRCode.toDataURL(text, { errorCorrectionLevel, margin: 1, width: size })
        return { dataUrl, text, truncated: maxLines < invoice.lines.length }
      } catch {
        /* النص أكبر من سعة الرمز — نجرب نسخة أقصر */
      }
    }
  }
  const text = invoiceText(invoice, 12, 0)
  return { dataUrl: await QRCode.toDataURL(text, { errorCorrectionLevel: "L", margin: 1, width: size }), text, truncated: true }
}

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string)

const logoSrc = (raw?: string) => {
  const value = String(raw || "").trim()
  if (!value) return ""
  const src = /^(data:|https?:|\/)/i.test(value) ? value : `data:image/png;base64,${value}`
  return /^(data:image\/[a-z+]+;base64,[a-z0-9+/=\s]+|https?:\/\/[^"'\s]+|\/[^"'\s]*)$/i.test(src) ? src : ""
}

/** صفحة طباعة 80mm لفاتورة QR: الشعار وترويسة الشركة فقط ثم رمز QR — رقم الفاتورة وتاريخها والعميل والإجمالي داخل الرمز. */
export function qrReceiptHtml(invoice: QrInvoice, dataUrl: string) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title></title><style>
@page{size:80mm auto;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
body{width:80mm;padding:4mm 3mm;font-family:Tahoma,Arial,sans-serif;color:#000;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.logo{display:block;width:22mm;height:22mm;margin:0 auto 1.5mm;object-fit:contain}
h1{font-size:15px;font-weight:800;margin-bottom:0.5mm}
.info{font-size:10px;color:#333;line-height:1.5}
hr{margin:2mm 0;border:0;border-top:1px solid #999}
.qr{display:block;width:66mm;height:66mm;margin:2mm auto;image-rendering:pixelated}
.thanks{margin-top:1.5mm;font-size:11px;font-weight:700}
.hint{font-size:9px;color:#333}
</style></head><body>
${logoSrc(invoice.companyLogo) ? `<img class="logo" src="${escapeHtml(logoSrc(invoice.companyLogo))}" alt="">` : ""}
${invoice.companyName ? `<h1>${escapeHtml(invoice.companyName)}</h1>` : ""}
${invoice.companyInfo ? `<div class="info">${escapeHtml(invoice.companyInfo)}</div>` : ""}
<hr>
<img class="qr" src="${dataUrl}" alt="QR">
<div class="hint">امسح الرمز لعرض تفاصيل الفاتورة كاملة</div>
<div class="thanks">شكراً لتسوقكم معنا</div>
</body></html>`
}
