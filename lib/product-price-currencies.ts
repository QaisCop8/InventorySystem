type CurrencyQuery = { query: (text: string, values: any[]) => Promise<{ rows: Array<{ id: number }> }> }

export async function validateProductPriceCurrencies(client: CurrencyQuery, prices: unknown): Promise<string | null> {
  if (!Array.isArray(prices) || !prices.length) return null
  const currencyIds = prices.map(price => Number(price?.currency_id))
  const invalidRow = currencyIds.findIndex(id => !Number.isSafeInteger(id) || id <= 0)
  if (invalidRow >= 0) return `اختر عملة صحيحة في أسعار البيع للسطر ${invalidRow + 1}`

  const result = await client.query("SELECT id FROM currency WHERE id = ANY($1::int[])", [[...new Set(currencyIds)]])
  const allowed = new Set(result.rows.map(row => Number(row.id)))
  const missingRow = currencyIds.findIndex(id => !allowed.has(id))
  return missingRow < 0 ? null : `العملة المحددة في أسعار البيع للسطر ${missingRow + 1} غير موجودة. أعد اختيار العملة ثم احفظ الصنف.`
}
