import { type NextRequest, NextResponse } from "next/server"
import { generateCustomerNumber, getPrefixFromSettings } from "@/lib/number-generator"
import sql from "@/lib/database"
import { ensureCustomerAccount, resolveAccountType, resolveRequiredParentAccount, MissingParentAccountError, toNullableInt, ensureCustomerCompatibilityColumns } from "@/app/api/customers/_lib"
import { loadStoredSettings } from "@/app/api/settings/system/route"

const CODE_LENGTH = 10

// نفس منطق adjustCode في شاشة العملاء (components/products/customers.tsx): تبقى حروف البادئة كما
// كتبها المستخدم، وتُكمَّل الأرقام بأصفار من اليسار حتى 10 خانات (S0000029 -> S000000029).
// بادئة الإعدادات حسب النوع تُستخدم فقط إن كان الرقم بلا حروف أصلاً (29 -> C000000029 لعميل).
const normalizeImportedCode = (rawValue: unknown, defaultPrefix: string) => {
  const cleaned = String(rawValue ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (!cleaned) return ""

  const match = cleaned.match(/^([A-Z]*)(\d*)$/)
  if (!match) return cleaned // حروف بين الأرقام — يُترك كما هو

  const prefix = match[1] || String(defaultPrefix || "").trim().toUpperCase()
  const digits = match[2]
  return `${prefix}${digits.padStart(Math.max(CODE_LENGTH - prefix.length, 0), "0")}`
}

const entityTypeKey = (type: number) =>
  type === 2 ? "supplier" : type === 3 ? "salesman" : type === 4 ? "subscriber" : "customer"

const defaultPrefixForType = async (type: number) => {
  try {
    return await getPrefixFromSettings(entityTypeKey(type))
  } catch {
    return type === 2 ? "S" : "C"
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureCustomerCompatibilityColumns()
    const body = await request.json()
    const { data } = body

    // فحص مسبق (شاشة مراجعة الاستيراد): أي الأرقام موجودة مسبقاً — بنفس تطبيع الرقم عند الحفظ.
    if (body.check === true) {
      const codes: string[] = Array.isArray(body.codes) ? body.codes.map((code: unknown) => String(code ?? "").trim()).filter(Boolean) : []
      const checkPrefix = await defaultPrefixForType(Number(body.type) || 1)
      const normalized = Object.fromEntries(codes.map((code) => [code, normalizeImportedCode(code, checkPrefix)]))
      const values = [...new Set(Object.values(normalized).filter(Boolean))]
      const rows = values.length ? await sql`SELECT customer_code FROM customers WHERE customer_code = ANY(${values}::text[])` : []
      return NextResponse.json({ existing: rows.map((row: any) => String(row.customer_code)), normalized })
    }

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: "لا توجد بيانات للاستيراد" }, { status: 400 })
    }

    // حساب الأب إلزامي: يُحدَّد لكل نوع مرة واحدة قبل حفظ أي سطر، ولا يُستورد شيء إن لم يكن معرَّفاً.
    const settings = await loadStoredSettings()
    const parentByType = new Map<number, { fatherId: number | null; levelNo: number }>()
    for (const type of new Set<number>(data.map((item: any) => Number(item?.type) || 1))) {
      // حساب الأب الافتراضي للنوع (لا يُقبَل father_id من ملف Excel)
      try {
        parentByType.set(type, await resolveRequiredParentAccount(type, null, settings))
      } catch (error) {
        if (error instanceof MissingParentAccountError) return NextResponse.json({ error: error.message }, { status: 400 })
        throw error
      }
    }

    let success = 0;
    let failed = 0;
    let duplicates = 0;
    const errors: string[] = [];
    // نتيجة كل سطر (rowIndex كما أرسله المستورِد) — تعرضها شاشة الاستيراد بجانب السطر نفسه.
    const results: Array<{ rowIndex: number; status: "success" | "failed" | "duplicate"; error?: string }> = [];
    const prefixByType = new Map<number, string>();

    for (const item of data) {
      try {
        const rowIndex = item.rowIndex || data.indexOf(item) + 1;

        // Skip invalid records
        if (!item.isValid) {
          errors.push(`السطر ${rowIndex}: بيانات غير صالحة`);
          results.push({ rowIndex, status: "failed", error: "بيانات غير صالحة" });
          failed++;
          continue;
        }

        // Required field check
        if (!item.customer_name) {
          errors.push(`السطر ${rowIndex}: اسم العميل مطلوب`);
          results.push({ rowIndex, status: "failed", error: "الاسم مطلوب" });
          failed++;
          continue;
        }

        // Determine type: 1 = customer, 2 = supplier
        const type = Number(item.type) || 1;

        // Generate customer code if not provided and normalize imported values to the same 10-digit format
        if (!prefixByType.has(type)) prefixByType.set(type, await defaultPrefixForType(type));
        let customerCode = normalizeImportedCode(item.customer_code, prefixByType.get(type) || "");
        if (!customerCode) {
          customerCode = await generateCustomerNumber(type);
        }

        // Check for duplicates
        const existing = await sql`
      SELECT id FROM customers WHERE customer_code = ${customerCode}
    `;
        if (existing.length > 0) {
          duplicates++;
          results.push({ rowIndex, status: "duplicate", error: `الرقم ${customerCode} موجود مسبقاً` });
          continue;
        }

        // كل عميل/مورد/مشترك مستورَد يحتاج حساباً مرتبطاً في account_tbl تماماً كما يحصل عند
        // الإنشاء اليدوي عبر /api/customers — بلا هذا الربط كان الاستيراد الجماعي يترك العميل
        // بلا حساب محاسبي أصلاً (account_id فارغ)، خلافاً لما يحدث عند الإدخال اليدوي.
        const accountType = resolveAccountType(type)
        const parent = parentByType.get(type)!
        const accountId = await ensureCustomerAccount({
          code: customerCode,
          name: item.name || item.customer_name,
          currencyId: toNullableInt(item.currency_id) ?? 1,
          allowTransWithDiffCurr: item.allow_trans_with_diff_curr ?? 0,
          isCalcCurrDiffRates: item.iscalc_curr_diff_rates ?? false,
          fatherId: parent.fatherId,
          levelNo: parent.levelNo,
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
        ${item.classification || item.classifications || null},
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
        results.push({ rowIndex: item.rowIndex || data.indexOf(item) + 1, status: "success" });
      } catch (error: any) {
        const rowIndex = item.rowIndex || data.indexOf(item) + 1;
        errors.push(`السطر ${rowIndex}: ${error.message}`);
        results.push({ rowIndex, status: "failed", error: error.message });
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
      results,
    })
  } catch (error) {
    console.error("Error importing customers:", error)
    return NextResponse.json({ error: "خطأ في استيراد العملاء" }, { status: 500 })
  }
}



