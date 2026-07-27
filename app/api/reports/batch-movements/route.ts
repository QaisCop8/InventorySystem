import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import * as XLSX from "xlsx"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const isExport = searchParams.get("export") === "true"
    const format = searchParams.get("format") || "json"

    // Get filter parameters
    const productId = searchParams.get("product_id")
    const transactionType = searchParams.get("transaction_type")
    const dateFrom = searchParams.get("date_from")
    const dateTo = searchParams.get("date_to")

    const whereConditions = ["1=1"]
    const params: any[] = []

    if (productId && productId !== "all") {
      whereConditions.push(`pl.product_id = $${params.length + 1}`)
      params.push(Number.parseInt(productId))
    }

    if (transactionType && transactionType !== "all") {
      whereConditions.push(`lt.transaction_type = $${params.length + 1}`)
      params.push(transactionType)
    }

    if (dateFrom) {
      whereConditions.push(`lt.created_at >= $${params.length + 1}`)
      params.push(dateFrom)
    }

    if (dateTo) {
      whereConditions.push(`lt.created_at <= $${params.length + 1} + INTERVAL '1 day'`)
      params.push(dateTo)
    }

    const whereClause = whereConditions.join(" AND ")

    const query = `
      SELECT 
        lt.id,
        lt.created_at as "تاريخ الحركة",
        p.product_name as "اسم المنتج",
        p.product_code as "كود المنتج",
        pl.lot_number as "رقم الدفعة",
        CASE 
          WHEN lt.transaction_type = 'purchase' THEN 'شراء'
          WHEN lt.transaction_type = 'sale' THEN 'بيع'
          WHEN lt.transaction_type = 'adjustment' THEN 'تعديل'
          WHEN lt.transaction_type = 'transfer' THEN 'تحويل'
          WHEN lt.transaction_type = 'return' THEN 'مرتجع'
          WHEN lt.transaction_type = 'status_change' THEN 'تغيير حالة'
          WHEN lt.transaction_type = 'damage' THEN 'تلف'
          WHEN lt.transaction_type = 'close' THEN 'إغلاق'
          ELSE lt.transaction_type
        END as "نوع الحركة",
        COALESCE(lt.quantity, 0) as "الكمية",
        COALESCE(lt.unit_cost, 0) as "سعر الوحدة",
        COALESCE(lt.quantity * lt.unit_cost, 0) as "القيمة الإجمالية",
        COALESCE(lt.reference_type, '') as "نوع المرجع",
        COALESCE(lt.reference_id::text, '') as "رقم المرجع",
        COALESCE(lt.notes, '') as "ملاحظات",
        COALESCE(lt.created_by, '') as "المستخدم",
        pl.manufacturing_date as "تاريخ الإنتاج",
        pl.expiry_date as "تاريخ الانتهاء",
        CASE 
          WHEN pl.status = 'new' THEN 'جديد'
          WHEN pl.status = 'in_use' THEN 'قيد الاستخدام'
          WHEN pl.status = 'finished' THEN 'منتهي'
          WHEN pl.status = 'damaged' THEN 'تالف'
          ELSE pl.status
        END as "حالة الدفعة",
        s.supplier_name as "المورد"
      FROM lot_transactions lt
      JOIN product_lots pl ON lt.lot_id = pl.id
      JOIN products p ON pl.product_id = p.id
      LEFT JOIN suppliers s ON pl.supplier_id = s.id
      WHERE ${whereClause}
      ORDER BY lt.created_at DESC
    `

    const result = await sql.unsafe(query, params)

    if (isExport && format === "excel") {
      // Create Excel workbook
      const workbook = XLSX.utils.book_new()
      const worksheet = XLSX.utils.json_to_sheet(result)

      // Set column widths
      const columnWidths = [
        { wch: 15 }, // تاريخ الحركة
        { wch: 25 }, // اسم المنتج
        { wch: 15 }, // كود المنتج
        { wch: 15 }, // رقم الدفعة
        { wch: 15 }, // نوع الحركة
        { wch: 10 }, // الكمية
        { wch: 12 }, // سعر الوحدة
        { wch: 15 }, // القيمة الإجمالية
        { wch: 15 }, // نوع المرجع
        { wch: 12 }, // رقم المرجع
        { wch: 30 }, // ملاحظات
        { wch: 15 }, // المستخدم
        { wch: 15 }, // تاريخ الإنتاج
        { wch: 15 }, // تاريخ الانتهاء
        { wch: 15 }, // حالة الدفعة
        { wch: 20 }, // المورد
      ]
      worksheet["!cols"] = columnWidths

      XLSX.utils.book_append_sheet(workbook, worksheet, "حركات الدفعات")

      // Generate Excel buffer
      const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })

      return new NextResponse(excelBuffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="batch-movements-report-${new Date().toISOString().split("T")[0]}.xlsx"`,
        },
      })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[v0] Error generating batch movements report:", error)
    return NextResponse.json({ error: "فشل في إنشاء تقرير حركات الدفعات" }, { status: 500 })
  }
}
