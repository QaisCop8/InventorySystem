const voucherSections: Record<number, string> = {
  4: "receipt-vouchers", 5: "payment-vouchers", 6: "credit-notes", 7: "debit-notes",
  8: "stock-in-vouchers", 9: "stock-out-vouchers", 10: "internal-delivery-vouchers", 11: "use-vouchers",
  12: "sales-invoices", 13: "sales-delivery", 14: "delivery-consignment-sale",
  15: "return-delivery-consignment-sale", 16: "return-sell", 17: "purchase-invoices",
  18: "delivery-pay", 19: "return-purchase", 20: "internal-manufacturing-request", 21: "cheque-payment-vouchers",
}

export function voucherSection(type: number) {
  return voucherSections[type] || "journal-vouchers"
}

export function voucherHref(id: number, type: number, company?: string | null) {
  const params = new URLSearchParams({ section: voucherSection(type), voucher_id: String(id) })
  if (company) params.set("company", company)
  return `/?${params}`
}
