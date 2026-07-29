import { type NextRequest, NextResponse } from "next/server"
import { promises as fs } from "fs"
import sql from "@/lib/database"
import { ensureTables, isAllowedModel, resolveStorageDir, generateStoredFileName, ensureDir } from "./_lib"

// حد أقصى 20 ميغابايت لكل ملف — وقاية بسيطة من رفع ملفات ضخمة تُثقل قرص الخادم (Node مستمر على
// IIS/Windows هنا، لا تخزيناً سحابياً بحداً منفصلاً خاصاً به).
const MAX_FILE_SIZE = 20 * 1024 * 1024

// خادم Node 18 هنا (لا 20+) لا يُعرِّف صنف File عالمياً (أُضيف فقط بدءاً من Node 20) — استخدام
// "instanceof File" مباشرة يرمي ReferenceError: File is not defined عند أي رفع ملف (وليس PDF
// تحديداً كما بدا ظاهرياً؛ كل رفع كان يفشل بنفس الخطأ). فحص بنيوي (duck typing) هنا بدل الاعتماد
// على وجود الصنف العالمي، يعمل مع أي كائن ملف حقيقي أعادته request.formData() بصرف النظر عن نسخة
// Node المشغّلة.
const isUploadedFile = (value: FormDataEntryValue | null): value is File =>
  !!value &&
  typeof value === "object" &&
  typeof (value as any).arrayBuffer === "function" &&
  typeof (value as any).size === "number" &&
  typeof (value as any).name === "string"

export async function GET(request: NextRequest) {
  try {
    await ensureTables()
    const { searchParams } = new URL(request.url)
    const modelName = searchParams.get("model_name") || ""
    const recordId = Number(searchParams.get("record_id"))

    if (!isAllowedModel(modelName) || !Number.isFinite(recordId) || recordId <= 0) {
      return NextResponse.json({ error: "معطيات غير صالحة" }, { status: 400 })
    }

    const rows = await sql`
      SELECT id, model_name, record_id, original_name, mime_type, file_size, description, uploaded_by, created_at
      FROM attachment_tbl
      WHERE model_name = ${modelName} AND record_id = ${recordId}
      ORDER BY created_at DESC
    `
    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error listing attachments:", error)
    return NextResponse.json({ error: "Failed to list attachments" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureTables()
    const form = await request.formData()
    const modelName = String(form.get("model_name") || "")
    const recordId = Number(form.get("record_id"))
    const description = String(form.get("description") || "")
    const uploadedBy = form.get("uploaded_by") ? Number(form.get("uploaded_by")) : null
    const file = form.get("file")

    if (!isAllowedModel(modelName) || !Number.isFinite(recordId) || recordId <= 0) {
      return NextResponse.json({ error: "معطيات غير صالحة" }, { status: 400 })
    }
    if (!isUploadedFile(file)) {
      return NextResponse.json({ error: "يجب اختيار ملف" }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "حجم الملف أكبر من الحد المسموح (20 ميغابايت)" }, { status: 400 })
    }

    const storedFileName = generateStoredFileName(file.name)
    const dir = await resolveStorageDir(modelName, recordId)
    await ensureDir(dir)
    const buffer = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(`${dir}/${storedFileName}`, buffer)

    const result = await sql`
      INSERT INTO attachment_tbl (model_name, record_id, file_name, original_name, mime_type, file_size, description, uploaded_by)
      VALUES (${modelName}, ${recordId}, ${storedFileName}, ${file.name}, ${file.type || null}, ${file.size}, ${description}, ${uploadedBy})
      RETURNING id, model_name, record_id, original_name, mime_type, file_size, description, uploaded_by, created_at
    `
    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error uploading attachment:", error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `فشل رفع المرفق: ${message}` }, { status: 500 })
  }
}
