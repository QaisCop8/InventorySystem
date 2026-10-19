export type VatAmountAction = "add" | "remove" | null

export type ParsedItemAmount = {
  amount: number
  vatAction: VatAmountAction
}

/** Convert edited grid values into finite numbers without treating blanks as zero. */
export function finiteItemNumber(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null
  const parsed = typeof value === "number" ? value : Number(String(value).trim())
  return Number.isFinite(parsed) ? parsed : null
}

/** Read an amount with an optional trailing + (add VAT) or - (remove included VAT). */
export function parseItemAmount(value: unknown): ParsedItemAmount | null {
  const raw = String(value ?? "").trim()
  const match = raw.match(/^(\d+(?:\.\d*)?|\.\d+)\s*([+-])?$/)
  if (!match) return null

  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return null

  return {
    amount,
    vatAction: match[2] === "+" ? "add" : match[2] === "-" ? "remove" : null,
  }
}

/** Keep line amounts net; the voucher's VAT calculation adds VAT once at totals time. */
export function netItemAmount(amount: number, vatAction: VatAmountAction, vatRate: number, alreadyAdjusted = false): number {
  if (vatAction !== "remove" || alreadyAdjusted) return amount
  const safeRate = Number.isFinite(vatRate) ? vatRate : 0
  return safeRate > 0 ? Math.round((amount / (1 + safeRate / 100)) * 100) / 100 : amount
}
