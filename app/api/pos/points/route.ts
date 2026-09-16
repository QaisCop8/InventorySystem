import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureTables as ensureVoucherTables } from "@/app/api/sales-vouchers/_lib"
import { ensurePosTables, requestBranchId, requestUserId } from "../_lib"

const bool = (value: unknown, fallback = false) => value == null ? fallback : Boolean(value)
const optionalId = (value: unknown) => Number(value || 0) || null

async function validate(data: any) {
  if (!String(data.code || "").trim()) return "رمز نقطة البيع مطلوب"
  if (!String(data.name || "").trim()) return "اسم نقطة البيع مطلوب"
  if (!optionalId(data.branch_id)) return "الفرع مطلوب"
  if (!optionalId(data.main_warehouse_id)) return "المخزن الرئيسي مطلوب"
  if (!optionalId(data.currency_id)) return "العملة مطلوبة"
  if (!optionalId(data.sales_book_id)) return "دفتر فواتير البيع مطلوب"
  if (!optionalId(data.price_category_id)) return "فئة السعر مطلوبة"
  if (!optionalId(data.cash_account_id)) return "حساب الصندوق مطلوب"
  const refs = await Promise.all([
    sql`SELECT id FROM branches WHERE id=${Number(data.branch_id)} AND COALESCE(status,1)<>3`,
    sql`SELECT id FROM warehouses WHERE id=${Number(data.main_warehouse_id)} AND COALESCE(status,1)<>3`,
    sql`SELECT id FROM currency WHERE id=${Number(data.currency_id)} AND COALESCE(is_active,true)`,
    sql`SELECT id FROM voucher_books_tbl WHERE id=${Number(data.sales_book_id)}`,
    sql`SELECT id FROM account_tbl WHERE id=${Number(data.cash_account_id)} AND COALESCE(status,1)<>3`,
    sql`SELECT id FROM pricecategory WHERE id=${Number(data.price_category_id)} AND COALESCE(status,1)=1`,
  ])
  if (refs.some((rows) => !rows[0])) return "أحد إعدادات نقطة البيع غير موجود أو غير نشط"
  return null
}

export async function GET(request: NextRequest) {
  try {
    await ensureVoucherTables(); await ensurePosTables()
    const userId=requestUserId(request), branchId=requestBranchId(request)
    if (!userId) return NextResponse.json({error:"تعذر تحديد المستخدم"},{status:401})
    const points=await sql`
      SELECT p.*,b.branch_name,w.warehouse_name,c.currency_name,c.currency_code,
             vb.name sales_book_name,rvb.name return_book_name,
             COALESCE((SELECT json_agg(json_build_object('user_id',u.user_id,'is_default',u.is_default) ORDER BY u.user_id) FROM pos_point_users_tbl u WHERE u.pos_point_id=p.id),'[]') users
      FROM pos_points_tbl p
      LEFT JOIN branches b ON b.id=p.branch_id LEFT JOIN warehouses w ON w.id=p.main_warehouse_id
      LEFT JOIN currency c ON c.id=p.currency_id LEFT JOIN voucher_books_tbl vb ON vb.id=p.sales_book_id
      LEFT JOIN voucher_books_tbl rvb ON rvb.id=p.return_book_id
      WHERE p.status<>3 AND (${branchId ?? 0}=0 OR p.branch_id=${branchId ?? 0})
        AND (NOT EXISTS(SELECT 1 FROM pos_point_users_tbl x WHERE x.pos_point_id=p.id) OR EXISTS(SELECT 1 FROM pos_point_users_tbl x WHERE x.pos_point_id=p.id AND x.user_id=${userId}))
      ORDER BY p.name
    `
    if (request.nextUrl.searchParams.get("meta") !== "1") return NextResponse.json({points})
    const [branches,warehouses,currencies,books,accounts,users,priceCategories]=await Promise.all([
      sql`SELECT id,branch_code code,branch_name name FROM branches WHERE COALESCE(status,1)<>3 ORDER BY branch_name`,
      sql`SELECT id,warehouse_code code,warehouse_name name FROM warehouses WHERE COALESCE(status,1)<>3 ORDER BY warehouse_name`,
      sql`SELECT id,currency_code code,currency_name name FROM currency WHERE COALESCE(is_active,true) ORDER BY id`,
      sql`SELECT id,name FROM voucher_books_tbl ORDER BY name`,
      sql`SELECT id,code,name,currency_id FROM account_tbl WHERE COALESCE(status,1)<>3 ORDER BY code LIMIT 10000`,
      sql`SELECT user_id,COALESCE(NULLIF(full_name,''),NULLIF(username,''),user_id::text) name FROM user_settings ORDER BY user_id`,
      sql`SELECT id,name FROM pricecategory WHERE COALESCE(status,1)=1 ORDER BY id`,
    ])
    return NextResponse.json({points,meta:{branches,warehouses,currencies,books,accounts,users,priceCategories}})
  } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:"تعذر تحميل نقاط البيع"},{status:500}) }
}

async function saveUsers(pointId:number, users:any[]) {
  await sql`DELETE FROM pos_point_users_tbl WHERE pos_point_id=${pointId}`
  for (const row of users || []) {
    const userId=String(row?.user_id || row || "").trim(); if(!userId) continue
    await sql`INSERT INTO pos_point_users_tbl(pos_point_id,user_id,is_default) VALUES(${pointId},${userId},${Boolean(row?.is_default)}) ON CONFLICT(pos_point_id,user_id) DO UPDATE SET is_default=EXCLUDED.is_default`
  }
}

export async function POST(request:NextRequest) {
  try { await ensureVoucherTables(); await ensurePosTables(); const data=await request.json(); const error=await validate(data); if(error)return NextResponse.json({error},{status:400})
    const duplicate=await sql`SELECT id FROM pos_points_tbl WHERE UPPER(code)=UPPER(${String(data.code).trim()}) AND status<>3`; if(duplicate[0])return NextResponse.json({error:"رمز نقطة البيع مستخدم"},{status:400})
    const rows=await sql`INSERT INTO pos_points_tbl(code,name,branch_id,main_warehouse_id,currency_id,sales_book_id,return_book_id,cash_account_id,card_account_id,cheque_account_id,receivable_account_id,gift_account_id,walk_in_account_id,tax_account_id,price_category_id,tax_percent,max_discount_percent,allow_offline,allow_returns,allow_gifts,status) VALUES(${String(data.code).trim().toUpperCase()},${String(data.name).trim()},${Number(data.branch_id)},${Number(data.main_warehouse_id)},${Number(data.currency_id)},${Number(data.sales_book_id)},${optionalId(data.return_book_id)},${Number(data.cash_account_id)},${optionalId(data.card_account_id)},${optionalId(data.cheque_account_id)},${optionalId(data.receivable_account_id)},${optionalId(data.gift_account_id)},${optionalId(data.walk_in_account_id)},${optionalId(data.tax_account_id)},${Number(data.price_category_id||1)},${Number(data.tax_percent||0)},${Number(data.max_discount_percent??100)},${bool(data.allow_offline,true)},${bool(data.allow_returns,true)},${bool(data.allow_gifts,true)},1) RETURNING *`
    await saveUsers(Number(rows[0].id),data.users); return NextResponse.json(rows[0],{status:201})
  } catch(error){return NextResponse.json({error:error instanceof Error?error.message:"تعذر حفظ نقطة البيع"},{status:500})}
}

export async function PUT(request:NextRequest) {
  try { await ensureVoucherTables(); await ensurePosTables(); const data=await request.json(),id=Number(data.id); if(!id)return NextResponse.json({error:"معرف نقطة البيع مطلوب"},{status:400}); if(Number(data.status)===3){await sql`UPDATE pos_points_tbl SET status=3,updated_at=NOW() WHERE id=${id}`;return NextResponse.json({success:true})}
    const error=await validate(data); if(error)return NextResponse.json({error},{status:400}); const duplicate=await sql`SELECT id FROM pos_points_tbl WHERE id<>${id} AND UPPER(code)=UPPER(${String(data.code).trim()}) AND status<>3`;if(duplicate[0])return NextResponse.json({error:"رمز نقطة البيع مستخدم"},{status:400})
    const rows=await sql`UPDATE pos_points_tbl SET code=${String(data.code).trim().toUpperCase()},name=${String(data.name).trim()},branch_id=${Number(data.branch_id)},main_warehouse_id=${Number(data.main_warehouse_id)},currency_id=${Number(data.currency_id)},sales_book_id=${Number(data.sales_book_id)},return_book_id=${optionalId(data.return_book_id)},cash_account_id=${Number(data.cash_account_id)},card_account_id=${optionalId(data.card_account_id)},cheque_account_id=${optionalId(data.cheque_account_id)},receivable_account_id=${optionalId(data.receivable_account_id)},gift_account_id=${optionalId(data.gift_account_id)},walk_in_account_id=${optionalId(data.walk_in_account_id)},tax_account_id=${optionalId(data.tax_account_id)},price_category_id=${Number(data.price_category_id||1)},tax_percent=${Number(data.tax_percent||0)},max_discount_percent=${Number(data.max_discount_percent??100)},allow_offline=${bool(data.allow_offline,true)},allow_returns=${bool(data.allow_returns,true)},allow_gifts=${bool(data.allow_gifts,true)},updated_at=NOW() WHERE id=${id} AND status<>3 RETURNING *`;if(!rows[0])return NextResponse.json({error:"نقطة البيع غير موجودة"},{status:404});await saveUsers(id,data.users);return NextResponse.json(rows[0])
  } catch(error){return NextResponse.json({error:error instanceof Error?error.message:"تعذر تحديث نقطة البيع"},{status:500})}
}
