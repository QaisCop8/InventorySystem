export type CommissionBasis = "sales" | "gross_profit" | "collection" | "tiered"
export type CommissionTier = { threshold: number; rate: number }
export type CommissionRule = {
  id: number
  salesman_id: number | null
  basis: CommissionBasis
  commission_percent: number
  customer_id?: number | null
  item_id?: number | null
  item_group_id?: number | null
  warehouse_id?: number | null
  branch_id?: number | null
  currency_id?: number | null
  minimum_sales?: number
  tiers?: CommissionTier[]
}
export type CommissionBase = { sales: number; grossProfit: number; collected: number }

export const roundCommission = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export function selectCommissionRule(rules: CommissionRule[], scope: {
  salesmanId: number; customerId?: number | null; itemId?: number | null; itemGroupId?: number | null;
  warehouseId?: number | null; branchId?: number | null; currencyId?: number | null; amount: number
}) {
  return rules
    .filter(rule => (!rule.salesman_id || Number(rule.salesman_id) === scope.salesmanId)
      && (!rule.customer_id || Number(rule.customer_id) === Number(scope.customerId || 0))
      && (!rule.item_id || Number(rule.item_id) === Number(scope.itemId || 0))
      && (!rule.item_group_id || Number(rule.item_group_id) === Number(scope.itemGroupId || 0))
      && (!rule.warehouse_id || Number(rule.warehouse_id) === Number(scope.warehouseId || 0))
      && (!rule.branch_id || Number(rule.branch_id) === Number(scope.branchId || 0))
      && (!rule.currency_id || Number(rule.currency_id) === Number(scope.currencyId || 0))
      && scope.amount >= Number(rule.minimum_sales || 0))
    .sort((a, b) => {
      const specificity = (rule: CommissionRule) => [rule.salesman_id, rule.customer_id, rule.item_id, rule.item_group_id, rule.warehouse_id, rule.branch_id, rule.currency_id].filter(Boolean).length
      return specificity(b) - specificity(a) || Number(b.id) - Number(a.id)
    })[0] || null
}

export function commissionRate(rule: CommissionRule, cumulativeSales = 0) {
  if (rule.basis !== "tiered") return Math.max(0, Number(rule.commission_percent || 0))
  const tiers = [...(rule.tiers || [])].sort((a, b) => Number(a.threshold) - Number(b.threshold))
  return tiers.reduce((rate, tier) => Number(cumulativeSales) >= Number(tier.threshold) ? Math.max(0, Number(tier.rate)) : rate, 0)
}

export function reverseCommission(originalCommission: number, returnedBasis: number, originalBasis: number) {
  if (!(originalBasis > 0)) return 0
  return -roundCommission(Math.abs(Number(originalCommission || 0)) * Math.min(1, Math.max(0, Number(returnedBasis || 0) / originalBasis)))
}

export function calculateCommission(rule: CommissionRule, base: CommissionBase, sign: 1 | -1 = 1, cumulativeSales = 0) {
  const rate = commissionRate(rule, cumulativeSales)
  const basisAmount = rule.basis === "gross_profit" ? base.grossProfit
    : rule.basis === "collection" ? base.collected : base.sales
  const amount = roundCommission(Math.max(0, basisAmount) * rate / 100) * sign
  return { rate, basisAmount: roundCommission(basisAmount), amount }
}
