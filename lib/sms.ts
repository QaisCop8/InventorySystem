import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

// رسائل SMS بنمط الشامل (ShamelAPI: SendMessagesBySmsM + MessagesTemplates + message_config_tbl):
// - الإعدادات: رابط الإرسال ورابط الرصيد بمتغيرات [UserName] [Password] [Sender] [Mobile] [Message]، رمز النجاح
//   (LeaderSMS: 1001) ومفتاح الدولة لتحويل 05xxxxxxxx إلى صيغة دولية.
// - القوالب: نص بمتغيرات [CustomerName] [CustomerBalance] [Code] [TransactionDate] [TransactionValue]
//   [TransactionCurrency] [TransactionType] [CompanyName].
// - ربط القوالب بالحركات: لكل نوع مستند قالب + "إرسال تلقائي عند الإضافة".
// - سجل الإرسال: كل محاولة (نجحت أو فشلت) مع رد المزوّد.

export type SmsSettings = {
  enabled: boolean
  send_link: string
  balance_link: string
  username: string
  password: string
  sender: string
  success_codes: string
  country_code: string
}

export const SMS_PLACEHOLDERS = [
  { key: "[CustomerName]", label: "اسم العميل" },
  { key: "[CustomerBalance]", label: "رصيد العميل" },
  { key: "[Code]", label: "رقم الحركة" },
  { key: "[TransactionDate]", label: "تاريخ الحركة" },
  { key: "[TransactionValue]", label: "قيمة الحركة" },
  { key: "[TransactionCurrency]", label: "عملة الحركة" },
  { key: "[TransactionType]", label: "نوع الحركة" },
  { key: "[CompanyName]", label: "اسم الشركة" },
] as const

// أنواع المستندات التي تُرسل لها رسائل: الحركات حسب نوع السند + الطلبيات
export const SMS_DOC_TYPES: { key: string; label: string; kind: "voucher" | "order"; vchType?: number; orderType?: number }[] = [
  { key: "vch_12", label: "فاتورة مبيعات", kind: "voucher", vchType: 12 },
  { key: "vch_13", label: "إرسالية مبيعات", kind: "voucher", vchType: 13 },
  { key: "vch_16", label: "مرتجع مبيعات", kind: "voucher", vchType: 16 },
  { key: "vch_14", label: "إرسالية برسم البيع", kind: "voucher", vchType: 14 },
  { key: "vch_15", label: "مرتجع إرسالية برسم البيع", kind: "voucher", vchType: 15 },
  { key: "vch_17", label: "فاتورة مشتريات", kind: "voucher", vchType: 17 },
  { key: "vch_18", label: "إرسالية مشتريات", kind: "voucher", vchType: 18 },
  { key: "vch_19", label: "مرتجع مشتريات", kind: "voucher", vchType: 19 },
  { key: "vch_4", label: "سند قبض", kind: "voucher", vchType: 4 },
  { key: "vch_5", label: "سند صرف", kind: "voucher", vchType: 5 },
  { key: "order_1", label: "طلبية مبيعات", kind: "order", orderType: 1 },
  { key: "order_2", label: "طلبية مشتريات", kind: "order", orderType: 2 },
]
export const docTypeOf = (key: string) => SMS_DOC_TYPES.find((type) => type.key === key)
export const voucherDocKey = (vchType: number) => `vch_${Number(vchType)}`
export const orderDocKey = (orderType: number) => `order_${Number(orderType) === 2 ? 2 : 1}`

const DEFAULT_SETTINGS: SmsSettings = {
  enabled: false,
  send_link: "http://www.leadersms.ps/http/V1/Messages/SendSms?username=[UserName]&password=[Password]&sender=[Sender]&to=[Mobile]&message=[Message]",
  balance_link: "",
  username: "",
  password: "",
  sender: "",
  success_codes: "1001",
  country_code: "970",
}

export async function ensureSmsSchema() { return runSchemaOnce("lib/sms.ts#ensureSmsSchema", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS sms_settings_tbl (
      id INTEGER PRIMARY KEY DEFAULT 1,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS sms_templates_tbl (
      id SERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      message_text TEXT NOT NULL,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS sms_doc_config_tbl (
      doc_key VARCHAR(20) PRIMARY KEY,
      template_id INTEGER REFERENCES sms_templates_tbl(id) ON DELETE SET NULL,
      auto_send BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS sms_log_tbl (
      id SERIAL PRIMARY KEY,
      doc_key VARCHAR(20),
      document_id INTEGER,
      document_code VARCHAR(60),
      account_id INTEGER,
      party_name VARCHAR(200),
      mobile VARCHAR(40),
      message TEXT,
      sent BOOLEAN NOT NULL DEFAULT false,
      auto BOOLEAN NOT NULL DEFAULT false,
      response TEXT,
      error TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_sms_log_created ON sms_log_tbl(created_at DESC)`
  await sql`CREATE INDEX IF NOT EXISTS idx_sms_log_document ON sms_log_tbl(doc_key, document_id)`
}) }

export async function getSmsSettings(): Promise<SmsSettings> {
  await ensureSmsSchema()
  const row = (await sql`SELECT settings FROM sms_settings_tbl WHERE id = 1`)[0] as any
  const stored = row?.settings || {}
  return { ...DEFAULT_SETTINGS, ...stored, enabled: stored.enabled === true }
}

export async function saveSmsSettings(input: Partial<SmsSettings>, userId: string) {
  const current = await getSmsSettings()
  const next: SmsSettings = {
    enabled: input.enabled === true,
    send_link: String(input.send_link ?? current.send_link).trim().slice(0, 1000),
    balance_link: String(input.balance_link ?? current.balance_link).trim().slice(0, 1000),
    username: String(input.username ?? current.username).trim().slice(0, 120),
    // كلمة المرور لا تُرسل للواجهة؛ حقل فارغ = إبقاء القديمة
    password: input.password ? String(input.password).slice(0, 200) : current.password,
    sender: String(input.sender ?? current.sender).trim().slice(0, 60),
    success_codes: String(input.success_codes ?? current.success_codes).trim().slice(0, 120) || "1001",
    country_code: String(input.country_code ?? current.country_code).replace(/\D/g, "").slice(0, 5),
  }
  await sql`
    INSERT INTO sms_settings_tbl (id, settings, updated_by, updated_at) VALUES (1, ${JSON.stringify(next)}::jsonb, ${userId}, NOW())
    ON CONFLICT (id) DO UPDATE SET settings = EXCLUDED.settings, updated_by = EXCLUDED.updated_by, updated_at = NOW()
  `
  return next
}

/** رقم الجوال بصيغة المزوّد: أرقام فقط، و05xxxxxxxx ⇐ 9705xxxxxxxx إن عُرّف مفتاح الدولة. */
export function normalizeMobile(raw: string, countryCode: string) {
  let digits = String(raw || "").replace(/[^\d+]/g, "").replace(/^\+/, "").replace(/^00/, "")
  if (countryCode && digits.startsWith("0")) digits = countryCode + digits.slice(1)
  return digits
}

const PROVIDER_ERRORS: Record<string, string> = {
  "1000": "لا يوجد رصيد في حساب الرسائل",
  "2000": "خطأ في اسم المستخدم أو كلمة المرور في إعدادات الرسائل",
  "3000": "خطأ في نوع الرسالة",
  "4000": "خطأ في الرابط: أحد المتغيرات لم يُمرَّر أو قيمته فارغة",
  "5000": "الدولة غير مدعومة أو رقم الجوال فارغ/غير صحيح",
  "6000": "خطأ في اسم المرسل في إعدادات الرسائل",
}

const fillLink = (link: string, settings: SmsSettings, values: Record<string, string>) =>
  Object.entries({ "[UserName]": settings.username, "[Password]": settings.password, "[Sender]": settings.sender, ...values })
    .reduce((url, [key, value]) => url.split(key).join(encodeURIComponent(value)), link)

export type SmsSendResult = { sent: boolean; response: string; error?: string }

export async function sendSmsRaw(mobile: string, message: string, settings?: SmsSettings): Promise<SmsSendResult> {
  const config = settings || (await getSmsSettings())
  if (!config.send_link.trim()) return { sent: false, response: "", error: "لم يُعرَّف رابط إرسال الرسائل في إعدادات SMS" }
  const to = normalizeMobile(mobile, config.country_code)
  if (to.length < 8) return { sent: false, response: "", error: "رقم الجوال غير صحيح" }
  if (!message.trim()) return { sent: false, response: "", error: "نص الرسالة فارغ" }
  const url = fillLink(config.send_link, config, { "[Mobile]": to, "[Message]": message })
  try {
    const response = await fetch(url, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(15000) })
    const text = (await response.text()).trim()
    const codes = config.success_codes.split(/[,،\s]+/).map((code) => code.trim()).filter(Boolean)
    const sent = response.ok && codes.some((code) => text === code || text.startsWith(code) || text.includes(code))
    return sent ? { sent: true, response: text.slice(0, 500) } : { sent: false, response: text.slice(0, 500), error: PROVIDER_ERRORS[text] || text.slice(0, 200) || `HTTP ${response.status}` }
  } catch (error) {
    return { sent: false, response: "", error: error instanceof Error ? `تعذر الاتصال بمزوّد الرسائل: ${error.message}` : "تعذر الاتصال بمزوّد الرسائل" }
  }
}

export async function getSmsBalance(): Promise<{ ok: boolean; balance?: string; error?: string }> {
  const config = await getSmsSettings()
  if (!config.balance_link.trim()) return { ok: false, error: "لم يُعرَّف رابط رصيد الرسائل" }
  try {
    const response = await fetch(fillLink(config.balance_link, config, {}), { cache: "no-store", signal: AbortSignal.timeout(15000) })
    const text = (await response.text()).trim()
    return Number.isFinite(Number(text)) && text !== "" ? { ok: true, balance: text } : { ok: false, error: PROVIDER_ERRORS[text] || text.slice(0, 200) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "تعذر الاتصال بمزوّد الرسائل" }
  }
}

export function renderSmsTemplate(text: string, values: Record<string, string>) {
  return Object.entries(values).reduce((message, [key, value]) => message.split(key).join(value ?? ""), String(text || ""))
}

type DocumentData = {
  docKey: string; documentId: number; code: string; date: string; amount: number; currency: string
  accountId: number | null; partyName: string; mobile: string; typeLabel: string
}

async function loadDocument(docKey: string, documentId: number): Promise<DocumentData | null> {
  const type = docTypeOf(docKey)
  if (!type || !(documentId > 0)) return null
  if (type.kind === "voucher") {
    const row = (await sql`
      SELECT vh.id, vh.vch_code, vh.vch_date::date::text AS vch_date, COALESCE(vh.amount, 0) AS amount, vh.account_id,
        COALESCE(NULLIF(to_jsonb(vh)->>'customer_name', ''), acc.name, '') AS party_name, c.currency_name,
        (SELECT NULLIF(TRIM(COALESCE(cu.mobile1, cu.mobile2, '')), '') FROM customers cu
          WHERE cu.account_id = vh.account_id AND COALESCE(cu.isdeleted, false) = false ORDER BY cu.id DESC LIMIT 1) AS mobile
      FROM voucher_header_tbl vh
      LEFT JOIN account_tbl acc ON acc.id = vh.account_id
      LEFT JOIN currency c ON c.id = vh.currency_id
      WHERE vh.id = ${documentId}
    `)[0] as any
    if (!row) return null
    return { docKey, documentId, code: row.vch_code, date: row.vch_date, amount: Number(row.amount), currency: row.currency_name || "", accountId: row.account_id ? Number(row.account_id) : null, partyName: row.party_name || "", mobile: row.mobile || "", typeLabel: type.label }
  }
  const row = (await sql`
    SELECT o.id, o.order_number, o.order_date::date::text AS order_date, COALESCE(o.total_amount, 0) AS amount, o.customer_id,
      COALESCE(NULLIF(to_jsonb(o)->>'customer_name', ''), acc.name, '') AS party_name, c.currency_name,
      COALESCE(NULLIF(TRIM(to_jsonb(o)->>'customer_phone'), ''), (SELECT NULLIF(TRIM(COALESCE(cu.mobile1, cu.mobile2, '')), '') FROM customers cu
        WHERE cu.account_id = o.customer_id AND COALESCE(cu.isdeleted, false) = false ORDER BY cu.id DESC LIMIT 1)) AS mobile
    FROM orders o
    LEFT JOIN account_tbl acc ON acc.id = o.customer_id
    LEFT JOIN currency c ON c.id = o.currency_id
    WHERE o.id = ${documentId}
  `)[0] as any
  if (!row) return null
  return { docKey, documentId, code: row.order_number, date: row.order_date, amount: Number(row.amount), currency: row.currency_name || "", accountId: row.customer_id ? Number(row.customer_id) : null, partyName: row.party_name || "", mobile: row.mobile || "", typeLabel: type.label }
}

/** رصيد الحساب بعملته (مدين − دائن) من كل السندات غير الملغاة — موجب = على العميل. */
async function accountBalance(accountId: number | null) {
  if (!accountId) return ""
  const row = (await sql`
    SELECT COALESCE(SUM(CASE WHEN vjd.credit_debit = 1 THEN 1 ELSE -1 END * COALESCE(vjd.account_amount, vjd.amount, 0)), 0) AS balance
    FROM voucher_journal_detail_tbl vjd JOIN voucher_header_tbl vh ON vh.id = vjd.voucher_id
    WHERE vjd.account_id = ${accountId} AND vh.status <> 3
  `)[0] as any
  return Number(row?.balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function companyName() {
  try {
    const row = (await sql`SELECT value FROM system_settings WHERE id::text = 'company_name' OR description = 'company_name' LIMIT 1`)[0] as any
    return String(row?.value || "")
  } catch {
    return ""
  }
}

export async function docConfig(docKey: string) {
  await ensureSmsSchema()
  return (await sql`
    SELECT c.doc_key, c.template_id, c.auto_send, t.name AS template_name, t.message_text
    FROM sms_doc_config_tbl c LEFT JOIN sms_templates_tbl t ON t.id = c.template_id
    WHERE c.doc_key = ${docKey}
  `)[0] as { doc_key: string; template_id: number | null; auto_send: boolean; template_name: string | null; message_text: string | null } | undefined
}

/** معاينة رسالة مستند: الجوال + النص المعبّأ من قالب نوعه (أو قالب محدد). */
export async function previewDocumentSms(docKey: string, documentId: number, templateId?: number | null) {
  await ensureSmsSchema()
  const document = await loadDocument(docKey, documentId)
  if (!document) return null
  const template = templateId
    ? ((await sql`SELECT id, name, message_text FROM sms_templates_tbl WHERE id = ${templateId}`)[0] as any)
    : await docConfig(docKey).then((config) => (config?.template_id ? { id: config.template_id, name: config.template_name, message_text: config.message_text } : null))
  const values = {
    "[CustomerName]": document.partyName,
    "[CustomerBalance]": template?.message_text?.includes("[CustomerBalance]") ? await accountBalance(document.accountId) : "",
    "[Code]": document.code,
    "[TransactionDate]": String(document.date || "").slice(0, 10).split("-").reverse().join("/"),
    "[TransactionValue]": document.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    "[TransactionCurrency]": document.currency,
    "[TransactionType]": document.typeLabel,
    "[CompanyName]": template?.message_text?.includes("[CompanyName]") ? await companyName() : "",
  }
  return { document, template: template ? { id: Number(template.id), name: template.name } : null, message: template ? renderSmsTemplate(template.message_text, values) : "" }
}

export async function logSms(entry: { docKey?: string | null; documentId?: number | null; code?: string | null; accountId?: number | null; partyName?: string | null; mobile: string; message: string; result: SmsSendResult; auto?: boolean; userId?: string | null }) {
  await ensureSmsSchema()
  await sql`
    INSERT INTO sms_log_tbl (doc_key, document_id, document_code, account_id, party_name, mobile, message, sent, auto, response, error, created_by)
    VALUES (${entry.docKey || null}, ${entry.documentId || null}, ${entry.code || null}, ${entry.accountId || null}, ${String(entry.partyName || "").slice(0, 200) || null},
      ${entry.mobile.slice(0, 40)}, ${entry.message}, ${entry.result.sent}, ${entry.auto === true}, ${entry.result.response || null}, ${entry.result.error || null}, ${entry.userId || null})
  `
}

/** إرسال تلقائي بعد إضافة مستند (إن فُعّل لنوعه) — لا يرمي أخطاء أبداً حتى لا يُفشل الحفظ. */
export async function autoSendDocumentSms(docKey: string, documentId: number, userId?: string | null) {
  try {
    const settings = await getSmsSettings()
    if (!settings.enabled) return
    const config = await docConfig(docKey)
    if (!config?.auto_send || !config.template_id) return
    const preview = await previewDocumentSms(docKey, documentId)
    if (!preview || !preview.message) return
    const mobile = preview.document.mobile
    const result = mobile ? await sendSmsRaw(mobile, preview.message, settings) : { sent: false, response: "", error: "لا يوجد رقم جوال للعميل" }
    await logSms({ docKey, documentId, code: preview.document.code, accountId: preview.document.accountId, partyName: preview.document.partyName, mobile: mobile || "", message: preview.message, result, auto: true, userId })
  } catch (error) {
    console.error("[sms] auto send failed", error)
  }
}

/**
 * يُستدعى من مسارات الحفظ بعد إضافة مستند: يحدّد قاعدة الشركة الآن (داخل الطلب) ثم يرسل في الخلفية تحت
 * withTenantDb — بعد انتهاء الطلب لا تتوفر headers/cookies فيعود الاتصال للقاعدة الافتراضية لولا ذلك.
 * لا ينتظر المزوّد، فالحفظ لا يتأخر ولا يفشل بسبب الرسائل.
 */
export async function queueAutoSms(docKey: string, documentId: number, userId?: string | null) {
  try {
    if (!(documentId > 0)) return
    const { resolveCurrentDbName, withTenantDb } = await import("@/lib/database")
    const dbName = await resolveCurrentDbName()
    void withTenantDb(dbName, () => autoSendDocumentSms(docKey, documentId, userId))
  } catch (error) {
    console.error("[sms] queue failed", error)
  }
}
