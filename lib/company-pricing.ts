// حساب سعر اشتراك شركة — مشترك بين الخادم (company-billing.ts، المبلغ المُرسل لبوابة الدفع) وصفحة "شركاتي" (العرض).
export type PricingCurrency = "ILS" | "USD" | "JOD"
export type Pricing = { currency: PricingCurrency; base_price: number; per_user: number; per_branch: number; per_pos_point: number; per_restaurant_location: number }
export type LicenseCounts = { users: number; branches: number; posPoints: number; restaurantLocations: number }

/** الأساسي يشمل مستخدماً وفرعاً واحداً + (المستخدمون − 1) × سعر المستخدم + (الفروع − 1) × سعر الفرع + نقاط البيع × سعرها + مواقع المطاعم × سعرها */
export function priceFor(pricing: Pricing, counts: LicenseCounts) {
  const users = Math.max(0, Math.floor(counts.users) - 1)
  const branches = Math.max(0, Math.floor(counts.branches) - 1)
  const posPoints = Math.max(0, Math.floor(counts.posPoints))
  const restaurantLocations = Math.max(0, Math.floor(Number(counts.restaurantLocations) || 0))
  const lines = [
    { label: "الاشتراك الأساسي (مستخدم وفرع واحد)", amount: pricing.base_price },
    { label: `مستخدمون إضافيون × ${users}`, amount: users * pricing.per_user },
    { label: `فروع إضافية × ${branches}`, amount: branches * pricing.per_branch },
    { label: `نقاط بيع × ${posPoints}`, amount: posPoints * pricing.per_pos_point },
    { label: `مواقع مطاعم × ${restaurantLocations}`, amount: restaurantLocations * (Number(pricing.per_restaurant_location) || 0) },
  ].map((line) => ({ ...line, amount: Math.round(line.amount * 100) / 100 }))
  const total = Math.round(lines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100
  return { currency: pricing.currency, lines, total }
}
