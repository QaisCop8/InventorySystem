import type { NextRequest } from "next/server"
import { stepCountIs, streamText, tool } from "ai"
import { google } from "@ai-sdk/google"
import { z } from "zod"
import sql from "@/lib/database"
import { aiCallOptions, geminiModel } from "@/lib/ai-model"
import { getSessionUser } from "@/lib/tenant-auth"
import { hasNamedPermission } from "@/lib/permissions"
import { filterAccessibleAccounts } from "@/lib/account-access"
import { ACCOUNT_BALANCE_VIEW_PERMISSION, CREDIT_LIMIT_PERMISSION_CATEGORY } from "@/lib/transaction-permission-definitions"

// المحادثة الحرة للمساعد الذكي (الأسئلة والاستعلامات). إنشاء المستندات يتم قبلها في receipt-draft/order-draft.
// الأدوات تقرأ الجداول الفعلية للنظام: voucher_header_tbl/voucher_items_tbl (المبيعات والمشتريات)،
// voucher_journal_detail_tbl (أرصدة الحسابات)، inventory_transactions (أرصدة الأصناف).

const MAX_HISTORY = 20
const round = (value: unknown) => Math.round(Number(value || 0) * 100) / 100
const iso = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null)
const like = (term: string) => `%${String(term || "").trim()}%`

function periodOf(days: number | undefined, from_date?: string, to_date?: string) {
  const to = iso(to_date) || new Date().toISOString().slice(0, 10)
  const from = iso(from_date) || new Date(Date.parse(to) - (Math.max(1, Math.floor(Number(days) || 30)) - 1) * 86_400_000).toISOString().slice(0, 10)
  return { from, to, days: Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1 }
}

// ملخص فواتير نوع معيّن ومرتجعاتها: 12/16 مبيعات، 17/19 مشتريات — بعملة الأساس (amount × rate)
async function invoiceSummary(invoiceType: 12 | 17, returnType: 16 | 19, period: { from: string; to: string; days: number }, branchId: number | null) {
  const { from, to } = period
  const totals = await sql`
    SELECT vch_type, COUNT(*)::int AS count, COALESCE(SUM(amount * COALESCE(NULLIF(rate, 0), 1)), 0)::float AS total,
      COUNT(*) FILTER (WHERE pos_point_id IS NOT NULL)::int AS pos_count
    FROM voucher_header_tbl
    WHERE vch_type IN (${invoiceType}, ${returnType}) AND status <> 3 AND vch_date::date BETWEEN ${from}::date AND ${to}::date
      AND (${branchId}::int IS NULL OR branch_id = ${branchId}::int)
    GROUP BY vch_type
  `
  const row = (type: number) => (totals as any[]).find((item) => Number(item.vch_type) === type) || { count: 0, total: 0, pos_count: 0 }
  const invoices = row(invoiceType)
  const returns = row(returnType)
  const [topProducts, topParties, topDays] = await Promise.all([
    sql`
      SELECT COALESCE(p.product_name, i.item_name, 'صنف') AS name, p.product_code AS code,
        SUM(COALESCE(NULLIF(i.main_unit_quantity, 0), i.qnty))::float AS quantity,
        SUM(COALESCE(i.qnty, 0) * COALESCE(i.price, 0) * (1 - COALESCE(i.discount, 0) / 100) * COALESCE(NULLIF(h.rate, 0), 1))::float AS value
      FROM voucher_items_tbl i
      JOIN voucher_header_tbl h ON h.id = i.voucher_id
      LEFT JOIN products p ON p.id = i.item_id
      WHERE h.vch_type = ${invoiceType} AND h.status <> 3 AND h.vch_date::date BETWEEN ${from}::date AND ${to}::date
        AND (${branchId}::int IS NULL OR h.branch_id = ${branchId}::int)
      GROUP BY 1, 2 ORDER BY value DESC NULLS LAST LIMIT 5
    `,
    sql`
      SELECT COALESCE(NULLIF(h.customer_name, ''), a.name, 'نقدي') AS name, COUNT(*)::int AS invoices,
        SUM(h.amount * COALESCE(NULLIF(h.rate, 0), 1))::float AS total
      FROM voucher_header_tbl h
      LEFT JOIN account_tbl a ON a.id = h.account_id
      WHERE h.vch_type = ${invoiceType} AND h.status <> 3 AND h.vch_date::date BETWEEN ${from}::date AND ${to}::date
        AND (${branchId}::int IS NULL OR h.branch_id = ${branchId}::int)
      GROUP BY 1 ORDER BY total DESC NULLS LAST LIMIT 5
    `,
    sql`
      SELECT h.vch_date::date::text AS day, COUNT(*)::int AS invoices, SUM(h.amount * COALESCE(NULLIF(h.rate, 0), 1))::float AS total
      FROM voucher_header_tbl h
      WHERE h.vch_type = ${invoiceType} AND h.status <> 3 AND h.vch_date::date BETWEEN ${from}::date AND ${to}::date
        AND (${branchId}::int IS NULL OR h.branch_id = ${branchId}::int)
      GROUP BY 1 ORDER BY total DESC NULLS LAST LIMIT 3
    `,
  ])
  return {
    period,
    invoices: { count: invoices.count, pos_count: invoices.pos_count, total: round(invoices.total), average: invoices.count ? round(invoices.total / invoices.count) : 0 },
    returns: { count: returns.count, total: round(returns.total) },
    net: round(invoices.total - returns.total),
    daily_average: round((invoices.total - returns.total) / Math.max(1, period.days)),
    top_products: (topProducts as any[]).map((item) => ({ ...item, quantity: round(item.quantity), value: round(item.value) })),
    top_parties: (topParties as any[]).map((item) => ({ ...item, total: round(item.total) })),
    best_days: (topDays as any[]).map((item) => ({ ...item, total: round(item.total) })),
    currency_note: "المبالغ بعملة الأساس",
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return new Response("لم يتم إعداد GOOGLE_GENERATIVE_AI_API_KEY للمساعد الذكي", { status: 503 })
    }
    const body = await request.json()
    const messages = (Array.isArray(body?.messages) ? body.messages : [])
      .filter((message: any) => (message?.role === "user" || message?.role === "assistant") && String(message?.content || "").trim())
      .slice(-MAX_HISTORY)
      .map((message: any) => ({ role: message.role, content: String(message.content).slice(0, 4000) }))
    if (!messages.length) return new Response("الرسالة فارغة", { status: 400 })

    const user = await getSessionUser(request).catch(() => null)
    const branchId = Number(request.headers.get("x-branch-id")) || Number(body?.branch_id) || null
    const branchName = String(body?.branch_name || "").slice(0, 80)
    const today = new Date().toISOString().slice(0, 10)
    const weekday = new Date().toLocaleDateString("ar", { weekday: "long" })
    const canSeeBalances = () => user ? hasNamedPermission(String(user.user_id), ACCOUNT_BALANCE_VIEW_PERMISSION, CREDIT_LIMIT_PERMISSION_CATEGORY, branchId) : Promise.resolve(false)

    const result = streamText({
      // تفكير منخفض + مهلة 45 ثانية: الرد يبدأ أسرع ولا يبقى المستخدم معلّقاً عند انشغال الخدمة
      ...aiCallOptions(geminiModel(), { thinking: "low", timeoutMs: 45_000 }),
      model: google(geminiModel()),
      messages,
      system: `أنت "المساعد الذكي" لنظام Noon ERP (محاسبة، مخزون، مبيعات ومشتريات) من شركة الصبّاح للبرمجة.
اليوم: ${weekday} ${today}.${branchName ? ` الفرع النشط للمستخدم: ${branchName}.` : ""}

قواعد الإجابة:
- أجب بالعربية بإيجاز ووضوح. ابدأ بالجواب المباشر (الرقم أو النتيجة) ثم التفاصيل.
- لأي سؤال عن أرقام الشركة استخدم الأدوات دائماً، ولا تخترع أي رقم غير موجود في نتائجها. إن فشلت أداة قل ذلك بوضوح.
- احسب الفترات النسبية من تاريخ اليوم: "هذا الشهر" = من أول الشهر حتى اليوم، "أمس"، "الأسبوع الماضي"... ومرّرها للأداة كـ from_date/to_date.
- الأرقام بفواصل الآلاف وخانتين عشريتين، واذكر العملة أو "بعملة الأساس".
- للمقارنات والقوائم استخدم جدول markdown (| عمود | عمود |) أو نقاطاً قصيرة، والعناوين بـ ###.
- إن كان السؤال غامضاً (مثلاً اسم زبون يطابق أكثر من حساب) اعرض الخيارات واسأل.
- المبيعات الفعلية = فواتير المبيعات (تشمل نقاط البيع) ناقص المرتجعات ⇐ getSalesSummary. المشتريات ⇐ getPurchasesSummary.
- رصيد زبون/مورد/أي حساب ⇐ getAccountBalance. أكبر الذمم المدينة ⇐ getTopReceivables.
- رصيد صنف أو البحث عن صنف ⇐ getProductStock. الأصناف التي ستنفد ⇐ getStockRisk.

إنشاء المستندات (سند قبض، سند صرف، مسودة طلبية مبيعات):
- أنت لا تحفظ ولا تسجّل أي مستند بنفسك. لا تقل أبداً "تم تسجيل" أو "تم حفظ" أو "تم إنشاء" مستند.
- إذا فهمت أن المستخدم يريد إنشاء سند قبض أو سند صرف (حتى مع خطأ إملائي مثل "قبص") وكان اسم الحساب والمبلغ معروفين، اكتب جملة قصيرة
  تلخص ما فهمته ثم اختم ردك بسطر أخير واحد بالضبط بالصيغة:
  تأكيد: سند قبض للزبون <اسم الحساب كما ذكره> بمبلغ <المبلغ> [<العملة إن ذُكرت>] [نقدي/شيك/بطاقة إن ذُكرت]
  أو: تأكيد: سند صرف لـ <اسم الحساب> بمبلغ <المبلغ> ...
  سيظهر للمستخدم زر "تأكيد" ينفّذ هذا السطر فعلياً. لا تكتب السطر إن كان الاسم أو المبلغ ناقصاً — اسأل عنه بدلاً من ذلك.
- طريقة الدفع الافتراضية نقدي، فلا تسأل عنها إلا إذا كانت غير واضحة.

بعد الإجابة عن سؤال استعلام (وليس عند اقتراح سطر "تأكيد:")، اختم بسطر أخير واحد بالصيغة:
اقتراحات: <سؤال متابعة قصير> | <سؤال متابعة قصير> | <سؤال متابعة قصير>
تظهر كأزرار للمستخدم؛ اجعلها أسئلة مفيدة مرتبطة بما سأله ويمكن الإجابة عنها بالأدوات.`,
      // AI SDK 6 يتوقف افتراضياً بعد أول خطوة — أي بعد استدعاء الأداة دون كتابة الرد؛ نسمح بخطوات لصياغة الإجابة
      stopWhen: stepCountIs(6),
      tools: {
        getSalesSummary: tool({
          description: "ملخص المبيعات الفعلية (فواتير المبيعات ونقاط البيع ومرتجعات المبيعات) لفترة: الإجمالي، الصافي، عدد الفواتير، المتوسط، أفضل الأصناف والعملاء والأيام",
          inputSchema: z.object({
            days: z.number().optional().describe("عدد الأيام الأخيرة (افتراضي 30) — يُتجاهل إن حُدد from_date"),
            from_date: z.string().optional().describe("من تاريخ YYYY-MM-DD"),
            to_date: z.string().optional().describe("إلى تاريخ YYYY-MM-DD (افتراضي اليوم)"),
            active_branch_only: z.boolean().optional().describe("true = الفرع النشط فقط، وإلا كل الفروع"),
          }),
          execute: async ({ days, from_date, to_date, active_branch_only }) => {
            try {
              const summary = await invoiceSummary(12, 16, periodOf(days, from_date, to_date), active_branch_only ? branchId : null)
              return { ...summary, top_customers: summary.top_parties, top_parties: undefined }
            } catch (error) {
              console.error("[ai] sales summary failed:", error)
              return { error: "فشل في جلب ملخص المبيعات" }
            }
          },
        }),

        getPurchasesSummary: tool({
          description: "ملخص المشتريات (فواتير المشتريات ومرتجعاتها) لفترة: الإجمالي، الصافي، عدد الفواتير، أكثر الأصناف شراءً وأكبر الموردين",
          inputSchema: z.object({
            days: z.number().optional().describe("عدد الأيام الأخيرة (افتراضي 30) — يُتجاهل إن حُدد from_date"),
            from_date: z.string().optional().describe("من تاريخ YYYY-MM-DD"),
            to_date: z.string().optional().describe("إلى تاريخ YYYY-MM-DD (افتراضي اليوم)"),
            active_branch_only: z.boolean().optional().describe("true = الفرع النشط فقط، وإلا كل الفروع"),
          }),
          execute: async ({ days, from_date, to_date, active_branch_only }) => {
            try {
              const summary = await invoiceSummary(17, 19, periodOf(days, from_date, to_date), active_branch_only ? branchId : null)
              return { ...summary, top_suppliers: summary.top_parties, top_parties: undefined }
            } catch (error) {
              console.error("[ai] purchases summary failed:", error)
              return { error: "فشل في جلب ملخص المشتريات" }
            }
          },
        }),

        getAccountBalance: tool({
          description: "البحث عن حساب (زبون، مورد، أو أي حساب) بالاسم أو الرقم وإرجاع رصيده بعملة الحساب وحد الائتمان وآخر حركة",
          inputSchema: z.object({
            searchTerm: z.string().describe("اسم الحساب أو رقمه أو جزء منه"),
          }),
          execute: async ({ searchTerm }) => {
            try {
              if (!(await canSeeBalances())) return { error: "لا تملك صلاحية \"السماح بمشاهدة رصيد الحساب في الحركات\"" }
              const rows = await sql`
                SELECT a.id, a.code, a.name,
                  COALESCE(c.currency_code, (SELECT base.currency_code FROM currency base ORDER BY base.id LIMIT 1), '') AS currency,
                  COALESCE(a.max_balance_amount, 0)::float AS credit_limit,
                  COALESCE(b.balance, 0)::float AS balance, b.last_date
                FROM account_tbl a
                LEFT JOIN currency c ON c.id = a.currency_id
                LEFT JOIN LATERAL (
                  SELECT SUM(CASE WHEN vjd.credit_debit = 1 THEN 1 ELSE -1 END * (
                      CASE
                        WHEN a.currency_id IS NULL THEN COALESCE(vjd.base_curr_amount, vjd.amount * COALESCE(NULLIF(vjd.rate, 0), 1))
                        WHEN vjd.currency_id = a.currency_id THEN vjd.amount
                        ELSE COALESCE(vjd.account_amount, vjd.base_curr_amount, vjd.amount)
                      END)) AS balance,
                    MAX(vh.vch_date)::date::text AS last_date
                  FROM voucher_journal_detail_tbl vjd
                  JOIN voucher_header_tbl vh ON vh.id = vjd.voucher_id AND vh.status <> 3
                  WHERE vjd.account_id = a.id
                ) b ON TRUE
                WHERE COALESCE(a.status, 1) <> 3 AND (a.name ILIKE ${like(searchTerm)} OR a.code::text ILIKE ${like(searchTerm)})
                ORDER BY (a.name = ${searchTerm.trim()}) DESC, length(a.name) LIMIT 8
              `
              const accessible = await filterAccessibleAccounts(request, rows as any[], "id", branchId)
              if (!accessible.length) return { found: 0, message: "لا يوجد حساب مطابق" }
              return accessible.map((row) => {
                const balance = round(row.balance)
                return {
                  code: row.code, name: row.name, balance: Math.abs(balance), side: balance > 0 ? "مدين" : balance < 0 ? "دائن" : "صفر",
                  currency: row.currency, credit_limit: round(row.credit_limit) || null, last_transaction: row.last_date || null,
                }
              })
            } catch (error) {
              console.error("[ai] account balance failed:", error)
              return { error: "فشل في جلب رصيد الحساب" }
            }
          },
        }),

        getTopReceivables: tool({
          description: "أكبر الذمم المدينة (العملاء أصحاب الأرصدة المدينة) بعملة الأساس، مع إجماليها ومن تجاوز حد الائتمان",
          inputSchema: z.object({ limit: z.number().optional().describe("عدد الحسابات (افتراضي 10)") }),
          execute: async ({ limit = 10 }) => {
            try {
              if (!(await canSeeBalances())) return { error: "لا تملك صلاحية \"السماح بمشاهدة رصيد الحساب في الحركات\"" }
              const rows = await sql`
                WITH bal AS (
                  SELECT vjd.account_id, SUM(CASE WHEN vjd.credit_debit = 1 THEN 1 ELSE -1 END * COALESCE(vjd.base_curr_amount, vjd.amount * COALESCE(NULLIF(vjd.rate, 0), 1))) AS balance
                  FROM voucher_journal_detail_tbl vjd
                  JOIN voucher_header_tbl vh ON vh.id = vjd.voucher_id AND vh.status <> 3
                  JOIN account_tbl a ON a.id = vjd.account_id AND a.type IN (2, 3, 5) AND COALESCE(a.status, 1) <> 3
                  GROUP BY vjd.account_id
                )
                SELECT a.id, a.code, a.name, bal.balance::float AS balance, COALESCE(a.max_balance_amount, 0)::float AS credit_limit,
                  SUM(bal.balance) OVER ()::float AS total, COUNT(*) OVER ()::int AS accounts
                FROM bal JOIN account_tbl a ON a.id = bal.account_id
                WHERE bal.balance > 0.5
                ORDER BY bal.balance DESC LIMIT ${Math.min(50, Math.max(1, Math.floor(Number(limit) || 10)))}
              `
              const accessible = await filterAccessibleAccounts(request, rows as any[], "id", branchId)
              return {
                total_receivables: round((rows as any[])[0]?.total), debtor_accounts: Number((rows as any[])[0]?.accounts || 0),
                top: accessible.map((row) => ({ code: row.code, name: row.name, balance: round(row.balance), credit_limit: round(row.credit_limit) || null, over_limit: row.credit_limit > 0 && row.balance > row.credit_limit })),
                currency_note: "المبالغ بعملة الأساس",
              }
            } catch (error) {
              console.error("[ai] receivables failed:", error)
              return { error: "فشل في جلب الذمم" }
            }
          },
        }),

        getProductStock: tool({
          description: "البحث عن صنف بالاسم أو الرقم أو الباركود وإرجاع رصيده الحالي (على مستوى الشركة) ومبيعاته في آخر 30 يوماً وآخر بيع",
          inputSchema: z.object({ searchTerm: z.string().describe("اسم الصنف أو رقمه أو باركوده") }),
          execute: async ({ searchTerm }) => {
            try {
              const rows = await sql`
                WITH found AS (
                  SELECT p.id, p.product_code, p.product_name FROM products p
                  WHERE COALESCE(p.deleted, false) = false
                    AND (p.product_name ILIKE ${like(searchTerm)} OR p.product_code ILIKE ${like(searchTerm)} OR p.barcode = ${searchTerm.trim()})
                  ORDER BY (p.product_code = ${searchTerm.trim()} OR p.barcode = ${searchTerm.trim()}) DESC, length(p.product_name) LIMIT 10
                )
                SELECT f.product_code AS code, f.product_name AS name,
                  COALESCE((SELECT SUM(CASE WHEN it.transaction_type = 'in' THEN it.quantity ELSE -it.quantity END) FROM inventory_transactions it WHERE it.product_id = f.id), 0)::float AS stock,
                  COALESCE((SELECT SUM(COALESCE(NULLIF(vi.main_unit_quantity, 0), vi.qnty)) FROM voucher_items_tbl vi JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
                    WHERE vi.item_id = f.id AND vh.vch_type = 12 AND vh.status <> 3 AND vh.vch_date >= CURRENT_DATE - 30), 0)::float AS sold_30_days,
                  (SELECT MAX(vh.vch_date)::date::text FROM voucher_items_tbl vi JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
                    WHERE vi.item_id = f.id AND vh.vch_type = 12 AND vh.status <> 3) AS last_sale
                FROM found f
              `
              if (!(rows as any[]).length) return { found: 0, message: "لا يوجد صنف مطابق" }
              return (rows as any[]).map((row) => ({ ...row, stock: round(row.stock), sold_30_days: round(row.sold_30_days), unit_note: "الكميات بالوحدة الرئيسية" }))
            } catch (error) {
              console.error("[ai] product stock failed:", error)
              return { error: "فشل في جلب رصيد الصنف" }
            }
          },
        }),

        getStockRisk: tool({
          description: "الأصناف التي ستنفد قريباً حسب معدل بيع آخر 30 يوماً (عدد الأيام المتبقية لكل صنف)، والأصناف الراكدة",
          inputSchema: z.object({ days_threshold: z.number().optional().describe("الأصناف التي تنفد خلال هذا العدد من الأيام (افتراضي 7)") }),
          execute: async ({ days_threshold = 7 }) => {
            try {
              const threshold = Math.max(1, Math.min(180, Number(days_threshold) || 7))
              const [risk, dead] = await Promise.all([
                sql`
                  WITH sold AS (
                    SELECT vi.item_id AS product_id, SUM(COALESCE(NULLIF(vi.main_unit_quantity, 0), vi.qnty)) AS qty
                    FROM voucher_items_tbl vi JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
                    WHERE vh.vch_type = 12 AND vh.status <> 3 AND vh.vch_date >= CURRENT_DATE - 30 AND vi.item_id IS NOT NULL
                    GROUP BY vi.item_id HAVING SUM(COALESCE(NULLIF(vi.main_unit_quantity, 0), vi.qnty)) > 0
                  ), stock AS (
                    SELECT it.product_id, SUM(CASE WHEN it.transaction_type = 'in' THEN it.quantity ELSE -it.quantity END) AS qty
                    FROM inventory_transactions it WHERE it.product_id IN (SELECT product_id FROM sold) GROUP BY it.product_id
                  )
                  SELECT p.product_code AS code, p.product_name AS name, GREATEST(COALESCE(stock.qty, 0), 0)::float AS stock,
                    (sold.qty / 30.0)::float AS daily_sales, (GREATEST(COALESCE(stock.qty, 0), 0) / (sold.qty / 30.0))::float AS days_left
                  FROM sold JOIN products p ON p.id = sold.product_id LEFT JOIN stock ON stock.product_id = sold.product_id
                  WHERE COALESCE(p.deleted, false) = false AND GREATEST(COALESCE(stock.qty, 0), 0) / (sold.qty / 30.0) < ${threshold}
                  ORDER BY days_left, daily_sales DESC LIMIT 20
                `,
                sql`
                  WITH stock AS (
                    SELECT it.product_id FROM inventory_transactions it GROUP BY it.product_id
                    HAVING SUM(CASE WHEN it.transaction_type = 'in' THEN it.quantity ELSE -it.quantity END) > 0
                  )
                  SELECT COUNT(*)::int AS items FROM stock
                  WHERE NOT EXISTS (
                    SELECT 1 FROM voucher_items_tbl vi JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
                    WHERE vi.item_id = stock.product_id AND vh.vch_type = 12 AND vh.status <> 3 AND vh.vch_date >= CURRENT_DATE - 60
                  )
                `,
              ])
              return {
                running_out: (risk as any[]).map((row) => ({ ...row, stock: round(row.stock), daily_sales: round(row.daily_sales), days_left: Math.round(Number(row.days_left) * 10) / 10 })),
                dead_items_no_sales_60_days: Number((dead as any[])[0]?.items || 0),
              }
            } catch (error) {
              console.error("[ai] stock risk failed:", error)
              return { error: "فشل في جلب الأصناف المهددة بالنفاد" }
            }
          },
        }),
      },
    })

    return result.toTextStreamResponse()
  } catch (error) {
    console.error("[ai] AI Assistant error:", error)
    return new Response("فشل في معالجة الطلب", { status: 500 })
  }
}
