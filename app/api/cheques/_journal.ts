import sql from "@/lib/database"
import {
  JournalDefaultsError,
  accountDefaultCostCenters,
  nextJournalVoucherCode,
  resolveUserDefaultJournalBook,
} from "@/lib/journal-defaults"
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

// الدفتر الافتراضي للمستخدم على سند القيد — نفس قاعدة كل القيود الآلية (lib/journal-defaults.ts).
async function resolveChequeJournalBook(userId: string) {
  try {
    return await resolveUserDefaultJournalBook(userId)
  } catch (error) {
    if (error instanceof JournalDefaultsError) return { error: error.message }
    throw error
  }
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
  const book=await resolveChequeJournalBook(input.userId)
  if("error" in book)return {ok:false,error:book.error}
  // مراكز التكلفة الافتراضية لحساب كل سطر
  const costCenters=await accountDefaultCostCenters(accountIds)
  const journalRows=lines.map((line,index)=>({journal_type_id:JOURNAL_TYPE_COUNTER_ACCOUNT,account_id:line.accountId,credit_debit:line.creditDebit,amount:line.amount,note:line.note.slice(0,70),cost_centers:costCenters.get(line.accountId)||[],order_no:index+1,currency_id:line.currencyId,rate:line.rate,base_curr_amount:Math.round(line.amount*line.rate*100)/100}))
  const currencyError=await validateJournalAccountCurrencies(journalRows,input.currencyId)
  if(currencyError)return {ok:false,error:currencyError}
  const code=await nextJournalVoucherCode(book)
  const voucher=(await sql`INSERT INTO voucher_header_tbl(vch_type,vch_code,vch_date,vch_book_id,branch_id,currency_id,rate,amount,note,status,vch_status,is_printed,insert_user,update_user) VALUES(3,${code},${input.operationDate},${book.bookId},${input.branchId},${input.currencyId},${input.rate||1},${debit},${input.note.slice(0,1000)},2,2,0,${book.userSettingId},${book.userSettingId}) RETURNING id,vch_code`)[0]
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

  const book = await resolveChequeJournalBook(input.userId)
  if ("error" in book) return { ok:false,error:book.error }
  // مراكز التكلفة الافتراضية لكل من الحسابين المدين والدائن
  const costCenters = await accountDefaultCostCenters([input.debitAccountId,input.creditAccountId])

  const rate = input.rate > 0 ? input.rate : 1
  const rows = [
    {
      journal_type_id:JOURNAL_TYPE_COUNTER_ACCOUNT,
      account_id:input.debitAccountId,
      credit_debit:1,
      amount:input.amount,
      note:`${input.operationName} - شيك ${input.chequeNumber}`.slice(0,70),
      cost_centers:costCenters.get(input.debitAccountId) || [],
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
      cost_centers:costCenters.get(input.creditAccountId) || [],
      order_no:2,
      currency_id:input.currencyId,
      rate,
      base_curr_amount:Math.round(input.amount * rate * 100) / 100,
    },
  ]
  const currencyError = await validateJournalAccountCurrencies(rows,input.currencyId)
  if (currencyError) return { ok:false,error:currencyError }

  const code = await nextJournalVoucherCode(book)
  const fullNote = (input.note || `${input.operationName} للشيك رقم ${input.chequeNumber}`).slice(0,1000)
  const voucher = (await sql`
    INSERT INTO voucher_header_tbl(
      vch_type,vch_code,vch_date,vch_book_id,branch_id,currency_id,rate,amount,note,
      status,vch_status,is_printed,insert_user,update_user
    ) VALUES(
      3,${code},${input.operationDate},${book.bookId},${input.branchId},${input.currencyId},${rate},${input.amount},${fullNote},
      2,2,0,${book.userSettingId},${book.userSettingId}
    ) RETURNING id,vch_code
  `)[0]
  await saveJournalRows(Number(voucher.id),rows)
  return { ok:true,id:Number(voucher.id),code:String(voucher.vch_code) }
}
