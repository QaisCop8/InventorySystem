export function campaignAmounts(item: { price: number; quantity: number; discount: number }) {
  const total = Number(item.price) * Number(item.quantity)
  const discount = Number(item.discount)
  return { qtyAmount: total, discount_ratio: total ? discount * 100 / total : 0, campQtyAmount: total - discount }
}

export function editCampaignItem<T extends { price: number; quantity: number; discount: number }>(item: T, field: string, value: unknown): T {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0 || (field === "quantity" && amount <= 0)) throw new Error("أدخل قيمة موجبة صحيحة")
  const next = { ...item }
  const total = Number(item.price) * Number(item.quantity)
  if (field === "discount_ratio") {
    if (amount > 100) throw new Error("نسبة الخصم لا تتجاوز 100%")
    next.discount = total * amount / 100
  } else if (field === "campQtyAmount") {
    if (amount > total) throw new Error("قيمة الحملة لا تتجاوز القيمة الأصلية")
    next.discount = total - amount
  } else if (field === "discount") {
    if (amount > total) throw new Error("الخصم لا يتجاوز قيمة الأصناف")
    next.discount = amount
  } else if (field === "quantity") {
    next.quantity = amount
    next.discount = Math.min(Number(item.discount), Number(item.price) * amount)
  }
  next.discount = Math.round(next.discount * 10000) / 10000
  return next
}
