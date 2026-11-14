import type { MigrationRun, StepContext } from "@/lib/shamel-migration/core"
import * as defs from "@/lib/shamel-migration/definitions"
import { processAccountBalances, processStockBalances } from "@/lib/shamel-migration/balances"
import { SHAMEL_VOUCHER_TYPES, processVoucherItems, processVoucherLines, voucherItemsSql, voucherLinesSql } from "@/lib/shamel-migration/vouchers"

// خطوات الترحيل بالترتيب: لكل خطوة استعلام Pervasive SQL ينفّذه معالج الترحيل على جهاز العميل (الأسماء المستعارة
// هي ما تقرؤه المعالجات) وحجم الدفعة. الاستعلامات هنا لا في البرنامج — تصحيحها يصل للعملاء مع تحديث الموقع.

type Row = Record<string, unknown>

export type MigrationStep = {
  key: string
  title: string
  group: "definitions" | "balances" | "vouchers"
  batchSize: number
  sql: (run: MigrationRun) => string
  process: (rows: Row[], ctx: StepContext, last: boolean) => Promise<void>
}

const yearsAgo = (years: number) => {
  const day = new Date()
  day.setFullYear(day.getFullYear() - years)
  return day.toISOString().slice(0, 10)
}

const STEPS: MigrationStep[] = [
  {
    key: "lookups", title: "القوائم المساعدة (المدن، التصنيفات، فئات الأسعار، أنواع مراكز التكلفة)", group: "definitions", batchSize: 2000,
    sql: () => `select "Typefile" as typefile, "Pos" as pos, "Names" as names from "multifl" where "Typefile" in (43,59,74,81,93) and "Pos" >= 0`,
    process: (rows, ctx) => defs.processLookups(rows, ctx),
  },
  {
    key: "currencies", title: "العملات", group: "definitions", batchSize: 200,
    sql: () => `select "Curr" as code, "Currency name" as name, "Pos" as pos, "Division" as unit_name, "Units" as units from "currency" order by "Pos"`,
    process: (rows, ctx) => defs.processCurrencies(rows, ctx),
  },
  {
    key: "rates", title: "أسعار الصرف", group: "definitions", batchSize: 1000,
    // التعريفات فقط: آخر سنة تكفي لتقييم الأرصدة؛ مع السندات: من سنتين
    sql: (run) => `select "Currency" as currency_code, "Date" as rate_date, "Rate" as rate, "Sale Rate" as sale_rate, "Purch. Rate" as purchase_rate
      from "rates" where "Date" >= '${run.mode === "full" ? yearsAgo(2) : yearsAgo(1)}' order by "Date"`,
    process: (rows, ctx) => defs.processRates(rows, ctx),
  },
  {
    key: "stores", title: "المستودعات", group: "definitions", batchSize: 500,
    sql: () => `select "Pos" as pos, max(case when "Typefile"=52 then "Names" end) as name, max(case when "Typefile"=2 then "Names" end) as name_lang2
      from "multifl" where "Typefile" in (52,2) and "Pos" >= 0 group by "Pos"`,
    process: (rows, ctx) => defs.processStores(rows, ctx),
  },
  {
    key: "cost_centers", title: "مراكز التكلفة", group: "definitions", batchSize: 500,
    sql: () => `select c."code" as code, c."Father" as father_code, c."Name" as name, c."fin_list" as costcenter_type, c."level" as level_no, c."Stoped" as stoped
      from "costcent" c order by c."level", c."code"`,
    process: (rows, ctx) => defs.processCostCenters(rows, ctx),
  },
  {
    key: "accounts", title: "دليل الحسابات", group: "definitions", batchSize: 300,
    sql: () => `select a."AccountNumber" as code, a."AccountFather" as father_code, a."AccountName" as name, a."level" as level_no,
      a."finlist" as finanical_list_id, a."Curr" as currency_code, a."Users" as max_balance_amount, a."allowforigncurr" as allow_trans_with_diff_curr,
      (if(a."CurrDeff"=1,'true','false')) as iscalc_curr_diff_rates_str, a."date" as insert_date,
      (select name from "enamefl" where type=4 and backup=0 and code=a."AccountNumber") as name_lang2
      from "accounts" a where a.attr=1 order by a."level", a."AccountNumber"`,
    process: (rows, ctx) => defs.processAccounts(rows, ctx),
  },
  {
    key: "salesmen", title: "المندوبون", group: "definitions", batchSize: 300,
    sql: () => `select s."ManID" as code, s."Name" as name, s."Phone" as phone, s."Jop" as job, s."Remark1" as note1, s."Remark2" as note2,
      s."Comission" as commission1, s."Comission2" as commission2,
      substring(concat(rtrim(s."Street"),concat(' ',concat(rtrim(s."Town"),concat(' ',rtrim(s."City"))))),1,70) as address,
      (select name from "enamefl" where type=12 and backup=0 and code=s."ManID") as name_lang2
      from "salesmen" s`,
    process: (rows, ctx) => defs.processSalesmen(rows, ctx),
  },
  {
    key: "customers", title: "العملاء والموردون والمشتركون (وحسابات الموظفين)", group: "definitions", batchSize: 200,
    sql: () => `select c."Code" as code, c."Com_name" as name, c."Phone1" as phone, c."Phone2" as phone2, c."Phone3" as phone3,
      c."ID_Number" as id_no, c."ToWork" as business_description, c."Sl_code" as salesman_code, c."City" as city_pos,
      c."Price Class" as priceclass_pos, c."VAT_reg" as vat_registration_no, c."Attr" as type_pos, c."stopped" as stopped,
      case when c."Date">'1990-01-01' then c."Date" else '1990-01-01' end as entry_date_,
      ci."Cr_limit" as debt_max_amount,
      acc."AccountFather" as father_code, acc."AccountName" as account_name, acc."Curr" as currency_code,
      acc."allowforigncurr" as allow_trans_with_diff_curr, acc."CurrDeff" as iscalc_curr_diff_rates_asint,
      (select name from "enamefl" where type=0 and backup=0 and code=c."Code") as name_lang2,
      substring(concat(rtrim(c."Street1"),concat(' ',rtrim(c."Street2"))),1,70) as address,
      substring(concat(rtrim(c."Remark1"),concat(' ',rtrim(c."Remark2"))),1,200) as displayed_note
      from "customer" c
      left join "csinfo" ci on c."Code"=ci."Code"
      left join "accounts" acc on acc."AccountNumber"=c."Code"
      order by acc."level", c."Code"`,
    process: (rows, ctx) => defs.processCustomers(rows, ctx),
  },
  {
    key: "banks", title: "البنوك", group: "definitions", batchSize: 500,
    sql: () => `select b."Code" as code, b."Name" as name, (select name from "enamefl" where type=2 and backup=0 and code=b."Code") as name_lang2 from "banks" b order by b."Code"`,
    process: (rows, ctx) => defs.processBanks(rows, ctx),
  },
  {
    key: "bank_branches", title: "فروع البنوك", group: "definitions", batchSize: 500,
    sql: () => `select br."Code" as branch_code, br."Bank ID" as bank_code, br."Branch ID" as code, br."Name" as name, br."Maneger" as manager_name,
      br.stopped as is_stopped, br."Phone 1" as phone, substring(concat(rtrim(br."Street"),concat(' ',rtrim(br."Town"))),1,70) as address
      from "branches" br order by br."Bank ID", br."Code"`,
    process: (rows, ctx) => defs.processBankBranches(rows, ctx),
  },
  {
    key: "bank_accounts", title: "الحسابات البنكية", group: "definitions", batchSize: 300,
    sql: () => `select bac."Acnum" as code, concat(bac."Bnk_code",bac."Brn_code") as branche_code, bac."Notes1" as name, bac."Note2" as notes,
      bac."Bankacc" as jary_account_code, bac."Postacc" as tahsil_account_code, bac."Comacc" as tahsil_commission_account_code,
      bac."Paycheqacc" as payed_checks_account_code, bac."Curr" as currency_code, bac."Retrate" as returned_checks_commission,
      bac."Comrate" as tahsil_checks_commission, bac."Retcurr" as returned_checks_commission_currency_code,
      bac."Comcurr" as tahsil_checks_commission_currency_code, bac."IPan" as iban, bac."Stopped" as is_stopped, bac."ActualACnum" as actual_bank_code,
      (select name from "enamefl" en where en.type=3 and en.backup=0 and en.code=left(bac."acnum",8)) as name_lang2
      from "bankaccs" bac`,
    process: (rows, ctx) => defs.processBankAccounts(rows, ctx),
  },
  {
    key: "item_groups", title: "مجموعات الأصناف", group: "definitions", batchSize: 500,
    sql: () => `select ms."M.Stock ID" as code, ms."Father" as father_code, ms."Name" as name, ms."Level" as level_no from "mstock" ms order by ms."Level", ms."M.Stock ID"`,
    process: (rows, ctx) => defs.processItemGroups(rows, ctx),
  },
  {
    key: "items", title: "الأصناف والوحدات والأسعار", group: "definitions", batchSize: 150,
    sql: () => `select s."StockID" as code, s."Father" as mainstock_code, s."Name" as name, s."Type" as item_type, s."QntyType" as service_type,
      s."Unit 1" as unit1_name, s."Unit 2" as unit2_name, s."Unit 3" as unit3_name, s."Unit 4" as unit4_name, s."Unit 5" as unit5_name, s."Unit 6" as unit6_name,
      s."Count2" as unit2_relation, s."Count3" as unit3_relation, s."Count4" as unit4_relation, s."Count5" as unit5_relation, s."Count6" as unit6_relation,
      s."Market price" as market_purchase_price, s."SalePrice1" as sales_price1, s."SalePrice2" as sales_price2, s."SalePrice3" as sales_price3,
      s."SalePrice4" as sales_price4, s."SalePrice5" as sales_price5, s."SalePrice6" as sales_price6,
      s."BCurr" as cost_purchase_currency_code, s."SP_Curr1" as sales_price1_curr_code, s."SP_Curr2" as sales_price2_curr_code, s."SP_Curr3" as sales_price3_curr_code,
      s."SP_Curr4" as sales_price4_curr_code, s."Sp_Curr5" as sales_price5_curr_code, s."SP_Curr6" as sales_price6_curr_code,
      s."Cr_Code" as selling_account_code, s."Dr_Code" as purchase_account_code, s."Pr_Code" as production_account_code,
      s."RS_Code" as selling_returns_account_code, s."RP_Code" as purchase_returns_account_code, s."Exp_Code" as stock_end_account_code,
      s."BValCode" as stock_start_account_code, s."BarCode" as barcode, s."VATrate" as vat_rate, s."Discount rate" as discount_rate,
      s."Trademark" as trademark1, s."Trademark2" as trademark2, s."Discontinued" as item_availability_status_pos, s."Has expiry" as has_expiry_,
      case when s."LastBurchase">'1990-01-01' then s."LastBurchase" else '1990-01-01' end as last_purchase_price_date,
      s."OrgCode" as part_no, s."FactoryCode" as oem, s."BackDbl2" as density, s."BackDbl3" as last_purchase_price, s."hasserial" as has_serial_,
      s."Length" as length, s."Width" as width, s."Height" as height,
      s."UCurr2" as unit2_curr, s."UCurr3" as unit3_curr, s."UCurr4" as unit4_curr, s."UCurr5" as unit5_curr, s."UCurr6" as unit6_curr,
      s."UPrice2" as unit2_price, s."UPrice3" as unit3_price, s."UPrice4" as unit4_price, s."UPrice5" as unit5_price, s."UPrice6" as unit6_price,
      (select name from "enamefl" en where en.type=10 and en.backup=0 and en.code=s."StockID") as name_lang2,
      (select names from "multifl" where typefile=18 and code = s."StockID" and pos=0) as note1,
      (select names from "multifl" where typefile=18 and code = s."StockID" and pos=1) as note2
      from "stock" s where s."Type"<7 order by s."StockID"`,
    process: (rows, ctx) => defs.processItems(rows, ctx),
  },
  {
    key: "item_barcodes", title: "باركودات الوحدات", group: "definitions", batchSize: 1000,
    sql: () => `select "Code" as code, "Barcode" as barcode, "num" as pos from "units" where ltrim("Barcode")<>''`,
    process: (rows, ctx) => defs.processItemBarcodes(rows, ctx),
  },
  {
    key: "account_balances", title: "الأرصدة الافتتاحية للحسابات (سند قيد)", group: "balances", batchSize: 2000,
    sql: () => `select "Code" as code, "Currency" as balance_currency, "Start Balance" as start_balance, "Current Balance" as current_balance
      from "balances" where "Start Balance"<>0 or "Current Balance"<>0`,
    process: (rows, ctx, last) => processAccountBalances(rows, ctx, last),
  },
  {
    key: "stock_balances", title: "كميات أول المدة (سند ادخال/اخراج بضاعة)", group: "balances", batchSize: 2000,
    sql: () => `select si."Code" as code, si."Store" as store_pos, sum(si."St Qnty") as start_balance, sum(si."Qnty") as qnty, max(s."Market price") as cost
      from "sitems" si inner join "stock" s on s."StockID"=si."Code" where s."Type"<6 group by si."Code", si."Store"`,
    process: (rows, ctx, last) => processStockBalances(rows, ctx, last),
  },
  {
    key: "voucher_items", title: "أسطر أصناف السندات (قراءة)", group: "vouchers", batchSize: 2000,
    sql: (run) => voucherItemsSql(run),
    process: (rows, ctx) => processVoucherItems(rows, ctx),
  },
  {
    key: "vouchers", title: "السندات المختارة", group: "vouchers", batchSize: 400,
    sql: (run) => voucherLinesSql(run),
    process: (rows, ctx, last) => processVoucherLines(rows, ctx, last),
  },
]

export function stepsForRun(run: MigrationRun): MigrationStep[] {
  return STEPS.filter((step) => step.group !== "vouchers" || (run.mode === "full" && run.voucher_types.length > 0))
}

export const findStep = (key: string) => STEPS.find((step) => step.key === key) || null
export { SHAMEL_VOUCHER_TYPES }
