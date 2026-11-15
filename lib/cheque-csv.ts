/**
 * CSV يفتحه Excel بالعربية سليماً: UTF-8 مع BOM وبلا سطر "sep=," — سطر sep يجعل Excel يتجاهل الـBOM
 * ويقرأ الملف بترميز ANSI فتظهر الحروف العربية رموزاً (نفس صيغة بقية التقارير).
 */
export function createChequeCsvBlob(rows: unknown[][]): Blob {
  const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`
  const text = rows.map(row => row.map(quote).join(",")).join("\r\n") + "\r\n"
  return new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" })
}
