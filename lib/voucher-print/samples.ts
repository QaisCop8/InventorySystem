import type { PrintDocument } from "./document"
import type { VoucherFamily } from "./settings"

export function samplePrintDocument(voucherTypeId: number, title: string, family: VoucherFamily): PrintDocument {
  const common = { voucherTypeId, title: title || "سند", code: "INV-000125", date: new Date().toISOString().slice(0, 10), currencyName: "شيكل" }
  if (family === "journal") {
    return {
      ...common,
      fields: [{ label: "العملة", value: "شيكل" }, { label: "سند يدوي", value: "M-77" }, { label: "الفرع", value: "الفرع الرئيسي" }],
      columns: [
        { key: "account_code", label: "رقم الحساب", weight: 0.9 },
        { key: "account_name", label: "اسم الحساب", weight: 2 },
        { key: "currency", label: "العملة", weight: 0.7, align: "center" },
        { key: "debit", label: "مدين", numeric: true },
        { key: "credit", label: "دائن", numeric: true },
        { key: "cost_center", label: "مركز التكلفة", weight: 1 },
        { key: "notes", label: "البيان", weight: 1.6 },
      ],
      rows: [
        { account_code: "1101", account_name: "الصندوق الرئيسي", currency: "ILS", debit: 1500, credit: 0, notes: "إيداع نقدي" },
        { account_code: "2105", account_name: "شركة الأمل للتجارة", currency: "ILS", debit: 0, credit: 1500, cost_center: "المبيعات", notes: "تسديد دفعة" },
      ],
      totals: [{ label: "إجمالي المدين", value: 1500 }, { label: "إجمالي الدائن", value: 1500, strong: true }],
      amount: 1500,
      notes: "قيد تسوية دفعة العميل لشهر أكتوبر.",
    }
  }
  if (family === "finance") {
    return {
      ...common,
      fields: [{ label: "استلمنا من", value: "شركة الأمل للتجارة" }, { label: "العملة", value: "شيكل" }, { label: "الفرع", value: "الفرع الرئيسي" }],
      columns: [
        { key: "method", label: "طريقة الدفع", weight: 0.9 },
        { key: "account_name", label: "الحساب", weight: 1.6 },
        { key: "currency", label: "العملة", weight: 0.6, align: "center" },
        { key: "amount", label: "المبلغ", numeric: true },
        { key: "cheque_no", label: "رقم الشيك", weight: 0.9 },
        { key: "due_date", label: "تاريخ الاستحقاق", weight: 0.9 },
        { key: "bank", label: "البنك", weight: 1 },
        { key: "notes", label: "البيان", weight: 1.3 },
      ],
      rows: [
        { method: "نقدي", account_name: "الصندوق الرئيسي", currency: "ILS", amount: 800 },
        { method: "شيك", account_name: "شيكات برسم التحصيل", currency: "ILS", amount: 1200, cheque_no: "300451", due_date: "2026-11-15", bank: "بنك فلسطين" },
      ],
      totals: [{ label: "الإجمالي", value: 2000, strong: true }],
      amount: 2000,
      notes: "دفعة على الحساب.",
    }
  }
  return {
    ...common,
    fields: [{ label: "العميل", value: "شركة الأمل للتجارة" }, { label: "المستودع", value: "المستودع الرئيسي" }, { label: "العملة", value: "شيكل" }, { label: "المندوب", value: "أحمد خالد" }, { label: "الفرع", value: "الفرع الرئيسي" }, { label: "طريقة الدفع", value: "آجل" }],
    columns: [
      { key: "item_code", label: "رقم الصنف", weight: 0.9 },
      { key: "item_name", label: "اسم الصنف", weight: 2.2 },
      { key: "unit", label: "الوحدة", weight: 0.7, align: "center" },
      { key: "warehouse", label: "المستودع", weight: 1 },
      { key: "quantity", label: "الكمية", numeric: true, weight: 0.7 },
      { key: "bonus", label: "البونص", numeric: true, weight: 0.6 },
      { key: "price", label: "السعر", numeric: true, weight: 0.8 },
      { key: "discount", label: "الخصم", numeric: true, weight: 0.7 },
      { key: "tax", label: "الضريبة", numeric: true, weight: 0.7 },
      { key: "total", label: "الإجمالي", numeric: true },
      { key: "notes", label: "ملاحظات", weight: 1 },
    ],
    rows: [
      { item_code: "10025", item_name: "أرز بسمتي 5 كغم", unit: "كيس", warehouse: "الرئيسي", quantity: 10, bonus: 1, price: 42, discount: 0, tax: 0, total: 420 },
      { item_code: "10031", item_name: "زيت زيتون بكر ممتاز 1 لتر", unit: "عبوة", warehouse: "الرئيسي", quantity: 6, bonus: 0, price: 38.5, discount: 11.55, tax: 0, total: 219.45 },
      { item_code: "20110", item_name: "سكر أبيض ناعم 1 كغم", unit: "كيس", warehouse: "الرئيسي", quantity: 24, bonus: 0, price: 4.25, discount: 0, tax: 0, total: 102 },
    ],
    totals: [{ label: "مجموع الأصناف", value: 753 }, { label: "الخصم", value: 11.55 }, { label: "الضريبة", value: 0 }, { label: "الصافي", value: 741.45, strong: true }],
    amount: 741.45,
    notes: "التسليم خلال 3 أيام عمل.",
  }
}
