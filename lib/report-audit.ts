import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

// أرشفة التقارير: من فتح أي تقرير ومتى، الفلاتر التي عُرض بها، والطباعة/PDF/الإرسال بواتساب.

export type ReportAuditAction = "open" | "run" | "print" | "pdf" | "whatsapp"

export const REPORT_AUDIT_ACTION_LABELS: Record<ReportAuditAction, string> = {
  open: "فتح التقرير",
  run: "عرض التقرير",
  print: "طباعة التقرير",
  pdf: "حفظ PDF",
  whatsapp: "إرسال واتساب",
}

export const ensureReportAuditTables = () => runSchemaOnce("lib/report-audit.ts#ensureReportAuditTables", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS report_audit_log_tbl (
      id BIGSERIAL PRIMARY KEY,
      report_key VARCHAR(120),
      report_title VARCHAR(250),
      action VARCHAR(20) NOT NULL,
      filters JSONB,
      branch_id INTEGER,
      user_id VARCHAR(80),
      user_name VARCHAR(200),
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_report_audit_created ON report_audit_log_tbl (created_at DESC)`
  await sql`CREATE INDEX IF NOT EXISTS idx_report_audit_key ON report_audit_log_tbl (report_key)`
})
