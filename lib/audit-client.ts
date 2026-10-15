// تسجيل أحداث الواجهة في أرشيف السندات/التقارير — لا ينتظر ولا يُفشل أي إجراء للمستخدم.

export type ClientVoucherAuditAction = "print" | "print_original" | "print_copy" | "print_review" | "clone" | "whatsapp" | "pdf"
export type ClientReportAuditAction = "open" | "run" | "print" | "pdf" | "whatsapp"
export type ReportFilterValue = { label: string; value: string }

const send = (url: string, body: unknown) => {
  if (typeof window === "undefined") return
  try {
    void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => undefined)
  } catch {
    /* ignore */
  }
}

/** "نسخة اصلية" ⇐ print_original، "نسخة" ⇐ print_copy، "نسخة للتدقيق" ⇐ print_review */
export function printActionForCopyLabel(copyLabel?: string | null): ClientVoucherAuditAction {
  const label = String(copyLabel || "").replace(/[أإآ]/g, "ا").trim()
  if (!label) return "print"
  if (label.includes("تدقيق")) return "print_review"
  if (label.includes("اصلية") || label.includes("اصليه")) return "print_original"
  if (label.includes("نسخة") || label.includes("نسخه")) return "print_copy"
  return "print"
}

export function logVoucherAudit(event: {
  action: ClientVoucherAuditAction
  voucher_id?: number | null
  vch_type?: number | null
  vch_code?: string | null
  source?: "voucher" | "order" | "purchase_order"
  copy_label?: string | null
  phone?: string | null
  channel?: string | null
}) {
  if (!event.voucher_id && !(event.vch_type && event.vch_code)) return
  send("/api/voucher-audit", event)
}

export function logReportAudit(event: {
  action: ClientReportAuditAction
  report_key?: string | null
  report_title?: string | null
  filters?: ReportFilterValue[]
  phone?: string | null
  recipient?: string | null
  channel?: string | null
}) {
  send("/api/report-audit", event)
}
