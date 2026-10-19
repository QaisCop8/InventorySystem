import managementSql, { ensureManagementTables, getManagementPool } from "@/lib/management-db"
import { countTenantUsage, ensureLicenseTables, LICENSE_RESOURCE_LABELS, type LicenseResource } from "@/lib/company-license"
import { initializeLahzaTransaction, isLahzaConfigured, isLahzaTestMode, LAHZA_CURRENCIES, lahzaPublicKey, toMinorUnits, verifyLahzaTransaction, type LahzaCurrency } from "@/lib/lahza"
import { provisionCompanyDatabase } from "@/lib/provisioning"
import { sendMail } from "@/lib/email"
import { priceFor, type LicenseCounts, type Pricing } from "@/lib/company-pricing"

// الدفع عند إنشاء شركة جديدة (قاعدة الإدارة):
//   platform_pricing  — سعر أساسي للشركة + سعر لكل مستخدم/فرع/نقطة بيع (يحدده مسؤول المنصة)
//   company_payments  — كل محاولة دفع عبر لحظة (reference فريد)، ونجاحها يزوّد قاعدة الشركة فوراً لسنة كاملة.
// الشركة المنتظرة للدفع حالتها 'awaiting_payment' (ولا تظهر لمسؤول المنصة كطلب موافقة)، وأثناء التزويد 'provisioning'.

const PLATFORM_ADMIN_EMAIL = "qais.sabbah@iscosoft.com"

let ensured: Promise<void> | null = null
export function ensureBillingTables() {
  if (!ensured) {
    ensured = (async () => {
      await ensureManagementTables()
      await managementSql`
        CREATE TABLE IF NOT EXISTS platform_pricing (
          id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
          currency VARCHAR(3) NOT NULL DEFAULT 'USD',
          base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
          per_user NUMERIC(12,2) NOT NULL DEFAULT 0,
          per_branch NUMERIC(12,2) NOT NULL DEFAULT 0,
          per_pos_point NUMERIC(12,2) NOT NULL DEFAULT 0,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`
      // أسعار مبدئية للتجربة فقط — يغيّرها مسؤول المنصة من لوحة الإدارة ← الأسعار
      await managementSql`
        INSERT INTO platform_pricing (id, currency, base_price, per_user, per_branch, per_pos_point)
        VALUES (1, 'USD', 100, 10, 20, 15) ON CONFLICT (id) DO NOTHING`
      await managementSql`
        CREATE TABLE IF NOT EXISTS company_payments (
          id SERIAL PRIMARY KEY,
          company_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          provider VARCHAR(20) NOT NULL DEFAULT 'lahza',
          reference VARCHAR(100) NOT NULL UNIQUE,
          amount NUMERIC(12,2) NOT NULL,
          currency VARCHAR(3) NOT NULL,
          number_of_users INTEGER,
          number_of_branches INTEGER,
          number_of_pos_points INTEGER,
          status VARCHAR(20) NOT NULL DEFAULT 'initialized',
          authorization_url TEXT,
          gateway_response TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          paid_at TIMESTAMP
        )`
      await managementSql`CREATE INDEX IF NOT EXISTS idx_company_payments_company ON company_payments(company_id, created_at DESC)`
      // دفعات زيادة الترخيص (مستخدم/فرع/نقطة بيع) من داخل الشركة تُسجَّل بنفس الجدول
      await managementSql`ALTER TABLE company_payments ADD COLUMN IF NOT EXISTS purpose VARCHAR(20) NOT NULL DEFAULT 'company'`
      await managementSql`ALTER TABLE company_payments ADD COLUMN IF NOT EXISTS license_request_id INTEGER`
      await managementSql`ALTER TABLE company_payments ADD COLUMN IF NOT EXISTS tenant_user_id VARCHAR(50)`
      await managementSql`ALTER TABLE company_payments ALTER COLUMN user_id DROP NOT NULL`
      // نسخة تجريبية؟ (تُنشأ بـ/companies/trial). الشركات التجريبية السابقة تُعرَف مرة واحدة من مدة اشتراكها (~10 أيام من الاعتماد)
      await managementSql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_trial BOOLEAN`
      await managementSql`
        UPDATE companies SET is_trial = (approved_at IS NOT NULL AND expiry_date IS NOT NULL AND expiry_date <= approved_at + INTERVAL '15 days')
        WHERE is_trial IS NULL`
      await managementSql`ALTER TABLE companies ALTER COLUMN is_trial SET DEFAULT false`
      // دفعات التجديد/التحويل لنسخة حقيقية: تُطبَّق مرة واحدة فقط (applied_at)
      await managementSql`ALTER TABLE company_payments ADD COLUMN IF NOT EXISTS applied_at TIMESTAMP`
      await managementSql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS provisioning_started_at TIMESTAMP`
      await managementSql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS provisioning_error TEXT`
      // أرقام التواصل مع المبيعات (صفحة خيارات الدفع) — يعدّلها مسؤول المنصة مع الأسعار
      await managementSql`ALTER TABLE platform_pricing ADD COLUMN IF NOT EXISTS sales_phone VARCHAR(40) NOT NULL DEFAULT '+970 92 373 001'`
      await managementSql`ALTER TABLE platform_pricing ADD COLUMN IF NOT EXISTS sales_whatsapp VARCHAR(40) NOT NULL DEFAULT '+970 569 555 576'`
      // "ارسال بطاقة للمبيعات": طلب تواصل بدل الدفع الإلكتروني
      await managementSql`
        CREATE TABLE IF NOT EXISTS sales_leads (
          id SERIAL PRIMARY KEY,
          company_id INTEGER,
          user_id INTEGER,
          name VARCHAR(150) NOT NULL,
          email VARCHAR(150) NOT NULL,
          phone VARCHAR(40) NOT NULL,
          whatsapp VARCHAR(40),
          notes TEXT,
          status VARCHAR(20) NOT NULL DEFAULT 'new',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`
    })().catch((error) => { ensured = null; throw error })
  }
  return ensured
}

export type { Pricing, LicenseCounts }

export async function getPricing(): Promise<Pricing> {
  await ensureBillingTables()
  const [row] = await managementSql`SELECT currency, base_price, per_user, per_branch, per_pos_point FROM platform_pricing WHERE id = 1`
  const currency = (LAHZA_CURRENCIES as readonly string[]).includes(String(row?.currency)) ? (row.currency as LahzaCurrency) : "USD"
  return { currency, base_price: Number(row?.base_price || 0), per_user: Number(row?.per_user || 0), per_branch: Number(row?.per_branch || 0), per_pos_point: Number(row?.per_pos_point || 0) }
}

export async function getSalesContacts(): Promise<{ phone: string; whatsapp: string }> {
  await ensureBillingTables()
  const [row] = await managementSql`SELECT sales_phone, sales_whatsapp FROM platform_pricing WHERE id = 1`
  return { phone: String(row?.sales_phone || ""), whatsapp: String(row?.sales_whatsapp || "") }
}

export async function saveSalesContacts(input: { phone?: unknown; whatsapp?: unknown }) {
  await ensureBillingTables()
  const clean = (value: unknown) => String(value ?? "").trim().slice(0, 40)
  if (input.phone !== undefined || input.whatsapp !== undefined) {
    const current = await getSalesContacts()
    await managementSql`UPDATE platform_pricing SET sales_phone = ${input.phone !== undefined ? clean(input.phone) : current.phone}, sales_whatsapp = ${input.whatsapp !== undefined ? clean(input.whatsapp) : current.whatsapp} WHERE id = 1`
  }
  return getSalesContacts()
}

/** طلب "ارسال بطاقة للمبيعات" — يُحفظ ويُبلَّغ مسؤول المنصة بالبريد (بلا انتظار). */
export async function createSalesLead(input: { companyId?: number | null; userId?: number | null; name: string; email: string; phone: string; whatsapp?: string; notes?: string; companyName?: string }) {
  await ensureBillingTables()
  const [row] = await managementSql`
    INSERT INTO sales_leads (company_id, user_id, name, email, phone, whatsapp, notes)
    VALUES (${input.companyId || null}, ${input.userId || null}, ${input.name}, ${input.email}, ${input.phone}, ${input.whatsapp || null}, ${input.notes || null})
    RETURNING id`
  const escape = (value: string) => value.replace(/[<>&"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[ch] as string)
  void sendMail({
    to: PLATFORM_ADMIN_EMAIL,
    subject: `طلب تواصل مع المبيعات${input.companyName ? ` — ${input.companyName}` : ""}`,
    html: `<div dir="rtl"><p>طلب جديد للتواصل مع المبيعات${input.companyName ? ` بخصوص شركة "${escape(input.companyName)}"` : ""}:</p><ul><li>الاسم: ${escape(input.name)}</li><li>البريد: ${escape(input.email)}</li><li>الهاتف: ${escape(input.phone)}</li>${input.whatsapp ? `<li>واتساب: ${escape(input.whatsapp)}</li>` : ""}</ul>${input.notes ? `<p>ملاحظات: ${escape(input.notes)}</p>` : ""}</div>`,
  }).catch(() => undefined)
  return { id: Number(row.id) }
}

export async function savePricing(input: Partial<Pricing>) {
  await ensureBillingTables()
  const current = await getPricing()
  const money = (value: unknown, fallback: number) => {
    const number = Math.round(Number(value ?? fallback) * 100) / 100
    if (!Number.isFinite(number) || number < 0 || number > 1_000_000) throw new Error("قيمة سعر غير صالحة")
    return number
  }
  const currency = input.currency && (LAHZA_CURRENCIES as readonly string[]).includes(input.currency) ? input.currency : current.currency
  await managementSql`
    UPDATE platform_pricing SET currency = ${currency}, base_price = ${money(input.base_price, current.base_price)}, per_user = ${money(input.per_user, current.per_user)},
      per_branch = ${money(input.per_branch, current.per_branch)}, per_pos_point = ${money(input.per_pos_point, current.per_pos_point)}, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1`
  return getPricing()
}

export { priceFor }

export const paymentsEnabled = async () => isLahzaConfigured() && (await getPricing().then((pricing) => pricing.base_price > 0).catch(() => false))

type Session = { id: number; email: string; full_name: string }

async function ownedCompany(companyId: number, userId: number) {
  const [company] = await managementSql`
    SELECT c.id, c.name, c.status, c.number_of_users, c.number_of_branches, c.number_of_pos_points
    FROM companies c JOIN user_company uc ON uc.company_id = c.id
    WHERE c.id = ${companyId} AND uc.user_id = ${userId} AND COALESCE(uc.is_active, true) = true`
  return company || null
}

/** يبدأ دفع شركة بانتظار الدفع (أو يكمل محاولة سابقة دُفعت فعلاً ولم تُؤكَّد) ويعيد رابط صفحة الدفع. */
export async function startCompanyPayment(companyId: number, session: Session, origin: string, mode: "redirect" | "popup" = "redirect") {
  await ensureBillingTables()
  const company = await ownedCompany(companyId, session.id)
  if (!company) throw Object.assign(new Error("الشركة غير موجودة"), { status: 404 })
  // مدفوعة فعلاً (معتمدة/قيد الاعتماد/فشل اعتمادها ⇒ "اعادة المحاولة" من شركاتي) — لا دفع جديد
  if (["approved", "provisioning", "provisioning_failed"].includes(String(company.status))) return { provisioned: true as const }
  if (company.status !== "awaiting_payment") throw Object.assign(new Error("هذه الشركة ليست بانتظار الدفع"), { status: 400 })

  // محاولة سابقة ربما دُفعت ثم أُغلق المتصفح قبل العودة: تُتحقق أولاً بدل الدفع مرتين
  const previous = await managementSql`SELECT reference FROM company_payments WHERE company_id = ${companyId} AND status IN ('initialized', 'success') ORDER BY id DESC LIMIT 3`
  for (const row of previous) {
    const confirmed = await confirmCompanyPayment(String(row.reference), session).catch(() => null)
    if (confirmed && ["approved", "provisioning", "failed"].includes(confirmed.status)) return { provisioned: true as const }
  }

  const pricing = await getPricing()
  const counts = { users: Number(company.number_of_users) || 1, branches: Number(company.number_of_branches) || 1, posPoints: Number(company.number_of_pos_points) || 0 }
  const quote = priceFor(pricing, counts)
  if (!(quote.total > 0)) throw Object.assign(new Error("لم يُحدَّد سعر الاشتراك بعد — تواصل مع إدارة النظام"), { status: 400 })
  const reference = `ARK-C${companyId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  if (mode === "popup") {
    // نافذة لحظة المنبثقة (LahzaPopup) تُفتح من المتصفح بالمفتاح العام وبنفس المرجع والمبلغ المسجّلين هنا؛
    // التحقق النهائي بالخادم بالمفتاح السري (confirmCompanyPayment يطابق المبلغ والعملة).
    await managementSql`
      INSERT INTO company_payments (company_id, user_id, reference, amount, currency, number_of_users, number_of_branches, number_of_pos_points)
      VALUES (${companyId}, ${session.id}, ${reference}, ${quote.total}, ${quote.currency}, ${counts.users}, ${counts.branches}, ${counts.posPoints})`
    return { provisioned: false as const, reference, amount: quote.total, amountMinor: toMinorUnits(quote.total), currency: quote.currency, email: session.email, fullName: session.full_name, publicKey: lahzaPublicKey() }
  }
  const callbackUrl = `${origin}/management/companies/payment-callback`
  const { authorizationUrl } = await initializeLahzaTransaction({
    email: session.email, firstName: session.full_name, amount: quote.total, currency: quote.currency, reference, callbackUrl,
    metadata: { company_id: companyId, company_name: company.name, users: counts.users, branches: counts.branches, pos_points: counts.posPoints },
  })
  await managementSql`
    INSERT INTO company_payments (company_id, user_id, reference, amount, currency, number_of_users, number_of_branches, number_of_pos_points, authorization_url)
    VALUES (${companyId}, ${session.id}, ${reference}, ${quote.total}, ${quote.currency}, ${counts.users}, ${counts.branches}, ${counts.posPoints}, ${authorizationUrl})`
  return { provisioned: false as const, authorizationUrl, reference, amount: quote.total, currency: quote.currency }
}

/**
 * يتحقق من الدفع لدى لحظة (لا يُعتمد على رابط العودة وحده): الحالة success والمبلغ والعملة مطابقة. عند النجاح يُزوِّد قاعدة
 * الشركة (سنة) ويثبّت الترخيص المدفوع. آمن للتكرار والتزامن: انتقال الحالة awaiting_payment → provisioning شرطي.
 */
export async function confirmCompanyPayment(reference: string, session: Session) {
  await ensureBillingTables()
  const [payment] = await managementSql`
    SELECT p.*, c.name company_name, c.status company_status
    FROM company_payments p JOIN companies c ON c.id = p.company_id
    JOIN user_company uc ON uc.company_id = c.id AND uc.user_id = ${session.id}
    WHERE p.reference = ${reference}`
  if (!payment) throw Object.assign(new Error("عملية الدفع غير موجودة"), { status: 404 })
  if (payment.purpose === "renewal" || payment.purpose === "upgrade") return confirmSubscriptionPayment(payment)
  if (payment.company_status === "approved") return { status: "approved" as const, companyId: Number(payment.company_id), companyName: String(payment.company_name) }

  const settled = await settlePayment(payment)
  if (!settled.ok) return { status: "unpaid" as const, gatewayStatus: settled.gatewayStatus, message: settled.message }

  // الدفع مؤكَّد ⇒ اعتماد الشركة تلقائياً بالخلفية؛ الطلب يعود فوراً و"شركاتي" تعرض "جاري اعتماد الشركة"
  return claimAndProvision(Number(payment.company_id), String(payment.company_name))
}

/**
 * يتحقق من دفعة مسجّلة لدى لحظة (لا يُعتمد على المتصفح): الحالة success والمبلغ والعملة مطابقان لما سجّله الخادم.
 * يعلّم الدفعة ناجحة/فاشلة. يرمي عند عدم تطابق المبلغ. آمن للتكرار (الدفعة الناجحة لا يُعاد فحصها).
 */
async function settlePayment(payment: any): Promise<{ ok: true } | { ok: false; gatewayStatus: string; message: string }> {
  if (payment.status === "success") return { ok: true }
  const reference = String(payment.reference)
  const result = await verifyLahzaTransaction(reference)
  if (result.status !== "success") {
    if (["failed", "abandoned", "reversed"].includes(result.status)) {
      await managementSql`UPDATE company_payments SET status = 'failed', gateway_response = ${result.gatewayResponse || result.status} WHERE reference = ${reference} AND status = 'initialized'`
    }
    return { ok: false, gatewayStatus: result.status, message: result.gatewayResponse || "لم تكتمل عملية الدفع" }
  }
  if (result.amountMinor !== toMinorUnits(Number(payment.amount)) || result.currency !== String(payment.currency).toUpperCase()) {
    await managementSql`UPDATE company_payments SET status = 'mismatch', gateway_response = ${`amount ${result.amountMinor} ${result.currency}`} WHERE reference = ${reference}`
    throw Object.assign(new Error("مبلغ الدفع لا يطابق المبلغ المطلوب — تواصل مع إدارة النظام"), { status: 409 })
  }
  await managementSql`
    UPDATE company_payments SET status = 'success', paid_at = COALESCE(${result.paidAt}::timestamptz, CURRENT_TIMESTAMP), gateway_response = ${result.gatewayResponse}
    WHERE reference = ${reference} AND status <> 'success'`
  return { ok: true }
}

// ───────────── زيادة الترخيص (مستخدم/فرع/نقطة بيع) بالدفع الإلكتروني ─────────────
// السعر = العدد × سعر الوحدة السنوي من "الأسعار". الدفع عبر نافذة لحظة المنبثقة (يتطلب LAHZA_PUBLIC_KEY)، والتحقق
// بالخادم؛ عند النجاح يُعتمد الطلب ويُرفع الحد فوراً في معاملة واحدة (بلا انتظار مسؤول المنصة).

const LICENSE_COLUMNS: Record<LicenseResource, { column: string; initialized: string; base: number }> = {
  users: { column: "number_of_users", initialized: "license_initialized", base: 1 },
  branches: { column: "number_of_branches", initialized: "license_initialized", base: 1 },
  pos_points: { column: "number_of_pos_points", initialized: "pos_license_initialized", base: 0 },
}

export function licenseUnitPrice(pricing: Pricing, resource: LicenseResource) {
  return resource === "users" ? pricing.per_user : resource === "branches" ? pricing.per_branch : pricing.per_pos_point
}

export async function licensePaymentInfo(companyId?: number, tenantUserId?: string | number) {
  const pricing = await getPricing()
  const prices = { users: pricing.per_user, branches: pricing.per_branch, pos_points: pricing.per_pos_point }
  let pendingPayment: { reference: string; resource: LicenseResource; quantity: number } | null = null
  if (companyId && tenantUserId != null) {
    await ensureLicenseTables()
    const [payment] = await managementSql`
      SELECT cp.reference, lr.resource, lr.quantity
      FROM company_payments cp
      JOIN company_license_requests lr ON lr.id = cp.license_request_id
      WHERE cp.company_id = ${companyId}
        AND cp.tenant_user_id = ${String(tenantUserId)}
        AND cp.purpose = 'license'
        AND cp.status IN ('initialized', 'success')
        AND lr.status = 'awaiting_payment'
      ORDER BY cp.id DESC
      LIMIT 1`
    if (payment) pendingPayment = {
      reference: String(payment.reference),
      resource: payment.resource as LicenseResource,
      quantity: Number(payment.quantity) || 1,
    }
  }
  return { enabled: isLahzaConfigured() && Boolean(lahzaPublicKey()), testMode: isLahzaTestMode(), currency: pricing.currency, prices, pendingPayment }
}

export async function startLicensePayment(input: {
  companyId: number; resource: LicenseResource; quantity: number; limitBefore: number; used: number; reason?: string
  tenantUserId: string; requestedByName?: string; email: string
}) {
  await ensureBillingTables()
  await ensureLicenseTables()
  if (!isLahzaConfigured() || !lahzaPublicKey()) throw Object.assign(new Error("الدفع الإلكتروني غير مفعّل"), { status: 400 })
  const quantity = Math.floor(Number(input.quantity))
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 1000) throw Object.assign(new Error("العدد المطلوب يجب أن يكون بين 1 و1000"), { status: 400 })
  const pricing = await getPricing()
  const amount = Math.round(licenseUnitPrice(pricing, input.resource) * quantity * 100) / 100
  if (!(amount > 0)) throw Object.assign(new Error("لم يُحدَّد سعر هذا البند بعد — أرسل طلباً للاعتماد"), { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw Object.assign(new Error("لا يوجد بريد إلكتروني صالح لحسابك — أضفه من بيانات المستخدم أولاً"), { status: 400 })
  const [request] = await managementSql`
    INSERT INTO company_license_requests (company_id, resource, quantity, limit_before, used_at_request, reason, requested_by_name, requested_by_email, tenant_user_id, status)
    VALUES (${input.companyId}, ${input.resource}, ${quantity}, ${input.limitBefore}, ${input.used}, ${String(input.reason || "").trim() || null},
            ${input.requestedByName || null}, ${input.email}, ${Number(input.tenantUserId) || null}, 'awaiting_payment')
    RETURNING id`
  const reference = `ARK-L${input.companyId}-${request.id}-${Date.now()}`
  await managementSql`
    INSERT INTO company_payments (company_id, user_id, tenant_user_id, purpose, license_request_id, reference, amount, currency)
    VALUES (${input.companyId}, NULL, ${String(input.tenantUserId)}, 'license', ${Number(request.id)}, ${reference}, ${amount}, ${pricing.currency})`
  return { reference, amount, amountMinor: toMinorUnits(amount), currency: pricing.currency, email: input.email, fullName: input.requestedByName || "", publicKey: lahzaPublicKey() }
}

/** يتحقق من دفعة زيادة ترخيص ويعتمدها (يرفع الحد) — مرة واحدة فقط حتى مع التكرار. */
export async function confirmLicensePayment(reference: string, companyId: number) {
  await ensureBillingTables()
  const [payment] = await managementSql`SELECT * FROM company_payments WHERE reference = ${reference} AND company_id = ${companyId} AND purpose = 'license'`
  if (!payment) throw Object.assign(new Error("عملية الدفع غير موجودة"), { status: 404 })
  const settled = await settlePayment(payment)
  if (!settled.ok) return { status: "unpaid" as const, message: settled.message }

  const client = await getManagementPool().connect()
  let applied: any = null
  try {
    await client.query("BEGIN")
    const claimed = await client.query(
      `UPDATE company_license_requests SET status = 'approved', approved_quantity = quantity, decided_at = CURRENT_TIMESTAMP, decision_note = $2
       WHERE id = $1 AND status = 'awaiting_payment' RETURNING resource, quantity, company_id`,
      [payment.license_request_id, `دفع إلكتروني — ${reference}`],
    )
    applied = claimed.rows[0] || null
    if (applied) {
      const target = LICENSE_COLUMNS[applied.resource as LicenseResource] || LICENSE_COLUMNS.users
      await client.query(
        `UPDATE companies SET ${target.column} = COALESCE(${target.column}, ${target.base}) + $2, ${target.initialized} = true WHERE id = $1`,
        [applied.company_id, Number(applied.quantity)],
      )
    }
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
  if (applied) {
    const label = LICENSE_RESOURCE_LABELS[applied.resource as LicenseResource]?.plural || applied.resource
    void sendMail({
      to: PLATFORM_ADMIN_EMAIL,
      subject: `زيادة ترخيص مدفوعة — ${label}`,
      html: `<div dir="rtl"><p>تم دفع زيادة ${label} بمقدار ${applied.quantity} للشركة رقم ${applied.company_id} بمبلغ ${Number(payment.amount).toFixed(2)} ${payment.currency} (مرجع ${reference}). تم رفع الحد تلقائياً.</p></div>`,
    }).catch(() => undefined)
  }
  return { status: "approved" as const }
}

// ───────────── تجديد الاشتراك / تحويل النسخة التجريبية إلى حقيقية ─────────────
// المدة الجديدة سنة تبدأ من نهاية الاشتراك الحالي إن لم ينتهِ بعد، وإلا من اليوم (مثال: ينتهي 1/11/2026 وجُدِّد 15/10/2026
// ⇒ من 1/11/2026 إلى 1/11/2027). التجديد متاح لشركة حقيقية بقي على اشتراكها أقل من شهر أو انتهى؛ التحويل لأي نسخة تجريبية.

export const RENEWAL_WINDOW_DAYS = 30
export type SubscriptionPurpose = "renewal" | "upgrade"

async function subscriptionCompany(companyId: number, userId: number) {
  const [company] = await managementSql`
    SELECT c.id, c.name, c.status, c.db_name, c.expiry_date, COALESCE(c.is_trial, false) AS is_trial,
           COALESCE(c.number_of_users, 1) AS number_of_users, COALESCE(c.number_of_branches, 1) AS number_of_branches, COALESCE(c.number_of_pos_points, 0) AS number_of_pos_points,
           GREATEST(COALESCE(c.expiry_date, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP) AS period_start,
           GREATEST(COALESCE(c.expiry_date, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP) + INTERVAL '1 year' AS period_end,
           (c.expiry_date IS NULL OR c.expiry_date < CURRENT_TIMESTAMP + (${RENEWAL_WINDOW_DAYS} * INTERVAL '1 day')) AS renewal_due
    FROM companies c JOIN user_company uc ON uc.company_id = c.id
    WHERE c.id = ${companyId} AND uc.user_id = ${userId} AND COALESCE(uc.is_active, true) = true`
  return company || null
}

export async function startSubscriptionPayment(companyId: number, session: Session, purpose: SubscriptionPurpose, requested?: Partial<LicenseCounts>) {
  await ensureBillingTables()
  if (!isLahzaConfigured() || !lahzaPublicKey()) throw Object.assign(new Error("الدفع الإلكتروني غير مفعّل"), { status: 400 })
  const company = await subscriptionCompany(companyId, session.id)
  if (!company) throw Object.assign(new Error("الشركة غير موجودة"), { status: 404 })
  if (company.status !== "approved" || !company.db_name) throw Object.assign(new Error("الشركة غير جاهزة للتجديد"), { status: 400 })
  if (purpose === "upgrade" && !company.is_trial) throw Object.assign(new Error("هذه الشركة ليست نسخة تجريبية"), { status: 400 })
  if (purpose === "renewal" && company.is_trial) throw Object.assign(new Error("حوّل النسخة التجريبية إلى نسخة حقيقية بدل التجديد"), { status: 400 })
  if (purpose === "renewal" && !company.renewal_due) throw Object.assign(new Error(`التجديد متاح عندما يتبقى على الاشتراك أقل من ${RENEWAL_WINDOW_DAYS} يوماً`), { status: 400 })

  let counts: LicenseCounts = { users: Number(company.number_of_users) || 1, branches: Number(company.number_of_branches) || 1, posPoints: Number(company.number_of_pos_points) || 0 }
  if (purpose === "upgrade") {
    // الترخيص المطلوب لا يقل عن الاستخدام الفعلي الحالي (وإلا تُحجب الإضافات القائمة)
    const usage = await countTenantUsage(String(company.db_name)).catch(() => ({ users: 1, branches: 1, pos_points: 0 }))
    const whole = (value: unknown, min: number) => Math.max(min, Math.floor(Number(value)))
    counts = {
      users: whole(requested?.users ?? counts.users, 1), branches: whole(requested?.branches ?? counts.branches, 1), posPoints: whole(requested?.posPoints ?? counts.posPoints, 0),
    }
    if (![counts.users, counts.branches, counts.posPoints].every((value) => Number.isFinite(value) && value <= 100000)) throw Object.assign(new Error("الأعداد المطلوبة غير صالحة"), { status: 400 })
    if (counts.users < usage.users) throw Object.assign(new Error(`عدد المستخدمين لا يقل عن المستخدمين الحاليين (${usage.users})`), { status: 400 })
    if (counts.branches < usage.branches) throw Object.assign(new Error(`عدد الفروع لا يقل عن الفروع الحالية (${usage.branches})`), { status: 400 })
    if (counts.posPoints < usage.pos_points) throw Object.assign(new Error(`عدد نقاط البيع لا يقل عن النقاط الحالية (${usage.pos_points})`), { status: 400 })
  }
  const pricing = await getPricing()
  const quote = priceFor(pricing, counts)
  if (!(quote.total > 0)) throw Object.assign(new Error("لم يُحدَّد سعر الاشتراك بعد — تواصل مع إدارة النظام"), { status: 400 })
  const reference = `ARK-${purpose === "upgrade" ? "U" : "R"}${companyId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  await managementSql`
    INSERT INTO company_payments (company_id, user_id, purpose, reference, amount, currency, number_of_users, number_of_branches, number_of_pos_points)
    VALUES (${companyId}, ${session.id}, ${purpose}, ${reference}, ${quote.total}, ${quote.currency}, ${counts.users}, ${counts.branches}, ${counts.posPoints})`
  return {
    reference, amount: quote.total, amountMinor: toMinorUnits(quote.total), currency: quote.currency, email: session.email, fullName: session.full_name, publicKey: lahzaPublicKey(),
    periodStart: company.period_start, periodEnd: company.period_end,
  }
}

/** بعد التحقق من الدفع: سنة جديدة من نهاية الاشتراك (أو اليوم إن انتهى) + الترخيص المدفوع، وإلغاء علامة "تجريبية" — مرة واحدة فقط. */
async function confirmSubscriptionPayment(payment: any) {
  const settled = await settlePayment(payment)
  if (!settled.ok) return { status: "unpaid" as const, gatewayStatus: settled.gatewayStatus, message: settled.message }
  const client = await getManagementPool().connect()
  let applied = false
  let expiry: string | null = null
  try {
    await client.query("BEGIN")
    const claimed = await client.query(`UPDATE company_payments SET applied_at = CURRENT_TIMESTAMP WHERE reference = $1 AND applied_at IS NULL RETURNING id`, [payment.reference])
    if (claimed.rows[0]) {
      const updated = await client.query(
        `UPDATE companies SET
           expiry_date = GREATEST(COALESCE(expiry_date, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP) + INTERVAL '1 year',
           is_trial = false, status = CASE WHEN status = 'stopped' THEN status ELSE 'approved' END,
           number_of_users = $2, number_of_branches = $3, number_of_pos_points = $4, license_initialized = true, pos_license_initialized = true
         WHERE id = $1 RETURNING expiry_date`,
        [payment.company_id, Number(payment.number_of_users) || 1, Number(payment.number_of_branches) || 1, Number(payment.number_of_pos_points) || 0],
      )
      expiry = updated.rows[0]?.expiry_date ? new Date(updated.rows[0].expiry_date).toISOString() : null
      applied = true
    }
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
  if (applied) {
    void sendMail({
      to: PLATFORM_ADMIN_EMAIL,
      subject: payment.purpose === "upgrade" ? `تحويل نسخة تجريبية إلى حقيقية — ${payment.company_name}` : `تجديد اشتراك — ${payment.company_name}`,
      html: `<div dir="rtl"><p>${payment.purpose === "upgrade" ? "تم تحويل النسخة التجريبية" : "تم تجديد اشتراك"} شركة "${payment.company_name}" بمبلغ ${Number(payment.amount).toFixed(2)} ${payment.currency} (مرجع ${payment.reference}).</p><p>الترخيص: ${payment.number_of_users} مستخدم، ${payment.number_of_branches} فرع، ${payment.number_of_pos_points} نقطة بيع${expiry ? `، وينتهي الاشتراك في ${expiry.slice(0, 10)}` : ""}.</p></div>`,
    }).catch(() => undefined)
  }
  return { status: "approved" as const, companyId: Number(payment.company_id), companyName: String(payment.company_name), expiryDate: expiry }
}

const STALE_PROVISIONING_MINUTES = 10

function runInBackground(task: Promise<unknown>) {
  // Cloudflare Workers يحتاج waitUntil ليكمل بعد إرسال الاستجابة؛ خادم Node (Render) يكمل تلقائياً
  const context = (globalThis as any)[Symbol.for("__cloudflare-context__")]
  context?.ctx?.waitUntil?.(task)
}

/** ينقل الشركة إلى provisioning (طلب واحد فقط يفوز) ويبدأ إنشاء قاعدتها بالخلفية. */
async function claimAndProvision(companyId: number, companyName: string) {
  const [claimed] = await managementSql`
    UPDATE companies SET status = 'provisioning', provisioning_started_at = CURRENT_TIMESTAMP, provisioning_error = NULL
    WHERE id = ${companyId}
      AND (status IN ('awaiting_payment', 'provisioning_failed')
           OR (status = 'provisioning' AND provisioning_started_at < CURRENT_TIMESTAMP - (${STALE_PROVISIONING_MINUTES} * INTERVAL '1 minute')))
    RETURNING id`
  if (!claimed) {
    const [current] = await managementSql`SELECT status FROM companies WHERE id = ${companyId}`
    const status = current?.status === "approved" ? "approved" as const : current?.status === "provisioning_failed" ? "failed" as const : "provisioning" as const
    return { status, companyId, companyName }
  }
  const task = provisionPaidCompany(companyId).catch((error) => console.error("[company-billing] provisioning failed", companyId, error))
  runInBackground(task)
  return { status: "provisioning" as const, companyId, companyName }
}

async function provisionPaidCompany(companyId: number) {
  try {
    const [payment] = await managementSql`
      SELECT * FROM company_payments WHERE company_id = ${companyId} AND status = 'success' ORDER BY paid_at DESC NULLS LAST, id DESC LIMIT 1`
    if (!payment) throw new Error("لا توجد دفعة ناجحة لهذه الشركة")
    const [owner] = await managementSql`
      SELECT c.name, u.email, u.full_name, u.password_hash FROM companies c JOIN users u ON u.id = c.created_by WHERE c.id = ${companyId}`
    if (!owner) throw new Error("تعذّر العثور على مالك الشركة")
    await provisionCompanyDatabase(
      { id: companyId, name: String(owner.name), requestedByEmail: owner.email, requestedByFullName: owner.full_name, requestedByPasswordHash: owner.password_hash },
      Number(payment.user_id),
    )
    // التزويد يضبط ترخيصاً افتراضياً — يُثبَّت هنا الترخيص المدفوع فعلاً
    await managementSql`
      UPDATE companies SET number_of_users = ${Number(payment.number_of_users) || 1}, number_of_branches = ${Number(payment.number_of_branches) || 1},
        number_of_pos_points = ${Number(payment.number_of_pos_points) || 0}, provisioning_error = NULL
      WHERE id = ${companyId}`
    void sendMail({
      to: PLATFORM_ADMIN_EMAIL,
      subject: "شركة جديدة مدفوعة تم اعتمادها",
      html: `<div dir="rtl"><p>تم دفع اشتراك شركة "${owner.name}" بمبلغ ${Number(payment.amount).toFixed(2)} ${payment.currency} (مرجع ${payment.reference}) من ${owner.full_name} (${owner.email}).</p><p>الترخيص: ${payment.number_of_users} مستخدم، ${payment.number_of_branches} فرع، ${payment.number_of_pos_points} نقطة بيع. تم اعتماد الشركة وإنشاء قاعدتها تلقائياً لمدة سنة.</p></div>`,
    }).catch(() => undefined)
  } catch (error) {
    // الدفع يبقى ناجحاً: "اعادة المحاولة" تعيد الإنشاء فقط بلا دفع جديد
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500)
    await managementSql`UPDATE companies SET status = 'provisioning_failed', provisioning_error = ${message} WHERE id = ${companyId} AND status = 'provisioning'`
    throw error
  }
}

/** "اعادة المحاولة" لشركة مدفوعة فشل اعتمادها (أو علق إنشاؤها) — لا دفع جديد. */
export async function retryCompanyProvisioning(companyId: number, session: Session) {
  await ensureBillingTables()
  const company = await ownedCompany(companyId, session.id)
  if (!company) throw Object.assign(new Error("الشركة غير موجودة"), { status: 404 })
  const [paid] = await managementSql`SELECT 1 FROM company_payments WHERE company_id = ${companyId} AND status = 'success' LIMIT 1`
  if (!paid) throw Object.assign(new Error("لا توجد دفعة ناجحة لهذه الشركة — أكمل الدفع أولاً"), { status: 400 })
  return claimAndProvision(companyId, String(company.name))
}

/** أصل الموقع لرابط العودة من صفحة الدفع (NEXT_PUBLIC_APP_URL أولاً، ثم رؤوس الوكيل مثل Render). */
export function appOrigin(request: Request) {
  const configured = String(process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "")
  if (configured) return configured
  const headers = request.headers
  const host = headers.get("x-forwarded-host") || headers.get("host") || new URL(request.url).host
  const proto = headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https")
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`
}
