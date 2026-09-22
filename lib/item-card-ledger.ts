const incomingTypes = new Set([8, 15, 16, 17, 18])
const outgoingTypes = new Set([9, 11, 12, 13, 14, 19])

export const itemVoucherNames: Record<number, string> = {
  8: "سند إدخال بضاعة", 9: "سند إخراج بضاعة", 10: "إرسالية داخلية", 11: "سند استعمال",
  12: "فاتورة مبيعات", 13: "إرسالية مبيعات", 14: "إرسالية بضاعة أمانة",
  15: "مردود إرسالية بضاعة أمانة", 16: "مردود مبيعات", 17: "فاتورة مشتريات",
  18: "إرسالية مشتريات", 19: "مردود مشتريات",
}

export type ItemCardLine = {
  id: number; voucher_id: number; vch_type: number; movement_date: string
  qnty?: unknown; bonus?: unknown; unit_factor?: unknown; delivery_item_id?: unknown
  store_id?: unknown; from_store_id?: unknown; to_store_id?: unknown
  store_name?: string; from_store_name?: string; to_store_name?: string
  price?: unknown; discount?: unknown; vat_ratio?: unknown; vat_included?: boolean
  header_discount_type?: string | null; header_discount_value?: unknown
  header_discount?: unknown; header_subtotal?: unknown
  [key: string]: unknown
}

const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0
const storeId = (...values: unknown[]) => values.map(numeric).find(value => value > 0) || 0

/** Voucher quantities/prices keep their own unit; balances and totals use the main unit. */
export function buildItemCard(lines: ItemCardLine[], fromDate: string, toDate: string, warehouseIds: number[] = [], showInternalTransfers = false) {
  const movements = lines.flatMap(line => {
    const type = numeric(line.vch_type)
    if (line.movement_date > toDate || (type !== 10 && !incomingTypes.has(type) && !outgoingTypes.has(type))) return []
    // The delivery already moved stock; its invoice must not move it a second time.
    if ([12, 17].includes(type) && numeric(line.delivery_item_id) > 0) return []
    const included = (id: number) => !warehouseIds.length || warehouseIds.includes(id)
    const source = storeId(line.from_store_id, line.store_id)
    const destination = storeId(line.to_store_id, line.store_id)
    const legs = type === 10
      ? (included(source) && included(destination) && !showInternalTransfers ? [] : [
          { store: source, name: line.from_store_name, sign: -1 },
          { store: destination, name: line.to_store_name, sign: 1 },
        ])
      : [{ store: storeId(line.store_id, line.to_store_id, line.from_store_id), name: line.store_name || line.to_store_name || line.from_store_name, sign: incomingTypes.has(type) ? 1 : -1 }]
    const quantity = numeric(line.qnty), bonus = numeric(line.bonus)
    const factor = numeric(line.unit_factor) > 0 ? numeric(line.unit_factor) : 1
    const vatDivisor = line.vat_included ? 1 + numeric(line.vat_ratio) / 100 : 1
    const headerDiscount = line.header_discount_type === "percentage"
      ? numeric(line.header_discount_value) / 100
      : numeric(line.header_subtotal) > 0
        ? numeric(line.header_discount_type === "amount" ? line.header_discount_value : line.header_discount) / numeric(line.header_subtotal) : 0
    const price = numeric(line.price) / (vatDivisor > 0 ? vatDivisor : 1) * (1 - numeric(line.discount) / 100) * (1 - headerDiscount)
    return legs.filter(leg => included(leg.store)).map(leg => ({
      ...line, id: `${line.id}-${leg.sign}`, voucher_id: numeric(line.voucher_id), vch_type: type,
      voucher_type_name: itemVoucherNames[type], store_name: leg.name || "", store_id: leg.store,
      unit_factor: factor, quantity, bonus, price, amount: price * quantity,
      quantity_in: leg.sign > 0 ? quantity + bonus : 0,
      quantity_out: leg.sign < 0 ? quantity + bonus : 0,
      paid_quantity_in: leg.sign > 0 ? quantity : 0,
      paid_quantity_out: leg.sign < 0 ? quantity : 0,
      signed_quantity: (quantity + bonus) * factor * leg.sign,
      direction: leg.sign,
    }))
  }).sort((a, b) => a.movement_date.localeCompare(b.movement_date) || a.voucher_id - b.voucher_id || parseInt(a.id) - parseInt(b.id) || a.direction - b.direction)

  let balance = 0, opening = 0, incoming = 0, outgoing = 0
  const rows = []
  for (const movement of movements) {
    balance += movement.signed_quantity
    if (movement.movement_date < fromDate) { opening = balance; continue }
    incoming += movement.quantity_in * movement.unit_factor
    outgoing += movement.quantity_out * movement.unit_factor
    rows.push({ ...movement, balance })
  }
  return { rows, opening_balance: opening, closing_balance: balance, received_quantity: incoming, issued_quantity: outgoing }
}
