import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

/**
 * أدوات ⇐ "إرسال مرفقات للمدير" و"بريد الرسائل":
 * موظف يرسل صورة/PDF لفاتورة مشتريات أو سند قبض مع المورد ⇐ تظهر في بريد الرسائل للتنزيل أو المعالجة
 * (المساعد الذكي يقرأ المرفق وينشئ السند) أو الحذف. الملف محفوظ في نفس السطر (file_data) — الحذف يحذف السطر
 * كاملاً فيُحرَّر حجمه من قاعدة البيانات، وقوائم البريد لا تقرأ file_data أبداً.
 */
export { MANAGER_ATTACHMENT_TYPES, MAX_MANAGER_ATTACHMENT_BYTES, MAX_MANAGER_ATTACHMENT_FILES, isAllowedAttachmentMime, type ManagerAttachmentType } from "@/lib/manager-attachments-shared"

export function ensureManagerAttachmentsTable() {
  return runSchemaOnce("lib/manager-attachments.ts#ensureManagerAttachmentsTable", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS manager_attachments_tbl (
        id SERIAL PRIMARY KEY,
        doc_type VARCHAR(30) NOT NULL,
        supplier_id INTEGER NOT NULL,
        note VARCHAR(500),
        file_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_size INTEGER NOT NULL DEFAULT 0,
        file_data BYTEA NOT NULL,
        branch_id INTEGER,
        sender_user_id VARCHAR(50),
        read_at TIMESTAMP,
        read_by VARCHAR(50),
        processed_at TIMESTAMP,
        processed_by VARCHAR(50),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS idx_manager_attachments_created ON manager_attachments_tbl (created_at DESC)`
    await sql`CREATE INDEX IF NOT EXISTS idx_manager_attachments_branch ON manager_attachments_tbl (branch_id)`
  })
}

/** أعمدة القائمة — بلا file_data */
export async function listManagerAttachments(filter: { branchIds?: number[]; senderUserId?: string; from?: string; to?: string; docType?: string; status?: string; limit?: number }) {
  await ensureManagerAttachmentsTable()
  const branchIds = filter.branchIds || []
  const from = filter.from || ""
  const to = filter.to || ""
  const docType = filter.docType || ""
  const status = filter.status || ""
  const sender = filter.senderUserId || ""
  const limit = Math.min(Math.max(Number(filter.limit) || 500, 1), 2000)
  return sql`
    SELECT m.id, m.doc_type, m.supplier_id, a.code AS supplier_code, a.name AS supplier_name, m.note,
      m.file_name, m.mime_type, m.file_size, m.branch_id, b.branch_name, m.sender_user_id, sender.full_name AS sender_name,
      m.read_at, m.processed_at, processor.full_name AS processed_by_name, m.created_at
    FROM manager_attachments_tbl m
    LEFT JOIN account_tbl a ON a.id = m.supplier_id
    LEFT JOIN branches b ON b.id = m.branch_id
    LEFT JOIN user_settings sender ON sender.user_id::text = m.sender_user_id
    LEFT JOIN user_settings processor ON processor.user_id::text = m.processed_by
    WHERE (${branchIds.length} = 0 OR m.branch_id = ANY(${branchIds}::int[]) OR m.branch_id IS NULL)
      AND (${sender} = '' OR m.sender_user_id = ${sender})
      AND (${from} = '' OR m.created_at::date >= NULLIF(${from}, '')::date)
      AND (${to} = '' OR m.created_at::date <= NULLIF(${to}, '')::date)
      AND (${docType} = '' OR m.doc_type = ${docType})
      AND (${status} = '' OR (${status} = 'new' AND m.processed_at IS NULL) OR (${status} = 'processed' AND m.processed_at IS NOT NULL))
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT ${limit}
  `
}
