const incomingTypes = new Set([8, 15, 16, 17, 18])
const outgoingTypes = new Set([9, 11, 12, 13, 14, 19])
const purchaseTypes = new Set([8, 17, 18])

const number = (value: unknown, fallback = 0) => {
  const parsed = value == null ? fallback : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
const factor = (value: unknown) => number(value, 1) > 0 ? number(value, 1) : 1

/** Quantities are in the main unit; costs are in the product's currency. */
export function summarizeVoucherInventory(products: any[], lines: any[], includePurchaseReturnsInCost = false) {
  const balances = new Map(products.map(product => [Number(product.id), {
    ...product,
    balance: 0, received_quantity: 0, issued_quantity: 0,
    received_value: 0, cost_quantity: 0,
    last_incoming_cost: number(product.last_purchase_price),
    average_cost: number(product.initial_price) || number(product.last_purchase_price),
    fifo_cost: number(product.initial_price) || number(product.last_purchase_price),
    last_movement_at: null as string | null,
  }]))
  const layers = new Map<number, { quantity: number; cost: number }[]>()
  const lastLayerCosts = new Map<number, number>()

  // The query orders lines by voucher date and line id, so the last acquisition
  // is deterministic even when several vouchers share a date.
  for (const line of [...lines].sort((a, b) => String(a.movement_date).localeCompare(String(b.movement_date)) || number(a.voucher_id) - number(b.voucher_id) || number(a.id) - number(b.id))) {
    const result = balances.get(Number(line.product_id))
    const type = number(line.vch_type)
    if (!result || (!incomingTypes.has(type) && !outgoingTypes.has(type))) continue
    if ([12, 17].includes(type) && number(line.delivery_item_id) > 0) continue
    const quantity = (number(line.qnty) + number(line.bonus)) * factor(line.unit_factor)
    const before = result.balance
    if (incomingTypes.has(type)) {
      result.balance += quantity
      result.received_quantity += quantity
    } else {
      result.balance -= quantity
      result.issued_quantity += quantity
    }
    result.last_movement_at = line.movement_date

    const paidQuantity = number(line.cost_qnty)
    const costQuantity = paidQuantity + number(line.cost_bonus)
    const vatDivisor = line.cost_vat_included ? 1 + number(line.cost_vat_ratio) / 100 : 1
    const netUnitPrice = number(line.cost_price) / factor(vatDivisor) * (1 - number(line.cost_discount) / 100)
    const headerDiscount = line.cost_discount_type === "percentage" ? number(line.cost_discount_value) / 100
      : number(line.cost_subtotal) > 0
        ? number(line.cost_discount_type === "amount" ? line.cost_discount_value : line.cost_header_discount) / number(line.cost_subtotal) : 0
    const unitCost = netUnitPrice * (1 - headerDiscount)
      * (costQuantity > 0 ? paidQuantity / costQuantity : 0) / factor(line.cost_unit_factor)
      * factor(line.currency_conversion)
    if (purchaseTypes.has(type) && quantity > 0) {
      result.received_value += unitCost * quantity
      result.cost_quantity += quantity
      result.last_incoming_cost = unitCost
    }

    // Shamel's average is a moving weighted average of the stock still on hand,
    // not total historical purchases divided by total historical receipts.
    if (incomingTypes.has(type)) {
      const receiptCost = purchaseTypes.has(type) ? unitCost : result.average_cost
      result.average_cost = Math.abs(result.balance) > 0.000001 && before >= 0
        ? (result.average_cost * before + quantity * receiptCost) / result.balance : receiptCost
    } else if (type === 19 && includePurchaseReturnsInCost) {
      result.average_cost = Math.abs(result.balance) > 0.000001
        ? (result.average_cost * before - quantity * unitCost) / result.balance : unitCost
    }

    const productId = Number(line.product_id)
    const queue = layers.get(productId) || []
    let lastCost = lastLayerCosts.get(productId) ?? result.fifo_cost
    if (incomingTypes.has(type) && quantity > 0) {
      const receiptCost = purchaseTypes.has(type) ? unitCost : lastCost
      // Receipts cover any previous shortage before creating a remaining layer.
      const remaining = Math.max(0, quantity + Math.min(before, 0))
      if (remaining > 0) queue.push({ quantity: remaining, cost: receiptCost })
      lastCost = receiptCost
    } else if (outgoingTypes.has(type)) {
      let remaining = quantity
      while (remaining > 0 && queue.length) {
        const layer = queue[0], consumed = Math.min(layer.quantity, remaining)
        layer.quantity -= consumed; remaining -= consumed
        if (layer.quantity <= 0.000001) queue.shift()
      }
    }
    const remainingQuantity = queue.reduce((sum, layer) => sum + layer.quantity, 0)
    result.fifo_cost = remainingQuantity > 0
      ? queue.reduce((sum, layer) => sum + layer.quantity * layer.cost, 0) / remainingQuantity : lastCost
    layers.set(productId, queue); lastLayerCosts.set(productId, lastCost)
  }
  return [...balances.values()]
}
