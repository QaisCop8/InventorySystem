import sql from "@/lib/database"
import { saveJournalRows } from "@/app/api/receipts/_lib"

export const FIXED_ASSET_DEPRECIATION_VCH_TYPE = 99

export const FIXED_ASSET_DEPRECIATION_METHODS = [
  "straight_line",
  "declining_balance",
  "units_of_production",
] as const

export async function ensureTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS fixed_asset_categories_tbl (
      id SERIAL PRIMARY KEY,
      code VARCHAR(30) NOT NULL UNIQUE,
      name VARCHAR(150) NOT NULL,
      asset_account_id INTEGER,
      accumulated_depreciation_account_id INTEGER,
      depreciation_expense_account_id INTEGER,
      gain_account_id INTEGER,
      loss_account_id INTEGER,
      default_useful_life_months INTEGER NOT NULL DEFAULT 60,
      default_salvage_value NUMERIC(18,2) NOT NULL DEFAULT 0,
      default_depreciation_method VARCHAR(30) NOT NULL DEFAULT 'straight_line',
      notes TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS fixed_assets_tbl (
      id SERIAL PRIMARY KEY,
      asset_code VARCHAR(40) NOT NULL UNIQUE,
      name VARCHAR(200) NOT NULL,
      category_id INTEGER NOT NULL REFERENCES fixed_asset_categories_tbl(id),
      supplier_account_id INTEGER,
      purchase_voucher_id INTEGER,
      purchase_invoice_no VARCHAR(80),
      purchase_date DATE,
      capitalization_date DATE,
      depreciation_start_date DATE,
      cost NUMERIC(18,2) NOT NULL DEFAULT 0,
      salvage_value NUMERIC(18,2) NOT NULL DEFAULT 0,
      useful_life_months INTEGER NOT NULL DEFAULT 60 CHECK (useful_life_months > 0),
      depreciation_method VARCHAR(30) NOT NULL DEFAULT 'straight_line',
      asset_account_id INTEGER,
      accumulated_depreciation_account_id INTEGER,
      depreciation_expense_account_id INTEGER,
      gain_account_id INTEGER,
      loss_account_id INTEGER,
      cost_center_id INTEGER,
      department_id INTEGER,
      location_id INTEGER,
      responsible_employee_id INTEGER,
      serial_number VARCHAR(80),
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      notes TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `
  await sql`ALTER TABLE fixed_assets_tbl ADD COLUMN IF NOT EXISTS branch_id INTEGER`
  await sql`ALTER TABLE fixed_assets_tbl ADD COLUMN IF NOT EXISTS currency_id INTEGER`
  await sql`ALTER TABLE fixed_assets_tbl ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,8) NOT NULL DEFAULT 1`
  await sql`ALTER TABLE fixed_assets_tbl ADD COLUMN IF NOT EXISTS quantity NUMERIC(18,4) NOT NULL DEFAULT 1`
  await sql`ALTER TABLE fixed_assets_tbl ADD COLUMN IF NOT EXISTS project_id INTEGER`
  await sql`ALTER TABLE fixed_assets_tbl ADD COLUMN IF NOT EXISTS store_id INTEGER`

  await sql`
    CREATE TABLE IF NOT EXISTS fixed_asset_depreciation_runs_tbl (
      id SERIAL PRIMARY KEY,
      period VARCHAR(15) NOT NULL,
      posting_date DATE NOT NULL,
      voucher_id INTEGER,
      total_depreciation NUMERIC(18,2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      created_by INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      posted_at TIMESTAMP
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS fixed_asset_depreciation_lines_tbl (
      id SERIAL PRIMARY KEY,
      run_id INTEGER NOT NULL REFERENCES fixed_asset_depreciation_runs_tbl(id) ON DELETE CASCADE,
      asset_id INTEGER NOT NULL REFERENCES fixed_assets_tbl(id),
      depreciation_date DATE NOT NULL,
      depreciation_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      book_value_before NUMERIC(18,2) NOT NULL DEFAULT 0,
      book_value_after NUMERIC(18,2) NOT NULL DEFAULT 0,
      depreciation_method VARCHAR(30) NOT NULL DEFAULT 'straight_line',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS fixed_asset_transfers_tbl (
      id SERIAL PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES fixed_assets_tbl(id),
      transfer_date DATE NOT NULL,
      from_cost_center_id INTEGER,
      to_cost_center_id INTEGER,
      from_department_id INTEGER,
      to_department_id INTEGER,
      from_location_id INTEGER,
      to_location_id INTEGER,
      reason TEXT,
      voucher_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS fixed_asset_improvements_tbl (
      id SERIAL PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES fixed_assets_tbl(id),
      improvement_date DATE NOT NULL,
      amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      description TEXT,
      voucher_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS fixed_asset_disposals_tbl (
      id SERIAL PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES fixed_assets_tbl(id),
      disposal_date DATE NOT NULL,
      sale_price NUMERIC(18,2) NOT NULL DEFAULT 0,
      book_value NUMERIC(18,2) NOT NULL DEFAULT 0,
      gain_loss NUMERIC(18,2) NOT NULL DEFAULT 0,
      reason TEXT,
      voucher_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS fixed_asset_transactions_tbl (
      id BIGSERIAL PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES fixed_assets_tbl(id),
      transaction_type VARCHAR(30) NOT NULL,
      transaction_date DATE NOT NULL,
      amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      voucher_id INTEGER,
      description TEXT,
      from_values JSONB NOT NULL DEFAULT '{}'::jsonb,
      to_values JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `

  await sql`CREATE INDEX IF NOT EXISTS idx_fixed_assets_category_id ON fixed_assets_tbl(category_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_fixed_assets_status ON fixed_assets_tbl(status)`
  await sql`CREATE INDEX IF NOT EXISTS idx_fixed_asset_depreciation_run_id ON fixed_asset_depreciation_lines_tbl(run_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_fixed_asset_transactions_asset_date ON fixed_asset_transactions_tbl(asset_id,transaction_date,id)`
}

export async function listFixedAssets() {
  await ensureTables()
  return sql`
    SELECT fa.*, fac.code AS category_code, fac.name AS category_name,
           b.branch_name,cc.name AS cost_center_name,
           COALESCE((SELECT SUM(i.amount) FROM fixed_asset_improvements_tbl i WHERE i.asset_id=fa.id),0) additions,
           COALESCE((SELECT SUM(fdl.depreciation_amount) FROM fixed_asset_depreciation_lines_tbl fdl JOIN fixed_asset_depreciation_runs_tbl fdr ON fdr.id=fdl.run_id AND fdr.status='posted' WHERE fdl.asset_id=fa.id),0) accumulated_depreciation
    FROM fixed_assets_tbl fa
    LEFT JOIN fixed_asset_categories_tbl fac ON fac.id = fa.category_id
    LEFT JOIN branches b ON b.id=fa.branch_id
    LEFT JOIN cost_centers cc ON cc.id=fa.cost_center_id
    WHERE fa.is_active = TRUE
    ORDER BY fa.id DESC
  `
}

export async function getFixedAssetById(id: number) {
  await ensureTables()
  const rows = await sql`
    SELECT fa.*, fac.code AS category_code, fac.name AS category_name
    FROM fixed_assets_tbl fa
    LEFT JOIN fixed_asset_categories_tbl fac ON fac.id = fa.category_id
    WHERE fa.id = ${id} AND fa.is_active = TRUE
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function getFixedAssetCard(id: number) {
  await ensureTables()
  const asset = await getFixedAssetById(id)
  if (!asset) return null
  const [transactions, depreciation, transfers, disposals, improvements] = await Promise.all([
    sql`SELECT * FROM fixed_asset_transactions_tbl WHERE asset_id=${id} ORDER BY transaction_date DESC,id DESC`,
    sql`SELECT fdl.*,fdr.period,fdr.status run_status,fdr.voucher_id FROM fixed_asset_depreciation_lines_tbl fdl JOIN fixed_asset_depreciation_runs_tbl fdr ON fdr.id=fdl.run_id WHERE fdl.asset_id=${id} ORDER BY fdl.depreciation_date DESC,fdl.id DESC`,
    sql`SELECT * FROM fixed_asset_transfers_tbl WHERE asset_id=${id} ORDER BY transfer_date DESC,id DESC`,
    sql`SELECT * FROM fixed_asset_disposals_tbl WHERE asset_id=${id} ORDER BY disposal_date DESC,id DESC`,
    sql`SELECT * FROM fixed_asset_improvements_tbl WHERE asset_id=${id} ORDER BY improvement_date DESC,id DESC`,
  ])
  return { ...asset, transactions, depreciation, transfers, disposals, improvements }
}

export async function createFixedAsset(input: Record<string, any>) {
  await ensureTables()

  const payload = {
    asset_code: String(input.asset_code || "").trim(),
    name: String(input.name || "").trim(),
    category_id: Number(input.category_id),
    cost: Number(input.cost || 0),
    salvage_value: Number(input.salvage_value || 0),
    useful_life_months: Number(input.useful_life_months || 60),
    depreciation_method: String(input.depreciation_method || "straight_line"),
    supplier_account_id: input.supplier_account_id ? Number(input.supplier_account_id) : null,
    purchase_invoice_no: input.purchase_invoice_no ? String(input.purchase_invoice_no).trim() : null,
    purchase_date: input.purchase_date || null,
    capitalization_date: input.capitalization_date || null,
    depreciation_start_date: input.depreciation_start_date || null,
    notes: input.notes ? String(input.notes).trim() : null,
    cost_center_id: input.cost_center_id ? Number(input.cost_center_id) : null,
    department_id: input.department_id ? Number(input.department_id) : null,
    location_id: input.location_id ? Number(input.location_id) : null,
    responsible_employee_id: input.responsible_employee_id ? Number(input.responsible_employee_id) : null,
    serial_number: input.serial_number ? String(input.serial_number).trim() : null,
    status: input.status || "active",
    is_active: input.is_active !== false,
  }

  if (!payload.asset_code || !payload.name || !payload.category_id || !Number.isFinite(payload.cost) || payload.cost < 0
      || !Number.isFinite(payload.useful_life_months) || payload.useful_life_months <= 0
      || !Number.isFinite(payload.salvage_value) || payload.salvage_value < 0 || payload.salvage_value > payload.cost) {
    throw new Error("بيانات الأصل الثابت غير مكتملة")
  }

  const category = (await sql`SELECT * FROM fixed_asset_categories_tbl WHERE id=${payload.category_id} AND is_active=TRUE`)[0]
  if (!category) throw new Error("تصنيف الأصل غير موجود أو غير نشط")
  const createAcquisitionVoucher = input.create_voucher === true
  const assetAccountId = Number(input.asset_account_id || category.asset_account_id || 0)
  if (createAcquisitionVoucher && payload.cost <= 0) throw new Error("تكلفة الأصل يجب أن تكون أكبر من صفر لإنشاء قيد الاقتناء")
  if (createAcquisitionVoucher && !(Number(input.exchange_rate || 1) > 0)) throw new Error("سعر الصرف يجب أن يكون أكبر من صفر")
  if (createAcquisitionVoucher && (!assetAccountId || !payload.supplier_account_id)) {
    throw new Error("لإنشاء قيد الاقتناء يجب تعريف حساب الأصل في التصنيف واختيار حساب المورد")
  }
  const result = await sql`
    INSERT INTO fixed_assets_tbl (
      asset_code,
      name,
      category_id,
      supplier_account_id,
      purchase_voucher_id,
      purchase_invoice_no,
      purchase_date,
      capitalization_date,
      depreciation_start_date,
      cost,
      salvage_value,
      useful_life_months,
      depreciation_method,
      cost_center_id,
      department_id,
      location_id,
      responsible_employee_id,
      serial_number,
      status,
      notes,
      asset_account_id,
      accumulated_depreciation_account_id,
      depreciation_expense_account_id,
      gain_account_id,
      loss_account_id,
      branch_id,
      currency_id,
      exchange_rate,
      quantity,
      project_id,
      store_id,
      is_active,
      updated_at
    ) VALUES (
      ${payload.asset_code},
      ${payload.name},
      ${payload.category_id},
      ${payload.supplier_account_id},
      ${input.purchase_voucher_id ? Number(input.purchase_voucher_id) : null},
      ${payload.purchase_invoice_no},
      ${payload.purchase_date},
      ${payload.capitalization_date},
      ${payload.depreciation_start_date},
      ${payload.cost},
      ${payload.salvage_value},
      ${payload.useful_life_months},
      ${payload.depreciation_method},
      ${payload.cost_center_id},
      ${payload.department_id},
      ${payload.location_id},
      ${payload.responsible_employee_id},
      ${payload.serial_number},
      ${payload.status},
      ${payload.notes},
      ${input.asset_account_id ? Number(input.asset_account_id) : category.asset_account_id},
      ${input.accumulated_depreciation_account_id ? Number(input.accumulated_depreciation_account_id) : category.accumulated_depreciation_account_id},
      ${input.depreciation_expense_account_id ? Number(input.depreciation_expense_account_id) : category.depreciation_expense_account_id},
      ${input.gain_account_id ? Number(input.gain_account_id) : category.gain_account_id},
      ${input.loss_account_id ? Number(input.loss_account_id) : category.loss_account_id},
      ${input.branch_id ? Number(input.branch_id) : null},
      ${input.currency_id ? Number(input.currency_id) : null},
      ${Number(input.exchange_rate || 1)},
      ${Number(input.quantity || 1)},
      ${input.project_id ? Number(input.project_id) : null},
      ${input.store_id ? Number(input.store_id) : null},
      ${payload.is_active},
      CURRENT_TIMESTAMP
    ) RETURNING *
  `

  let acquisitionVoucher: any = null
  if (createAcquisitionVoucher) {
    const currencyId = Number(input.currency_id || 0) || null
    const rate = Number(input.exchange_rate || 1)
    const branchId = Number(input.branch_id || 0) || null
    acquisitionVoucher = (await sql`
      INSERT INTO voucher_header_tbl(vch_type,vch_code,vch_date,branch_id,currency_id,rate,amount,note,status,vch_status,is_printed,insert_user)
      VALUES(${FIXED_ASSET_DEPRECIATION_VCH_TYPE},${`FA-ACQ-${Number(result[0].id)}`},${payload.purchase_date || payload.capitalization_date || new Date().toISOString().slice(0,10)}::date,${branchId},${currencyId},${rate},${payload.cost},${`اقتناء أصل ثابت ${payload.asset_code}`},2,2,0,${input.created_by ? Number(input.created_by) : null})
      RETURNING *
    `)[0]
    await saveJournalRows(Number(acquisitionVoucher.id), [
      { order_no: 1, journal_type_id: 5, account_id: assetAccountId, credit_debit: 1, amount: payload.cost, currency_id: currencyId, rate, base_curr_amount: Math.round(payload.cost * rate * 100) / 100, note: `تكلفة الأصل ${payload.asset_code}` },
      { order_no: 2, journal_type_id: 5, account_id: payload.supplier_account_id, credit_debit: 2, amount: payload.cost, currency_id: currencyId, rate, base_curr_amount: Math.round(payload.cost * rate * 100) / 100, note: `مورد الأصل ${payload.asset_code}` },
    ])
    await sql`UPDATE fixed_assets_tbl SET purchase_voucher_id=${Number(acquisitionVoucher.id)} WHERE id=${Number(result[0].id)}`
  }

  await sql`
    INSERT INTO fixed_asset_transactions_tbl(asset_id,transaction_type,transaction_date,amount,voucher_id,description,to_values,created_by)
    VALUES(${Number(result[0].id)},'acquisition',COALESCE(${payload.purchase_date}::date,CURRENT_DATE),${payload.cost},${Number(acquisitionVoucher?.id || input.purchase_voucher_id) || null},${`اقتناء أصل ${payload.asset_code}`},${JSON.stringify({supplier_account_id:payload.supplier_account_id,purchase_invoice_no:payload.purchase_invoice_no,capitalization_date:payload.capitalization_date})}::jsonb,${input.created_by ? Number(input.created_by) : null})
  `

  return { ...result[0], purchase_voucher_id: Number(acquisitionVoucher?.id || input.purchase_voucher_id) || null, acquisition_voucher: acquisitionVoucher }
}

export async function transferFixedAsset(assetId: number, input: Record<string, any>) {
  await ensureTables()
  const asset = await getFixedAssetById(assetId)
  if (!asset || asset.status === "disposed") throw new Error("الأصل غير موجود أو مستبعد")
  const transferDate = String(input.transfer_date || new Date().toISOString().slice(0, 10))
  const fromValues = {
    branch_id: asset.branch_id ?? null,
    department_id: asset.department_id ?? null,
    cost_center_id: asset.cost_center_id ?? null,
    location_id: asset.location_id ?? null,
    responsible_employee_id: asset.responsible_employee_id ?? null,
    store_id: asset.store_id ?? null,
    project_id: asset.project_id ?? null,
  }
  const toValues = {
    branch_id: input.branch_id ? Number(input.branch_id) : fromValues.branch_id,
    department_id: input.department_id ? Number(input.department_id) : fromValues.department_id,
    cost_center_id: input.cost_center_id ? Number(input.cost_center_id) : fromValues.cost_center_id,
    location_id: input.location_id ? Number(input.location_id) : fromValues.location_id,
    responsible_employee_id: input.responsible_employee_id ? Number(input.responsible_employee_id) : fromValues.responsible_employee_id,
    store_id: input.store_id ? Number(input.store_id) : fromValues.store_id,
    project_id: input.project_id ? Number(input.project_id) : fromValues.project_id,
  }
  const transfer = (await sql`
    INSERT INTO fixed_asset_transfers_tbl (
      asset_id,transfer_date,from_cost_center_id,to_cost_center_id,
      from_department_id,to_department_id,from_location_id,to_location_id,reason
    ) VALUES (
      ${assetId},${transferDate}::date,${fromValues.cost_center_id},${toValues.cost_center_id},
      ${fromValues.department_id},${toValues.department_id},${fromValues.location_id},${toValues.location_id},${String(input.reason || "")}
    ) RETURNING *
  `)[0]
  const updated = (await sql`
    UPDATE fixed_assets_tbl SET branch_id=${toValues.branch_id},department_id=${toValues.department_id},
      cost_center_id=${toValues.cost_center_id},location_id=${toValues.location_id},
      responsible_employee_id=${toValues.responsible_employee_id},store_id=${toValues.store_id},
      project_id=${toValues.project_id},updated_at=CURRENT_TIMESTAMP
    WHERE id=${assetId} RETURNING *
  `)[0]
  await sql`
    INSERT INTO fixed_asset_transactions_tbl(asset_id,transaction_type,transaction_date,description,from_values,to_values,created_by)
    VALUES(${assetId},'transfer',${transferDate}::date,${String(input.reason || "نقل أصل")},${JSON.stringify(fromValues)}::jsonb,${JSON.stringify(toValues)}::jsonb,${input.created_by ? Number(input.created_by) : null})
  `
  return { transfer, asset: updated }
}

export async function listFixedAssetTransactions(assetId: number) {
  await ensureTables()
  return sql`SELECT * FROM fixed_asset_transactions_tbl WHERE asset_id=${assetId} ORDER BY transaction_date DESC,id DESC`
}

export async function listFixedAssetTransfers() {
  await ensureTables()
  return sql`
    SELECT t.*,a.asset_code,a.name asset_name
    FROM fixed_asset_transfers_tbl t JOIN fixed_assets_tbl a ON a.id=t.asset_id
    ORDER BY t.transfer_date DESC,t.id DESC LIMIT 500
  `
}

export async function listFixedAssetDisposals() {
  await ensureTables()
  return sql`
    SELECT d.*,a.asset_code,a.name asset_name,a.currency_id,a.branch_id
    FROM fixed_asset_disposals_tbl d JOIN fixed_assets_tbl a ON a.id=d.asset_id
    ORDER BY d.disposal_date DESC,d.id DESC LIMIT 500
  `
}

export async function disposeFixedAsset(assetId: number, input: Record<string, any>) {
  await ensureTables()
  const asset = await getFixedAssetById(assetId)
  if (!asset || asset.status === "disposed") throw new Error("الأصل غير موجود أو سبق استبعاده")
  const category = (await sql`SELECT * FROM fixed_asset_categories_tbl WHERE id=${Number(asset.category_id)}`)[0]
  const accumulatedRows = await sql`
    SELECT COALESCE(SUM(fdl.depreciation_amount),0) accumulated
    FROM fixed_asset_depreciation_lines_tbl fdl
    JOIN fixed_asset_depreciation_runs_tbl fdr ON fdr.id=fdl.run_id AND fdr.status='posted'
    WHERE fdl.asset_id=${assetId}
  `
  const improvements = (await sql`SELECT COALESCE(SUM(amount),0) total FROM fixed_asset_improvements_tbl WHERE asset_id=${assetId}`)[0]
  const cost = Number(asset.cost || 0) + Number(improvements?.total || 0)
  const accumulated = Math.min(cost, Number(accumulatedRows[0]?.accumulated || 0))
  const bookValue = Math.max(0, Math.round((cost - accumulated) * 100) / 100)
  const salePrice = Number(input.sale_price || 0)
  if (!Number.isFinite(salePrice) || salePrice < 0) throw new Error("متحصلات الاستبعاد يجب ألا تكون سالبة")
  const gainLoss = Math.round((salePrice - bookValue) * 100) / 100
  const assetAccountId = Number(asset.asset_account_id || category?.asset_account_id || 0)
  const accumulatedAccountId = Number(asset.accumulated_depreciation_account_id || category?.accumulated_depreciation_account_id || 0)
  const gainAccountId = Number(asset.gain_account_id || category?.gain_account_id || 0)
  const lossAccountId = Number(asset.loss_account_id || category?.loss_account_id || 0)
  const proceedsAccountId = Number(input.proceeds_account_id || 0)
  if (!assetAccountId || !accumulatedAccountId || !proceedsAccountId || (gainLoss > 0 && !gainAccountId) || (gainLoss < 0 && !lossAccountId)) {
    throw new Error("يجب تعريف حساب الأصل والإهلاك المتراكم وحساب المتحصلات وحساب الربح أو الخسارة في التصنيف")
  }
  const currencyId = Number(input.currency_id || asset.currency_id || 0) || null
  const rate = Number(input.rate || asset.exchange_rate || 1)
  const branchId = Number(input.branch_id || asset.branch_id || 0) || null
  const journalRows: any[] = []
  let orderNo = 1
  const addRow = (accountId: number, side: 1 | 2, amount: number, note: string) => {
    if (amount <= 0) return
    journalRows.push({
      order_no: orderNo++, journal_type_id: 5, account_id: accountId,
      credit_debit: side, amount, currency_id: currencyId, rate,
      base_curr_amount: Math.round(amount * rate * 100) / 100, note,
    })
  }
  addRow(proceedsAccountId, 1, salePrice, `متحصلات استبعاد ${asset.asset_code}`)
  addRow(accumulatedAccountId, 1, accumulated, `إهلاك متراكم ${asset.asset_code}`)
  addRow(assetAccountId, 2, cost, `تكلفة الأصل ${asset.asset_code}`)
  if (gainLoss > 0) addRow(gainAccountId, 2, gainLoss, `ربح استبعاد ${asset.asset_code}`)
  if (gainLoss < 0) addRow(lossAccountId, 1, Math.abs(gainLoss), `خسارة استبعاد ${asset.asset_code}`)
  const debit = journalRows.filter(row => row.credit_debit === 1).reduce((sum, row) => sum + row.amount, 0)
  const credit = journalRows.filter(row => row.credit_debit === 2).reduce((sum, row) => sum + row.amount, 0)
  if (Math.round((debit - credit) * 100) / 100 !== 0) throw new Error("قيد استبعاد الأصل غير متوازن")

  const disposalDate = String(input.disposal_date || new Date().toISOString().slice(0, 10))
  const voucher = (await sql`
    INSERT INTO voucher_header_tbl(vch_type,vch_code,vch_date,branch_id,currency_id,rate,amount,note,status,vch_status,is_printed,insert_user)
    VALUES(${FIXED_ASSET_DEPRECIATION_VCH_TYPE},${`FA-DISP-${assetId}-${Date.now()}`},${disposalDate}::date,${branchId},${currencyId},${rate},${salePrice},${`استبعاد أصل ثابت ${asset.asset_code}`},2,2,0,${input.created_by ? Number(input.created_by) : null})
    RETURNING *
  `)[0]
  await saveJournalRows(voucher.id, journalRows)
  const disposal = (await sql`
    INSERT INTO fixed_asset_disposals_tbl(asset_id,disposal_date,sale_price,book_value,gain_loss,reason,voucher_id)
    VALUES(${assetId},${disposalDate}::date,${salePrice},${bookValue},${gainLoss},${String(input.reason || "")},${Number(voucher.id)})
    RETURNING *
  `)[0]
  await sql`UPDATE fixed_assets_tbl SET status='disposed',is_active=TRUE,updated_at=CURRENT_TIMESTAMP WHERE id=${assetId}`
  await sql`
    INSERT INTO fixed_asset_transactions_tbl(asset_id,transaction_type,transaction_date,amount,voucher_id,description,created_by)
    VALUES(${assetId},'disposal',${disposalDate}::date,${salePrice},${Number(voucher.id)},${String(input.reason || "استبعاد أصل")},${input.created_by ? Number(input.created_by) : null})
  `
  return { disposal, voucher, journal_rows: journalRows }
}

export async function updateFixedAsset(id: number, input: Record<string, any>) {
  await ensureTables()

  const current = await getFixedAssetById(id)
  if (!current) {
    throw new Error("الأصل الثابت غير موجود")
  }

  const next = {
    ...current,
    ...input,
    cost: Number(input.cost ?? current.cost ?? 0),
    salvage_value: Number(input.salvage_value ?? current.salvage_value ?? 0),
    useful_life_months: Number(input.useful_life_months ?? current.useful_life_months ?? 60),
    depreciation_method: String(input.depreciation_method ?? current.depreciation_method ?? "straight_line"),
    notes: input.notes !== undefined ? String(input.notes).trim() : current.notes,
    status: input.status ?? current.status ?? "active",
    is_active: input.is_active !== undefined ? Boolean(input.is_active) : current.is_active,
  }

  if (!next.asset_code || !next.name || !next.category_id || !(next.cost >= 0)) {
    throw new Error("بيانات الأصل الثابت غير مكتملة")
  }

  const rows = await sql`
    UPDATE fixed_assets_tbl
    SET
      asset_code = ${next.asset_code},
      name = ${next.name},
      category_id = ${next.category_id},
      supplier_account_id = ${next.supplier_account_id ?? null},
      purchase_invoice_no = ${next.purchase_invoice_no ?? null},
      purchase_date = ${next.purchase_date ?? null},
      capitalization_date = ${next.capitalization_date ?? null},
      depreciation_start_date = ${next.depreciation_start_date ?? null},
      cost = ${next.cost},
      salvage_value = ${next.salvage_value},
      useful_life_months = ${next.useful_life_months},
      depreciation_method = ${next.depreciation_method},
      cost_center_id = ${next.cost_center_id ?? null},
      department_id = ${next.department_id ?? null},
      location_id = ${next.location_id ?? null},
      responsible_employee_id = ${next.responsible_employee_id ?? null},
      serial_number = ${next.serial_number ?? null},
      status = ${next.status},
      notes = ${next.notes},
      is_active = ${next.is_active},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING *
  `

  return rows[0]
}

export async function deleteFixedAsset(id: number) {
  await ensureTables()
  const rows = await sql`
    UPDATE fixed_assets_tbl
    SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING *
  `
  return rows[0] ?? null
}

export async function listCategories() {
  await ensureTables()
  return sql`
    SELECT *
    FROM fixed_asset_categories_tbl
    WHERE is_active = TRUE
    ORDER BY id DESC
  `
}

export async function createCategory(input: Record<string, any>) {
  await ensureTables()

  const payload = {
    code: String(input.code || "").trim(),
    name: String(input.name || "").trim(),
    asset_account_id: input.asset_account_id ? Number(input.asset_account_id) : null,
    accumulated_depreciation_account_id: input.accumulated_depreciation_account_id ? Number(input.accumulated_depreciation_account_id) : null,
    depreciation_expense_account_id: input.depreciation_expense_account_id ? Number(input.depreciation_expense_account_id) : null,
    gain_account_id: input.gain_account_id ? Number(input.gain_account_id) : null,
    loss_account_id: input.loss_account_id ? Number(input.loss_account_id) : null,
    default_useful_life_months: Number(input.default_useful_life_months || 60),
    default_salvage_value: Number(input.default_salvage_value || 0),
    default_depreciation_method: String(input.default_depreciation_method || "straight_line"),
    notes: input.notes ? String(input.notes).trim() : null,
  }

  if (!payload.code || !payload.name) {
    throw new Error("كود أو اسم التصنيف مطلوب")
  }

  const rows = await sql`
    INSERT INTO fixed_asset_categories_tbl (
      code,
      name,
      asset_account_id,
      accumulated_depreciation_account_id,
      depreciation_expense_account_id,
      gain_account_id,
      loss_account_id,
      default_useful_life_months,
      default_salvage_value,
      default_depreciation_method,
      notes,
      is_active,
      updated_at
    ) VALUES (
      ${payload.code},
      ${payload.name},
      ${payload.asset_account_id},
      ${payload.accumulated_depreciation_account_id},
      ${payload.depreciation_expense_account_id},
      ${payload.gain_account_id},
      ${payload.loss_account_id},
      ${payload.default_useful_life_months},
      ${payload.default_salvage_value},
      ${payload.default_depreciation_method},
      ${payload.notes},
      TRUE,
      CURRENT_TIMESTAMP
    ) RETURNING *
  `

  return rows[0]
}

export function getFixedAssetDepreciationAmount(asset: Record<string, any>) {
  const cost = Number(asset.cost || 0)
  const salvageValue = Number(asset.salvage_value || 0)
  const usefulLifeMonths = Number(asset.useful_life_months || 60)
  const method = String(asset.depreciation_method || "straight_line")

  if (cost <= 0) return { amount: 0, method, bookValueBefore: 0, bookValueAfter: 0 }

  const depreciableBase = Math.max(cost - salvageValue, 0)

  if (method === "declining_balance") {
    const rate = usefulLifeMonths > 0 ? 2 / usefulLifeMonths : 0
    const amount = Math.max((cost - salvageValue) * rate / 12, 0)
    return {
      amount,
      method,
      bookValueBefore: cost,
      bookValueAfter: Math.max(cost - amount, salvageValue),
    }
  }

  if (method === "units_of_production") {
    const amount = Math.max((depreciableBase / usefulLifeMonths), 0)
    return {
      amount,
      method,
      bookValueBefore: cost,
      bookValueAfter: Math.max(cost - amount, salvageValue),
    }
  }

  const amount = Math.max(depreciableBase / usefulLifeMonths, 0)
  return {
    amount,
    method: "straight_line",
    bookValueBefore: cost,
    bookValueAfter: Math.max(cost - amount, salvageValue),
  }
}

export async function listDepreciationRuns() {
  await ensureTables()
  const runs = await sql`
    SELECT *
    FROM fixed_asset_depreciation_runs_tbl
    ORDER BY id DESC
  `

  const runsWithLines = await Promise.all(
    runs.map(async (run: any) => {
      const lines = await sql`
        SELECT fdl.*, fa.asset_code, fa.name AS asset_name
        FROM fixed_asset_depreciation_lines_tbl fdl
        LEFT JOIN fixed_assets_tbl fa ON fa.id = fdl.asset_id
        WHERE fdl.run_id = ${run.id}
        ORDER BY fdl.id
      `
      return { ...run, lines }
    }),
  )

  return runsWithLines
}

export async function getDepreciationRunById(id: number) {
  await ensureTables()
  const rows = await sql`
    SELECT *
    FROM fixed_asset_depreciation_runs_tbl
    WHERE id = ${id}
    LIMIT 1
  `

  if (!rows[0]) return null

  const lines = await sql`
    SELECT fdl.*, fa.asset_code, fa.name AS asset_name
    FROM fixed_asset_depreciation_lines_tbl fdl
    LEFT JOIN fixed_assets_tbl fa ON fa.id = fdl.asset_id
    WHERE fdl.run_id = ${id}
    ORDER BY fdl.id
  `

  return { ...rows[0], lines }
}

export async function buildFixedAssetDepreciationJournalRows(
  runId: number,
  lines: any[],
  currencyId: number | null,
  rate: number,
) {
  const rowsByAccount = new Map<string, { accountId: number; amount: number; credit_debit: 1 | 2; note: string }>()

  for (const line of lines) {
    const asset = line.asset || {}
    const category = line.category || {}
    const expenseAccountId = Number(line.expense_account_id ?? category.depreciation_expense_account_id ?? asset.depreciation_expense_account_id ?? 0)
    const accumulatedAccountId = Number(line.accumulated_account_id ?? category.accumulated_depreciation_account_id ?? asset.accumulated_depreciation_account_id ?? 0)
    const depreciationAmount = Number(line.depreciation_amount || 0)

    if (expenseAccountId > 0) {
      const key = `dr-${expenseAccountId}-debit`
      const current = rowsByAccount.get(key)
      rowsByAccount.set(key, {
        accountId: expenseAccountId,
        amount: Number((current?.amount || 0) + depreciationAmount),
        credit_debit: 1,
        note: `إهلاك أصل ثابت: ${asset.asset_code || "أصل"}`,
      })
    }

    if (accumulatedAccountId > 0) {
      const key = `cr-${accumulatedAccountId}-credit`
      const current = rowsByAccount.get(key)
      rowsByAccount.set(key, {
        accountId: accumulatedAccountId,
        amount: Number((current?.amount || 0) + depreciationAmount),
        credit_debit: 2,
        note: `إجمالي إهلاك تراكمي: ${asset.asset_code || "أصل"}`,
      })
    }
  }

  const journalRows = Array.from(rowsByAccount.values()).map((entry, index) => ({
    order_no: index + 1,
    journal_type_id: 5,
    account_id: entry.accountId,
    credit_debit: entry.credit_debit,
    amount: Number(entry.amount || 0),
    currency_id: currencyId,
    rate: Number(rate || 1),
    base_curr_amount: Number((entry.amount || 0) * (Number(rate || 1))),
    note: entry.note,
  }))

  return journalRows
}

export async function createDepreciationRun(input: Record<string, any>) {
  await ensureTables()

  const period = String(input.period || new Date().toISOString().slice(0, 7))
  const postingDate = input.posting_date || input.postingDate || new Date().toISOString().slice(0, 10)
  const shouldPost = input.create_voucher !== false && input.post_immediately !== false

  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error("فترة الإهلاك يجب أن تكون بصيغة YYYY-MM")
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`fixed-asset-depreciation:${period}`}))`
  const existingRun = (await sql`SELECT id,status FROM fixed_asset_depreciation_runs_tbl WHERE period=${period} LIMIT 1`)[0]
  if (existingRun) throw new Error(`تم إنشاء تجميع إهلاك للفترة ${period} مسبقاً`)

  const rows = await sql`
    SELECT fa.*, fac.asset_account_id, fac.accumulated_depreciation_account_id, fac.depreciation_expense_account_id
    FROM fixed_assets_tbl fa
    LEFT JOIN fixed_asset_categories_tbl fac ON fac.id = fa.category_id
    WHERE fa.is_active = TRUE AND fa.status = 'active'
      AND (fa.depreciation_start_date IS NULL OR fa.depreciation_start_date <= ${postingDate}::date)
  `

  const assetIds = rows.map((asset: any) => Number(asset.id))
  const [previousDepreciationRows, improvementRows] = assetIds.length ? await Promise.all([
    sql`
      SELECT fdl.asset_id,COALESCE(SUM(fdl.depreciation_amount),0) accumulated
      FROM fixed_asset_depreciation_lines_tbl fdl
      JOIN fixed_asset_depreciation_runs_tbl fdr ON fdr.id=fdl.run_id AND fdr.status='posted'
      WHERE fdl.asset_id=ANY(${assetIds}::int[]) AND fdl.depreciation_date<${postingDate}::date
      GROUP BY fdl.asset_id
    `,
    sql`SELECT asset_id,COALESCE(SUM(amount),0) additions FROM fixed_asset_improvements_tbl WHERE asset_id=ANY(${assetIds}::int[]) AND improvement_date<=${postingDate}::date GROUP BY asset_id`,
  ]) : [[], []]
  const previousByAsset = new Map<number, number>(previousDepreciationRows.map((row: any) => [Number(row.asset_id), Number(row.accumulated || 0)]))
  const additionsByAsset = new Map<number, number>(improvementRows.map((row: any) => [Number(row.asset_id), Number(row.additions || 0)]))

  const lineInputs = rows.map((asset: any) => {
    const totalCost = Number(asset.cost || 0) + Number(additionsByAsset.get(Number(asset.id)) || 0)
    const accumulated = Number(previousByAsset.get(Number(asset.id)) || 0)
    const openingBookValue = Math.max(0, totalCost - accumulated)
    const depreciableRemaining = Math.max(0, openingBookValue - Number(asset.salvage_value || 0))
    const lifeMonths = Math.max(1, Number(asset.useful_life_months || 60))
    const method = String(asset.depreciation_method || "straight_line")
    const rawAmount = method === "declining_balance"
      ? openingBookValue * (2 / lifeMonths)
      : (totalCost - Number(asset.salvage_value || 0)) / lifeMonths
    const depreciationAmount = Math.round(Math.min(depreciableRemaining, Math.max(0, rawAmount)) * 100) / 100
    return {
      asset_id: asset.id,
      asset_code: asset.asset_code,
      asset_name: asset.name,
      depreciation_date: postingDate,
      depreciation_amount: depreciationAmount,
      book_value_before: openingBookValue,
      book_value_after: Math.max(Number(asset.salvage_value || 0), openingBookValue - depreciationAmount),
      depreciation_method: method,
      expense_account_id: asset.depreciation_expense_account_id ?? null,
      accumulated_account_id: asset.accumulated_depreciation_account_id ?? null,
      category: {
        depreciation_expense_account_id: asset.depreciation_expense_account_id,
        accumulated_depreciation_account_id: asset.accumulated_depreciation_account_id,
      },
    }
  }).filter((line: any) => Number(line.depreciation_amount || 0) > 0)

  if (lineInputs.length === 0) {
    return { period, posting_date: postingDate, lines: [], total_depreciation: 0, voucher: null }
  }

  const totalDepreciation = lineInputs.reduce((sum: number, line: any) => sum + Number(line.depreciation_amount || 0), 0)

  const runRows = await sql`
    INSERT INTO fixed_asset_depreciation_runs_tbl (
      period,
      posting_date,
      total_depreciation,
      status,
      created_by,
      created_at
    ) VALUES (
      ${period},
      ${postingDate}::date,
      ${totalDepreciation},
      'draft',
      ${input.created_by ?? null},
      CURRENT_TIMESTAMP
    ) RETURNING *
  `

  const run = runRows[0]

  const insertionRows = await Promise.all(
    lineInputs.map(async (line: any) => sql`
      INSERT INTO fixed_asset_depreciation_lines_tbl (
        run_id,
        asset_id,
        depreciation_date,
        depreciation_amount,
        book_value_before,
        book_value_after,
        depreciation_method
      ) VALUES (
        ${run.id},
        ${line.asset_id},
        ${line.depreciation_date}::date,
        ${Number(line.depreciation_amount || 0)},
        ${Number(line.book_value_before || 0)},
        ${Number(line.book_value_after || 0)},
        ${line.depreciation_method || 'straight_line'}
      ) RETURNING *
    `),
  )

  let voucher: any = null
  if (shouldPost) {
    voucher = await postDepreciationRun(run.id, {
      branch_id: input.branch_id ?? input.branchId ?? null,
      currency_id: input.currency_id ?? input.currencyId ?? null,
      rate: input.rate ?? 1,
      voucher_code: input.voucher_code ?? null,
    })
  }

  return {
    ...run,
    lines: insertionRows.flatMap((entry) => entry),
    total_depreciation: totalDepreciation,
    voucher,
  }
}

export async function postDepreciationRun(runId: number, input: Record<string, any> = {}) {
  await ensureTables()

  const run = await getDepreciationRunById(runId)
  if (!run) {
    throw new Error("تجميع إهلاك الأصول غير موجود")
  }

  const branchId = Number(input.branch_id ?? input.branchId ?? 0) || null
  const currencyId = input.currency_id ?? input.currencyId ?? null
  const rate = Number(input.rate ?? 1)

  const lineRows = await sql`
    SELECT fdl.*, fa.asset_code, fa.name AS asset_name, fa.category_id,
           fac.accumulated_depreciation_account_id,
           fac.depreciation_expense_account_id,
           fac.asset_account_id
    FROM fixed_asset_depreciation_lines_tbl fdl
    LEFT JOIN fixed_assets_tbl fa ON fa.id = fdl.asset_id
    LEFT JOIN fixed_asset_categories_tbl fac ON fac.id = fa.category_id
    WHERE fdl.run_id = ${runId}
  `

  if (!lineRows.length) {
    throw new Error("لا توجد بنود لإهلاك هذا التجميع")
  }

  const missingAccount = lineRows.find((line: any) => !Number(line.depreciation_expense_account_id) || !Number(line.accumulated_depreciation_account_id))
  if (missingAccount) throw new Error(`يجب تعريف حساب مصروف الإهلاك وحساب الإهلاك المتراكم لتصنيف الأصل ${missingAccount.asset_code || ""}`)

  const journalRows = buildFixedAssetDepreciationJournalRows(runId, lineRows.map((line) => ({
    ...line,
    asset: { asset_code: line.asset_code, name: line.asset_name },
    category: {
      depreciation_expense_account_id: line.depreciation_expense_account_id,
      accumulated_depreciation_account_id: line.accumulated_depreciation_account_id,
    },
  })), currencyId, rate)

  if (journalRows.length === 0) {
    throw new Error("لا يمكن إنشاء قيد محاسبي للإهلاك: لا يوجد حساب مصروف/إجمالي إهلاك")
  }

  const totalDebit = journalRows.filter((row) => Number(row.credit_debit) === 1).reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const totalCredit = journalRows.filter((row) => Number(row.credit_debit) === 2).reduce((sum, row) => sum + Number(row.amount || 0), 0)

  if (Math.round((totalDebit - totalCredit) * 100) / 100 !== 0) {
    throw new Error("قيد إهلاك الأصول غير متوازن")
  }

  const code = String(input.voucher_code || `FA-${run.period}-${run.id}`)
  const voucherRows = await sql`
    INSERT INTO voucher_header_tbl (
      vch_type,
      vch_code,
      vch_date,
      branch_id,
      currency_id,
      rate,
      amount,
      note,
      status,
      vch_status,
      is_printed,
      insert_user
    ) VALUES (
      ${FIXED_ASSET_DEPRECIATION_VCH_TYPE},
      ${code},
      ${run.posting_date}::date,
      ${branchId},
      ${currencyId},
      ${Number(rate || 1)},
      ${Number(run.total_depreciation || 0)},
      ${`إهلاك الأصول الثابتة - ${run.period}`},
      2,
      2,
      0,
      ${input.created_by ?? null}
    ) RETURNING *
  `

  const voucher = voucherRows[0]
  await saveJournalRows(voucher.id, journalRows)

  for (const line of lineRows) {
    await sql`
      INSERT INTO fixed_asset_transactions_tbl(asset_id,transaction_type,transaction_date,amount,voucher_id,description,created_by)
      VALUES(${Number(line.asset_id)},'depreciation',${line.depreciation_date}::date,${Number(line.depreciation_amount||0)},${Number(voucher.id)},${`إهلاك ${run.period}`},${input.created_by ? Number(input.created_by) : null})
    `
  }

  await sql`
    UPDATE fixed_asset_depreciation_runs_tbl
    SET voucher_id = ${voucher.id}, status = 'posted', posted_at = CURRENT_TIMESTAMP
    WHERE id = ${runId}
  `

  return {
    run_id: runId,
    voucher,
    total_depreciation: Number(run.total_depreciation || 0),
    journal_rows: journalRows,
  }
}
