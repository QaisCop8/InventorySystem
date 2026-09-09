import sql from "@/lib/database"
import { buildVoucherCode } from "@/lib/voucher-code"
import {
  JOURNAL_TYPE_COUNTER_ACCOUNT,
  saveJournalRows,
  validateJournalAccountCurrencies,
} from "@/app/api/journal-vouchers/_lib"

type CreateChequeJournalInput = {
  userId: string
  branchId: number
  chequeNumber: string
  operationName: string
  operationDate: string
  debitAccountId: number
  creditAccountId: number
  amount: number
  currencyId: number | null
  rate: number
  note: string
}

export type ChequeJournalResult =
  | { ok: true; id: number; code: string }
  | { ok: false; error: string }

type BulkJournalLine = {
  accountId:number
  creditDebit:1|2
  amount:number
  currencyId:number|null
  rate:number
  note:string
}

export async function createChequeBulkOperationJournal(input:{
  userId:string;branchId:number;operationName:string;operationDate:string;currencyId:number|null;
  rate:number;note:string;lines:BulkJournalLine[]
}):Promise<ChequeJournalResult>{
  const lines=input.lines.filter(line=>line.accountId&&line.amount>0)
  const debit=Math.round(lines.filter(x=>x.creditDebit===1).reduce((s,x)=>s+x.amount,0)*100)/100
  const credit=Math.round(lines.filter(x=>x.creditDebit===2).reduce((s,x)=>s+x.amount,0)*100)/100
  if(!lines.length||Math.abs(debit-credit)>.009)return {ok:false,error:"قيد عملية الشيكات الجماعية غير متوازن"}
  const accountIds=Array.from(new Set(lines.map(x=>x.accountId)))
  const accounts=await sql`SELECT id FROM account_tbl WHERE id=ANY(${accountIds}::int[]) AND COALESCE(status,1)<>3`
  if(accounts.length!==accountIds.length)return {ok:false,error:"أحد حسابات القيد غير موجود أو غير فعال"}
  const userSetting=(await sql`SELECT id FROM user_settings WHERE user_id=${input.userId} LIMIT 1`)[0]
  if(!userSetting?.id)return {ok:false,error:"تعذر تحديد المستخدم المنفذ لعملية الشيكات"}
  const book=(await sql`SELECT p.vch_book_id,b.name FROM voucher_book_user_permissions_tbl p JOIN voucher_books_tbl b ON b.id=p.vch_book_id WHERE p.user_id=${Number(userSetting.id)} AND p.voucher_type_id=3 ORDER BY COALESCE(p.is_default,0) DESC,p.vch_book_id LIMIT 1`)[0]
  if(!book?.vch_book_id)return {ok:false,error:"يجب تعيين دفتر افتراضي لسند القيد للمستخدم"}
  const journalRows=lines.map((line,index)=>({journal_type_id:JOURNAL_TYPE_COUNTER_ACCOUNT,account_id:line.accountId,credit_debit:line.creditDebit,amount:line.amount,note:line.note.slice(0,70),cost_centers:[],order_no:index+1,currency_id:line.currencyId,rate:line.rate,base_curr_amount:Math.round(line.amount*line.rate*100)/100}))
  const currencyError=await validateJournalAccountCurrencies(journalRows,input.currencyId)
  if(currencyError)return {ok:false,error:currencyError}
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`cheque-journal-number:${Number(book.vch_book_id)}`}))`
  const settings=await sql`SELECT id,value FROM system_settings WHERE id IN ('journal_prefix','journal_start')`
  const values=Object.fromEntries(settings.map((row:any)=>[row.id,row.value])),prefixValue=String(values.journal_prefix||"J").trim().toUpperCase(),prefix=/^[A-Z]{1,3}$/.test(prefixValue)?prefixValue:"J",start=Math.max(1,Number(values.journal_start)||1),codePrefix=`${prefix}${String(book.name||"").trim().toUpperCase()}`
  const existing=await sql`SELECT vch_code FROM voucher_header_tbl WHERE vch_type=3 AND vch_code LIKE ${codePrefix+"%"}`
  const maximum=existing.reduce((max:number,row:any)=>Math.max(max,Number(String(row.vch_code||"").slice(codePrefix.length).match(/(\d+)$/)?.[1]||0)),0)
  const code=buildVoucherCode(prefix,String(book.name),Math.max(start,maximum+1))
  const voucher=(await sql`INSERT INTO voucher_header_tbl(vch_type,vch_code,vch_date,vch_book_id,branch_id,currency_id,rate,amount,note,status,vch_status,is_printed,insert_user,update_user) VALUES(3,${code},${input.operationDate},${Number(book.vch_book_id)},${input.branchId},${input.currencyId},${input.rate||1},${debit},${input.note.slice(0,1000)},2,2,0,${Number(userSetting.id)},${Number(userSetting.id)}) RETURNING id,vch_code`)[0]
  await saveJournalRows(Number(voucher.id),journalRows)
  return {ok:true,id:Number(voucher.id),code:String(voucher.vch_code)}
}

export async function createChequeOperationJournal(input: CreateChequeJournalInput): Promise<ChequeJournalResult> {
  if (!(input.amount > 0)) return { ok:false,error:"قيمة الشيك يجب أن تكون أكبر من صفر" }
  if (!input.debitAccountId || !input.creditAccountId) {
    return { ok:false,error:"تعذر تحديد طرفي القيد المحاسبي لعملية الشيك" }
  }
  if (input.debitAccountId === input.creditAccountId) {
    return { ok:false,error:"لا يمكن تنفيذ العملية لأن الحساب المدين والدائن متطابقان" }
  }

  const accounts = await sql`
    SELECT id,code,name FROM account_tbl
    WHERE id=ANY(${[input.debitAccountId,input.creditAccountId]}::int[]) AND COALESCE(status,1)<>3
  `
  if (accounts.length !== 2) return { ok:false,error:"أحد حسابات قيد عملية الشيك غير موجود أو غير فعال" }

  const userSetting = (await sql`SELECT id FROM user_settings WHERE user_id=${input.userId} LIMIT 1`)[0]
  if (!userSetting?.id) return { ok:false,error:"تعذر تحديد المستخدم المنفذ لعملية الشيك" }

  const book = (await sql`
    SELECT permission.vch_book_id,book.name
    FROM voucher_book_user_permissions_tbl permission
    JOIN voucher_books_tbl book ON book.id=permission.vch_book_id
    WHERE permission.user_id=${Number(userSetting.id)} AND permission.voucher_type_id=3
    ORDER BY COALESCE(permission.is_default,0) DESC,permission.vch_book_id
    LIMIT 1
  `)[0]
  if (!book?.vch_book_id) {
    return { ok:false,error:"يجب تعيين دفتر افتراضي لسند القيد للمستخدم قبل تنفيذ عملية الشيك" }
  }

  const rate = input.rate > 0 ? input.rate : 1
  const rows = [
    {
      journal_type_id:JOURNAL_TYPE_COUNTER_ACCOUNT,
      account_id:input.debitAccountId,
      credit_debit:1,
      amount:input.amount,
      note:`${input.operationName} - شيك ${input.chequeNumber}`.slice(0,70),
      cost_centers:[],
      order_no:1,
      currency_id:input.currencyId,
      rate,
      base_curr_amount:Math.round(input.amount * rate * 100) / 100,
    },
    {
      journal_type_id:JOURNAL_TYPE_COUNTER_ACCOUNT,
      account_id:input.creditAccountId,
      credit_debit:2,
      amount:input.amount,
      note:`${input.operationName} - شيك ${input.chequeNumber}`.slice(0,70),
      cost_centers:[],
      order_no:2,
      currency_id:input.currencyId,
      rate,
      base_curr_amount:Math.round(input.amount * rate * 100) / 100,
    },
  ]
  const currencyError = await validateJournalAccountCurrencies(rows,input.currencyId)
  if (currencyError) return { ok:false,error:currencyError }

  const lockKey = `cheque-journal-number:${Number(book.vch_book_id)}`
  await sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`
  const settings = await sql`SELECT id,value FROM system_settings WHERE id IN ('journal_prefix','journal_start')`
  const values = Object.fromEntries(settings.map((row: any) => [row.id,row.value]))
  const prefixValue = String(values.journal_prefix || "J").trim().toUpperCase()
  const prefix = /^[A-Z]{1,3}$/.test(prefixValue) ? prefixValue : "J"
  const startNumber = Math.max(1,Number(values.journal_start) || 1)
  const codePrefix = `${prefix}${String(book.name || "").trim().toUpperCase()}`
  const existing = await sql`SELECT vch_code FROM voucher_header_tbl WHERE vch_type=3 AND vch_code LIKE ${codePrefix+"%"}`
  const maximum = existing.reduce((max: number,row: any) => {
    const suffix = String(row.vch_code || "").slice(codePrefix.length)
    return Math.max(max,Number(suffix.match(/(\d+)$/)?.[1] || 0))
  },0)
  const code = buildVoucherCode(prefix,String(book.name),Math.max(startNumber,maximum+1))
  const fullNote = (input.note || `${input.operationName} للشيك رقم ${input.chequeNumber}`).slice(0,1000)
  const voucher = (await sql`
    INSERT INTO voucher_header_tbl(
      vch_type,vch_code,vch_date,vch_book_id,branch_id,currency_id,rate,amount,note,
      status,vch_status,is_printed,insert_user,update_user
    ) VALUES(
      3,${code},${input.operationDate},${Number(book.vch_book_id)},${input.branchId},${input.currencyId},${rate},${input.amount},${fullNote},
      2,2,0,${Number(userSetting.id)},${Number(userSetting.id)}
    ) RETURNING id,vch_code
  `)[0]
  await saveJournalRows(Number(voucher.id),rows)
  return { ok:true,id:Number(voucher.id),code:String(voucher.vch_code) }
}
