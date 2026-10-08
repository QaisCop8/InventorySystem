import sql, { resolveCurrentDbName } from "@/lib/database"

// فترة العمل (سنة العمل + أشهر العمل من "إعدادات النظام ← اعدادات عامة") تُفرَض على كل الحركات عبر
// Trigger على voucher_header_tbl — نقطة واحدة تغطي كل مسارات إنشاء/تعديل/حذف السندات (مخزون، مبيعات،
// قبض/صرف، قيود، شيكات، نقاط البيع، القيود الآلية، الرواتب...) بدل تكرار الفحص في كل مسار API.
//   • إنشاء سند: تاريخه يجب أن يقع في سنة العمل وأحد أشهر العمل.
//   • تعديل التاريخ/الحالة/المبلغ (يشمل الترحيل والإلغاء): التاريخ القديم والجديد معاً داخل الفترة.
//   • حذف فعلي: تاريخ السند داخل الفترة.
//   الطباعة (is_printed) وبقية الحقول لا تُفحَص. بلا سنة عمل محفوظة ⇐ لا قيود إطلاقاً.

const preparedDatabases = new Set<string>()

export async function ensureWorkingPeriodGuard() {
  const databaseName = await resolveCurrentDbName()
  if (preparedDatabases.has(databaseName)) return
  const tables = await sql`SELECT to_regclass('voucher_header_tbl') IS NOT NULL AS vouchers`
  if (!tables[0]?.vouchers) return

  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION working_period_violation(p_date date) RETURNS text AS $fn$
    DECLARE
      v_year_text text;
      v_months_text text;
      v_year int;
      v_months int[];
    BEGIN
      IF p_date IS NULL OR to_regclass('system_settings') IS NULL THEN RETURN NULL; END IF;

      SELECT value INTO v_year_text FROM system_settings
        WHERE id::text = 'working_year' OR description = 'working_year'
        ORDER BY (id::text = 'working_year') DESC LIMIT 1;
      v_year := NULLIF(regexp_replace(COALESCE(v_year_text, ''), '[^0-9]', '', 'g'), '')::int;
      IF v_year IS NULL THEN RETURN NULL; END IF;

      IF EXTRACT(YEAR FROM p_date)::int <> v_year THEN
        RETURN format('تاريخ السند %s خارج سنة العمل (%s) — راجع إعدادات النظام ← اعدادات عامة', to_char(p_date, 'YYYY-MM-DD'), v_year);
      END IF;

      SELECT value INTO v_months_text FROM system_settings
        WHERE id::text = 'working_months' OR description = 'working_months'
        ORDER BY (id::text = 'working_months') DESC LIMIT 1;
      IF COALESCE(btrim(v_months_text), '') IN ('', 'null', '[]') THEN RETURN NULL; END IF;
      BEGIN
        SELECT array_agg(x::int) INTO v_months FROM json_array_elements_text(v_months_text::json) AS x;
      EXCEPTION WHEN others THEN
        SELECT array_agg(btrim(x)::int) INTO v_months
          FROM unnest(string_to_array(regexp_replace(v_months_text, '[^0-9,]', '', 'g'), ',')) AS x
          WHERE btrim(x) <> '';
      END;
      IF v_months IS NULL OR array_length(v_months, 1) IS NULL THEN RETURN NULL; END IF;

      IF NOT (EXTRACT(MONTH FROM p_date)::int = ANY(v_months)) THEN
        RETURN format('تاريخ السند %s في شهر غير مفتوح للعمل (الأشهر المفتوحة: %s) — راجع إعدادات النظام ← اعدادات عامة',
          to_char(p_date, 'YYYY-MM-DD'), array_to_string(v_months, '، '));
      END IF;
      RETURN NULL;
    END;
    $fn$ LANGUAGE plpgsql STABLE
  `)

  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION check_voucher_working_period() RETURNS trigger AS $fn$
    DECLARE
      v_error text;
    BEGIN
      IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_error := working_period_violation(NEW.vch_date::date);
        IF v_error IS NOT NULL THEN RAISE EXCEPTION '%', v_error USING ERRCODE = 'P0001'; END IF;
      END IF;
      IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_error := working_period_violation(OLD.vch_date::date);
        IF v_error IS NOT NULL THEN RAISE EXCEPTION '%', v_error USING ERRCODE = 'P0001'; END IF;
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql
  `)

  await sql`DROP TRIGGER IF EXISTS voucher_working_period_trigger ON voucher_header_tbl`
  await sql.unsafe(`
    CREATE TRIGGER voucher_working_period_trigger
    BEFORE INSERT OR UPDATE OF vch_date, status, amount OR DELETE ON voucher_header_tbl
    FOR EACH ROW EXECUTE FUNCTION check_voucher_working_period()
  `)
  preparedDatabases.add(databaseName)
}

/** نص الخطأ إن كانت الرسالة صادرة عن فحص فترة العمل (لعرضها كما هي بدل رسالة عامة). */
export const workingPeriodErrorMessage = (error: unknown): string | null => {
  const message = String((error as any)?.message || "")
  return message.includes("فترة العمل") || message.includes("سنة العمل") || message.includes("غير مفتوح للعمل") ? message : null
}
