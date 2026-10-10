// ESC على نافذة سند: يُغلق النافذة (مروراً بالتحقق من التغييرات) — إلا إن كان المفتاح موجّهاً لعنصر داخلي:
// محرر خلية Wijmo (ESC يلغي تحرير الخلية فقط)، قائمة منسدلة/تقويم مفتوح (ESC يغلقها فقط)، أو نافذة تأكيد
// داخلية مفتوحة (blockers). يُستدعى من onEscapeKeyDown في DialogContent.
const INNER_POPUPS = ".p-dropdown-panel, .p-autocomplete-panel, .p-multiselect-panel, .p-datepicker:not(.p-datepicker-inline), .wj-dropdown-panel, [data-radix-popper-content-wrapper]"

export function keepDialogOpenOnEscape(event: KeyboardEvent, blockers: unknown[] = []) {
  const keep = () => {
    event.preventDefault()
    return true
  }
  if (blockers.some(Boolean)) return keep()
  const target = event.target as HTMLElement | null
  if (target?.closest?.(".wj-flexgrid") && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return keep()
  if (target?.closest?.('[aria-expanded="true"]')) return keep()
  if (typeof document !== "undefined") {
    const open = Array.from(document.querySelectorAll<HTMLElement>(INNER_POPUPS)).some((element) => element.getClientRects().length > 0)
    if (open) return keep()
  }
  return false
}
