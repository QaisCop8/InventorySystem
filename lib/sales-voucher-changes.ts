// Compare editable voucher data, not lookup labels, calculated totals or grid
// bookkeeping. Keep numeric strings equivalent to their API number values.
const headerNumbers = "vch_type vch_book_id branch_id currency_id rate account_id to_store_id salesman_id linked_order_id discount_value vat_percent vat_classification_id invoice_type maqasa_type cash_account_id tax_account_id city_id invoice_source_type source_voucher_id source_voucher_type".split(" ")
const headerText = "vch_code vch_date customer_name shipping_address discount_type manual_voucher manual_date note phone due_date".split(" ")
const headerFlags = "vat_included is_maqasa is_exported_sales".split(" ")
const rowNumbers = "product_id warehouse_id unit_id quantity bonus_quantity unit_price discount_percent source_voucher_id source_voucher_type order_item_id delivery_item_id length width height count account_id".split(" ")
const rowText = "product_code product_name barcode batch_number expiry_date note".split(" ")

function stable(value: any): any {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
  return value
}

function fields(record: any, numbers: string[], strings: string[]) {
  return Object.fromEntries([
    ...numbers.map(key => [key, Number(record[key] || 0)]),
    ...strings.map(key => [key, String(record[key] ?? "")]),
  ])
}

export function salesVoucherSnapshot(form: any): string {
  return JSON.stringify(stable({
    ...fields(form, headerNumbers, headerText),
    ...Object.fromEntries(headerFlags.map(key => [key, Boolean(form[key])])),
    items: (form.items || []).filter((row: any) => row.product_id || row.product_code || row.product_name).map((row: any) => ({
      ...fields(row, rowNumbers, rowText),
      selected_attributes: row.selected_attributes || {},
      serial_numbers: row.serial_numbers || [],
      account_cost_centers: (row.account_cost_centers || []).map((selection: any) => ({
        cost_center_type_id: Number(selection.cost_center_type_id),
        cost_center_id: Number(selection.cost_center_id),
      })).sort((a: any, b: any) => a.cost_center_type_id - b.cost_center_type_id),
    })),
  }))
}
