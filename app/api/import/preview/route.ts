import { type NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const entityType = formData.get("entityType") as string

    if (!file) {
      return NextResponse.json({ error: "لم يتم العثور على الملف" }, { status: 400 })
    }

    // Read the Excel file
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: "array" })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]

    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

    if (jsonData.length < 2) {
      return NextResponse.json({ error: "الملف فارغ أو لا يحتوي على بيانات كافية" }, { status: 400 })
    }

    // Get headers and data
    const headers = jsonData[0] as string[]
    const rows = jsonData.slice(1) as any[][]

    // Map column names based on entity type
    const columnMappings = {
      products: {
        "رقم الصنف": "product_code",
        "اسم الصنف": "product_name",
        الوصف: "description",
        الفئة: "category",
        "الوحدة الأساسية": "main_unit",
        "الوحدة الثانوية": "secondary_unit",
        "معامل التحويل": "conversion_factor",
        الباركود: "barcode",
        "آخر سعر شراء": "last_purchase_price",
        العملة: "currency",
      },
      customers: {
        "رقم العميل": "customer_code",
        "اسم العميل": "customer_name",
        "الجوال الأول": "phone1",
        "الجوال الثاني": "phone2",
        "واتساب الأول": "whatsapp1",
        المدينة: "city",
        العنوان: "address",
        "البريد الإلكتروني": "email",
        الحالة: "status",
        التصنيف: "classification",
      },
      suppliers: {
        "رقم المورد": "supplier_code",
        "اسم المورد": "supplier_name",
        "الجوال الأول": "phone1",
        "الجوال الثاني": "phone2",
        "واتساب الأول": "whatsapp1",
        المدينة: "city",
        العنوان: "address",
        "البريد الإلكتروني": "email",
        الحالة: "status",
        "طبيعة العمل": "business_nature",
      },
    }

    const mapping = columnMappings[entityType as keyof typeof columnMappings]
    if (!mapping) {
      return NextResponse.json({ error: "نوع البيانات غير مدعوم" }, { status: 400 })
    }

    // Convert rows to objects
    const preview = rows
      .filter((row) => row.some((cell) => cell !== null && cell !== undefined && cell !== ""))
      .map((row) => {
        const obj: any = {}
        headers.forEach((header, index) => {
          const mappedKey = mapping[header as keyof typeof mapping]
          if (mappedKey && row[index] !== null && row[index] !== undefined) {
            obj[mappedKey] = String(row[index]).trim()
          }
        })
        return obj
      })
      .filter((obj) => Object.keys(obj).length > 0)

    return NextResponse.json({
      preview: preview.slice(0, 100), // Limit preview to 100 records
      total: preview.length,
    })
  } catch (error) {
    console.error("Error processing Excel file:", error)
    return NextResponse.json({ error: "خطأ في معالجة الملف" }, { status: 500 })
  }
}
