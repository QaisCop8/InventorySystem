import managementSql, { ensureManagementTables } from "@/lib/management-db"
import { initializeLahzaTransaction, isLahzaConfigured, LAHZA_CURRENCIES, toMinorUnits, verifyLahzaTransaction, type LahzaCurrency } from "@/lib/lahza"
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
export async function startCompanyPayment(companyId: number, session: Session, origin: string) {
  await ensureBillingTables()
  const company = await ownedCompany(companyId, session.id)
  if (!company) throw Object.assign(new Error("الشركة غير موجودة"), { status: 404 })
  if (company.status === "approved") return { provisioned: true as const }
  if (company.status !== "awaiting_payment") throw Object.assign(new Error("هذه الشركة ليست بانتظار الدفع"), { status: 400 })

  // محاولة سابقة ربما دُفعت ثم أُغلق المتصفح قبل العودة: تُتحقق أولاً بدل الدفع مرتين
  const previous = await managementSql`SELECT reference FROM company_payments WHERE company_id = ${companyId} AND status IN ('initialized', 'success') ORDER BY id DESC LIMIT 3`
  for (const row of previous) {
    const confirmed = await confirmCompanyPayment(String(row.reference), session).catch(() => null)
    if (confirmed?.status === "approved") return { provisioned: true as const }
  }

  const pricing = await getPricing()
  const counts = { users: Number(company.number_of_users) || 1, branches: Number(company.number_of_branches) || 1, posPoints: Number(company.number_of_pos_points) || 0 }
  const quote = priceFor(pricing, counts)
  if (!(quote.total > 0)) throw Object.assign(new Error("لم يُحدَّد سعر الاشتراك بعد — تواصل مع إدارة النظام"), { status: 400 })
  const reference = `ARK-C${companyId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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
  if (payment.company_status === "approved") return { status: "approved" as const, companyId: Number(payment.company_id), companyName: String(payment.company_name) }

  if (payment.status !== "success") {
    const result = await verifyLahzaTransaction(reference)
    const expectedMinor = toMinorUnits(Number(payment.amount))
    if (result.status !== "success") {
      if (["failed", "abandoned", "reversed"].includes(result.status)) {
        await managementSql`UPDATE company_payments SET status = 'failed', gateway_response = ${result.gatewayResponse || result.status} WHERE reference = ${reference} AND status = 'initialized'`
      }
      return { status: "unpaid" as const, gatewayStatus: result.status, message: result.gatewayResponse || "لم تكتمل عملية الدفع" }
    }
    if (result.amountMinor !== expectedMinor || result.currency !== String(payment.currency).toUpperCase()) {
      await managementSql`UPDATE company_payments SET status = 'mismatch', gateway_response = ${`amount ${result.amountMinor} ${result.currency}`} WHERE reference = ${reference}`
      throw Object.assign(new Error("مبلغ الدفع لا يطابق قيمة الاشتراك — تواصل مع إدارة النظام"), { status: 409 })
    }
    await managementSql`
      UPDATE company_payments SET status = 'success', paid_at = COALESCE(${result.paidAt}::timestamptz, CURRENT_TIMESTAMP), gateway_response = ${result.gatewayResponse}
      WHERE reference = ${reference} AND status <> 'success'`
  }

  // طلب واحد فقط يزوّد الشركة؛ أي طلب متزامن آخر يرى "جاري الإنشاء"
  const [claimed] = await managementSql`UPDATE companies SET status = 'provisioning' WHERE id = ${payment.company_id} AND status = 'awaiting_payment' RETURNING id`
  if (!claimed) {
    const [current] = await managementSql`SELECT status FROM companies WHERE id = ${payment.company_id}`
    return current?.status === "approved"
      ? { status: "approved" as const, companyId: Number(payment.company_id), companyName: String(payment.company_name) }
      : { status: "provisioning" as const, companyId: Number(payment.company_id), companyName: String(payment.company_name) }
  }
  try {
    const [owner] = await managementSql`
      SELECT u.email, u.full_name, u.password_hash FROM companies c JOIN users u ON u.id = c.created_by WHERE c.id = ${payment.company_id}`
    if (!owner) throw new Error("تعذّر العثور على مالك الشركة")
    await provisionCompanyDatabase(
      { id: Number(payment.company_id), name: String(payment.company_name), requestedByEmail: owner.email, requestedByFullName: owner.full_name, requestedByPasswordHash: owner.password_hash },
      Number(payment.user_id),
    )
    // التزويد يضبط ترخيصاً افتراضياً — يُثبَّت هنا الترخيص المدفوع فعلاً
    await managementSql`
      UPDATE companies SET number_of_users = ${Number(payment.number_of_users) || 1}, number_of_branches = ${Number(payment.number_of_branches) || 1}, number_of_pos_points = ${Number(payment.number_of_pos_points) || 0}
      WHERE id = ${payment.company_id}`
  } catch (error) {
    // الدفع محفوظ كناجح: إعادة المحاولة (إكمال الدفع/فتح رابط العودة) تزوّد الشركة بلا دفع جديد
    await managementSql`UPDATE companies SET status = 'awaiting_payment' WHERE id = ${payment.company_id} AND status = 'provisioning'`
    throw error
  }
  void sendMail({
    to: PLATFORM_ADMIN_EMAIL,
    subject: "شركة جديدة مدفوعة تم إنشاؤها",
    html: `<div dir="rtl"><p>دفع المستخدم ${session.full_name} (${session.email}) اشتراك شركة "${payment.company_name}" بمبلغ ${Number(payment.amount).toFixed(2)} ${payment.currency} (مرجع ${reference}).</p><p>الترخيص: ${payment.number_of_users} مستخدم، ${payment.number_of_branches} فرع، ${payment.number_of_pos_points} نقطة بيع. تم إنشاء قاعدة الشركة تلقائياً لمدة سنة.</p></div>`,
  }).catch(() => undefined)
  return { status: "approved" as const, companyId: Number(payment.company_id), companyName: String(payment.company_name) }
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
