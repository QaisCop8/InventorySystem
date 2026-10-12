import sql from "@/lib/database"
import { getSystemSettings } from "@/lib/system-settings"

// Cash, incoming cheques and cards are configured per user and currency.
// Sales tax and sales returns use the existing system accounting defaults.
export async function resolvePosAccounts(point: any, userId: string) {
  const defaults = await sql`
    WITH selected_user AS (
      SELECT id,user_id FROM user_settings
      WHERE user_id::text=${userId} OR id::text=${userId}
      ORDER BY CASE WHEN user_id::text=${userId} THEN 0 ELSE 1 END LIMIT 1
    )
    SELECT d.* FROM users_currencies_default_account_tbl d
    JOIN selected_user u ON d.user_id::text=u.id::text OR d.user_id::text=u.user_id::text
    WHERE d.currency_id=${Number(point.currency_id)}
      AND (to_jsonb(d)->>'branch_id' IS NULL OR to_jsonb(d)->>'branch_id'=${String(point.branch_id)})
    ORDER BY CASE WHEN to_jsonb(d)->>'branch_id'=${String(point.branch_id)} THEN 0 ELSE 1 END,
      CASE WHEN d.user_id::text=u.id::text THEN 0 ELSE 1 END,d.id DESC LIMIT 1
  `
  const user = defaults[0] || {}
  const system = await getSystemSettings()
  const id = (...values: unknown[]) => values.map(Number).find(value => Number.isSafeInteger(value) && value > 0) || null
  return {
    ...point,
    pos_configured_cash_account_id: id(point.cash_account_id),
    cash_account_id: id(point.cash_account_id, user.account_id),
    cheque_account_id: id(point.cheque_account_id, user.received_cheqs_account_id),
    card_account_id: id(point.card_account_id, user.cards_account_id),
    tax_account_id: id(point.tax_account_id, system.default_sales_tax_account),
    return_account_id: id(point.return_account_id, system.default_selling_returns_account_id),
    walk_in_account_id: id(point.walk_in_account_id),
    receivable_account_id: null,
  }
}

export async function resolvePosCashAccount(point: any, userId: string, currencyId: number) {
  const configuredAccountId = Number(point.pos_configured_cash_account_id)
  if (Number.isSafeInteger(configuredAccountId) && configuredAccountId > 0) return configuredAccountId

  if (currencyId === Number(point.currency_id)) {
    const pointCurrencyAccountId = Number(point.cash_account_id)
    if (Number.isSafeInteger(pointCurrencyAccountId) && pointCurrencyAccountId > 0) return pointCurrencyAccountId
  }

  const defaults = await sql`
    WITH selected_user AS (
      SELECT id,user_id FROM user_settings
      WHERE user_id::text=${userId} OR id::text=${userId}
      ORDER BY CASE WHEN user_id::text=${userId} THEN 0 ELSE 1 END LIMIT 1
    )
    SELECT d.account_id FROM users_currencies_default_account_tbl d
    JOIN selected_user u ON d.user_id::text=u.id::text OR d.user_id::text=u.user_id::text
    WHERE d.currency_id=${currencyId}
      AND (to_jsonb(d)->>'branch_id' IS NULL OR to_jsonb(d)->>'branch_id'=${String(point.branch_id)})
    ORDER BY CASE WHEN to_jsonb(d)->>'branch_id'=${String(point.branch_id)} THEN 0 ELSE 1 END,
      CASE WHEN d.user_id::text=u.id::text THEN 0 ELSE 1 END,d.id DESC LIMIT 1
  `
  const accountId = Number(defaults[0]?.account_id)
  return Number.isSafeInteger(accountId) && accountId > 0 ? accountId : null
}
