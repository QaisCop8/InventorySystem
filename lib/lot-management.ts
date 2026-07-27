import sql from "@/lib/database"
export interface ProductLot {
  id: number
  product_id: number
  lot_number: string
  manufacturing_date?: string
  expiry_date?: string
  supplier_id?: number
  purchase_order_id?: number
  initial_quantity: number
  current_quantity: number
  reserved_quantity: number
  available_quantity: number
  unit_cost: number
  notes?: string
  status: "new" | "in_use" | "finished" | "damaged"
  status_changed_at?: string
  status_changed_by?: string
  status_notes?: string
  created_at: string
  updated_at: string
}

export interface LotTransaction {
  id: number
  lot_id: number
  transaction_type: "purchase" | "sale" | "adjustment" | "transfer" | "return" | "status_change" | "damage" | "close"
  quantity: number
  reference_type?: string
  reference_id?: number
  unit_cost?: number
  notes?: string
  created_by?: string
  created_at: string
}

export interface LotInventoryReport {
  lot_id: number
  lot_number: string
  product_code: string
  product_name: string
  manufacturing_date?: string
  expiry_date?: string
  expiry_status: "منتهي الصلاحية" | "قريب الانتهاء" | "صالح"
  initial_quantity: number
  current_quantity: number
  reserved_quantity: number
  available_quantity: number
  unit_cost: number
  total_value: number
  supplier_name?: string
  status_display: string
  status: "new" | "in_use" | "finished" | "damaged"
  status_changed_at?: string
  status_changed_by?: string
  status_notes?: string
  created_at: string
  updated_at: string
}

export interface LotStatusSummary {
  product_name: string
  status: "new" | "in_use" | "finished" | "damaged"
  status_display: string
  lot_count: number
  total_quantity: number
  total_value: number
}

// إنشاء دفعة جديدة
export async function createProductLot(lotData: {
  product_id: number
  lot_number: string
  manufacturing_date?: string
  expiry_date?: string
  supplier_id?: number
  purchase_order_id?: number
  initial_quantity: number
  unit_cost?: number
  notes?: string
}): Promise<ProductLot> {
  console.log("[v0] Creating new product lot:", lotData)

  const result = await sql`
    INSERT INTO product_lots (
      product_id, lot_number, manufacturing_date, expiry_date,
      supplier_id, purchase_order_id, initial_quantity, current_quantity,
      unit_cost, notes
    ) VALUES (
      ${lotData.product_id},
      ${lotData.lot_number},
      ${lotData.manufacturing_date || null},
      ${lotData.expiry_date || null},
      ${lotData.supplier_id || null},
      ${lotData.purchase_order_id || null},
      ${lotData.initial_quantity},
      ${lotData.initial_quantity},
      ${lotData.unit_cost || 0},
      ${lotData.notes || null}
    )
    RETURNING *
  `

  if (result.length === 0) {
    throw new Error("فشل في إنشاء الدفعة")
  }

  // إضافة حركة شراء للدفعة
  await createLotTransaction({
    lot_id: result[0].id,
    transaction_type: "purchase",
    quantity: lotData.initial_quantity,
    reference_type: "purchase_order",
    reference_id: lotData.purchase_order_id,
    unit_cost: lotData.unit_cost,
    notes: "إنشاء دفعة جديدة",
  })

  return result[0] as ProductLot
}

// الحصول على دفعات منتج معين
export async function getProductLots(productId: number, activeOnly = true): Promise<ProductLot[]> {
  console.log("[v0] Getting lots for product:", productId)

  const whereClause = activeOnly
    ? sql`WHERE product_id = ${productId} AND status IN ('new', 'in_use') AND current_quantity > 0`
    : sql`WHERE product_id = ${productId}`

  const result = await sql`
    SELECT * FROM product_lots 
    ${whereClause}
    ORDER BY expiry_date ASC, created_at ASC
  `

  return result as ProductLot[]
}

// الحصول على دفعة بالرقم
export async function getLotByNumber(productId: number, lotNumber: string): Promise<ProductLot | null> {
  console.log("[v0] Getting lot by number:", { productId, lotNumber })

  const result = await sql`
    SELECT * FROM product_lots 
    WHERE product_id = ${productId} AND lot_number = ${lotNumber}
    LIMIT 1
  `

  return result.length > 0 ? (result[0] as ProductLot) : null
}

// إنشاء حركة دفعة
export async function createLotTransaction(transactionData: {
  lot_id: number
  transaction_type: "purchase" | "sale" | "adjustment" | "transfer" | "return" | "status_change" | "damage" | "close"
  quantity: number
  reference_type?: string
  reference_id?: number
  unit_cost?: number
  notes?: string
  created_by?: string
}): Promise<LotTransaction> {
  console.log("[v0] Creating lot transaction:", transactionData)

  const result = await sql`
    INSERT INTO lot_transactions (
      lot_id, transaction_type, quantity, reference_type,
      reference_id, unit_cost, notes, created_by
    ) VALUES (
      ${transactionData.lot_id},
      ${transactionData.transaction_type},
      ${transactionData.quantity},
      ${transactionData.reference_type || null},
      ${transactionData.reference_id || null},
      ${transactionData.unit_cost || null},
      ${transactionData.notes || null},
      ${transactionData.created_by || null}
    )
    RETURNING *
  `

  if (result.length === 0) {
    throw new Error("فشل في إنشاء حركة الدفعة")
  }

  return result[0] as LotTransaction
}

// حجز كمية من دفعة
export async function reserveLotQuantity(lotId: number, quantity: number): Promise<void> {
  console.log("[v0] Reserving lot quantity:", { lotId, quantity })

  await sql`
    UPDATE product_lots 
    SET 
      reserved_quantity = reserved_quantity + ${quantity},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${lotId} AND (current_quantity - reserved_quantity) >= ${quantity}
  `
}

// إلغاء حجز كمية من دفعة
export async function unreserveLotQuantity(lotId: number, quantity: number): Promise<void> {
  console.log("[v0] Unreserving lot quantity:", { lotId, quantity })

  await sql`
    UPDATE product_lots 
    SET 
      reserved_quantity = GREATEST(0, reserved_quantity - ${quantity}),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${lotId}
  `
}

// الحصول على تقرير المخزون حسب الدفعات
export async function getLotInventoryReport(filters?: {
  product_id?: number
  supplier_id?: number
  expiry_status?: string
  lot_number?: string
}): Promise<LotInventoryReport[]> {
  console.log("[v0] Getting lot inventory report with filters:", filters)

  const whereConditions = []
  const params: any[] = []

  if (filters?.product_id) {
    whereConditions.push(`pl.product_id = $${params.length + 1}`)
    params.push(filters.product_id)
  }

  if (filters?.supplier_id) {
    whereConditions.push(`pl.supplier_id = $${params.length + 1}`)
    params.push(filters.supplier_id)
  }

  if (filters?.lot_number) {
    whereConditions.push(`pl.lot_number ILIKE $${params.length + 1}`)
    params.push(`%${filters.lot_number}%`)
  }

  if (filters?.expiry_status) {
    if (filters.expiry_status === "expired") {
      whereConditions.push(`pl.expiry_date < CURRENT_DATE`)
    } else if (filters.expiry_status === "expiring_soon") {
      whereConditions.push(`pl.expiry_date <= CURRENT_DATE + INTERVAL '30 days' AND pl.expiry_date >= CURRENT_DATE`)
    } else if (filters.expiry_status === "valid") {
      whereConditions.push(`(pl.expiry_date IS NULL OR pl.expiry_date > CURRENT_DATE + INTERVAL '30 days')`)
    }
  }

  const whereClause = whereConditions.length > 0 ? `AND ${whereConditions.join(" AND ")}` : ""

  const query = `
    SELECT * FROM lot_inventory_report 
    WHERE 1=1 ${whereClause}
    ORDER BY product_name, expiry_date
  `

  const result = await sql.unsafe(query, params)
  return result as LotInventoryReport[]
}

// الحصول على الدفعات المتاحة للبيع (FIFO - First In, First Out)
export async function getAvailableLotsForSale(
  productId: number,
  requiredQuantity: number,
): Promise<{
  lots: ProductLot[]
  totalAvailable: number
  canFulfill: boolean
}> {
  console.log("[v0] Getting available lots for sale:", { productId, requiredQuantity })

  const result = await sql`
    SELECT * FROM product_lots 
    WHERE product_id = ${productId} 
      AND status IN ('new', 'in_use')
      AND available_quantity > 0
    ORDER BY 
      CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
      expiry_date ASC,
      created_at ASC
  `

  const lots = result as ProductLot[]
  const totalAvailable = lots.reduce((sum, lot) => sum + lot.available_quantity, 0)
  const canFulfill = totalAvailable >= requiredQuantity

  return {
    lots,
    totalAvailable,
    canFulfill,
  }
}

// تحديث حالة الدفعات المنتهية الصلاحية
export async function updateExpiredLots(): Promise<number> {
  console.log("[v0] Updating expired lots status")

  const result = await sql`
    UPDATE product_lots 
    SET 
      status = 'damaged',
      status_changed_at = CURRENT_TIMESTAMP,
      status_notes = 'تم تغيير الحالة تلقائياً - منتهي الصلاحية',
      updated_at = CURRENT_TIMESTAMP
    WHERE expiry_date < CURRENT_DATE 
      AND status IN ('new', 'in_use')
    RETURNING id
  `

  return result.length
}

// الحصول على إحصائيات الدفعات
export async function getLotStatistics(): Promise<{
  totalLots: number
  newLots: number
  inUseLots: number
  finishedLots: number
  damagedLots: number
  totalValue: number
}> {
  console.log("[v0] Getting lot statistics")

  const result = await sql`
    SELECT 
      COUNT(*) as total_lots,
      COUNT(CASE WHEN status = 'new' THEN 1 END) as new_lots,
      COUNT(CASE WHEN status = 'in_use' THEN 1 END) as in_use_lots,
      COUNT(CASE WHEN status = 'finished' THEN 1 END) as finished_lots,
      COUNT(CASE WHEN status = 'damaged' THEN 1 END) as damaged_lots,
      COALESCE(SUM(CASE WHEN status IN ('new', 'in_use') THEN current_quantity * unit_cost END), 0) as total_value
    FROM product_lots
  `

  const stats = result[0]
  return {
    totalLots: Number(stats.total_lots),
    newLots: Number(stats.new_lots),
    inUseLots: Number(stats.in_use_lots),
    finishedLots: Number(stats.finished_lots),
    damagedLots: Number(stats.damaged_lots),
    totalValue: Number(stats.total_value),
  }
}

// تغيير حالة الدفعة يدويًا
export async function changeLotStatus(
  lotId: number,
  newStatus: "new" | "in_use" | "finished" | "damaged",
  notes?: string,
  changedBy?: string,
): Promise<void> {
  console.log("[v0] Changing lot status:", { lotId, newStatus, notes, changedBy })

  const result = await sql`
    SELECT change_lot_status(${lotId}, ${newStatus}, ${notes || null}, ${changedBy || null})
  `

  if (!result[0]?.change_lot_status) {
    throw new Error("فشل في تغيير حالة الدفعة")
  }
}

// الحصول على ملخص حالة الدفعات
export async function getLotStatusSummary(): Promise<LotStatusSummary[]> {
  console.log("[v0] Getting lot status summary")

  const result = await sql`
    SELECT * FROM lot_status_summary
    ORDER BY product_name, status
  `

  return result as LotStatusSummary[]
}

// الحصول على الدفعات حسب الحالة
export async function getLotsByStatus(status: "new" | "in_use" | "finished" | "damaged"): Promise<ProductLot[]> {
  console.log("[v0] Getting lots by status:", status)

  const result = await sql`
    SELECT pl.*, p.product_name, p.product_code
    FROM product_lots pl
    JOIN products p ON pl.product_id = p.id
    WHERE pl.status = ${status}
    ORDER BY pl.created_at DESC
  `

  return result as ProductLot[]
}
