import { openSectionInNewTab } from "@/lib/new-tab-handoff"

// فتح "بيان حساب الذمة" لحساب محدد من شاشة أخرى (العملاء/الموردين/المشتركين) في تبويب متصفح جديد:
// تُمرَّر الذمة المطلوبة عبر lib/new-tab-handoff إلى sessionStorage التبويب الجديد، والتقرير عند فتحه
// يختار الذمة ويعرض النتائج مباشرة.
export const RECEIVABLES_STATEMENT_SECTION = "receivables-statement-report"
const STORAGE_KEY = "statement-prefill:receivables"
export const STATEMENT_PREFILL_EVENT = "STATEMENT_PREFILL"
const MAX_AGE_MS = 5 * 60_000

export function openReceivablesStatement(accountId: number) {
  if (!(accountId > 0)) return
  openSectionInNewTab(RECEIVABLES_STATEMENT_SECTION, { [STORAGE_KEY]: JSON.stringify({ accountId, at: Date.now() }) })
}

/** يقرأ الطلب المعلّق (خلال 5 دقائق) ويحذفه — يُستدعى مرة عند فتح التقرير. */
export function takeReceivablesStatementPrefill(): number | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    sessionStorage.removeItem(STORAGE_KEY)
    const data = JSON.parse(raw)
    return Date.now() - Number(data.at) < MAX_AGE_MS && Number(data.accountId) > 0 ? Number(data.accountId) : null
  } catch {
    return null
  }
}

export function clearReceivablesStatementPrefill() {
  try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
}
