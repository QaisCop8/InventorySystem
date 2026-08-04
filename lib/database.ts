import { neon } from "@neondatabase/serverless"
import { Pool, types } from "pg"
import { cookies, headers } from "next/headers"
import { AsyncLocalStorage } from "node:async_hooks"
import { withDatabaseName, getDatabaseNameFromUrl, isNeonDatabaseUrl } from "./db-url"

// node-postgres يحوّل أعمدة DATE افتراضياً إلى كائن JS Date مربوط بمنتصف الليل بالتوقيت المحلي
// لخادم Node (لا UTC ولا أي علاقة بالقيمة المخزَّنة فعلياً) — فتاريخ مثل "1990-01-01" على خادم
// بتوقيت +02:00 (Africa/Cairo هنا) يصبح "1989-12-31T22:00:00.000Z"، ويظهر بعدها كيوم سابق خاطئ في
// أي مكان يعرضه (تأكَّد تجريبياً: القيمة المخزَّنة فعلياً في القاعدة صحيحة، والعطل فقط في تحويل
// pg لها لجافاسكربت). التسجيل هنا (OID 1082 = date) يُعيدها كنص "YYYY-MM-DD" خام بلا تحويل، وهو
// الإصلاح المعياري الموصى به لِهذه المشكلة المعروفة في node-postgres. لا يؤثر على مسار Neon
// (neon() أدناه) لأنه لا يستخدم سجل الأنواع هذا التابع لحزمة pg.
types.setTypeParser(1082, (value: string) => value)

// تنفيذ استعلام خام (نص + معاملات موضعية $1,$2...) على قاعدة بعينها — واجهة موحَّدة تُخفي الفرق بين
// pg.Pool محلياً و.unsafe() الخاصة بعميل Neon، حتى يبقى منطق تركيب الاستعلامات (أدناه) مستقلاً تماماً
// عن الخلفيّة الفعلية.
interface TenantClient {
  query: (text: string, params: any[]) => Promise<any[]>
}

const baseUrl = (process.env.DATABASE_URL || "").trim()
const defaultDbName = baseUrl ? getDatabaseNameFromUrl(baseUrl) : ""

function buildNoopClient(): TenantClient {
  return { query: async () => [] }
}

function buildClientForUrl(url: string): TenantClient {
  if (!url) return buildNoopClient()

  if (!isNeonDatabaseUrl(url)) {
    const pool = new Pool({ connectionString: url })
    return { query: async (text, params) => (await pool.query(text, params)).rows }
  }
  const neonClient = neon(url) as any
  return { query: (text, params) => neonClient.unsafe(text, params) }
}

// عميل واحد لكل قاعدة (مُخزَّن مؤقتاً بالذاكرة) — لا نفتح اتصالاً/Pool جديداً بكل استعلام، ولا حتى
// بكل طلب HTTP، بل مرة واحدة لكل db_name طيلة عمر العملية (Node process).
const clientCache = new Map<string, TenantClient>()

function getClientForDbName(dbName: string): TenantClient {
  let client = clientCache.get(dbName)
  if (!client) {
    const url = dbName === defaultDbName ? baseUrl : withDatabaseName(baseUrl, dbName)
    client = buildClientForUrl(url)
    clientCache.set(dbName, client)
  }
  return client
}

// وصول مباشر لقاعدة شركة بعينها بصرف النظر عن كوكي tenant_db للطلب الحالي — يُستخدَم فقط من كود
// التزويد (lib/provisioning.ts) الذي يجب أن يكتب لقاعدة الشركة المُنشأة حديثاً تحديداً، لا لقاعدة
// الشركة التي يتصفّحها المسؤول (Qais) حالياً أثناء الموافقة.
export function getPoolForDb(dbName: string): TenantClient {
  return getClientForDbName(dbName)
}

// pg.Pool حقيقي (وليس دالة tagged-template) للكود الذي يحتاج معاملات (BEGIN/COMMIT/ROLLBACK) عبر
// عدة استعلامات على نفس الاتصال — مثل lib/orders.ts's createOrder. يعمل مع Neon أيضاً (بروتوكول
// Postgres السلكي القياسي مدعوم من Neon، لا يقتصر الاتصال به على عميل neon() المبني على HTTP فقط).
// مُخصَّص لقاعدة الشركة الحالية (نفس كوكي tenant_db)، ومُخزَّن مؤقتاً بالذاكرة لكل قاعدة كذلك.
const rawPoolCache = new Map<string, Pool>()

export async function getTenantPool(): Promise<Pool> {
  const dbName = await resolveCurrentDbName()
  let pool = rawPoolCache.get(dbName)
  if (!pool) {
    const url = dbName === defaultDbName ? baseUrl : withDatabaseName(baseUrl, dbName)
    pool = new Pool({ connectionString: url })
    rawPoolCache.set(dbName, pool)
  }
  return pool
}

// قائمة أسماء قواعد الشركات المعتمَدة (status='approved') — مخزَّنة مؤقتاً دقيقة واحدة، حتى لا
// نستعلم قاعدة الإدارة (management) في كل استعلام لكل طلب HTTP في التطبيق كله.
let approvedDbNamesCache: { names: Set<string>; loadedAt: number } | null = null
const APPROVED_NAMES_TTL_MS = 60_000

async function isApprovedTenantDb(dbName: string): Promise<boolean> {
  const now = Date.now()
  if (!approvedDbNamesCache || now - approvedDbNamesCache.loadedAt > APPROVED_NAMES_TTL_MS) {
    try {
      const managementSql = (await import("./management-db")).default
      // تُستثنى الشركات المنتهي اشتراكها هنا أيضاً (لا فقط عند اختيار الشركة في select-company) —
      // حاجز دفاعي إضافي يقطع كل استعلامات هذه القاعدة فوراً حتى لو بقيت كوكي tenant_db قديمة سارية
      // من قبل تاريخ الانتهاء (المستخدم لم يُعِد اختيار الشركة، فلا مسار آخر كان سيرفض طلباته).
      const rows = await managementSql`
        SELECT db_name FROM companies
        WHERE status = 'approved' AND db_name IS NOT NULL AND (expiry_date IS NULL OR expiry_date > CURRENT_TIMESTAMP)
      `
      approvedDbNamesCache = { names: new Set(rows.map((r: any) => r.db_name)), loadedAt: now }
    } catch (error) {
      console.error("[database] Failed to refresh approved tenant db list:", error)
      return false
    }
  }
  return approvedDbNamesCache!.names.has(dbName)
}

// تجاوز صريح (وليس عبر كوكي/هيدر) لقاعدة الشركة الحالية ضمن نطاق دالة واحدة — يُستخدَم من
// /api/management/select-company لتنفيذ تسجيل الدخول التلقائي على قاعدة الشركة المُختارة للتو
// ضمن نفس الطلب، دون اعتماد على قراءة الكوكي الذي ضُبط للتو (توقيت الكتابة/القراءة داخل نفس
// الطلب في Route Handlers غير مضمون بنفس درجة تجاوز صريح كهذا).
const tenantOverrideStorage = new AsyncLocalStorage<string>()

export function withTenantDb<T>(dbName: string, fn: () => Promise<T>): Promise<T> {
  return tenantOverrideStorage.run(dbName, fn)
}

// كوكي tenant_db يُضبط فقط بواسطة /api/management/select-company بعد التحقق من ملكية المستخدم
// لتلك الشركة وأنها معتمَدة — بلا هذا الكوكي (أو حين لا يمكن قراءة الكوكيز أصلاً، كسكربتات CLI/
// اختبارات مباشرة) يبقى التطبيق يعمل على القاعدة الافتراضية (DATABASE_URL) تماماً كسلوكه الحالي،
// حفاظاً على التوافق التام مع الاستخدام أحادي الشركة القائم.
//
// ترتيب الأولوية: تجاوز صريح (withTenantDb) > هيدر x-tenant-db (لكل تبويب متصفح على حدة — يُضبط
// من تصحيح fetch في auth-context.tsx حتى تتمكّن عدة تبويبات من فتح شركات مختلفة في آنٍ واحد رغم
// أن الكوكي مشتركة بين كل تبويبات نفس المتصفح) > كوكي tenant_db (المسار الأقدم/تبويب واحد).
export async function resolveCurrentDbName(): Promise<string> {
  const override = tenantOverrideStorage.getStore()
  if (override) return override

  try {
    const headerStore = await headers()
    const headerDb = headerStore.get("x-tenant-db")
    if (headerDb && /^[a-zA-Z0-9_]+$/.test(headerDb) && (await isApprovedTenantDb(headerDb))) {
      return headerDb
    }
  } catch {
    // headers() غير متاحة خارج سياق طلب فعلي.
  }

  try {
    const cookieStore = await cookies()
    const tenantDb = cookieStore.get("tenant_db")?.value
    if (tenantDb && /^[a-zA-Z0-9_]+$/.test(tenantDb) && (await isApprovedTenantDb(tenantDb))) {
      return tenantDb
    }
  } catch {
    // cookies() غير متاحة خارج سياق طلب فعلي — استخدم القاعدة الافتراضية بصمت.
  }
  return defaultDbName
}

// يدعم الاستخدامين اللذين يعتمد عليهما الكود القائم بكل مكان في المشروع (على غرار عميل Neon
// الحقيقي): استدعاء sql`...` مباشرة كنص قالب مع معاملات مربوطة $1,$2...، و sql.unsafe(text, params)
// لاستعلام نصّي خام — وكلاهما قابل لأن يُضمَّن كـ"جزء" (fragment) داخل استدعاء آخر (مثل
// `WHERE ${sql.unsafe(whereClause)}`) بدل أن يُعامَل كقيمة مربوطة عادية، لأسماء أعمدة/جداول ديناميكية
// أو شروط WHERE مبنية سلفاً. بناء النص فوري ومتزامن (لا يحتاج معرفة "أي شركة" أصلاً)؛ التنفيذ الفعلي
// وحده (عند await) يحلّ الشركة الحالية عبر كوكي tenant_db وينفّذ الاستعلام النهائي عليها.
class SqlFragment {
  constructor(
    public text: string,
    public params: any[],
  ) {}
}

function isFragment(value: any): value is SqlFragment {
  return value instanceof SqlFragment
}

function buildTaggedQuery(strings: readonly string[], values: any[]): { text: string; params: any[] } {
  let text = strings[0] ?? ""
  const params: any[] = []
  for (let i = 0; i < values.length; i++) {
    const value = values[i]
    if (isFragment(value)) {
      text += value.text
      params.push(...value.params)
    } else {
      params.push(value)
      text += `$${params.length}`
    }
    text += strings[i + 1] ?? ""
  }
  return { text, params }
}

function makeAwaitableFragment(text: string, params: any[]): any {
  const fragment: any = new SqlFragment(text, params)
  fragment.then = (resolve: any, reject: any) => {
    ;(async () => {
      const dbName = await resolveCurrentDbName()
      const client = getClientForDbName(dbName)
      return client.query(text, params)
    })().then(resolve, reject)
  }
  fragment.catch = (onReject: any) => Promise.resolve(fragment).catch(onReject)
  return fragment
}

const sql: any = (strings: TemplateStringsArray, ...values: any[]) => {
  const { text, params } = buildTaggedQuery(strings, values)
  return makeAwaitableFragment(text, params)
}
sql.unsafe = (text: string, params: any[] = []) => makeAwaitableFragment(text, params)

export default sql

// Database utility functions
export async function executeQuery(query: string, params: any[] = []) {
  try {
    // neon doesn't support .query() method, only template literals
    // For parameterized queries, we need to use the template literal syntax
    const result = await sql([query] as any, ...params)
    return { success: true, data: result }
  } catch (error) {
    console.error("[v0] Database query error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown database error",
    }
  }
}

// Customer operations
export async function getCustomers() {
  try {
    const result = await sql`SELECT * FROM customers ORDER BY created_at DESC`
    return { success: true, data: result }
  } catch (error) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}

export async function createCustomer(customerData: any) {
  const query = `
    INSERT INTO customers (
      customer_code, customer_name, mobile1, mobile2, whatsapp1, whatsapp2,
      city, address, email, business_nature, salesman, classifications,
      movement_notes, general_notes, api_number,
      account_opening_date, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING *
  `
  const params = [
    customerData.customer_code,
    customerData.customer_name || customerData.name, // Support both field names for compatibility
    customerData.mobile1,
    customerData.mobile2,
    customerData.whatsapp1,
    customerData.whatsapp2,
    customerData.city,
    customerData.address,
    customerData.email,
    customerData.business_nature,
    customerData.salesman,
    customerData.classifications,
    customerData.movement_notes,
    customerData.general_notes,
    customerData.api_number,
    customerData.account_opening_date,
    customerData.status || "active",
  ]
  return executeQuery(query, params)
}

// Supplier operations
export async function getSuppliers() {
  try {
    const result = await sql`SELECT * FROM suppliers ORDER BY created_at DESC`
    return { success: true, data: result }
  } catch (error) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}

export async function createSupplier(supplierData: any) {
  const query = `
    INSERT INTO suppliers (
      supplier_code, supplier_name, mobile1, mobile2, whatsapp1, whatsapp2,
      city, address, email, business_nature, salesman, classifications,
      movement_notes, general_notes, api_number,
      account_opening_date, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING *
  `
  const params = [
    supplierData.supplier_code,
    supplierData.supplier_name || supplierData.name, // Support both field names for compatibility
    supplierData.mobile1,
    supplierData.mobile2,
    supplierData.whatsapp1,
    supplierData.whatsapp2,
    supplierData.city,
    supplierData.address,
    supplierData.email,
    supplierData.business_nature,
    supplierData.salesman,
    supplierData.classifications,
    supplierData.movement_notes,
    supplierData.general_notes,
    supplierData.api_number,
    supplierData.account_opening_date,
    supplierData.status || "active",
  ]
  return executeQuery(query, params)
}

// Product operations
export async function getProducts() {
  try {
    const result = await sql`
      SELECT p.*, ig.group_name as category_name, s.supplier_name as supplier_name
      FROM products p
      LEFT JOIN item_groups ig ON p.category = ig.group_name
      LEFT JOIN suppliers s ON p.product_code = s.supplier_code
      ORDER BY p.created_at DESC
    `
    return { success: true, data: result }
  } catch (error) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}

export async function createProduct(productData: any) {
  const query = `
    INSERT INTO products (
      product_code, product_name, description, barcode, original_number,
      manufacturer_number, category, main_unit, secondary_unit,
      conversion_factor, currency, last_purchase_price, 
      order_quantity, max_quantity, has_expiry, has_batch_number, 
      has_colors, status, product_type, entry_date, product_image
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
    RETURNING *
  `
  const params = [
    productData.product_code,
    productData.product_name || productData.name, // Support both field names for compatibility
    productData.description,
    productData.barcode,
    productData.original_number,
    productData.manufacturer_number,
    productData.category,
    productData.main_unit,
    productData.secondary_unit,
    productData.conversion_factor || 1,
    productData.currency,
    productData.last_purchase_price || 0,
    productData.order_quantity || 0,
    productData.max_quantity || 0,
    productData.has_expiry || false,
    productData.has_batch_number || false,
    productData.has_colors || false,
    productData.status || "active",
    productData.product_type || "عادي",
    productData.entry_date || new Date().toISOString().split("T")[0],
    productData.product_image,
  ]
  return executeQuery(query, params)
}

// Sales Orders operations
export async function getSalesOrders() {
  try {
    const result = await sql`
      SELECT so.*, c.customer_name as customer_name
      FROM sales_orders so
      LEFT JOIN customers c ON so.customer_id = c.id
      ORDER BY so.created_at DESC
    `
    return { success: true, data: result }
  } catch (error) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}

export async function createSalesOrder(orderData: any) {
  const query = `
    INSERT INTO sales_orders (
      order_number, order_date, customer_id, customer_code, salesman,
      currency_name, currency_symbol, exchange_rate, manual_document,
      financial_status, order_status, delivery_date, subtotal, tax_amount,
      discount_amount, total_amount, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING *
  `
  const params = [
    orderData.order_number,
    orderData.order_date,
    orderData.customer_id,
    orderData.customer_code,
    orderData.salesman,
    orderData.currency_name,
    orderData.currency_symbol,
    orderData.exchange_rate || 1,
    orderData.manual_document,
    orderData.financial_status,
    orderData.order_status,
    orderData.delivery_date,
    orderData.subtotal || 0,
    orderData.tax_amount || 0,
    orderData.discount_amount || 0,
    orderData.total_amount || 0,
    orderData.notes,
  ]
  return executeQuery(query, params)
}

// Purchase Orders operations
export async function getPurchaseOrders() {
  try {
    const result = await sql`
      SELECT po.*, s.supplier_name as supplier_name
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      ORDER BY po.created_at DESC
    `
    return { success: true, data: result }
  } catch (error) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}

export async function createPurchaseOrder(orderData: any) {
  const query = `
    INSERT INTO purchase_orders (
      order_number, order_date, supplier_id, supplier_code, salesman,
      currency_name, currency_symbol, exchange_rate, manual_document,
      expected_date, subtotal, tax_amount, discount_amount, total_amount,
      status, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING *
  `
  const params = [
    orderData.order_number,
    orderData.order_date,
    orderData.supplier_id,
    orderData.supplier_code,
    orderData.salesman,
    orderData.currency_name,
    orderData.currency_symbol,
    orderData.exchange_rate || 1,
    orderData.manual_document,
    orderData.expected_date,
    orderData.subtotal || 0,
    orderData.tax_amount || 0,
    orderData.discount_amount || 0,
    orderData.total_amount || 0,
    orderData.status || "قيد التنفيذ",
    orderData.notes,
  ]
  return executeQuery(query, params)
}

// Exchange rates operations
export async function getExchangeRates() {
  try {
    const result = await sql`
      SELECT * FROM exchange_rates 
      ORDER BY currency_code
    `
    return { success: true, data: result }
  } catch (error) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}

export async function getCurrenciesWithLatestRate() {
  try {
    const result = await sql`
      SELECT 
        c.id AS currency_id,
        c.currency_code,
        c.currency_name,
        c.is_active AS is_active,
        c.created_at AS currency_created,
        c.updated_at AS currency_updated,
        er.id AS id,
        er.buy_rate,
        er.sell_rate,
        er.exchange_rate,
        to_char(er.rate_date, 'YYYY-MM-DD') AS rate_date,
        er.is_active AS rate_active,
        er.created_at AS rate_created,
        er.updated_at AS rate_updated
      FROM currency c
      LEFT JOIN LATERAL (
        SELECT *
        FROM exchange_rates er
        WHERE er.currency_id = c.id
        ORDER BY er.rate_date DESC, er.created_at DESC
        LIMIT 1
      ) er ON true
      ORDER BY c.id
    `

    return { success: true, data: result }
  } catch (error: any) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}

// أسعار الصرف "كما كانت" بتاريخ مُعيَّن — لكل عملة نشطة (عدا الرئيسية، الثابتة دوماً عند 1): إن وُجد
// سعر مسجَّل لهذا التاريخ تحديداً يُعاد كما هو، وإلا يُنسَخ آخر سعر معروف قبل هذا التاريخ (أو 0 إن لم
// يوجد أي سعر سابق إطلاقاً) ويُحفَظ تلقائياً كسعر هذا اليوم — حتى لا تُفتَح شاشة الإدخال بلا أي قيمة
// افتراضية معقولة لأي عملة.
export async function getOrCreateRatesForDate(date: string) {
  try {
    const rows = await sql`
      SELECT
        c.id AS currency_id, c.currency_code, c.currency_name, c.is_active,
        er.id, er.buy_rate, er.sell_rate, er.exchange_rate, to_char(er.rate_date, 'YYYY-MM-DD') AS rate_date
      FROM currency c
      LEFT JOIN LATERAL (
        SELECT *
        FROM exchange_rates er
        WHERE er.currency_id = c.id AND er.rate_date <= ${date}
        ORDER BY er.rate_date DESC, er.created_at DESC
        LIMIT 1
      ) er ON true
      ORDER BY c.id
    `

    const baseId = rows.length > 0 ? Math.min(...rows.map((r: any) => Number(r.currency_id))) : null

    const result = []
    for (const row of rows as any[]) {
      const currencyId = Number(row.currency_id)

      if (currencyId === baseId) {
        result.push({ ...row, buy_rate: 1, sell_rate: 1, exchange_rate: 1, rate_date: date })
        continue
      }

      const existingDate = row.rate_date ? String(row.rate_date).slice(0, 10) : null
      if (existingDate === date || row.is_active === false) {
        result.push(row)
        continue
      }

      // بلا أي سعر سابق مسجَّل إطلاقاً لهذه العملة (لا صف أصلاً عبر LEFT JOIN LATERAL، فـrow.buy_rate
      // وأخواتها null) — القيمة الافتراضية المعقولة هي 1 (لا فرق صرف بعد) وليس 0 (سعر صرف صفري
      // يُفسَد به أي حساب لاحق يعتمد القسمة على سعر الصرف).
      const carried = await sql`
        INSERT INTO exchange_rates (currency_id, buy_rate, sell_rate, exchange_rate, is_active, rate_date)
        VALUES (${currencyId}, ${row.buy_rate ?? 1}, ${row.sell_rate ?? 1}, ${row.exchange_rate ?? 1}, true, ${date})
        RETURNING id, buy_rate, sell_rate, exchange_rate, rate_date
      `
      result.push({ ...row, ...carried[0] })
    }

    return { success: true, data: result }
  } catch (error: any) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}

export async function getExchangeRate(
  currency_id: number,
  rate_date?: string | null
) {
  try {
    const result = await sql`
  SELECT COALESCE(
           (SELECT exchange_rate
            FROM exchange_rates
            WHERE currency_id = ${currency_id}
              AND is_active = true
              AND rate_date <= ${rate_date}
            ORDER BY rate_date DESC
            LIMIT 1),
           1
         ) AS exchange_rate
`;

    // Defensive check in case result.rows is undefined
    const exchangeRate = result[0]?.exchange_rate
      ? Number(result[0].exchange_rate) > 0 ? Number(result[0].exchange_rate) : 1
      : 1;

    return {
      success: true,
      data: exchangeRate,
    };
  } catch (error: any) {
    console.error("Error fetching exchange rate:", error);
    return {
      success: false,
      error: error.message || "Unknown error",
    };
  }
}
// ملاحظة: كانت هذه الدالة تبني نصوص SQL عبر قوالب حرفية (template literals) وتُمرّرها لـ executeQuery
// بلا معاملات مربوطة إطلاقاً — أي أن buy_rate/sell_rate/exchange_rate/currency_id (قيم من جسم طلب
// المستخدم مباشرة) كانت تُدرَج خاماً داخل نص الاستعلام، وهي ثغرة حقن SQL كلاسيكية. استُبدلت هنا
// بالقوالب الموسومة (tagged templates) لـ sql التي تربط كل قيمة كمعامل $n حقيقي.
export async function updateExchangeRate(id: number, rates: any) {
  try {
    if (rates.type === 1) {
      // rate_date اختياري — بلا تمريره (الاستخدام القديم) يبقى السلوك كما كان دوماً (يوم اليوم)؛
      // نافذة أسعار الصرف اليومية الجديدة تُمرِّره صراحةً لتحديث/إدخال سعر تاريخ مُختار بعينه.
      const rateDate = rates.rate_date || new Date().toISOString().slice(0, 10)
      const existing = await sql`
        SELECT id FROM exchange_rates
        WHERE currency_id = ${rates.currency_id}
        AND rate_date = ${rateDate}
        LIMIT 1
      `

      if (existing.length > 0) {
        const result = await sql`
          UPDATE exchange_rates
          SET
            buy_rate = ${rates.buy_rate},
            sell_rate = ${rates.sell_rate},
            exchange_rate = ${rates.exchange_rate},
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ${existing[0].id}
          RETURNING *
        `
        return { success: true, data: result }
      } else {
        const result = await sql`
          INSERT INTO exchange_rates (
            currency_id, buy_rate, sell_rate, exchange_rate, is_active, rate_date
          ) VALUES (
            ${rates.currency_id}, ${rates.buy_rate}, ${rates.sell_rate}, ${rates.exchange_rate},
            ${rates.is_active ?? true}, ${rateDate}
          ) RETURNING *
        `
        return { success: true, data: result }
      }
    } else {
      const result = await sql`
        UPDATE exchange_rates
        SET
          buy_rate = ${rates.buy_rate},
          sell_rate = ${rates.sell_rate},
          exchange_rate = ${rates.exchange_rate},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING *
      `
      return { success: true, data: result }
    }
  } catch (error: any) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}


// Order Items operations
export async function getOrderItems(orderType: string, orderId: number) {
  try {
    const result = await sql`
      SELECT oi.*, p.product_name as product_name
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_type = ${orderType} AND oi.order_id = ${orderId}
      ORDER BY oi.created_at
    `
    return { success: true, data: result }
  } catch (error) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}

export async function createOrderItem(itemData: any) {
  const query = `
    INSERT INTO order_items (
      order_type, order_id, product_id, product_code, product_name,
      barcode, warehouse_id, quantity, bonus_quantity, unit,
      unit_price, total_price, expiry_date, batch_number, item_notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *
  `
  const params = [
    itemData.order_type,
    itemData.order_id,
    itemData.product_id,
    itemData.product_code,
    itemData.product_name,
    itemData.barcode,
    itemData.warehouse_id,
    itemData.quantity,
    itemData.bonus_quantity || 0,
    itemData.unit,
    itemData.unit_price,
    itemData.total_price,
    itemData.expiry_date,
    itemData.batch_number,
    itemData.item_notes,
  ]
  return executeQuery(query, params)
}

// Warehouses operations
export async function getWarehouses() {
  try {
    const result = await sql`SELECT * FROM warehouses ORDER BY name`
    return { success: true, data: result }
  } catch (error) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}

// Product Categories operations
export async function getProductCategories() {
  try {
    const result = await sql`SELECT * FROM product_categories ORDER BY name`
    return { success: true, data: result }
  } catch (error) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}

// Dashboard statistics
export async function getDashboardStats() {
  try {
    const [customers, suppliers, products, salesOrders, purchaseOrders] = await Promise.all([
      sql`SELECT COUNT(*) as count FROM customers WHERE status = 'active'`,
      sql`SELECT COUNT(*) as count FROM suppliers WHERE status = 'active'`,
      sql`SELECT COUNT(*) as count FROM products WHERE status = 'active'`,
      sql`SELECT COUNT(*) as count FROM sales_orders WHERE order_status != 'cancelled'`,
      sql`SELECT COUNT(*) as count FROM purchase_orders WHERE workflow_status != 'cancelled'`,
    ])

    return {
      success: true,
      data: {
        customers: customers[0]?.count || 0,
        suppliers: suppliers[0]?.count || 0,
        products: products[0]?.count || 0,
        salesOrders: salesOrders[0]?.count || 0,
        purchaseOrders: purchaseOrders[0]?.count || 0,
      },
    }
  } catch (error) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}
