import { promises as fs } from "fs"
import path from "path"
import crypto from "crypto"
import sql, { resolveCurrentDbName } from "@/lib/database"

// نظام مرفقات عام (على نمط Odoo ir.attachment): جدول واحد مُعرَّف بـ(model_name, record_id) بدل
// جدول مرفقات مخصَّص لكل شاشة (سندات/عملاء/أصناف) — أي شاشة جديدة تحصل على مرفقات فوراً بمجرد
// تمرير model_name/record_id مناسبَين، دون أي تعديل على هذا الملف أو الجدول.
export const ensureTables = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS attachment_tbl (
      id SERIAL PRIMARY KEY,
      model_name VARCHAR(50) NOT NULL,
      record_id INTEGER NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(100),
      file_size INTEGER,
      description VARCHAR(255),
      uploaded_by INTEGER,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_attachment_tbl_model_record ON attachment_tbl(model_name, record_id)`
}

// أسماء نماذج مسموحة فقط — يمنع أي model_name عشوائي من الوصول لبناء مسارات ملفات غير متوقَّعة.
// "voucher" يخدم كل أنواع السندات معاً (فاتورة/إرسالية مبيعات، مشتريات، قبض/صرف، مخزون...) لأنها
// جميعاً صفوف في نفس الجدول المشترك voucher_header_tbl، فمعرّفها (id) فريد عالمياً أصلاً.
export const ALLOWED_MODELS = ["voucher", "customer", "product", "task_order_item"] as const
export type AttachmentModel = (typeof ALLOWED_MODELS)[number]

export const isAllowedModel = (value: string): value is AttachmentModel =>
  (ALLOWED_MODELS as readonly string[]).includes(value)

// جذر التخزين خارج public/ عمداً — لا يُقرأ أي ملف مباشرة عبر مسار ثابت، فقط عبر
// GET /api/attachments/[id] الذي يتحقق أولاً من صف attachment_tbl في قاعدة بيانات المستأجر الحالية
// (نفس عزل tenant_db المستخدَم لبقية البيانات) قبل تسليم محتوى الملف.
const STORAGE_ROOT = path.join(process.cwd(), "uploads")

export const resolveStorageDir = async (modelName: string, recordId: number): Promise<string> => {
  const dbName = await resolveCurrentDbName()
  return path.join(STORAGE_ROOT, dbName, modelName, String(recordId))
}

// اسم ملف عشوائي (UUID) على القرص — يمنع تصادم الأسماء وأي احتمال traversal من الاسم الأصلي
// (original_name يبقى للعرض/التنزيل فقط، لا يُستخدَم أبداً في بناء مسار حقيقي على القرص).
export const generateStoredFileName = (originalName: string): string => {
  const ext = path.extname(originalName).slice(0, 20)
  return `${crypto.randomUUID()}${ext}`
}

export const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true })
}
