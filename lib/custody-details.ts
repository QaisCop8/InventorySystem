// صلاحية "السماح بمشاهدة تفاصيل العهدة" (كاشير نقطة البيع والمطاعم): بدونها ينفّذ المستخدم الإيداع والسحب وإغلاق
// الوردية فقط، ولا تصله المبيعات ولا الرصيد المتوقع ولا الفرق ولا سجل الحركات — تُحذف من استجابة الخادم نفسها
// (لا إخفاء في الواجهة فقط)، ويُعلَّم الجلسة details_hidden لتعرض نافذة العهدة حقول الإدخال وحدها.
export function redactCustodySession<T extends Record<string, any> | null | undefined>(session: T, canViewDetails: boolean): T {
  if (!session) return session
  if (canViewDetails) return { ...session, details_hidden: false }
  const { payments: _payments, movements: _movements, movement_totals: _totals, expected_cash: _expected, ...rest } = session as Record<string, any>
  return {
    ...rest,
    details_hidden: true,
    currencies: Array.isArray(session.currencies)
      ? session.currencies.map(({ expected_amount: _amount, ...currency }: Record<string, any>) => currency)
      : session.currencies,
  } as unknown as T
}
