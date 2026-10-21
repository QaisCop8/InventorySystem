import type { PrintDocument } from "./document"

// طباعة سند القبض/الصرف بنمط الشامل (ShamelWeb: QabdVoucher → GeneralVoucherAll.mrt):
// رأس: وصلني من (القبض) / صرفنا إلى (الصرف) + الرمز، العملة، سعر الصرف، السند اليدوي، تصنيف الدفعة، المندوب
// ثم مربع "تفاصيل الدفع" (المجموع، نقداً، شيكات، بطاقات)، ثم مربع "بالكلمات"، ثم جدول "تفاصيل الشيكات"
// و"تفاصيل البطاقات". إعدادات طباعة نوع السند (الشعار، المبلغ كتابةً، الملاحظات، التوقيعات…) تبقى سارية.

type ChequeRow = {
  bank_account?: string; cheq_num?: string; bank_no?: string; bank_name?: string; branch_no?: string; branch_name?: string
  due_date?: string; amount?: number | null; cheq_owner_name?: string
}
type CardRow = { card_type_name?: string; card_no?: string; account_code?: string; account_name?: string; amount?: number | null }

export type ReceiptPrintInput = {
  vch_code: string
  vch_date: string
  amount?: number | null
  cash_amount?: number | null
  check_amount?: number | null
  credit_card_amount?: number | null
  rate?: number | null
  manual_voucher?: string
  note?: string
  cheques?: ChequeRow[]
  cards?: CardRow[]
}

const money = (value: unknown) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const dmy = (value?: string) => {
  const iso = String(value || "").slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso
}

export function receiptVoucherDocument(record: ReceiptPrintInput, options: {
  voucherTypeId: 4 | 5
  title: string
  copyLabel?: string
  partyName?: string
  partyCode?: string
  currencyName?: string
  paymentClassification?: string
  salesman?: string
}): PrintDocument {
  const cheques = (record.cheques || []).filter(row => String(row.cheq_num || "").trim() || Number(row.amount || 0) > 0)
  const cards = (record.cards || []).filter(row => String(row.card_no || row.card_type_name || "").trim() || Number(row.amount || 0) > 0)
  const chequeTotal = Number(record.check_amount ?? cheques.reduce((sum, row) => sum + Number(row.amount || 0), 0)) || 0
  const cardTotal = Number(record.credit_card_amount ?? cards.reduce((sum, row) => sum + Number(row.amount || 0), 0)) || 0
  const cash = Number(record.cash_amount || 0)
  const total = Number(record.amount || 0) || cash + chequeTotal + cardTotal
  const party = [options.partyName, options.partyCode].filter(value => String(value || "").trim()).join("/")
  const rate = Number(record.rate || 0)

  return {
    voucherTypeId: options.voucherTypeId,
    title: options.title,
    copyLabel: options.copyLabel,
    code: record.vch_code,
    date: record.vch_date,
    fields: [
      { label: options.voucherTypeId === 4 ? "وصلني من" : "صرفنا إلى", value: party },
      { label: "العملة", value: options.currencyName },
      { label: "سعر الصرف", value: rate > 0 && rate !== 1 ? rate.toLocaleString("en-US", { maximumFractionDigits: 6 }) : "" },
      { label: "سند يدوي", value: record.manual_voucher },
      { label: "تصنيف الدفعة", value: options.paymentClassification },
      { label: "المندوب", value: options.salesman },
    ],
    boxes: [{
      title: "تفاصيل الدفع",
      items: [
        { label: "المجموع", value: money(total) },
        { label: "نقداً", value: money(cash) },
        { label: "شيكات", value: money(chequeTotal) },
        ...(cardTotal > 0 ? [{ label: "بطاقات", value: money(cardTotal) }] : []),
      ],
    }],
    wordsInBox: true,
    columns: [],
    rows: [],
    sections: [
      {
        title: "تفاصيل الشيكات",
        columns: [
          { key: "bank_account", label: "رقم الحساب", weight: 1 },
          { key: "cheq_num", label: "رقم الشيك", weight: 1, align: "center" },
          { key: "bank_no", label: "البنك", weight: 0.6, align: "center" },
          { key: "bank_name", label: "اسم البنك", weight: 1.2 },
          { key: "branch_no", label: "الفرع", weight: 0.6, align: "center" },
          { key: "branch_name", label: "اسم الفرع", weight: 1.2 },
          { key: "due_date", label: "يستحق في", weight: 0.9, align: "center" },
          { key: "amount", label: "المبلغ", weight: 0.9, numeric: true },
        ],
        rows: cheques.map(row => ({
          bank_account: row.bank_account, cheq_num: row.cheq_num, bank_no: row.bank_no, bank_name: row.bank_name,
          branch_no: row.branch_no, branch_name: row.branch_name, due_date: dmy(row.due_date), amount: Number(row.amount || 0),
        })),
      },
      {
        title: "تفاصيل البطاقات",
        columns: [
          { key: "card_type", label: "نوع البطاقة", weight: 1.2 },
          { key: "card_no", label: "رقم البطاقة", weight: 1.2, align: "center" },
          { key: "account", label: "الحساب", weight: 1.6 },
          { key: "amount", label: "المبلغ", weight: 0.9, numeric: true },
        ],
        rows: cards.map(row => ({
          card_type: row.card_type_name, card_no: row.card_no,
          account: [row.account_code, row.account_name].filter(Boolean).join(" - "), amount: Number(row.amount || 0),
        })),
      },
    ],
    amount: total,
    currencyName: options.currencyName,
    notes: record.note,
  }
}
