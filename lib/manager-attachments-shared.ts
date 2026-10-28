// ثوابت مرفقات المدير المشتركة بين الواجهة والخادم (lib/manager-attachments.ts) — بلا قاعدة بيانات
export const MANAGER_ATTACHMENT_TYPES = {
  purchase_invoice: "فاتورة مشتريات",
  receipt_voucher: "سند قبض",
} as const
export type ManagerAttachmentType = keyof typeof MANAGER_ATTACHMENT_TYPES

export const MAX_MANAGER_ATTACHMENT_BYTES = 8 * 1024 * 1024
export const MAX_MANAGER_ATTACHMENT_FILES = 10
export const isAllowedAttachmentMime = (mime: string) => /^image\//i.test(mime) || mime === "application/pdf"
