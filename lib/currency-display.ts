export type CurrencyDisplayOption = {
  id?: number | string | null
  currency_id?: number | string | null
  currency_code?: string | null
  currency_name?: string | null
  currency_symbol?: string | null
}

export function getFirstCurrencyLabel(currencies: CurrencyDisplayOption[]): string {
  if (!Array.isArray(currencies) || currencies.length === 0) return ""

  const firstCurrency = currencies.reduce<CurrencyDisplayOption | null>((first, currency) => {
    const currencyId = Number(currency.currency_id ?? currency.id)
    if (!Number.isFinite(currencyId)) return first ?? currency

    const firstId = Number(first?.currency_id ?? first?.id)
    return !first || !Number.isFinite(firstId) || currencyId < firstId ? currency : first
  }, null)

  return (
    firstCurrency?.currency_symbol?.trim() ||
    firstCurrency?.currency_code?.trim() ||
    firstCurrency?.currency_name?.trim() ||
    ""
  )
}
