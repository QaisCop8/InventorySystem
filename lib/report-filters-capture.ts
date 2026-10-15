"use client"

import type { ReportFilterValue } from "@/lib/audit-client"

// يقرأ فلاتر التقرير الظاهرة (اسم الحقل + قيمته) من الشاشة نفسها — يعمل مع كل التقارير دون تعديل كل تقرير:
// حقول input/select/textarea، قوائم PrimeReact، وقوائم Radix (combobox).

const clean = (value: string | null | undefined) => String(value ?? "").replace(/\s+/g, " ").replace(/[*:]+\s*$/, "").trim()
const isShown = (element: Element) => element instanceof HTMLElement && element.offsetParent !== null

function labelFor(element: HTMLElement, root: HTMLElement): string {
  const id = element.id || element.querySelector("input[id]")?.id
  if (id) {
    const explicit = root.querySelector(`label[for="${CSS.escape(id)}"]`)
    if (explicit?.textContent) return clean(explicit.textContent)
  }
  const aria = element.getAttribute("aria-label") || element.querySelector("[aria-label]")?.getAttribute("aria-label")
  // يصعد حتى 3 مستويات بحثاً عن أقرب عنوان (Label) داخل نفس حاوية الحقل
  let node: HTMLElement | null = element.parentElement
  for (let depth = 0; node && node !== root && depth < 3; depth++, node = node.parentElement) {
    const label = node.querySelector("label, .report-filter-label")
    if (label && !label.contains(element) && label.textContent?.trim()) return clean(label.textContent)
  }
  if (aria) return clean(aria)
  const placeholder = element.getAttribute("placeholder")
  return placeholder ? clean(placeholder) : ""
}

function valueOf(element: HTMLElement): string {
  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox" || element.type === "radio") return element.checked ? "✓" : ""
    return clean(element.value)
  }
  if (element instanceof HTMLSelectElement) return clean(element.selectedOptions[0]?.textContent || element.value)
  if (element instanceof HTMLTextAreaElement) return clean(element.value)
  if (element.matches(".p-dropdown")) return clean(element.querySelector(".p-dropdown-label")?.textContent)
  if (element.matches(".p-multiselect")) return clean(element.querySelector(".p-multiselect-label")?.textContent)
  if (element.matches("[role=checkbox]")) return element.getAttribute("aria-checked") === "true" || element.dataset.state === "checked" ? "✓" : ""
  return clean(element.textContent)
}

const PLACEHOLDER_VALUES = new Set(["empty", "اختر", "اختر...", "الكل", "--"])

export function collectReportFilters(root: HTMLElement | null): ReportFilterValue[] {
  if (!root || typeof document === "undefined") return []
  const scope = (root.querySelector(".report-filters") as HTMLElement | null) || root
  const fields = Array.from(scope.querySelectorAll<HTMLElement>(
    "input, select, textarea, .p-dropdown, .p-multiselect, button[role=combobox], button[role=checkbox]",
  )).filter(isShown)
  const result: ReportFilterValue[] = []
  const seen = new Set<string>()
  for (const element of fields) {
    // حقل داخل قائمة PrimeReact (بحث القائمة/الإدخال المخفي) يُمثَّل بالقائمة نفسها
    const owner = element.parentElement?.closest(".p-dropdown, .p-multiselect")
    if (owner && owner !== element) continue
    if (element.closest("table, .wj-flexgrid, [role=dialog], .p-dropdown-panel, .p-multiselect-panel")) continue
    if (element instanceof HTMLInputElement && ["hidden", "button", "submit", "file"].includes(element.type)) continue
    const value = valueOf(element)
    if (!value || PLACEHOLDER_VALUES.has(value)) continue
    const label = labelFor(element, scope) || "فلتر"
    const key = `${label}\u0000${value}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ label, value })
    if (result.length >= 40) break
  }
  return result
}

/** التقرير الذي يحتوي العنصر: مفتاحه (section) وعنوانه، والحاوية التي تُقرأ منها الفلاتر. */
export function reportContextOf(element: Element | null): { key: string | null; title: string; root: HTMLElement | null } {
  const holder = element?.closest<HTMLElement>("[data-report-section]") || null
  const page = element?.closest<HTMLElement>(".report-page") || holder
  const title = holder?.dataset.reportTitle
    || page?.querySelector(".report-header h1, h1")?.textContent?.trim()
    || ""
  return { key: holder?.dataset.reportSection || null, title, root: page || holder }
}
