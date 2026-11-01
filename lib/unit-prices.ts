// سعر وحدة بلا سعر خاص بها (لا سعر في فئة السعر، أو صفر): سعر الوحدة الأولى المسعّرة × العلاقة بالرئيسية.
// العلاقة (to_main_qnty) = كم وحدة رئيسية في هذه الوحدة، فالسعر يُحوَّل عبر الوحدة الرئيسية:
//   سعر الوحدة = سعر الوحدة المرجعية ÷ علاقتها × علاقة هذه الوحدة  (المرجعية عادةً الرئيسية بعلاقة 1).
// مشترك بين الخادم (وحدات الصنف، البحث بالباركود، كتالوج الكاشير والمطعم) والواجهة.

const round4 = (value: number) => Math.round(value * 10000) / 10000
const factorOf = (value: unknown) => {
  const factor = Number(value)
  return Number.isFinite(factor) && factor > 0 ? factor : 1
}

/**
 * يعيد نسخة من الوحدات (بنفس ترتيبها — الأولى = أول وحدة معرّفة للصنف) مع ملء سعر كل وحدة بلا سعر.
 * priceKey/factorKey أسماء حقول السعر والعلاقة في صفوف المستدعي. الوحدات المسعّرة لا تتغير.
 */
export function withDerivedUnitPrices<T extends Record<string, any>>(units: T[], priceKey: keyof T & string, factorKey: keyof T & string): T[] {
  if (!Array.isArray(units) || units.length < 2) return units
  const base = units.find((unit) => Number(unit[priceKey]) > 0)
  if (!base) return units
  const perMain = Number(base[priceKey]) / factorOf(base[factorKey])
  return units.map((unit) => Number(unit[priceKey]) > 0 ? unit : { ...unit, [priceKey]: round4(perMain * factorOf(unit[factorKey])) })
}

/** سعر وحدة واحدة: سعرها إن وُجد، وإلا المشتق من الوحدات (نفس قاعدة withDerivedUnitPrices). */
export function derivedUnitPrice(units: Record<string, any>[], index: number, priceKey: string, factorKey: string): number {
  const filled = withDerivedUnitPrices(units, priceKey, factorKey)
  return Number(filled[index]?.[priceKey]) || 0
}
