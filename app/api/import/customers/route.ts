import { type NextRequest, NextResponse } from "next/server"
import { generateCustomerNumber } from "@/lib/number-generator"
import sql from "@/lib/database"
import { ensureCustomerAccount, resolveAccountType, toNullableInt, ensureCustomerCompatibilityColumns } from "@/app/api/customers/_lib"

const normalizeImportedCode = (rawValue: unknown, prefix = "C") => {
  const cleaned = String(rawValue ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (!cleaned) return ""

  if (prefix) {
    const prefixValue = String(prefix).trim().toUpperCase()
    const numericPart = cleaned.replace(/[^0-9]/g, "")
    const maxDigits = Math.max(0, 10 - prefixValue.length)
    const digits = numericPart.slice(0, maxDigits).padEnd(maxDigits, "0")
    return `${prefixValue}${digits}`.slice(0, 10)
  }

  return cleaned.slice(0, 10).padEnd(10, "0")
}

export async function POST(request: NextRequest) {
  try {
    await ensureCustomerCompatibilityColumns()
    const { data } = await request.json()

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: "لا توجد بيانات للاستيراد" }, { status: 400 })
    }

    let success = 0;
    let failed = 0;
    let duplicates = 0;
    const errors: string[] = [];

    for (const item of data) {
      try {
        const rowIndex = item.rowIndex || data.indexOf(item) + 1;

        // Skip invalid records
        if (!item.isValid) {
          errors.push(`السطر ${rowIndex}: بيانات غير صالحة`);
          failed++;
          continue;
        }

        // Required field check
        if (!item.customer_name) {
          errors.push(`السطر ${rowIndex}: اسم العميل مطلوب`);
          failed++;
          continue;
        }

        // Determine type: 1 = customer, 2 = supplier
        const type = item.type || 1;

        // Generate customer code if not provided and normalize imported values to the same 10-digit format
        let customerCode = normalizeImportedCode(item.customer_code, "C");
        if (!customerCode) {
          customerCode = await generateCustomerNumber();
        }

        // Check for duplicates
        const existing = await sql`
      SELECT id FROM customers WHERE customer_code = ${customerCode}
    `;
        if (existing.length > 0) {
          duplicates++;
          continue;
        }

        // كل عميل/مورد/مشترك مستورَد يحتاج حساباً مرتبطاً في account_tbl تماماً كما يحصل عند
        // الإنشاء اليدوي عبر /api/customers — بلا هذا الربط كان الاستيراد الجماعي يترك العميل
        // بلا حساب محاسبي أصلاً (account_id فارغ)، خلافاً لما يحدث عند الإدخال اليدوي.
        const accountType = resolveAccountType(type)
        const accountId = await ensureCustomerAccount({
          code: customerCode,
          name: item.name || item.customer_name,
          currencyId: toNullableInt(item.currency_id) ?? 1,
          allowTransWithDiffCurr: item.allow_trans_with_diff_curr ?? 0,
          isCalcCurrDiffRates: item.iscalc_curr_diff_rates ?? false,
          fatherId: toNullableInt(item.father_id),
          levelNo: Number(item.level_no) || 1,
          accountType,
        })

        // Insert into customers table
        const result = await sql`
      INSERT INTO customers (
        customer_code,
        name,
        mobile1,
        mobile2,
        whatsapp1,
        whatsapp2,
        city,
        address,
        email,
        status,
        business_nature,
        salesman,
        classification,
        registration_date,
        transaction_notes,
        general_notes,
        api_key,
        type,
        isDeleted,
        priceCategory,
        account_id
      ) VALUES (
        ${customerCode},
        ${item.name || item.customer_name},
        ${item.mobile1 || null},
        ${item.mobile2 || null},
        ${item.whatsapp1 || null},
        ${item.whatsapp2 || null},
        ${item.city || null},
        ${item.address || null},
        ${item.email || null},
        ${item.status || 'نشط'},
        ${item.business_nature || null},
        ${item.salesman || null},
        ${item.classification || null},
        ${item.registration_date || new Date().toISOString().split('T')[0]},
        ${item.transaction_notes || null},
        ${item.general_notes || null},
        ${item.api_key || `API_${customerCode}_${Date.now()}`},
        ${type},
        ${item.isDeleted || false},
        ${Number(item.pricecategory) || Number(item.priceCategory) || 0},
        ${accountId}
      )
      RETURNING *;
    `;

        success++;
      } catch (error: any) {
        const rowIndex = item.rowIndex || data.indexOf(item) + 1;
        errors.push(`السطر ${rowIndex}: ${error.message}`);
        failed++;
        console.error(`Error importing customer ${item.customer_name}:`, error);
      }
    }

    // Now you have { success, failed, duplicates, errors } to return or use


    return NextResponse.json({
      success,
      failed,
      duplicates,
      errors: errors.slice(0, 10),
    })
  } catch (error) {
    console.error("Error importing customers:", error)
    return NextResponse.json({ error: "خطأ في استيراد العملاء" }, { status: 500 })
  }
}



