// فتح "بيان حساب الذمة" لحساب محدد من شاشة أخرى (العملاء/الموردين/المشتركين):
// تُخزَّن الذمة المطلوبة في sessionStorage (لتقرير يُفتح الآن لأول مرة) ويُطلق حدث (لتقرير مفتوح مسبقاً في تبويب)،
// ثم يُفتح التقرير عبر OPEN_SECTION — والتقرير يختار الذمة ويعرض النتائج مباشرة.
export const RECEIVABLES_STATEMENT_SECTION = "receivables-statement-report"
const STORAGE_KEY = "statement-prefill:receivables"
export const STATEMENT_PREFILL_EVENT = "STATEMENT_PREFILL"

export function openReceivablesStatement(accountId: number) {
  if (!(accountId > 0)) return
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ accountId, at: Date.now() })) } catch {}
  window.dispatchEvent(new CustomEvent(STATEMENT_PREFILL_EVENT, { detail: { kind: "receivables", accountId } }))
  window.dispatchEvent(new CustomEvent("OPEN_SECTION", { detail: { section: RECEIVABLES_STATEMENT_SECTION } }))
}

/** يقرأ الطلب المعلّق (خلال دقيقة) ويحذفه — يُستدعى مرة عند فتح التقرير. */
export function takeReceivablesStatementPrefill(): number | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    sessionStorage.removeItem(STORAGE_KEY)
    const data = JSON.parse(raw)
    return Date.now() - Number(data.at) < 60_000 && Number(data.accountId) > 0 ? Number(data.accountId) : null
  } catch {
    return null
  }
}

export function clearReceivablesStatementPrefill() {
  try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
}
