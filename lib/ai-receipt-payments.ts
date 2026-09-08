import { z } from "zod"

export const paymentSchema = z.object({
  payment_method: z.enum(["cash", "cheques", "card", "mixed"]).nullish(),
  cash_amount: z.coerce.number().nonnegative().nullish(),
  check_amount: z.coerce.number().nonnegative().nullish(),
  credit_card_amount: z.coerce.number().nonnegative().nullish(),
  cheques: z.array(z.object({
    number: z.coerce.string().nullish(), due_date: z.string().nullish(), amount: z.coerce.number().positive().nullish(),
    bank: z.string().nullish(), branch: z.string().nullish(), bank_account: z.string().nullish(), owner: z.string().nullish(),
  })).nullish(),
  cards: z.array(z.object({
    type: z.string().nullish(), number: z.coerce.string().nullish(), expire_date: z.string().nullish(), amount: z.coerce.number().positive().nullish(),
  })).nullish(),
})

export const paymentPrompt = `السند يمكن أن يكون نقدياً أو شيكات أو بطاقة أو مختلطاً.
payment_method: cash أو cheques أو card أو mixed؛ الافتراضي cash فقط إذا لم تذكر وسيلة الدفع.
cash_amount: الجزء النقدي. amount: إجمالي السند، يمكن جمع الأجزاء المذكورة صراحة.
check_amount: إجمالي الشيكات المذكور. credit_card_amount: إجمالي البطاقة المذكور.
مثال "بمبلغ نقدي 200 وشيكات 300": payment_method=mixed، cash_amount=200، check_amount=300، amount=500. لا تجعل 200 إجمالي السند. احتفظ بإجمالي الشيكات حتى لو نقصت تفاصيلها.
"رقم الحساب" ضمن تفاصيل الشيك هو bank_account وليس رقم الشيك أو رمز حساب العميل. احفظه كنص مع الأصفار في البداية. رقم حساب العميل أو الحساب المقابل يذهب إلى account في بيانات السند.
cheques: مصفوفة لكل شيك: number (رقم كنص مع الحفاظ على الأصفار)، due_date (تاريخ الاستحقاق YYYY-MM-DD)، amount، bank (اسم البنك أو رمزه)، branch (اسم الفرع أو رمزه)، bank_account (رقم الحساب كنص)، owner (صاحب الشيك).
cards: مصفوفة لكل بطاقة: type (نوع البطاقة)، number (الرقم المذكور كنص)، expire_date (YYYY-MM-DD)، amount.
لا تخلط رقم الشيك بالمبلغ أو تاريخ استحقاقه بتاريخ السند. يجوز استخدام الإجمالي لشيك واحد أو بطاقة واحدة إذا كانت وسيلة الدفع الوحيدة. لا توزع الإجمالي على عدة شيكات دون تفاصيل. الحقول الناقصة null. لا تحول شيكاً أو بطاقة إلى نقد بسبب نقص البيانات.`

const normalize = (value: unknown) => String(value || "").normalize("NFKC")
  .replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").trim().toLowerCase()

function match(rows: any[], text: string | null | undefined, name: string, code?: string) {
  const term = normalize(text)
  if (!term) return null
  const exact = rows.filter(row => normalize(row[name]) === term || (code && normalize(row[code]) === term))
  const matches = exact.length ? exact : rows.filter(row => term.split(/\s+/).every(word => normalize(row[name]).split(/\s+/).includes(word)))
  return matches.length === 1 ? matches[0] : null
}

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value

export function resolveReceiptPayments(parsed: z.infer<typeof paymentSchema>, amount: number, currencyId: number | null,
  lookups: { banks: any[]; branches: any[]; cardTypes: any[]; bankAccounts?: any[] }, voucherType: 4 | 5 = 4) {
  const chequeInputs = parsed.cheques || []
  const cardInputs = parsed.cards || []
  const method = parsed.payment_method || (chequeInputs.length || cardInputs.length ? "mixed" : "cash")
  if ((parsed.check_amount || 0) > 0 && !chequeInputs.length) throw new Error("اذكر تفاصيل الشيكات: رقم كل شيك وتاريخ الاستحقاق والبنك والفرع ورقم الحساب ومبلغه")
  if ((parsed.credit_card_amount || 0) > 0 && !cardInputs.length) throw new Error("اذكر نوع البطاقة وتفاصيل مبلغها")
  if (method === "cheques" && !chequeInputs.length) throw new Error("اذكر تفاصيل الشيك: الرقم والمبلغ وتاريخ الاستحقاق والبنك والفرع")
  if (method === "card" && !cardInputs.length) throw new Error("اذكر نوع البطاقة ومبلغها")
  if (cardInputs.length > 1) throw new Error("السند يدعم بطاقة واحدة. أنشئ سنداً مستقلاً لكل بطاقة")
  const cheques = chequeInputs.map((cheque, index) => {
    const value = cheque.amount ?? (chequeInputs.length === 1 ? parsed.check_amount ?? (method === "cheques" ? amount : null) : null)
    if (!cheque.number?.trim() || !cheque.due_date || !validDate(cheque.due_date) || !value) throw new Error(`الشيك ${index + 1}: اذكر الرقم والمبلغ وتاريخ استحقاق صحيح`)
    const bank = match(lookups.banks, cheque.bank, "bank_name", "bank_code")
    if (!bank) throw new Error(`الشيك ${cheque.number}: اذكر اسم البنك أو رمزه بشكل محدد`)
    const branch = match(lookups.branches.filter(row => Number(row.bank_id) === Number(bank.id)), cheque.branch, "branch_name", "branch_code")
    if (!branch) throw new Error(`الشيك ${cheque.number}: اذكر فرع البنك أو رمزه بشكل محدد`)
    const bankAccount = voucherType === 5
      ? match((lookups.bankAccounts || []).filter(row => Number(row.branch_id) === Number(branch.id) && Number(row.currency_id) === currencyId), cheque.bank_account, "name", "code")
      : null
    if (voucherType === 5 && !bankAccount) throw new Error(`الشيك ${cheque.number}: اذكر رقم الحساب البنكي المعرف للفرع وعملة السند`)
    if (voucherType === 5 && !bankAccount.jary_account_id) throw new Error(`الشيك ${cheque.number}: الحساب البنكي لا يملك حساباً جارياً معرفاً`)
    return { cheq_num: cheque.number.trim(), due_date: cheque.due_date, amount: value,
      bank_id: Number(bank.id), bank_no: bank.bank_code, bank_name: bank.bank_name,
      branch_id: Number(branch.id), branch_no: branch.branch_code, branch_name: branch.branch_name,
      bank_account: bankAccount?.code || cheque.bank_account || "",
      bank_account_id: bankAccount ? Number(bankAccount.id) : null,
      jary_account_id: bankAccount ? Number(bankAccount.jary_account_id) : null,
      cheq_owner_name: cheque.owner || "" }
  })
  const cards = cardInputs.map(card => {
    const type = match(lookups.cardTypes.filter(row => Number(row.currency_id) === currencyId), card.type, "name")
    if (!type) throw new Error("اذكر نوع بطاقة معرفاً بعملة السند بشكل محدد")
    const value = card.amount ?? parsed.credit_card_amount ?? (method === "card" ? amount : null)
    if (!value) throw new Error("اذكر مبلغ البطاقة")
    if (card.expire_date && !validDate(card.expire_date)) throw new Error("تاريخ انتهاء البطاقة غير صحيح")
    return { card_type_id: Number(type.id), card_type_name: type.name, card_no: card.number || "",
      expire_date: card.expire_date || "", amount: value, currency_id: currencyId,
      account_id: type.financial_account_id == null ? null : Number(type.financial_account_id) }
  })
  const cash_amount = parsed.cash_amount ?? (method === "cash" && !cheques.length && !cards.length ? amount : 0)
  const check_amount = cheques.reduce((sum, row) => sum + row.amount, 0)
  const credit_card_amount = cards.reduce((sum, row) => sum + row.amount, 0)
  if (parsed.check_amount != null && Math.round((check_amount - parsed.check_amount) * 100) !== 0) throw new Error("مجموع مبالغ الشيكات لا يساوي مبلغ الشيكات المذكور")
  if (parsed.credit_card_amount != null && Math.round((credit_card_amount - parsed.credit_card_amount) * 100) !== 0) throw new Error("مبلغ البطاقة لا يساوي مبلغ البطاقات المذكور")
  if (Math.round((cash_amount + check_amount + credit_card_amount - amount) * 100) !== 0) throw new Error("مجموع النقدي والشيكات والبطاقة يجب أن يساوي إجمالي السند. اذكر مبلغ كل جزء")
  return { payment_method: method, cash_amount, check_amount, credit_card_amount, cheques, cards }
}
