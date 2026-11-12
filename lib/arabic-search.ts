// توحيد النص العربي في كل البحث: الهمزات (أ إ آ ٱ ⇐ ا)، التاء المربوطة (ة ⇐ ه)، الألف المقصورة (ى ⇐ ي)، ؤ ⇐ و، ئ ⇐ ي،
// حذف التشكيل والتطويل، الأرقام العربية ⇐ لاتينية، وأحرف صغيرة — فيطابق "مؤسسة" و"موسسه" و"اسامة" و"أسامه" بعضها.
// يُطبَّق على النص المبحوث فيه وعلى عبارة البحث معاً.
export function normalizeArabicSearch(value: unknown): string {
  return String(value ?? "")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .toLocaleLowerCase()
}

/** هل يحوي النص عبارة البحث (بعد التوحيد)؟ عبارة فارغة ⇐ true */
export function arabicIncludes(text: unknown, query: unknown): boolean {
  const needle = normalizeArabicSearch(query).trim()
  return !needle || normalizeArabicSearch(text).includes(needle)
}

/** كل كلمات عبارة البحث موجودة في النص (بأي ترتيب) */
export function arabicWordsMatch(text: unknown, query: unknown): boolean {
  const haystack = normalizeArabicSearch(text)
  return normalizeArabicSearch(query).split(/\s+/).filter(Boolean).every((word) => haystack.includes(word))
}

/** نفس التوحيد داخل SQL: translate(lower(expr), SQL_ARABIC_FROM, SQL_ARABIC_TO) ILIKE '%' || normalizeArabicSearch(query) || '%' */
export const SQL_ARABIC_FROM = "أإآٱةىؤئ"
export const SQL_ARABIC_TO = "ااااهيوي"
