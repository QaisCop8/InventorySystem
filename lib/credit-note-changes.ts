const numericFields = "vch_type vch_book_id branch_id currency_id rate account_id debit_account_id vat_account_id amount_journal_type_8 vat_percent vat amount payment_classification_id salesman_id".split(" ")
const textFields = "vch_code manual_voucher note".split(" ")
const dateFields = ["vch_date", "manual_date"]
const costCenterFields = ["account_cost_centers", "debit_account_cost_centers", "vat_account_cost_centers"]
const calculatedFields = new Set(["amount", "amount_journal_type_8", "vat", "vat_percent", "rate"])

function numericValue(field: string, value: unknown): number {
  const parsed = Number(value || 0)
  // Reciprocal VAT calculations can introduce insignificant IEEE-754 drift.
  return calculatedFields.has(field) && Number.isFinite(parsed) ? Number(parsed.toPrecision(15)) : parsed
}

// Compare persisted, editable values. Account labels and numeric/date formatting
// can change as controls load without changing the voucher itself.
export function creditNoteSnapshot(form: Record<string, any>): string {
  return JSON.stringify({
    ...Object.fromEntries(numericFields.map((field) => [field, numericValue(field, form[field])])),
    ...Object.fromEntries(textFields.map((field) => [field, String(form[field] ?? "")])),
    ...Object.fromEntries(dateFields.map((field) => [field, String(form[field] ?? "").slice(0, 10)])),
    ...Object.fromEntries(costCenterFields.map((field) => [field, (form[field] || [])
      .map((selection: { cost_center_type_id: unknown; cost_center_id: unknown }) => ({
        cost_center_type_id: Number(selection.cost_center_type_id || 0),
        cost_center_id: Number(selection.cost_center_id || 0),
      }))
      .sort((a: { cost_center_type_id: number; cost_center_id: number }, b: { cost_center_type_id: number; cost_center_id: number }) =>
        a.cost_center_type_id - b.cost_center_type_id || a.cost_center_id - b.cost_center_id),
    ])),
  })
}
