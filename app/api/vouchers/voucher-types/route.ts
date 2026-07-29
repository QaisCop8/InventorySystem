import { NextRequest, NextResponse } from "next/server"

import sql, { getTenantPool } from "@/lib/database"



export async function GET(request: NextRequest) {
  
  try {
    const query = `
      SELECT id, name, status
       FROM voucher_types_tbl
       WHERE status = 1
       ORDER BY id`
    ;

  const result = await (await getTenantPool()).query(query);
  return NextResponse.json(result.rows)
  } catch (err: any) {
    console.error("voucher-types error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
