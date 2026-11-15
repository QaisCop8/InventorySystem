import { NextRequest } from "next/server"
import sql, { withTenantDb } from "@/lib/database"

const DB = "co_perfbench"
const cookie = `tenant_session_${DB}=${"ab".repeat(20)}`
const ONLY = process.env.ONLY || ""

async function main() {
  await withTenantDb(DB, async () => {
    const [acc] = await sql`SELECT account_id id FROM voucher_journal_detail_tbl GROUP BY 1 ORDER BY count(*) DESC LIMIT 1` as any[]
    const [cust] = await sql`SELECT h.account_id id FROM voucher_header_tbl h JOIN account_tbl a ON a.id=h.account_id WHERE a.type IN (2,3,5) GROUP BY 1 ORDER BY count(*) DESC LIMIT 1` as any[]
    const [prod] = await sql`SELECT item_id id FROM voucher_items_tbl GROUP BY 1 ORDER BY count(*) DESC LIMIT 1` as any[]
    const [cur] = await sql`SELECT id FROM currency ORDER BY id LIMIT 1` as any[]
    const D = "from_date=2020-01-01&to_date=2026-12-31"
    const cases: [string, string][] = [
      ["account-balances", "kind=accounting&meta=1"], ["account-balances", `kind=accounting&to_date=2026-12-31&currency_ids=${cur.id}`],
      ["account-balances", "kind=receivables&meta=1"], ["account-balances", `kind=receivables&to_date=2026-12-31&currency_ids=${cur.id}`],
      ["account-statement", "kind=receivables&meta=1"], ["account-statement", `kind=receivables&${D}&account_ids=${cust?.id}&currency_ids=${cur.id}`],
      ["account-statement", "kind=accounting&meta=1"], ["account-statement", `kind=accounting&${D}&account_ids=${acc.id}&currency_ids=${cur.id}`],
      ["financial", "type=transactions&meta=1"], ["financial", `type=transactions&${D}`], ["financial", `type=vouchers&${D}`],
      ["financial", `type=trial-balance&${D}`], ["financial", `type=balance-sheet&${D}`], ["financial", `type=income-statement&${D}`],
      ["cost-centers", "kind=statement-with-cc&meta=1"], ["cost-centers", `kind=trial-balance-cc&${D}`], ["cost-centers", `kind=income-statement-cc&${D}`],
      ["receivables-aging", "meta=1"], ["receivables-aging", "to_date=2026-12-31"],
      ["tax", "kind=sales&meta=1"], ["tax", `kind=sales&${D}`], ["tax", `kind=purchases&${D}`],
      ["deliveries", "kind=deliveries&meta=1"], ["deliveries", `kind=deliveries&${D}`], ["deliveries", `kind=sales-purchases&${D}`],
      ["item-balances", "meta=1"], ["item-balances", "to_date=2026-12-31&with_zeros=0"],
      ["item-valuation", "meta=1"], ["item-valuation", "to_date=2026-12-31&with_zeros=0&price_way=1"],
      ["item-card", `product_id=${prod.id}&${D}`],
      ["expiry-balances", "meta=1"], ["expiry-balances", "to_date=2026-12-31"],
      ["sales-profit", "meta=1"], ["sales-profit", `${D}`], ["sales-profit", `${D}&group_by=item`],
      ["cheques", "view=registry&meta=1"], ["cheques", `${D}`],
      ["orders", "view=summary&meta=1"], ["orders", `view=detailed&${D}`],
      ["exchange-rates", ""], ["batch-movements", "date_from=2020-01-01&date_to=2026-12-31"],
      ["dashboard-data", D], ["production", "view=orders&meta=1"], ["pos-custody", "meta=1"], ["serial-movements", ""],
      ["lot-inventory", ""], ["inventory", ""], ["sales", ""],
    ]
    for (const [route, qs] of cases) {
      if (ONLY && !route.includes(ONLY)) continue
      const mod = await import(`@/app/api/reports/${route}/route`)
      const req = new NextRequest(`http://localhost/api/reports/${route}?${qs}`, { headers: { cookie } })
      const t = Date.now()
      let status = 0, size = 0, err = ""
      try { const res: Response = await mod.GET(req); status = res.status; const text = await res.text(); size = text.length; if (status >= 400) err = text.slice(0, 120) } catch (e: any) { err = String(e?.message || e).slice(0, 120) }
      console.log(`${String(Date.now() - t).padStart(6)}ms ${String(status).padStart(3)} ${String(size).padStart(9)}B  ${route}?${qs.replace(/from_date=2020-01-01&to_date=2026-12-31/, "D")} ${err}`)
    }
  })
  process.exit(0)
}
main()
