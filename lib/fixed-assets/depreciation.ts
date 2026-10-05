export const DEPRECIATION_METHODS = {
  STRAIGHT_LINE: "قسط ثابت",
  DECLINING_BALANCE: "قسط متناقص",
  NONE: "بدون إهلاك",
} as const

export type DepreciationMethod = keyof typeof DEPRECIATION_METHODS

export type ScheduleRow = {
  period: string
  depreciation_date: string
  opening_book_value: number
  depreciable_base: number
  depreciation_amount: number
  accumulated_depreciation: number
  closing_book_value: number
}

export type ScheduleInput = {
  method: DepreciationMethod
  cost: number
  residualValue: number
  accumulatedDepreciation: number
  remainingLifeMonths: number
  firstPeriod: string
  // Day-of-month the asset became depreciable; only the very first month of a new book is prorated.
  prorateFromDate?: string | null
  decliningRatePercent?: number | null
  usefulLifeMonths: number
}

export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export const periodOf = (date: string) => String(date).slice(0, 7)

export function addMonths(period: string, months: number) {
  const [year, month] = period.split("-").map(Number)
  const index = year * 12 + (month - 1) + months
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`
}

export function monthsBetween(fromPeriod: string, toPeriod: string) {
  const [fy, fm] = fromPeriod.split("-").map(Number)
  const [ty, tm] = toPeriod.split("-").map(Number)
  return (ty * 12 + tm) - (fy * 12 + fm)
}

export function periodEnd(period: string) {
  const [year, month] = period.split("-").map(Number)
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${period}-${String(last).padStart(2, "0")}`
}

export function isPeriod(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

function firstMonthFraction(date: string | null | undefined) {
  if (!date) return 1
  const [year, month, day] = String(date).slice(0, 10).split("-").map(Number)
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return Math.min(1, Math.max(0, (days - day + 1) / days))
}

export function generateSchedule(input: ScheduleInput): ScheduleRow[] {
  const cost = round2(input.cost)
  const residual = round2(Math.max(0, input.residualValue))
  let accumulated = round2(Math.max(0, input.accumulatedDepreciation))
  let openingValue = round2(cost - accumulated)
  const remainingMonths = Math.max(1, Math.round(input.remainingLifeMonths))
  if (input.method === "NONE" || openingValue - residual <= 0.004) return []

  const rows: ScheduleRow[] = []
  const prorate = input.prorateFromDate ? firstMonthFraction(input.prorateFromDate) : 1
  const totalPeriods = remainingMonths + (prorate < 1 ? 1 : 0)
  const straightMonthly = (openingValue - residual) / remainingMonths
  const annualRate = input.method === "DECLINING_BALANCE"
    ? (Number(input.decliningRatePercent) > 0 ? Number(input.decliningRatePercent) / 100 : 2 / Math.max(1 / 12, input.usefulLifeMonths / 12))
    : 0

  for (let index = 0; index < totalPeriods; index++) {
    const period = addMonths(input.firstPeriod, index)
    const remaining = round2(openingValue - residual)
    if (remaining <= 0.004) break
    const fraction = index === 0 ? prorate : 1
    const lastPeriod = index === totalPeriods - 1
    let amount: number
    if (input.method === "DECLINING_BALANCE") {
      const declining = openingValue * (annualRate / 12) * fraction
      const periodsLeft = Math.max(1, totalPeriods - index)
      const straight = (remaining / periodsLeft) * fraction
      amount = Math.max(declining, straight)
    } else {
      amount = straightMonthly * fraction
    }
    amount = lastPeriod ? remaining : Math.min(remaining, round2(amount))
    if (amount <= 0) break
    accumulated = round2(accumulated + amount)
    const closing = round2(cost - accumulated)
    rows.push({
      period,
      depreciation_date: periodEnd(period),
      opening_book_value: openingValue,
      depreciable_base: round2(openingValue - residual),
      depreciation_amount: round2(amount),
      accumulated_depreciation: accumulated,
      closing_book_value: closing,
    })
    openingValue = closing
  }
  return rows
}
