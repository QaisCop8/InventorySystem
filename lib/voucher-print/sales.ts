import type { PrintDocument } from "./document"

type SalesItem = {
  product_id: number | null
  product_code?: string
  product_name?: string
  attribute_summary?: string
  unit?: string
  unit_name?: string
  quantity: number | null
  bonus_quantity?: number | null
  unit_price: number | null
  discount_percent?: number | null
  total_price?: number | null
  line_amount?: number | null
  note?: string
}

type SalesRecord = {
  vch_code: string
  vch_date: string
  rate?: number | null
  customer_name?: string
  phone?: string
  shipping_address?: string
  manual_voucher?: string
  due_date?: string
  discount_type?: "percentage" | "amount"
  discount_value?: number
  vat_percent?: number
  amount?: number
  note?: string
  items: SalesItem[]
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/**
 * "تفاصيل الشحن" لإرسالية/فاتورة المبيعات: بيانات المرسل إليه والسيارة والسائق + الأصناف وكمياتها بلا أسعار
 * (ترافق البضاعة مع السائق). لا تُعلِّم السند كمطبوع ولا تُسجَّل كطباعة أصلية.
 */
export function shippingDetailsDocument(record: SalesRecord, options: {
  voucherTypeId: number
  voucherTitle: string
  shipping: { destination_name?: string; phone?: string; address?: string; po_box?: string; city?: string; car?: string; driver?: string }
  partyLabel?: string
}): PrintDocument {
  const items = record.items.filter(item => item.product_id)
  const { shipping } = options
  return {
    voucherTypeId: options.voucherTypeId,
    title: `تفاصيل الشحن — ${options.voucherTitle}`,
    code: record.vch_code,
    date: record.vch_date,
    noAudit: true,
    fields: [
      { label: "المرسل إليه", value: shipping.destination_name || record.customer_name },
      { label: "الهاتف", value: shipping.phone || record.phone },
      { label: "المنطقة", value: shipping.city },
      { label: "العنوان", value: shipping.address || record.shipping_address },
      { label: "ص.ب", value: shipping.po_box },
      { label: "السيارة", value: shipping.car },
      { label: "السائق", value: shipping.driver },
      { label: options.partyLabel ?? "العميل", value: record.customer_name },
    ],
    columns: [
      { key: "item_code", label: "رقم الصنف", weight: 0.9 },
      { key: "item_name", label: "اسم الصنف", weight: 2.6 },
      { key: "unit", label: "الوحدة", weight: 0.8, align: "center" },
      { key: "quantity", label: "الكمية", numeric: true, weight: 0.8 },
      { key: "bonus", label: "البونص", numeric: true, weight: 0.7 },
      { key: "notes", label: "ملاحظات", weight: 1.2 },
    ],
    rows: items.map(item => ({
      item_code: item.product_code,
      item_name: item.attribute_summary ? `${item.product_name} (${item.attribute_summary})` : item.product_name,
      unit: item.unit_name || item.unit,
      quantity: Number(item.quantity || 0),
      bonus: Number(item.bonus_quantity || 0) || "",
      notes: item.note,
    })),
    totals: [
      { label: "عدد الأصناف", value: items.length },
      { label: "إجمالي الكميات", value: round2(items.reduce((sum, item) => sum + Number(item.quantity || 0) + Number(item.bonus_quantity || 0), 0)), strong: true },
    ],
    notes: record.note,
  }
}

export function salesVoucherDocument(record: SalesRecord, options: {
  voucherTypeId: number
  title: string
  copyLabel?: string
  currencyName?: string
  partyLabel?: string
  extraFields?: { label: string; value: string | number | null | undefined }[]
}): PrintDocument {
  const items = record.items.filter(item => item.product_id)
  const rows = items.map(item => {
    const quantity = Number(item.quantity || 0)
    const price = Number(item.unit_price || 0)
    const gross = quantity * price
    const discountAmount = gross * Number(item.discount_percent || 0) / 100
    const total = Number(item.line_amount ?? item.total_price ?? gross - discountAmount)
    return {
      item_code: item.product_code,
      item_name: item.attribute_summary ? `${item.product_name} (${item.attribute_summary})` : item.product_name,
      unit: item.unit_name || item.unit,
      quantity,
      bonus: Number(item.bonus_quantity || 0) || "",
      price,
      discount: discountAmount ? round2(discountAmount) : "",
      total: round2(total),
      notes: item.note,
      _gross: gross,
    }
  })
  const gross = round2(rows.reduce((sum, row) => sum + row._gross, 0))
  const lineTotal = round2(rows.reduce((sum, row) => sum + Number(row.total), 0))
  const lineDiscount = round2(gross - lineTotal)
  const discountValue = Number(record.discount_value || 0)
  const invoiceDiscount = round2(record.discount_type === "amount" ? discountValue : lineTotal * discountValue / 100)
  const net = round2(lineTotal - invoiceDiscount)
  const vatPercent = Number(record.vat_percent || 0)
  const vat = round2(net * vatPercent / 100)
  const total = round2(Number(record.amount) > 0 ? Number(record.amount) : net + vat)

  const totals = [
    { label: "المجموع", value: gross },
    ...(lineDiscount > 0 ? [{ label: "خصم الأصناف", value: lineDiscount }] : []),
    ...(invoiceDiscount > 0 ? [{ label: record.discount_type === "amount" ? "خصم الفاتورة" : `خصم الفاتورة (${discountValue}%)`, value: invoiceDiscount }] : []),
    ...(vatPercent > 0 ? [{ label: `الضريبة (${vatPercent}%)`, value: vat }] : []),
    { label: "الإجمالي", value: total, strong: true },
  ]

  return {
    voucherTypeId: options.voucherTypeId,
    title: options.title,
    copyLabel: options.copyLabel,
    code: record.vch_code,
    date: record.vch_date,
    fields: [
      { label: options.partyLabel ?? "العميل", value: record.customer_name },
      { label: "الهاتف", value: record.phone },
      { label: "العملة", value: options.currencyName },
      { label: "سعر الصرف", value: Number(record.rate) > 0 ? Number(record.rate).toLocaleString("en-US", { maximumFractionDigits: 6 }) : "" },
      { label: "سند يدوي", value: record.manual_voucher },
      { label: "تاريخ الاستحقاق", value: record.due_date ? String(record.due_date).slice(0, 10) : "" },
      { label: "عنوان الشحن", value: record.shipping_address },
      ...(options.extraFields ?? []),
    ],
    columns: [
      { key: "item_code", label: "رقم الصنف", weight: 0.9 },
      { key: "item_name", label: "اسم الصنف", weight: 2.4 },
      { key: "unit", label: "الوحدة", weight: 0.7, align: "center" },
      { key: "quantity", label: "الكمية", numeric: true, weight: 0.7 },
      { key: "bonus", label: "البونص", numeric: true, weight: 0.6 },
      { key: "price", label: "السعر", numeric: true, weight: 0.8 },
      { key: "discount", label: "الخصم", numeric: true, weight: 0.7 },
      { key: "total", label: "الإجمالي", numeric: true },
      { key: "notes", label: "ملاحظات", weight: 1 },
    ],
    rows: rows.map(({ _gross, ...row }) => row),
    totals,
    amount: total,
    currencyName: options.currencyName,
    notes: record.note,
  }
}
