import { NextResponse, type NextRequest } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { authorizeStoredVoucher } from "@/lib/transaction-permissions"
import { rollbackChequeOperationsForVoucher } from "@/app/api/cheques/_lib"
import { ensureChequePaymentTables, fetchChequePaymentVoucher } from "../_lib"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureChequePaymentTables()
  const id = Number((await params).id)
  const authorization = await authorizeStoredVoucher(request, id, "view")
  if (!authorization.ok) return authorization.response
  const row = await fetchChequePaymentVoucher(id)
  return row
    ? NextResponse.json(row)
    : NextResponse.json({ error: "السند غير موجود" }, { status: 404 })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureChequePaymentTables()
    const id = Number((await params).id)
    const authorization = await authorizeStoredVoucher(request, id, "delete")
    if (!authorization.ok) return authorization.response

    return await withTenantTransaction(async () => {
      const changed = await sql`
        SELECT c.cheq_num, c.status_id, latest.new_status_id
        FROM cheque_payment_voucher_items i
        JOIN cheques_tbl c ON c.id = i.cheque_id
        LEFT JOIN LATERAL (
          SELECT l.new_status_id
          FROM cheque_operations_log_tbl l
          WHERE l.cheque_id = c.id AND l.voucher_id = ${id} AND COALESCE(l.status, 1) <> 9
          ORDER BY l.operation_date DESC, l.id DESC
          LIMIT 1
        ) latest ON TRUE
        WHERE i.voucher_id = ${id}
        FOR UPDATE OF c
      `
      const invalid = changed.find((row: any) => Number(row.status_id) !== Number(row.new_status_id))
      if (invalid) {
        return NextResponse.json({ error: `لا يمكن حذف السند: تغيّرت حالة الشيك رقم ${invalid.cheq_num} بعد هذا السند` }, { status: 409 })
      }
      const rollback = await rollbackChequeOperationsForVoucher(id)
      if (rollback.error) return NextResponse.json({ error: rollback.error }, { status: 409 })

      const updated = await sql`
        UPDATE voucher_header_tbl
        SET status=3,vch_status=1,last_update_date=CURRENT_TIMESTAMP
        WHERE id=${id} AND vch_type=21 AND status<>3
        RETURNING id
      `
      if (!updated.length) throw new Error("CHEQUE_PAYMENT_VOUCHER_NOT_FOUND")
      return NextResponse.json({ success: true, restored_cheques: rollback.restored })
    })
  } catch (error) {
    if (error instanceof Error && error.message === "CHEQUE_PAYMENT_VOUCHER_NOT_FOUND") {
      return NextResponse.json({ error: "السند غير موجود أو ملغي" }, { status: 404 })
    }
    console.error("Cheque payment delete error:", error)
    return NextResponse.json({ error: "تعذر إلغاء سند صرف الشيكات" }, { status: 500 })
  }
}
