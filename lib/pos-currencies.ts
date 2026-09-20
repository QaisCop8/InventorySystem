import sql from "@/lib/database"

export type PosCurrency = { currency_id: number; currency_code: string; currency_name: string; exchange_rate: number; rate_to_point: number }

export async function getPosCurrencies(pointCurrencyId: number, rateDate?: string | null): Promise<PosCurrency[]> {
  const effectiveDate = rateDate || null
  const rows = await sql`SELECT c.id currency_id,c.currency_code,c.currency_name,
    COALESCE((SELECT er.exchange_rate FROM exchange_rates er WHERE er.currency_id=c.id
        AND er.rate_date::date<=COALESCE(${effectiveDate}::date,CURRENT_DATE) AND COALESCE(er.is_active,true)
        ORDER BY er.rate_date DESC,er.id DESC LIMIT 1),1) exchange_rate
    FROM currency c WHERE COALESCE(c.is_active,true) ORDER BY c.id`
  const pointRate = Number(rows.find((row: any) => Number(row.currency_id) === pointCurrencyId)?.exchange_rate) || 1
  return rows.filter((row: any) => Number(row.exchange_rate) > 0).map((row: any) => ({
    currency_id: Number(row.currency_id), currency_code: String(row.currency_code || ""),
    currency_name: String(row.currency_name || ""), exchange_rate: Number(row.exchange_rate),
    rate_to_point: Number(row.exchange_rate) / pointRate,
  }))
}
