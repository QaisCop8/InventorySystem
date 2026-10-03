import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { calculateCommission, reverseCommission, selectCommissionRule, type CommissionRule } from "@/lib/salesman-commission"
import { ensureTables as ensureSalesVoucherTables } from "@/app/api/sales-vouchers/_lib"

async function ensureTables() {
  await sql`CREATE TABLE IF NOT EXISTS salesman_commission_rules (
    id BIGSERIAL PRIMARY KEY, salesman_id INTEGER REFERENCES salesmen(id), name VARCHAR(160) NOT NULL,
    basis VARCHAR(24) NOT NULL DEFAULT 'sales', commission_percent NUMERIC(9,4) NOT NULL DEFAULT 0,
    customer_id INTEGER, item_id INTEGER, item_group_id INTEGER, warehouse_id INTEGER, branch_id INTEGER, currency_id INTEGER,
    minimum_sales NUMERIC(18,4) NOT NULL DEFAULT 0, tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
    effective_from DATE NOT NULL, effective_to DATE, is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`
  await sql`CREATE TABLE IF NOT EXISTS salesman_commission_transactions (
    id BIGSERIAL PRIMARY KEY, rule_id BIGINT NOT NULL, salesman_id INTEGER NOT NULL REFERENCES salesmen(id), branch_id INTEGER,
    source_type VARCHAR(20) NOT NULL, source_id INTEGER NOT NULL, source_item_id INTEGER NOT NULL DEFAULT 0,
    invoice_id INTEGER NOT NULL, invoice_date DATE NOT NULL, invoice_type INTEGER, commission_basis VARCHAR(24), customer_id INTEGER, item_id INTEGER, item_group_id INTEGER, warehouse_id INTEGER, currency_id INTEGER, quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
    net_sales NUMERIC(18,4) NOT NULL DEFAULT 0, cost_amount NUMERIC(18,4) NOT NULL DEFAULT 0, gross_profit NUMERIC(18,4) NOT NULL DEFAULT 0,
    collected_amount NUMERIC(18,4) NOT NULL DEFAULT 0, commission_rate NUMERIC(9,4) NOT NULL DEFAULT 0,
    commission_amount NUMERIC(18,4) NOT NULL DEFAULT 0, return_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
    final_commission NUMERIC(18,4) NOT NULL DEFAULT 0, status VARCHAR(16) NOT NULL DEFAULT 'calculated', payment_voucher_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(rule_id,source_type,source_id,source_item_id)
  )`
  await sql`ALTER TABLE salesman_commission_transactions ADD COLUMN IF NOT EXISTS branch_id INTEGER`
  await sql`ALTER TABLE salesman_commission_transactions ADD COLUMN IF NOT EXISTS invoice_type INTEGER`
  await sql`ALTER TABLE salesman_commission_transactions ADD COLUMN IF NOT EXISTS commission_basis VARCHAR(24)`
  await sql`ALTER TABLE salesman_commission_transactions ADD COLUMN IF NOT EXISTS item_group_id INTEGER`
  await sql`ALTER TABLE salesman_commission_transactions ADD COLUMN IF NOT EXISTS warehouse_id INTEGER`
  await sql`ALTER TABLE salesman_commission_transactions ADD COLUMN IF NOT EXISTS currency_id INTEGER`
  await sql`CREATE TABLE IF NOT EXISTS salesman_commission_collections (
    id BIGSERIAL PRIMARY KEY, receipt_id INTEGER NOT NULL REFERENCES voucher_header_tbl(id), invoice_id INTEGER NOT NULL REFERENCES voucher_header_tbl(id),
    applied_amount NUMERIC(18,4) NOT NULL CHECK(applied_amount > 0), allocation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by INTEGER, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(receipt_id,invoice_id)
  )`
  await sql`CREATE TABLE IF NOT EXISTS salesman_targets (
    id BIGSERIAL PRIMARY KEY, salesman_id INTEGER NOT NULL REFERENCES salesmen(id), period_from DATE NOT NULL, period_to DATE NOT NULL,
    sales_target NUMERIC(18,4) NOT NULL DEFAULT 0, collection_target NUMERIC(18,4) NOT NULL DEFAULT 0,
    profit_target NUMERIC(18,4) NOT NULL DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(salesman_id,period_from,period_to)
  )`
  await sql`CREATE TABLE IF NOT EXISTS salesman_commission_payments (
    id BIGSERIAL PRIMARY KEY, transaction_id BIGINT NOT NULL REFERENCES salesman_commission_transactions(id),
    payment_voucher_id INTEGER NOT NULL, amount NUMERIC(18,4) NOT NULL CHECK(amount > 0), payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by INTEGER, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`
}

const num = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const validDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))
const errorResponse = (error: unknown, fallback: string) => NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: Number((error as any)?.status) || 500 })

export async function GET(request: NextRequest) {
  try {
    await ensureSalesVoucherTables()
    await ensureTables()
    const access = await authorizeTransaction(request, "sales_invoice", "view")
    if (!access.ok) return access.response
    const params = request.nextUrl.searchParams
    const from = params.get("from") || new Date().toISOString().slice(0, 10).slice(0, 8) + "01"
    const to = params.get("to") || new Date().toISOString().slice(0, 10)
    if (!validDate(from) || !validDate(to) || from > to) return NextResponse.json({ error: "فترة التقرير غير صالحة" }, { status: 400 })
    const salesmanId = num(params.get("salesman_id"))
    const customerId=num(params.get("customer_id")),itemId=num(params.get("item_id")),itemGroupId=num(params.get("item_group_id")),warehouseId=num(params.get("warehouse_id")),branchId=num(params.get("branch_id")),currencyId=num(params.get("currency_id")),invoiceType=num(params.get("invoice_type"))
    const [salesmen, customers, products, groups, warehouses, branches, currencies, rules, transactions, targets, collections, performance] = await Promise.all([
      sql`SELECT id,code,name,is_active,sales_commission_percent,collection_commission_percent FROM salesmen WHERE COALESCE(is_active,true) ORDER BY name`,
      sql`SELECT id,code,name FROM account_tbl WHERE COALESCE(status,1)<>3 AND type IN (2,3,5) ORDER BY name`,
      sql`SELECT id,product_code code,product_name name FROM products WHERE COALESCE(deleted,false)=false AND COALESCE(status,1)<>3 ORDER BY product_name LIMIT 5000`,
      sql`SELECT id,group_name name FROM item_groups WHERE COALESCE(status,1)=1 ORDER BY group_name`,
      sql`SELECT id,warehouse_code code,warehouse_name name FROM warehouses WHERE COALESCE(status,1)<>3 ORDER BY warehouse_name`,
      sql`SELECT id,branch_code code,branch_name name FROM branches WHERE COALESCE(status,1)<>3 ORDER BY branch_name`,
      sql`SELECT id,currency_code code,currency_name name FROM currency WHERE COALESCE(is_active,true) ORDER BY id`,
      sql`SELECT r.*,s.name salesman_name,c.name customer_name,p.product_name item_name,g.group_name item_group_name,w.warehouse_name,b.branch_name,cu.currency_code
        FROM salesman_commission_rules r LEFT JOIN salesmen s ON s.id=r.salesman_id LEFT JOIN account_tbl c ON c.id=r.customer_id
        LEFT JOIN products p ON p.id=r.item_id LEFT JOIN item_groups g ON g.id=r.item_group_id LEFT JOIN warehouses w ON w.id=r.warehouse_id
        LEFT JOIN branches b ON b.id=r.branch_id LEFT JOIN currency cu ON cu.id=r.currency_id
        WHERE r.branch_id IS NULL OR r.branch_id=ANY(${access.branchIds}::int[]) ORDER BY r.is_active DESC,r.id DESC`,
        sql`SELECT t.*,s.name salesman_name,v.vch_code invoice_code,c.name customer_name,p.product_name item_name,cu.currency_code,
          (SELECT COALESCE(SUM(pm.amount),0) FROM salesman_commission_payments pm WHERE pm.transaction_id=t.id) paid_amount
        FROM salesman_commission_transactions t JOIN salesmen s ON s.id=t.salesman_id
        LEFT JOIN voucher_header_tbl v ON v.id=t.invoice_id LEFT JOIN account_tbl c ON c.id=t.customer_id LEFT JOIN products p ON p.id=t.item_id LEFT JOIN currency cu ON cu.id=t.currency_id
        WHERE t.invoice_date BETWEEN ${from}::date AND ${to}::date AND (${salesmanId}=0 OR t.salesman_id=${salesmanId})
          AND (${access.branchIds.length===0} OR t.branch_id=ANY(${access.branchIds}::int[]))
          AND (${customerId}=0 OR t.customer_id=${customerId}) AND (${itemId}=0 OR t.item_id=${itemId})
          AND (${itemGroupId}=0 OR t.item_group_id=${itemGroupId}) AND (${warehouseId}=0 OR t.warehouse_id=${warehouseId})
          AND (${branchId}=0 OR t.branch_id=${branchId}) AND (${currencyId}=0 OR t.currency_id=${currencyId})
          AND (${invoiceType}=0 OR t.invoice_type=${invoiceType})
        ORDER BY t.invoice_date DESC,t.id DESC LIMIT 5000`,
      sql`SELECT t.*,s.name salesman_name FROM salesman_targets t JOIN salesmen s ON s.id=t.salesman_id
        WHERE t.period_from<=${to}::date AND t.period_to>=${from}::date AND (${salesmanId}=0 OR t.salesman_id=${salesmanId}) ORDER BY t.period_from DESC`,
      sql`SELECT a.*,receipt.vch_code receipt_code,invoice.vch_code invoice_code,s.name salesman_name
        FROM salesman_commission_collections a JOIN voucher_header_tbl receipt ON receipt.id=a.receipt_id
        JOIN voucher_header_tbl invoice ON invoice.id=a.invoice_id LEFT JOIN salesmen s ON s.id=invoice.salesman_id
        WHERE a.allocation_date BETWEEN ${from}::date AND ${to}::date AND (${salesmanId}=0 OR invoice.salesman_id=${salesmanId})
          AND (${access.branchIds.length===0} OR invoice.branch_id=ANY(${access.branchIds}::int[])) ORDER BY a.allocation_date DESC,a.id DESC LIMIT 2000`,
      sql`WITH invoice_lines AS (
          SELECT vh.id,vh.salesman_id,vh.vch_type,vh.account_id,vh.discount_type,vh.discount_value,vh.branch_id,vh.currency_id,
            SUM(vi.qnty*vi.price*(1-COALESCE(vi.pos_discount_percent,vi.discount,0)/100)-COALESCE(vi.campaign_discount,0)) net_before_header,
            SUM(vi.qnty*COALESCE(vi.cost_price,0)) cost_amount
          FROM voucher_header_tbl vh JOIN voucher_items_tbl vi ON vi.voucher_id=vh.id
          WHERE vh.vch_type IN (12,16) AND vh.status=2 AND vh.vch_date>=${from}::date AND vh.vch_date<(${to}::date+INTERVAL '1 day')
            AND vh.salesman_id IS NOT NULL AND (${access.branchIds.length===0} OR vh.branch_id=ANY(${access.branchIds}::int[]))
          GROUP BY vh.id,vh.salesman_id,vh.vch_type,vh.account_id,vh.discount_type,vh.discount_value,vh.branch_id,vh.currency_id
        ), invoice_net AS (
          SELECT *,GREATEST(0,net_before_header-CASE WHEN discount_type='amount' THEN discount_value ELSE net_before_header*discount_value/100 END) net_sales
          FROM invoice_lines
        )
        SELECT s.id salesman_id,s.name salesman_name,i.currency_id,cu.currency_code,
          SUM(CASE WHEN i.vch_type=12 THEN i.net_sales ELSE 0 END) sales,
          SUM(CASE WHEN i.vch_type=16 THEN i.net_sales ELSE 0 END) returns,
          SUM(CASE WHEN i.vch_type=12 THEN i.net_sales ELSE -i.net_sales END) net_sales,
          SUM(CASE WHEN i.vch_type=12 THEN i.cost_amount ELSE -i.cost_amount END) cost_amount,
          SUM(CASE WHEN i.vch_type=12 THEN i.net_sales-i.cost_amount ELSE -(i.net_sales-i.cost_amount) END) gross_profit,
          COUNT(DISTINCT i.account_id)::int customer_count,COUNT(DISTINCT i.id)::int invoice_count,
          (SELECT COALESCE(SUM(a.applied_amount),0) FROM salesman_commission_collections a JOIN voucher_header_tbl iv ON iv.id=a.invoice_id
            WHERE iv.salesman_id=s.id AND a.allocation_date BETWEEN ${from}::date AND ${to}::date AND iv.status=2
              AND iv.currency_id=i.currency_id AND (${currencyId}=0 OR iv.currency_id=${currencyId})
              AND (${access.branchIds.length===0} OR iv.branch_id=ANY(${access.branchIds}::int[]))) collected_allocated
        FROM invoice_net i JOIN salesmen s ON s.id=i.salesman_id LEFT JOIN currency cu ON cu.id=i.currency_id
        WHERE (${salesmanId}=0 OR s.id=${salesmanId}) AND (${currencyId}=0 OR i.currency_id=${currencyId})
        GROUP BY s.id,s.name,i.currency_id,cu.currency_code ORDER BY net_sales DESC`,
    ])
    const visibleBranches = new Set(access.branchIds.map(Number))
    const visibleTransactions = transactions.filter((row: any) => visibleBranches.has(Number(row.branch_id)) || access.branchIds.length === 0)
    const totals = visibleTransactions.reduce((sum: any, row: any) => ({
      sales: sum.sales + Number(row.net_sales || 0), cost: sum.cost + Number(row.cost_amount || 0),
      profit: sum.profit + Number(row.gross_profit || 0), commission: sum.commission + Number(row.final_commission || 0),
    }), { sales: 0, cost: 0, profit: 0, commission: 0 })
    totals.commission=visibleTransactions.filter((row:any)=>row.status!=="cancelled").reduce((sum:number,row:any)=>sum+Number(row.final_commission||0),0)
    const visiblePerformance=performance
    return NextResponse.json({ from, to, meta: { salesmen, customers, products, groups, warehouses, branches: branches.filter((row: any) => visibleBranches.has(Number(row.id))), currencies }, rules, transactions: visibleTransactions, targets, collections, performance: visiblePerformance, totals })
  } catch (error) { return errorResponse(error, "تعذر تحميل عمولات المندوبين") }
}

export async function POST(request: NextRequest) {
  try {
    await ensureSalesVoucherTables()
    await ensureTables()
    const data = await request.json()
    const action = String(data.action || "")
    const permissionAction = ["approve", "post", "pay", "cancel"].includes(action) ? "approve" : "create"
    const access = await authorizeTransaction(request, "sales_invoice", permissionAction, data.branch_id)
    if (!access.ok) return access.response

    if (action === "save_rule") {
      if (num(data.branch_id)>0 && !access.branchIds.includes(num(data.branch_id))) return NextResponse.json({ error: "غير مخول لإعداد قاعدة لهذا الفرع" }, { status: 403 })
      const basis = String(data.basis || "sales")
      if (!String(data.name || "").trim() || !["sales", "gross_profit", "collection", "tiered"].includes(basis)) return NextResponse.json({ error: "اسم القاعدة وأساس عمولة صالحان مطلوبان" }, { status: 400 })
      if (!validDate(data.effective_from) || (data.effective_to && !validDate(data.effective_to))) return NextResponse.json({ error: "تواريخ سريان القاعدة غير صالحة" }, { status: 400 })
      const tiers = Array.isArray(data.tiers) ? data.tiers.map((tier: any) => ({ threshold: num(tier.threshold), rate: num(tier.rate) })).sort((a: any,b: any) => a.threshold-b.threshold) : []
      if (basis === "tiered" && (!tiers.length || tiers.some((tier: any) => tier.threshold < 0 || tier.rate < 0 || tier.rate > 100))) return NextResponse.json({ error: "شرائح العمولة غير صالحة" }, { status: 400 })
      const values = [num(data.salesman_id)||null, String(data.name).trim(), basis, Math.max(0,num(data.commission_percent)), num(data.customer_id)||null, num(data.item_id)||null, num(data.item_group_id)||null, num(data.warehouse_id)||null, num(data.branch_id)||null, num(data.currency_id)||null, Math.max(0,num(data.minimum_sales)), JSON.stringify(tiers), data.effective_from, data.effective_to||null, data.is_active!==false]
      if(data.id)await sql`UPDATE salesman_commission_rules SET is_active=false,updated_at=NOW() WHERE id=${Number(data.id)}`
      const rows = await sql`INSERT INTO salesman_commission_rules(salesman_id,name,basis,commission_percent,customer_id,item_id,item_group_id,warehouse_id,branch_id,currency_id,minimum_sales,tiers,effective_from,effective_to,is_active)
        VALUES(${values[0]},${values[1]},${values[2]},${values[3]},${values[4]},${values[5]},${values[6]},${values[7]},${values[8]},${values[9]},${values[10]},${values[11]}::jsonb,${values[12]},${values[13]},${values[14]}) RETURNING *`
      return NextResponse.json({ rule: rows[0] })
    }

    if (action === "save_target") {
      if (!num(data.salesman_id) || !validDate(data.period_from) || !validDate(data.period_to) || data.period_from > data.period_to) return NextResponse.json({ error: "بيانات الهدف غير صالحة" }, { status: 400 })
      const rows = await sql`INSERT INTO salesman_targets(salesman_id,period_from,period_to,sales_target,collection_target,profit_target)
        VALUES(${Number(data.salesman_id)},${data.period_from},${data.period_to},${Math.max(0,num(data.sales_target))},${Math.max(0,num(data.collection_target))},${Math.max(0,num(data.profit_target))})
        ON CONFLICT(salesman_id,period_from,period_to) DO UPDATE SET sales_target=EXCLUDED.sales_target,collection_target=EXCLUDED.collection_target,profit_target=EXCLUDED.profit_target RETURNING *`
      return NextResponse.json({ target: rows[0] })
    }

    if (action === "allocate_collection") {
      const receiptId=num(data.receipt_id), invoiceId=num(data.invoice_id), amount=num(data.amount)
      if (!receiptId || !invoiceId || amount<=0) return NextResponse.json({ error: "حدد سند القبض والفاتورة ومبلغ التخصيص" }, { status: 400 })
      const receipt=(await sql`SELECT id,vch_type,vch_date,amount,currency_id,status,branch_id FROM voucher_header_tbl WHERE id=${receiptId} FOR UPDATE`)[0]
      const invoice=(await sql`SELECT id,vch_type,vch_date,amount,currency_id,status,salesman_id,branch_id FROM voucher_header_tbl WHERE id=${invoiceId} FOR UPDATE`)[0]
      if (!receipt || Number(receipt.vch_type)!==4 || Number(receipt.status)!==2 || !invoice || Number(invoice.vch_type)!==12 || Number(invoice.status)!==2 || !invoice.salesman_id) return NextResponse.json({ error: "سند القبض أو فاتورة المبيعات غير صالحة أو غير مرحلة" }, { status: 400 })
      if (!access.branchIds.includes(Number(invoice.branch_id)) || !access.branchIds.includes(Number(receipt.branch_id))) return NextResponse.json({ error: "غير مخول لتخصيص سند من هذا الفرع" }, { status: 403 })
      if (Number(receipt.branch_id)!==Number(invoice.branch_id)||Number(receipt.currency_id)!==Number(invoice.currency_id)||Number(receipt.account_id)!==Number(invoice.account_id)) return NextResponse.json({ error: "يجب أن يتطابق فرع وعملة وعميل سند القبض مع الفاتورة" }, { status: 400 })
      const prior=(await sql`SELECT COALESCE(SUM(applied_amount),0) amount FROM salesman_commission_collections WHERE receipt_id=${receiptId}`)[0]
      if (Number(prior.amount)+amount>Number(receipt.amount)+0.009) return NextResponse.json({ error: "مبلغ التخصيص يتجاوز سند القبض" }, { status: 400 })
      const invoicePrior=(await sql`SELECT COALESCE(SUM(applied_amount),0) amount FROM salesman_commission_collections WHERE invoice_id=${invoiceId}`)[0]
      if (Number(invoicePrior.amount)+amount>Number(invoice.amount)+0.009) return NextResponse.json({ error: "مبلغ التخصيص يتجاوز الرصيد المفتوح للفاتورة" }, { status: 400 })
      const rows=await sql`INSERT INTO salesman_commission_collections(receipt_id,invoice_id,applied_amount,allocation_date,created_by) VALUES(${receiptId},${invoiceId},${amount},${String(receipt.vch_date).slice(0,10)},${num(access.userId)||null}) ON CONFLICT(receipt_id,invoice_id) DO UPDATE SET applied_amount=salesman_commission_collections.applied_amount+EXCLUDED.applied_amount RETURNING *`
      return NextResponse.json({ allocation: rows[0] }, { status: 201 })
    }

    if (action === "calculate") return await calculatePeriod(data, access)

    if (action === "approve" || action === "cancel") {
      const id=num(data.id)
      const allowed=action==="approve"?"calculated":"calculated"
      const status=action==="approve"?"approved":"cancelled"
      const existing=(await sql`SELECT branch_id FROM salesman_commission_transactions WHERE id=${id} FOR UPDATE`)[0]
      if (!existing || !access.branchIds.includes(Number(existing.branch_id))) return NextResponse.json({ error: "العمولة غير موجودة أو خارج الفروع المصرح بها" }, { status: 404 })
      const rows=await sql`UPDATE salesman_commission_transactions SET status=${status} WHERE id=${id} AND status=${allowed} RETURNING *`
      if (!rows.length) return NextResponse.json({ error: "حالة العمولة لا تسمح بهذا الإجراء" }, { status: 409 })
      return NextResponse.json({ transaction: rows[0] })
    }

    if (action === "pay") {
      const id=num(data.id), amount=num(data.amount), voucherId=num(data.payment_voucher_id)
      if (!id || amount<=0 || !voucherId) return NextResponse.json({ error: "رقم سند الصرف ومبلغ الدفعة مطلوبان" }, { status: 400 })
      const tx=(await sql`SELECT * FROM salesman_commission_transactions WHERE id=${id} FOR UPDATE`)[0]
      if (!tx || !["approved","posted"].includes(tx.status) || Number(tx.final_commission)<=0) return NextResponse.json({ error: "العمولة غير معتمدة أو غير قابلة للصرف" }, { status: 409 })
      if (!access.branchIds.includes(Number(tx.branch_id))) return NextResponse.json({ error: "غير مخول لصرف عمولة من هذا الفرع" }, { status: 403 })
      const voucher=(await sql`SELECT id,vch_type,status,branch_id FROM voucher_header_tbl WHERE id=${voucherId}`)[0]
      if (!voucher || Number(voucher.vch_type)!==5 || Number(voucher.status)!==2 || Number(voucher.branch_id)!==Number(tx.branch_id)) return NextResponse.json({ error: "يجب ربط العمولة بسند صرف مرحل من الفرع نفسه" }, { status: 400 })
      const paid=(await sql`SELECT COALESCE(SUM(amount),0) amount FROM salesman_commission_payments WHERE transaction_id=${id}`)[0]
      if (Number(paid.amount)+amount>Number(tx.final_commission)+0.009) return NextResponse.json({ error: "مبلغ الصرف يتجاوز رصيد العمولة" }, { status: 400 })
      await sql`INSERT INTO salesman_commission_payments(transaction_id,payment_voucher_id,amount,created_by) VALUES(${id},${voucherId},${amount},${num(access.userId)||null})`
      const totalPaid=Number(paid.amount)+amount
      const status=totalPaid+0.009>=Number(tx.final_commission)?"paid":"posted"
      await sql`UPDATE salesman_commission_transactions SET status=${status},payment_voucher_id=${voucherId} WHERE id=${id}`
      return NextResponse.json({ success: true, status, paid: totalPaid, balance: Number(tx.final_commission)-totalPaid })
    }
    return NextResponse.json({ error: "الإجراء غير معروف" }, { status: 400 })
  } catch (error) { return errorResponse(error, "تعذر تنفيذ عملية العمولة") }
}

async function calculatePeriod(data: any, access: { userId: string; branchIds: number[] }) {
  const from=String(data.from||""),to=String(data.to||"")
  if (!validDate(from)||!validDate(to)||from>to) return NextResponse.json({ error: "فترة الحساب غير صالحة" }, { status: 400 })
  const branchIds=access.branchIds.map(Number)
  const rules=(await sql`SELECT * FROM salesman_commission_rules WHERE is_active=true AND effective_from<=${to}::date AND (effective_to IS NULL OR effective_to>=${from}::date)
    AND (branch_id IS NULL OR branch_id=ANY(${access.branchIds}::int[])) ORDER BY id`) as CommissionRule[]
  const legacy=await sql`SELECT id,sales_commission_percent,collection_commission_percent FROM salesmen WHERE COALESCE(is_active,true)`
  for (const salesman of legacy) {
    if (!rules.some(rule=>Number(rule.salesman_id)===Number(salesman.id)&&rule.basis!=="collection")&&Number(salesman.sales_commission_percent)>0)
      rules.push({id:-Number(salesman.id),salesman_id:Number(salesman.id),basis:"sales",commission_percent:Number(salesman.sales_commission_percent),effective_from:"1900-01-01",effective_to:null,tiers:[]} as CommissionRule)
    if (!rules.some(rule=>Number(rule.salesman_id)===Number(salesman.id)&&rule.basis==="collection")&&Number(salesman.collection_commission_percent)>0)
      rules.push({id:-100000-Number(salesman.id),salesman_id:Number(salesman.id),basis:"collection",commission_percent:Number(salesman.collection_commission_percent),effective_from:"1900-01-01",effective_to:null,tiers:[]} as CommissionRule)
  }
  const lines=await sql`SELECT vh.id invoice_id,vh.vch_type,vh.vch_date::date invoice_date,vh.account_id customer_id,vh.salesman_id,vh.branch_id,vh.currency_id,vh.discount_type,vh.discount_value,
      vi.id source_item_id,vi.item_id,vi.item_name,vi.qnty quantity,vi.price,COALESCE(vi.pos_discount_percent,vi.discount,0) discount_percent,
      COALESCE(vi.campaign_discount,0) campaign_discount,COALESCE(vi.cost_price,0) cost_price,vi.store_id warehouse_id,
      p.category_id item_group_id,vi.return_sales_invoice_id
    FROM voucher_header_tbl vh JOIN voucher_items_tbl vi ON vi.voucher_id=vh.id LEFT JOIN products p ON p.id=vi.item_id
    WHERE vh.vch_type IN (12,16) AND vh.status=2 AND vh.vch_date>=${from}::date AND vh.vch_date<(${to}::date+INTERVAL '1 day')
      AND vh.salesman_id IS NOT NULL AND (${branchIds.length===0} OR vh.branch_id=ANY(${branchIds}::int[]))
    ORDER BY vh.vch_date,vh.id,vi.id`
  const grouped=new Map<number,any[]>()
  for(const line of lines){const list=grouped.get(Number(line.invoice_id))||[];list.push(line);grouped.set(Number(line.invoice_id),list)}
  const cumulative=new Map<number,number>()
  let inserted=0
  for(const invoiceLines of grouped.values()){
    const first=invoiceLines[0],salesmanId=Number(first.salesman_id),returning=Number(first.vch_type)===16
    const raw=invoiceLines.map(line=>({...line,gross:Number(line.quantity)*Number(line.price),net:Math.max(0,Number(line.quantity)*Number(line.price)*(1-Number(line.discount_percent)/100)-Number(line.campaign_discount))}))
    const subtotal=raw.reduce((sum,line)=>sum+line.net,0)
    const headerDiscount=first.discount_type==="amount"?Number(first.discount_value||0):subtotal*Number(first.discount_value||0)/100
    for(const line of raw){
      const allocatedHeaderDiscount=subtotal>0?headerDiscount*line.net/subtotal:0
      const netSales=Math.max(0,line.net-allocatedHeaderDiscount)
      const cost=Number(line.quantity)*Number(line.cost_price||0)
      const prior=cumulative.get(salesmanId)||0
      if(!returning)cumulative.set(salesmanId,prior+netSales)
      let returnRule: CommissionRule | undefined
      if(returning&&Number(line.return_sales_invoice_id)>0){
        const original=(await sql`SELECT rule_id,commission_basis,commission_rate FROM salesman_commission_transactions WHERE invoice_id=${Number(line.return_sales_invoice_id)} AND item_id=${Number(line.item_id)} AND source_type='invoice' ORDER BY id DESC LIMIT 1`)[0]
        returnRule=rules.find(item=>Number(item.id)===Number(original?.rule_id))|| (original?.commission_basis?{id:Number(original.rule_id),salesman_id:salesmanId,basis:original.commission_basis,commission_percent:Number(original.commission_rate),tiers:[]} as CommissionRule:undefined)
      }
      const invoiceDate=String(line.invoice_date).slice(0,10)
      const effectiveRules=rules.filter(item=>item.basis!=="collection"&&String((item as any).effective_from||"").slice(0,10)<=invoiceDate&&(!(item as any).effective_to||String((item as any).effective_to).slice(0,10)>=invoiceDate))
      const rule=returnRule||selectCommissionRule(effectiveRules,{salesmanId,customerId:Number(line.customer_id)||null,itemId:Number(line.item_id)||null,itemGroupId:Number(line.item_group_id)||null,warehouseId:Number(line.warehouse_id)||null,branchId:Number(line.branch_id)||null,currencyId:Number(line.currency_id)||null,amount:returning?netSales:prior+netSales})
      if(!rule)continue
      const result=calculateCommission(rule,{sales:netSales,grossProfit:netSales-cost,collected:0},returning?-1:1,prior+netSales)
      const originalSnapshot=returning&&Number(line.return_sales_invoice_id)>0
        ?(await sql`SELECT final_commission,net_sales,cost_amount,gross_profit,commission_rate,commission_basis FROM salesman_commission_transactions
          WHERE invoice_id=${Number(line.return_sales_invoice_id)} AND item_id=${Number(line.item_id)} AND source_type='invoice' ORDER BY id DESC LIMIT 1`)[0]
        :null
      const originalBasis=rule.basis==="gross_profit"?Number(originalSnapshot?.gross_profit):Number(originalSnapshot?.net_sales)
      const returnedBasis=rule.basis==="gross_profit"?Math.max(0,netSales-cost):netSales
      const amount=returning&&originalSnapshot?reverseCommission(Number(originalSnapshot.final_commission),returnedBasis,originalBasis):result.amount
      const snapshotRate=returning&&originalSnapshot?Number(originalSnapshot.commission_rate):result.rate
      await sql`INSERT INTO salesman_commission_transactions(rule_id,salesman_id,branch_id,source_type,source_id,source_item_id,invoice_id,invoice_date,invoice_type,commission_basis,customer_id,item_id,item_group_id,warehouse_id,currency_id,quantity,net_sales,cost_amount,gross_profit,commission_rate,commission_amount,return_amount,final_commission,status)
        VALUES(${rule.id},${salesmanId},${Number(line.branch_id)},${returning?'return':'invoice'},${Number(line.invoice_id)},${Number(line.source_item_id)},${Number(line.invoice_id)},${line.invoice_date},${Number(line.vch_type)},${rule.basis},${line.customer_id},${line.item_id},${line.item_group_id},${line.warehouse_id},${Number(line.currency_id)},${Number(line.quantity)},${returning?-netSales:netSales},${returning?-cost:cost},${returning?-(netSales-cost):netSales-cost},${snapshotRate},${amount},${returning?netSales:0},${amount},'calculated')
        ON CONFLICT(rule_id,source_type,source_id,source_item_id) DO NOTHING RETURNING id`
      inserted++
    }
  }
  const allocations=await sql`SELECT a.id allocation_id,a.receipt_id,a.invoice_id,a.applied_amount,a.allocation_date,invoice.salesman_id,invoice.account_id customer_id,invoice.currency_id,invoice.branch_id,receipt.vch_code receipt_code
    FROM salesman_commission_collections a JOIN voucher_header_tbl invoice ON invoice.id=a.invoice_id JOIN voucher_header_tbl receipt ON receipt.id=a.receipt_id
    WHERE a.allocation_date BETWEEN ${from}::date AND ${to}::date AND invoice.status=2 AND receipt.status=2
      AND (${branchIds.length===0} OR invoice.branch_id=ANY(${branchIds}::int[]))`
  for(const allocation of allocations){
    const salesmanId=Number(allocation.salesman_id),amount=Number(allocation.applied_amount)
    const allocationDate=String(allocation.allocation_date).slice(0,10)
    const effectiveCollectionRules=rules.filter(item=>item.basis==="collection"&&String((item as any).effective_from||"").slice(0,10)<=allocationDate&&(!(item as any).effective_to||String((item as any).effective_to).slice(0,10)>=allocationDate))
    const rule=selectCommissionRule(effectiveCollectionRules,{salesmanId,customerId:Number(allocation.customer_id)||null,branchId:Number(allocation.branch_id)||null,currencyId:Number(allocation.currency_id)||null,amount})
    if(!rule)continue
    const result=calculateCommission(rule,{sales:0,grossProfit:0,collected:amount})
    await sql`INSERT INTO salesman_commission_transactions(rule_id,salesman_id,branch_id,source_type,source_id,source_item_id,invoice_id,invoice_date,invoice_type,commission_basis,customer_id,currency_id,collected_amount,commission_rate,commission_amount,final_commission,status)
      VALUES(${rule.id},${salesmanId},${Number(allocation.branch_id)},'collection',${Number(allocation.receipt_id)},${Number(allocation.allocation_id)},${Number(allocation.invoice_id)},${allocation.allocation_date},12,${rule.basis},${allocation.customer_id},${Number(allocation.currency_id)},${amount},${result.rate},${result.amount},${result.amount},'calculated')
      ON CONFLICT(rule_id,source_type,source_id,source_item_id) DO UPDATE SET collected_amount=EXCLUDED.collected_amount,commission_rate=EXCLUDED.commission_rate,commission_amount=EXCLUDED.commission_amount,final_commission=EXCLUDED.final_commission WHERE salesman_commission_transactions.status='calculated'`
    inserted++
  }
  return NextResponse.json({ success: true, calculated: inserted })
}
