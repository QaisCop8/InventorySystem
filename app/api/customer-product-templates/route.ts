import { NextRequest, NextResponse } from "next/server"
import sql, { getTenantPool } from "@/lib/database"
import { ensureCustomerProductTemplateTables } from "@/lib/customer-product-templates"

const fullSelect = `SELECT t.*,COALESCE((SELECT json_agg(c.account_id ORDER BY c.account_id) FROM customer_product_template_customers_tbl c WHERE c.template_id=t.id),'[]') customer_ids,COALESCE((SELECT json_agg(p.product_id ORDER BY p.product_id) FROM customer_product_template_products_tbl p WHERE p.template_id=t.id),'[]') product_ids FROM customer_product_templates_tbl t`
const validate = (d:any) => {
  if (!String(d.template_code||"").trim() || !String(d.name_ar||"").trim() || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.start_date||""))) return "الكود والاسم العربي وتاريخ البداية مطلوبة"
  if (d.end_date && String(d.end_date)<String(d.start_date)) return "تاريخ النهاية لا يمكن أن يسبق تاريخ البداية"
  if (!Array.isArray(d.customer_ids)||!d.customer_ids.length) return "يجب اختيار عميل واحد على الأقل"
  if (!Array.isArray(d.product_ids)||!d.product_ids.length) return "يجب اختيار صنف واحد على الأقل"
  return ""
}

export async function GET(request:NextRequest){
  try { await ensureCustomerProductTemplateTables(); const code=request.nextUrl.searchParams.get("code")?.trim(); const nav=request.nextUrl.searchParams.get("navigation"); const current=Number(request.nextUrl.searchParams.get("currentId")||0)
    if(request.nextUrl.searchParams.get("generate")==="1"){const rows:any[]=await sql`SELECT COALESCE(MAX(id),0)+1 next FROM customer_product_templates_tbl`;return NextResponse.json({code:`CPT${String(rows[0].next).padStart(7,"0")}`})}
    if(request.nextUrl.searchParams.get("lookup")==="1"){
      const [templates,customers,products]=await Promise.all([
        sql.unsafe(`${fullSelect} WHERE t.status<>3 ORDER BY t.id DESC`),
        sql`SELECT id,code AS account_code,name AS account_name FROM account_tbl WHERE type=2 AND COALESCE(status,1) IN (1,2) ORDER BY code`,
        sql`SELECT id,product_code,product_name,barcode FROM products WHERE COALESCE(status,1)<>3 AND COALESCE(type,1)=1 ORDER BY product_code`,
      ])
      return NextResponse.json({templates,customers,products})
    }
    let where="WHERE t.status<>3",order="ORDER BY t.id DESC",params:any[]=[]
    if(code){where="WHERE UPPER(t.template_code)=UPPER($1) AND t.status<>3";params=[code]}
    else if(nav==="first"){order="ORDER BY t.id ASC LIMIT 1"}else if(nav==="last"){order="ORDER BY t.id DESC LIMIT 1"}else if(nav==="previous"){where="WHERE t.status<>3 AND t.id<$1";params=[current];order="ORDER BY t.id DESC LIMIT 1"}else if(nav==="next"){where="WHERE t.status<>3 AND t.id>$1";params=[current];order="ORDER BY t.id ASC LIMIT 1"}
    const rows=await sql.unsafe(`${fullSelect} ${where} ${order}`,params); if((code||nav)&&!rows.length)return NextResponse.json({error:"القالب غير موجود"},{status:404}); return NextResponse.json(code||nav?rows[0]:rows)
  }catch(e:any){return NextResponse.json({error:e.message},{status:500})}
}

export async function POST(request:NextRequest){let client:any;try{await ensureCustomerProductTemplateTables();const d=await request.json(),error=validate({...d,template_code:d.template_code||"generated"});if(error)return NextResponse.json({error},{status:400});client=await(await getTenantPool()).connect();await client.query("BEGIN");const duplicate=await client.query("SELECT id FROM customer_product_templates_tbl WHERE status<>3 AND LOWER(TRIM(name_ar))=LOWER(TRIM($1))",[String(d.name_ar).trim()]);if(duplicate.rowCount)throw new Error("اسم القالب مستخدم مسبقاً");const customers=await client.query("SELECT id FROM account_tbl WHERE id=ANY($1::int[]) AND type=2 AND COALESCE(status,1) IN (1,2)",[d.customer_ids.map(Number)]);if(customers.rowCount!==new Set(d.customer_ids.map(Number)).size)throw new Error("يوجد حساب عميل غير صالح");const products=await client.query("SELECT id FROM products WHERE id=ANY($1::int[]) AND COALESCE(status,1)<>3",[d.product_ids.map(Number)]);if(products.rowCount!==new Set(d.product_ids.map(Number)).size)throw new Error("يوجد صنف غير صالح");const next=await client.query("SELECT nextval(pg_get_serial_sequence('customer_product_templates_tbl','id'))::int id");const newId=Number(next.rows[0].id),generatedCode=`CPT${String(newId).padStart(7,"0")}`;const saved=await client.query("INSERT INTO customer_product_templates_tbl(id,template_code,name_ar,name_en,start_date,end_date,status,notes) VALUES($1,$2,$3,$4,$5,$6,1,$7) RETURNING *",[newId,generatedCode,String(d.name_ar).trim(),String(d.name_en||"").trim()||null,d.start_date,d.end_date||null,d.notes||null]);for(const id of new Set(d.customer_ids.map(Number)))await client.query("INSERT INTO customer_product_template_customers_tbl(template_id,account_id) VALUES($1,$2)",[saved.rows[0].id,id]);for(const id of new Set(d.product_ids.map(Number)))await client.query("INSERT INTO customer_product_template_products_tbl(template_id,product_id) VALUES($1,$2)",[saved.rows[0].id,id]);await client.query("COMMIT");return NextResponse.json(saved.rows[0],{status:201})}catch(e:any){if(client)await client.query("ROLLBACK").catch(()=>{});return NextResponse.json({error:e.message},{status:e.message?.includes("مسبقاً")||e.message?.includes("غير صالح")?400:500})}finally{client?.release()}}
