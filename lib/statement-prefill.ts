import { openSectionInNewTab } from "@/lib/new-tab-handoff"

// فتح "بيان حساب الذمة" أو "بيان حساب محاسبي" لحساب محدد من شاشة أخرى (العملاء/الموردين/المشتركين، تقريرا الأرصدة)
// في تبويب متصفح جديد: يُمرَّر الحساب المطلوب عبر lib/new-tab-handoff إلى sessionStorage التبويب الجديد، والتقرير عند
// فتحه يختار الحساب ويعرض النتائج مباشرة.
export type StatementKind = "receivables" | "accounting"
export const RECEIVABLES_STATEMENT_SECTION = "receivables-statement-report"
export const ACCOUNTING_STATEMENT_SECTION = "accounting-statement-report"
const SECTIONS: Record<StatementKind, string> = { receivables: RECEIVABLES_STATEMENT_SECTION, accounting: ACCOUNTING_STATEMENT_SECTION }
const storageKey = (kind: StatementKind) => `statement-prefill:${kind}`
export const STATEMENT_PREFILL_EVENT = "STATEMENT_PREFILL"
const MAX_AGE_MS = 5 * 60_000

/** حتى تاريخ (اختياري): البيان يُعرض حتى نفس تاريخ تقرير الأرصدة الذي فُتح منه */
export function openAccountStatement(kind: StatementKind, accountId: number, toDate?: string) {
  if (!(accountId > 0)) return
  openSectionInNewTab(SECTIONS[kind], { [storageKey(kind)]: JSON.stringify({ accountId, toDate: toDate || null, at: Date.now() }) })
}

export function openReceivablesStatement(accountId: number) {
  openAccountStatement("receivables", accountId)
}

/** يقرأ الطلب المعلّق (خلال 5 دقائق) ويحذفه — يُستدعى مرة عند فتح التقرير. */
export function takeStatementPrefill(kind: StatementKind): { accountId: number; toDate: string | null } | null {
  try {
    const raw = sessionStorage.getItem(storageKey(kind))
    if (!raw) return null
    sessionStorage.removeItem(storageKey(kind))
    const data = JSON.parse(raw)
    if (!(Date.now() - Number(data.at) < MAX_AGE_MS && Number(data.accountId) > 0)) return null
    return { accountId: Number(data.accountId), toDate: /^\d{4}-\d{2}-\d{2}$/.test(String(data.toDate || "")) ? String(data.toDate) : null }
  } catch {
    return null
  }
}

export function clearStatementPrefill(kind: StatementKind) {
  try { sessionStorage.removeItem(storageKey(kind)) } catch {}
}

/** توافق مع الاستدعاءات القديمة */
export const takeReceivablesStatementPrefill = () => takeStatementPrefill("receivables")?.accountId ?? null
export const clearReceivablesStatementPrefill = () => clearStatementPrefill("receivables")
