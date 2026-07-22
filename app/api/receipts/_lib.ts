import sql from "@/lib/database"
import { ensureTables as ensureCreditCardTables } from "../credit-cards/_lib"
import { getSystemSettingValue } from "@/lib/system-settings"

// Shared schema + persistence helpers for سند قبض / سند صرف (voucher_header_tbl and its
// related tables). Used by route.ts, [id]/route.ts and navigation/[navigationType]/route.ts
// so the three endpoints can never drift out of sync with each other.

// ترقيم journal_type_id موحّد لكامل النظام المحاسبي (voucher_journal_type_caption_tbl، 1-15) —
// هذه الثوابت هي الأنواع المستخدمة فعلياً في سند القبض/الصرف وسند القيد فقط؛ الباقي (1=أخرى،
// 6-15=مبيعات/مشتريات/بنك/...) محجوز لموديولات أخرى لا تستخدم هذا الملف.
export const JOURNAL_TYPE_CASH = 2
export const JOURNAL_TYPE_CHEQUE = 3
export const JOURNAL_TYPE_CARD = 4
export const JOURNAL_TYPE_COUNTER_ACCOUNT = 5

export const ensureTables = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS voucher_header_tbl (
      id SERIAL PRIMARY KEY,
      vch_type INTEGER NOT NULL,
      vch_code VARCHAR(30) NOT NULL,
      vch_date DATE NOT NULL,
      currency_id INTEGER,
      rate DOUBLE PRECISION DEFAULT 1,
      cash_amount DOUBLE PRECISION DEFAULT 0,
      cash_account_id INTEGER,
      amount DOUBLE PRECISION DEFAULT 0,
      note VARCHAR(200),
      status INTEGER DEFAULT 1,
      insert_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_update_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (vch_type, vch_code)
    )
  `
  // إعادة تسمية على تنصيب قائم من قبل هذا التغيير (تنصيب جديد ينشئ الأعمدة بالاسم الجديد مباشرة
  // عبر CREATE TABLE أعلاه، فلا تجد هذه الكتلة شيئاً لتُعيد تسميته).
  await sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voucher_header_tbl' AND column_name = 'created_at') THEN
        ALTER TABLE voucher_header_tbl RENAME COLUMN created_at TO insert_date;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voucher_header_tbl' AND column_name = 'updated_at') THEN
        ALTER TABLE voucher_header_tbl RENAME COLUMN updated_at TO last_update_date;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voucher_header_tbl' AND column_name = 'printed') THEN
        ALTER TABLE voucher_header_tbl RENAME COLUMN printed TO is_printed;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voucher_header_tbl' AND column_name = 'customer_account_id') THEN
        ALTER TABLE voucher_header_tbl RENAME COLUMN customer_account_id TO account_id;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voucher_header_tbl' AND column_name = 'insert_user_id') THEN
        ALTER TABLE voucher_header_tbl RENAME COLUMN insert_user_id TO insert_user;
      END IF;
    END$$;
  `
  await sql`ALTER TABLE voucher_header_tbl ALTER COLUMN vch_code TYPE VARCHAR(30)`

  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS vch_book_id INTEGER`
  // account_id: الحساب/الزبون الرئيسي للسند (سُمِّي customer_account_id سابقاً؛ أُعيدت تسميته
  // أعلاه ليطابق المرجع). to_account_id يبقى منفصلاً عمداً (لم يُدمَج فيه) — الاثنان يُدخَلان
  // فعلياً بحقلين مستقلين في الواجهة وقد يختلفان (مثال: القبض من زبون لكن الإقفال على حساب
  // مقابل مختلف)، فدمجهما كان سيُفقد بيانات حقيقية موجودة اليوم.
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS account_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS customer_name VARCHAR(150)`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS to_account_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS check_amount DOUBLE PRECISION DEFAULT 0`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS check_account_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS credit_card_amount DOUBLE PRECISION DEFAULT 0`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS credit_card_account_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS payment_classification_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS salesman_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS manual_voucher VARCHAR(30)`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS manual_date DATE`
  // ترحيل السند: يُطبع عند "ترحيل وطباعة" فيصبح is_printed=1 — لا علاقة له بحالة السند (status).
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS is_printed INTEGER DEFAULT 0`
  // Per-card fields moved to voucher_cards_detail_tbl (a voucher can carry more than one card).
  await sql`ALTER TABLE voucher_header_tbl DROP COLUMN IF EXISTS credit_card_type`
  await sql`ALTER TABLE voucher_header_tbl DROP COLUMN IF EXISTS credit_card_code`
  await sql`ALTER TABLE voucher_header_tbl DROP COLUMN IF EXISTS credit_card_expiry_date`
  // bank_amount/bank_account_id لم يُستخدما فعلياً في أي مسار حفظ أو نموذج — أعمدة ميتة من تصميم
  // سابق، خلافاً لـ cash_amount/cash_account_id (تبويب "نقدي") التي تبقى مستخدمة فعلياً.
  await sql`ALTER TABLE voucher_header_tbl DROP COLUMN IF EXISTS bank_amount`
  await sql`ALTER TABLE voucher_header_tbl DROP COLUMN IF EXISTS bank_account_id`
  // المستخدم الذي أنشأ السند — يُسجَّل مرة واحدة عند الإدراج (POST) فقط، ولا يتغيّر مع أي تعديل
  // لاحق. اسمه insert_user (وليس insert_user_id، أُعيدت تسميته أعلاه) مطابقةً للمرجع؛ لا FK هنا
  // لأن جدول مستخدمين حقيقي (users_tbl) غير موجود في هذه القاعدة (المصادقة مُدارة خارجياً).
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS insert_user INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS update_user INTEGER`

  // vch_status: درافت=1 / مرحل=2 فقط (حالة الترحيل تحديداً) — status يبقى بمعناه الحالي
  // (١=فعال ٢=مرحل ٣=محذوف/ملغي منطقياً، مرجعاً إلى voucher_status_tbl) ولا يزال المصدر الوحيد
  // الذي يعتمد عليه isLocked/canSave/canDelete ونص نسخة الطباعة في الواجهة. vch_status عمود
  // إضافي يُبقي القيمتين الحيتين (١/٢) متزامنتين مع status لمطابقة اسم العمود في المرجع فقط.
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS vch_status INTEGER`
  await sql`UPDATE voucher_header_tbl SET vch_status = CASE WHEN status = 2 THEN 2 ELSE 1 END WHERE vch_status IS NULL`

  // الحقول التالية محجوزة لموديولات لم تُبنَ بعد في هذا التطبيق (ضريبة، مقاصة، مخازن، تسعير...)
  // — أُضيفت فقط لمطابقة شكل الجدول المرجعي، دون أي منطق تطبيقي يقرأها أو يكتبها حالياً. لا FK
  // على أي منها لأن الجداول المرجعية (companies_tbl, stores_tbl, vat_*, ...) غير موجودة هنا.
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS company_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS discount DOUBLE PRECISION`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS updated_vch_id INTEGER REFERENCES voucher_header_tbl(id)`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS payment_type_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS approved INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS location_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS internal_voucher_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS language_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS print_setting_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS print_attachment_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS phone VARCHAR(30)`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS vat_reg VARCHAR(16)`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS vat_duedate DATE`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS vat_type_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS vat_classification_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS vat_included BOOLEAN`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS vat DOUBLE PRECISION`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS invoice_type INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS is_maqasa BOOLEAN`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS maqasa_type INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS to_store_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS vat_percent DOUBLE PRECISION`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS cheq_operation_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS is_breakpoint BOOLEAN DEFAULT false`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS pricing_way_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS exit_time TIMESTAMP`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS returnedable_voucher_id INTEGER REFERENCES voucher_header_tbl(id)`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS due_date DATE`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS is_exported_sales BOOLEAN`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS draft_code VARCHAR(30)`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS twins_vch_id INTEGER`

  // جدول تصنيف أنواع أسطر القيد موحّد لكامل النظام المحاسبي (وليس خاصاً بسند القبض/الصرف فقط)،
  // لذا يحمل رقم النوع فقط؛ التسميات منفصلة في voucher_journal_type_caption_tbl (متعددة اللغات).
  // الأنواع 6-15 غير مستخدمة بعد في هذا التطبيق (مبيعات/مشتريات/بنك/...) لكنها محجوزة لموديولات
  // مستقبلية تشارك نفس التصنيف.
  await sql`
    CREATE TABLE IF NOT EXISTS voucher_journal_type_tbl (
      id INTEGER PRIMARY KEY
    )
  `
  await sql`ALTER TABLE voucher_journal_type_tbl DROP COLUMN IF EXISTS name`
  await sql`
    INSERT INTO voucher_journal_type_tbl (id) VALUES
      (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12),(13),(14),(15)
    ON CONFLICT (id) DO NOTHING
  `

  await sql`
    CREATE TABLE IF NOT EXISTS voucher_journal_type_caption_tbl (
      id SERIAL PRIMARY KEY,
      journal_type_id INTEGER REFERENCES voucher_journal_type_tbl(id) ON DELETE CASCADE,
      language_id INTEGER,
      name VARCHAR(30)
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS idx_voucher_journal_type_caption_tbl_type
    ON voucher_journal_type_caption_tbl(journal_type_id)
  `
  await sql`
    INSERT INTO voucher_journal_type_caption_tbl (id, journal_type_id, language_id, name) VALUES
      (1, 1, 1, 'أخرى'),
      (2, 2, 1, 'نقدا'),
      (3, 3, 1, 'شيكات'),
      (4, 4, 1, 'بطاقات'),
      (5, 5, 1, 'حساب الزبون/المورد'),
      (6, 6, 1, 'المبيعات'),
      (7, 7, 1, 'ضريبة المبيعات'),
      (8, 8, 1, 'الخصم بالإشعار المدين'),
      (9, 9, 1, 'المشتريات'),
      (10, 10, 1, 'ضريبة المشتريات'),
      (11, 11, 1, 'الخصم المكتسب بالإشعار الدائن'),
      (12, 12, 1, 'حساب بنك'),
      (13, 13, 1, 'تحويل عملة'),
      (14, 14, 1, 'حساب المصروف سند الاستعمال'),
      (15, 15, 1, 'إقفال أرصدة حسابات الميزانية')
    ON CONFLICT (id) DO NOTHING
  `
  await sql`
    SELECT setval(
      pg_get_serial_sequence('voucher_journal_type_caption_tbl', 'id'),
      (SELECT COALESCE(MAX(id), 1) FROM voucher_journal_type_caption_tbl)
    )
  `

  // voucher_journal_detail_tbl mirrors the real accounting schema: every voucher
  // must produce a balanced double-entry (sum(debit) == sum(credit), >= 2 rows).
  await sql`
    CREATE TABLE IF NOT EXISTS voucher_journal_detail_tbl (
      id SERIAL PRIMARY KEY,
      voucher_id INTEGER NOT NULL REFERENCES voucher_header_tbl(id) ON DELETE CASCADE,
      order_no INTEGER DEFAULT 1,
      journal_type_id INTEGER,
      account_id INTEGER NOT NULL,
      credit_debit INTEGER NOT NULL,
      amount DOUBLE PRECISION DEFAULT 0,
      currency_id INTEGER,
      rate DOUBLE PRECISION DEFAULT 1,
      base_curr_amount DOUBLE PRECISION DEFAULT 0,
      note VARCHAR(70)
    )
  `
  // account_currency_id/account_rate/account_amount: the account's own-currency view of the
  // line (distinct from currency_id/rate/base_curr_amount, which are the voucher's currency).
  // balance_id/contract_id: reserved for future budget/contract linking (per source schema).
  // Added via ALTER (not the CREATE above) since this table may already exist from before —
  // no FK here because the column may be backfilled against pre-existing rows.
  await sql`ALTER TABLE voucher_journal_detail_tbl ADD COLUMN IF NOT EXISTS account_currency_id INTEGER`
  await sql`ALTER TABLE voucher_journal_detail_tbl ADD COLUMN IF NOT EXISTS account_rate DOUBLE PRECISION DEFAULT 1`
  await sql`ALTER TABLE voucher_journal_detail_tbl ADD COLUMN IF NOT EXISTS account_amount DOUBLE PRECISION DEFAULT 0`
  await sql`ALTER TABLE voucher_journal_detail_tbl ADD COLUMN IF NOT EXISTS balance_id INTEGER`
  await sql`ALTER TABLE voucher_journal_detail_tbl ADD COLUMN IF NOT EXISTS contract_id INTEGER`
  // Cost centers now live in voucher_costcenter_tbl (a line can carry more than one).
  await sql`ALTER TABLE voucher_journal_detail_tbl DROP COLUMN IF EXISTS cost_center_id`

  // ترحيل بيانات: ترقيم journal_type_id في هذا التطبيق كان محلياً (1=نقدي، 2=شيكات، 3=بطاقات،
  // 4=حساب مقابل/سطر سند قيد)، وبعد التوحيد مع voucher_journal_type_caption_tbl أصبح 2=نقدا،
  // 3=شيكات، 4=بطاقات، 5=حساب الزبون/المورد. الإصلاح يعتمد على عمود note (ثابت لا يتغيّر عبر أي
  // ترقيم) بدل "إزاحة +1 على القيمة الحالية" — تلك الطريقة السابقة كانت خطأً: ensureTables تُستدعى
  // في كل طلب، وإزاحة قائمة على القيمة الحالية تُعيد إزاحة صفوف رُحِّلت بالفعل في كل استدعاء لاحق
  // (بطاقات مثلاً ينتهي بها المطاف عند 5 بدل 4 بعد استدعاءين). الاعتماد على note آمن ويُعطي نفس
  // النتيجة بغضّ النظر عن عدد مرات التشغيل: buildJournalRows يضع دائماً note='نقدي'/'شيكات'/
  // 'بطاقات' لهذه الأنواع الثلاثة تحديداً (وليس أي سطر آخر)، وأي سطر آخر (حساب مقابل لسند قبض/صرف
  // أو سطر سند قيد) هو دائماً النوع 5.
  await sql`UPDATE voucher_journal_detail_tbl SET journal_type_id = ${JOURNAL_TYPE_CASH} WHERE note = 'نقدي' AND journal_type_id IS DISTINCT FROM ${JOURNAL_TYPE_CASH}`
  await sql`UPDATE voucher_journal_detail_tbl SET journal_type_id = ${JOURNAL_TYPE_CHEQUE} WHERE note = 'شيكات' AND journal_type_id IS DISTINCT FROM ${JOURNAL_TYPE_CHEQUE}`
  await sql`UPDATE voucher_journal_detail_tbl SET journal_type_id = ${JOURNAL_TYPE_CARD} WHERE note = 'بطاقات' AND journal_type_id IS DISTINCT FROM ${JOURNAL_TYPE_CARD}`
  await sql`
    UPDATE voucher_journal_detail_tbl SET journal_type_id = ${JOURNAL_TYPE_COUNTER_ACCOUNT}
    WHERE (note IS NULL OR note NOT IN ('نقدي', 'شيكات', 'بطاقات'))
      AND journal_type_id IS DISTINCT FROM ${JOURNAL_TYPE_COUNTER_ACCOUNT}
  `

  await sql`
    CREATE TABLE IF NOT EXISTS voucher_costcenter_tbl (
      id SERIAL PRIMARY KEY,
      voucher_journal_id INTEGER NOT NULL REFERENCES voucher_journal_detail_tbl(id) ON DELETE CASCADE,
      cost_center_id INTEGER NOT NULL REFERENCES cost_centers(id) ON DELETE CASCADE
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_voucher_costcenter_tbl_journal ON voucher_costcenter_tbl(voucher_journal_id)`

  await sql`
    CREATE TABLE IF NOT EXISTS voucher_notes_tbl (
      id SERIAL PRIMARY KEY,
      voucher_id INTEGER NOT NULL REFERENCES voucher_header_tbl(id) ON DELETE CASCADE,
      note VARCHAR(150),
      order_no INTEGER DEFAULT 1
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS voucher_related_vch_tbl (
      id SERIAL PRIMARY KEY,
      type INTEGER,
      voucher_id INTEGER REFERENCES voucher_header_tbl(id) ON DELETE CASCADE,
      related_vch_id INTEGER REFERENCES voucher_header_tbl(id) ON DELETE CASCADE
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS voucher_status_tbl (
      id INTEGER PRIMARY KEY,
      name VARCHAR(30)
    )
  `
  await sql`
    INSERT INTO voucher_status_tbl (id, name) VALUES (1, 'فعال'), (2, 'مرحل'), (3, 'محذوف')
    ON CONFLICT (id) DO NOTHING
  `

  // جداول أرشيف السندات المحذوفة (status=1 فقط، أي مسودة لم تُرحَّل بعد): السند يُنسخ إليها
  // قبل حذفه فعلياً من الجداول الحقيقية، بحيث لا تضيع الحركة نهائياً بل يبقى أثر لها. عمود
  // serial (وليس id الأصلي) هو المفتاح الأساسي هنا لأن نفس id قد يُؤرشَف أكثر من مرة إن أُعيد
  // إنشاء سند بنفس الرقم لاحقاً، وheader_serial في جداول التفاصيل يربط كل سطر بحدث الحذف الصحيح.
  await sql`
    CREATE TABLE IF NOT EXISTS voucher_header_log_tbl (
      serial SERIAL PRIMARY KEY,
      id INTEGER NOT NULL,
      vch_type INTEGER,
      vch_code VARCHAR(30),
      vch_date DATE,
      currency_id INTEGER,
      rate DOUBLE PRECISION,
      cash_amount DOUBLE PRECISION,
      cash_account_id INTEGER,
      amount DOUBLE PRECISION,
      note VARCHAR(200),
      status INTEGER,
      vch_book_id INTEGER,
      customer_name VARCHAR(150),
      to_account_id INTEGER,
      check_amount DOUBLE PRECISION,
      check_account_id INTEGER,
      credit_card_amount DOUBLE PRECISION,
      credit_card_account_id INTEGER,
      payment_classification_id INTEGER,
      salesman_id INTEGER,
      manual_voucher VARCHAR(30),
      manual_date DATE,
      insert_date TIMESTAMP,
      last_update_date TIMESTAMP,
      deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
  // نفس عمليات إعادة التسمية/الإضافة المطبَّقة على voucher_header_tbl أعلاه — الجدولان يجب أن
  // يبقيا متطابقين في البنية دائماً (أرشفة تنسخ صفاً كاملاً من الأول إلى الثاني حرفياً).
  await sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voucher_header_log_tbl' AND column_name = 'created_at') THEN
        ALTER TABLE voucher_header_log_tbl RENAME COLUMN created_at TO insert_date;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voucher_header_log_tbl' AND column_name = 'updated_at') THEN
        ALTER TABLE voucher_header_log_tbl RENAME COLUMN updated_at TO last_update_date;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voucher_header_log_tbl' AND column_name = 'printed') THEN
        ALTER TABLE voucher_header_log_tbl RENAME COLUMN printed TO is_printed;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voucher_header_log_tbl' AND column_name = 'customer_account_id') THEN
        ALTER TABLE voucher_header_log_tbl RENAME COLUMN customer_account_id TO account_id;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voucher_header_log_tbl' AND column_name = 'insert_user_id') THEN
        ALTER TABLE voucher_header_log_tbl RENAME COLUMN insert_user_id TO insert_user;
      END IF;
    END$$;
  `
  await sql`ALTER TABLE voucher_header_log_tbl ALTER COLUMN vch_code TYPE VARCHAR(30)`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS account_id INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS is_printed INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl DROP COLUMN IF EXISTS bank_amount`
  await sql`ALTER TABLE voucher_header_log_tbl DROP COLUMN IF EXISTS bank_account_id`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS insert_user INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS update_user INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS vch_status INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS company_id INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS discount DOUBLE PRECISION`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS updated_vch_id INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS payment_type_id INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS approved INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS location_id INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS internal_voucher_id INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS language_id INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS print_setting_id INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS print_attachment_id INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS phone VARCHAR(30)`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS vat_reg VARCHAR(16)`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS vat_duedate DATE`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS vat_type_id INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS vat_classification_id INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS vat_included BOOLEAN`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS vat DOUBLE PRECISION`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS invoice_type INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS is_maqasa BOOLEAN`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS maqasa_type INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS to_store_id INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS vat_percent DOUBLE PRECISION`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS cheq_operation_id INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS is_breakpoint BOOLEAN`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS pricing_way_id INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS exit_time TIMESTAMP`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS returnedable_voucher_id INTEGER`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS due_date DATE`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS is_exported_sales BOOLEAN`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS draft_code VARCHAR(30)`
  await sql`ALTER TABLE voucher_header_log_tbl ADD COLUMN IF NOT EXISTS twins_vch_id INTEGER`
  await sql`CREATE INDEX IF NOT EXISTS idx_voucher_header_log_tbl_id ON voucher_header_log_tbl(id)`

  await sql`
    CREATE TABLE IF NOT EXISTS voucher_journal_detail_log_tbl (
      serial SERIAL PRIMARY KEY,
      header_serial INTEGER NOT NULL REFERENCES voucher_header_log_tbl(serial) ON DELETE CASCADE,
      id INTEGER,
      voucher_id INTEGER,
      order_no INTEGER,
      journal_type_id INTEGER,
      account_id INTEGER,
      credit_debit INTEGER,
      amount DOUBLE PRECISION,
      currency_id INTEGER,
      rate DOUBLE PRECISION,
      base_curr_amount DOUBLE PRECISION,
      account_currency_id INTEGER,
      account_rate DOUBLE PRECISION,
      account_amount DOUBLE PRECISION,
      note VARCHAR(70)
    )
  `
  // إصلاح بيانات مؤجَّل من أعلى هذه الدالة (نفس منطق إعادة الترقيم القائم على note، وليس على
  // القيمة الحالية) — مؤجَّل إلى هنا لأن الجدول لا يكون موجوداً بعد عند أول تشغيلة على تنصيب جديد.
  await sql`UPDATE voucher_journal_detail_log_tbl SET journal_type_id = ${JOURNAL_TYPE_CASH} WHERE note = 'نقدي' AND journal_type_id IS DISTINCT FROM ${JOURNAL_TYPE_CASH}`
  await sql`UPDATE voucher_journal_detail_log_tbl SET journal_type_id = ${JOURNAL_TYPE_CHEQUE} WHERE note = 'شيكات' AND journal_type_id IS DISTINCT FROM ${JOURNAL_TYPE_CHEQUE}`
  await sql`UPDATE voucher_journal_detail_log_tbl SET journal_type_id = ${JOURNAL_TYPE_CARD} WHERE note = 'بطاقات' AND journal_type_id IS DISTINCT FROM ${JOURNAL_TYPE_CARD}`
  await sql`
    UPDATE voucher_journal_detail_log_tbl SET journal_type_id = ${JOURNAL_TYPE_COUNTER_ACCOUNT}
    WHERE (note IS NULL OR note NOT IN ('نقدي', 'شيكات', 'بطاقات'))
      AND journal_type_id IS DISTINCT FROM ${JOURNAL_TYPE_COUNTER_ACCOUNT}
  `

  await sql`
    CREATE TABLE IF NOT EXISTS voucher_costcenter_log_tbl (
      serial SERIAL PRIMARY KEY,
      header_serial INTEGER NOT NULL REFERENCES voucher_header_log_tbl(serial) ON DELETE CASCADE,
      id INTEGER,
      voucher_journal_id INTEGER,
      cost_center_id INTEGER
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS voucher_notes_log_tbl (
      serial SERIAL PRIMARY KEY,
      header_serial INTEGER NOT NULL REFERENCES voucher_header_log_tbl(serial) ON DELETE CASCADE,
      id INTEGER,
      voucher_id INTEGER,
      note VARCHAR(150),
      order_no INTEGER
    )
  `

  // voucher_types_tbl itself (the real one, migrated from legacy voucher_types) is owned by
  // app/api/voucher-book-permissions/_lib.ts — nothing here needs to join against it, only the
  // raw vch_type ints.
  // One-time migration: this table used to store 1 (قبض) / 2 (صرف) before vch_type was
  // aligned to voucher_types_tbl's real ids (8/9). No-op once already migrated.
  await sql`UPDATE voucher_header_tbl SET vch_type = ${RECEIPT_VCH_TYPE} WHERE vch_type = 1`
  await sql`UPDATE voucher_header_tbl SET vch_type = ${PAYMENT_VCH_TYPE} WHERE vch_type = 2`

  // Superseded by the real cheques_tbl below.
  await sql`DROP TABLE IF EXISTS voucher_cheques_tbl`

  await sql`
    CREATE TABLE IF NOT EXISTS cheques_type_tbl (
      id INTEGER PRIMARY KEY,
      name VARCHAR(50),
      name_lang2 VARCHAR(50)
    )
  `
  await sql`
    INSERT INTO cheques_type_tbl (id, name, name_lang2) VALUES
      (1, 'شيكات واردة', 'In Cheques'), (2, 'شيكات صادرة', 'Out Cheques')
    ON CONFLICT (id) DO NOTHING
  `

  await sql`
    CREATE TABLE IF NOT EXISTS cheque_status_tbl (
      id INTEGER PRIMARY KEY,
      name VARCHAR(50)
    )
  `
  await sql`
    INSERT INTO cheque_status_tbl (id, name) VALUES
      (1, 'مستحق'), (2, 'غير مستحق'), (3, 'مؤجل'), (4, 'تم ايداعه'), (5, 'راجع'),
      (6, 'اعيد للمصدر'), (7, 'مجير'), (8, 'برسم التحصيل'), (9, 'ملغي')
    ON CONFLICT (id) DO NOTHING
  `

  // Full column set from the real cheques_tbl schema. Only the columns needed to record a
  // cheque on a سند قبض/سند صرف are populated here — the rest (return/hold/pay dates, log_id,
  // cheq_source_id, cheq_book_id, payment_order_id, attachments...) belong to future cheque
  // operation screens (deposit/return/transfer) and stay NULL/default until that's built.
  await sql`
    CREATE TABLE IF NOT EXISTS cheques_tbl (
      id SERIAL PRIMARY KEY,
      voucher_id INTEGER REFERENCES voucher_header_tbl(id) ON DELETE RESTRICT,
      cheq_type INTEGER REFERENCES cheques_type_tbl(id),
      bank_account VARCHAR(20),
      cheq_num VARCHAR(20),
      bank_id INTEGER REFERENCES banks(id),
      branch_id INTEGER REFERENCES branches(id),
      amount DOUBLE PRECISION,
      currency_id INTEGER,
      rate DOUBLE PRECISION,
      received_date TIMESTAMP,
      trans_date TIMESTAMP,
      due_date TIMESTAMP,
      pay_date TIMESTAMP,
      return_date TIMESTAMP,
      hold_date TIMESTAMP,
      first_due_date TIMESTAMP,
      customer_id INTEGER,
      rec_cheq_account_id INTEGER,
      current_account_id INTEGER,
      bank_account_id INTEGER,
      salesman_id INTEGER,
      log_id INTEGER,
      last_voucher_id INTEGER,
      cheq_source_id INTEGER,
      cheq_holder_id INTEGER,
      cheq_owner_name VARCHAR(70),
      status_id INTEGER REFERENCES cheque_status_tbl(id),
      cheq_book_id INTEGER,
      return_count INTEGER DEFAULT 0,
      previous_year INTEGER,
      manual_insert INTEGER DEFAULT 0,
      payment_order_id INTEGER,
      is_printed INTEGER DEFAULT 0,
      front_attach_id INTEGER,
      back_attach_id INTEGER,
      last_update_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      update_user_id INTEGER,
      old_status_id INTEGER,
      order_no INTEGER DEFAULT 1
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_cheques_tbl_voucher_id ON cheques_tbl(voucher_id)`

  // credit_cards_types_tbl's real schema (بطاقات الائتمان admin screen) is owned there —
  // ensure it here too since سند قبض/سند صرف's card tab references it via FK.
  await ensureCreditCardTables()

  await sql`
    CREATE TABLE IF NOT EXISTS voucher_cards_detail_tbl (
      id SERIAL PRIMARY KEY,
      card_type_id INTEGER REFERENCES credit_cards_types_tbl(id),
      card_no VARCHAR(50),
      expire_date TIMESTAMP,
      voucher_id INTEGER REFERENCES voucher_header_tbl(id) ON DELETE CASCADE,
      account_id INTEGER,
      amount DOUBLE PRECISION DEFAULT 0,
      bank_amount DOUBLE PRECISION DEFAULT 0,
      net_amount DOUBLE PRECISION DEFAULT 0,
      currency_id INTEGER,
      bank_currency_id INTEGER,
      card_currency_id INTEGER,
      fees_voucher_id INTEGER REFERENCES voucher_header_tbl(id),
      order_no INTEGER DEFAULT 1
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_voucher_cards_detail_tbl_voucher_id ON voucher_cards_detail_tbl(voucher_id)`
}

// vch_type values on voucher_header_tbl, per voucher_types_tbl.
export const RECEIPT_VCH_TYPE = 8
export const PAYMENT_VCH_TYPE = 9

const VOUCHER_CODE_SEQUENCE_DIGITS = 6

// رقم السند = بادئة (من إعدادات النظام) + رمز دفتر السندات + رقم تسلسلي مبطّن بأصفار
// (مثال: RE + F + 00001 = REF00001). يُقرأ عبر طلب داخلي لنفس منطق /api/settings/system
// بدل تكرار معالجة المخطط القديم/الجديد لجدول system_settings هناك.
export const getVoucherNumberSettings = async (
  requestUrl: string,
  vchType: number,
): Promise<{ prefix: string; startNumber: number }> => {
  const isReceipt = vchType === RECEIPT_VCH_TYPE
  const defaultPrefix = isReceipt ? "R" : "P"
  try {
    const response = await fetch(new URL("/api/settings/system", requestUrl))
    if (!response.ok) return { prefix: defaultPrefix, startNumber: 1 }
    const settings = await response.json()
    const prefixRaw = String(settings?.[isReceipt ? "receipt_prefix" : "payment_prefix"] || defaultPrefix).trim().toUpperCase()
    const prefix = /^[A-Z]{1,3}$/.test(prefixRaw) ? prefixRaw : defaultPrefix
    const startNumber = Number(settings?.[isReceipt ? "receipt_start" : "payment_start"]) || 1
    return { prefix, startNumber }
  } catch (error) {
    console.error("Failed to load voucher numbering settings, using defaults:", error)
    return { prefix: defaultPrefix, startNumber: 1 }
  }
}

export const buildVoucherCode = (prefix: string, bookName: string, sequence: number): string =>
  `${prefix}${bookName}${String(sequence).padStart(VOUCHER_CODE_SEQUENCE_DIGITS, "0")}`

// الرقم التسلسلي التالي ضمن تركيبة (نوع السند + البادئة + رمز الدفتر) هذه تحديداً — تغيير
// الدفتر يبدّل رمزه ضمن الكود فيُعاد حساب الأقصى من جديد لتلك التركيبة، كما لو أنها ترقيم منفصل.
export const nextVoucherSequence = async (vchType: number, codePrefix: string, startNumber: number): Promise<number> => {
  const rows = await sql`
    SELECT vch_code FROM voucher_header_tbl WHERE vch_type = ${vchType} AND vch_code LIKE ${codePrefix + "%"}
  `
  let maxNumber = 0
  for (const row of rows) {
    const numericPart = String(row.vch_code || "").slice(codePrefix.length)
    const value = Number(numericPart)
    if (Number.isFinite(value) && value > maxNumber) maxNumber = value
  }
  return maxNumber >= startNumber ? maxNumber + 1 : startNumber
}

export const resolveVoucherBookName = async (bookId: number | null): Promise<string> => {
  if (!bookId) return ""
  const rows = await sql`SELECT name FROM voucher_books_tbl WHERE id = ${bookId}`
  return rows[0]?.name || ""
}

// Debit (credit_debit=1) / Credit (credit_debit=2) — matches the reference C# system
// (VoucherJournalDetail: "case when credit_debit=1 then amount else 0 end as debit").
// سند قبض: cash/check/card accounts are debited, the counter account(s) are credited.
// سند صرف: the reverse.
export const buildJournalRows = (data: any, vchType: number) => {
  const isReceipt = vchType === RECEIPT_VCH_TYPE
  const paymentSide = isReceipt ? 1 : 2
  const counterSide = isReceipt ? 2 : 1
  const currencyId = data.currency_id || null
  const rate = Number(data.rate || 1)

  const rows: any[] = []
  let orderNo = 1

  const cashAmount = Number(data.cash_amount || 0)
  if (cashAmount > 0 && data.cash_account_id) {
    rows.push({
      journal_type_id: JOURNAL_TYPE_CASH,
      account_id: Number(data.cash_account_id),
      credit_debit: paymentSide,
      amount: cashAmount,
      note: "نقدي",
      cost_centers: Array.isArray(data.cash_account_cost_centers) ? data.cash_account_cost_centers : [],
      order_no: orderNo++,
    })
  }

  const checkAmount = Number(data.check_amount || 0)
  if (checkAmount > 0 && data.check_account_id) {
    rows.push({
      journal_type_id: JOURNAL_TYPE_CHEQUE,
      account_id: Number(data.check_account_id),
      credit_debit: paymentSide,
      amount: checkAmount,
      note: "شيكات",
      cost_centers: Array.isArray(data.check_account_cost_centers) ? data.check_account_cost_centers : [],
      order_no: orderNo++,
    })
  }

  const creditCardAmount = Number(data.credit_card_amount || 0)
  if (creditCardAmount > 0 && data.credit_card_account_id) {
    rows.push({
      journal_type_id: JOURNAL_TYPE_CARD,
      account_id: Number(data.credit_card_account_id),
      credit_debit: paymentSide,
      amount: creditCardAmount,
      note: "بطاقات",
      cost_centers: Array.isArray(data.credit_card_account_cost_centers) ? data.credit_card_account_cost_centers : [],
      order_no: orderNo++,
    })
  }

  const journalRows = (Array.isArray(data.journal) ? data.journal : []).filter(
    (row: any) => row?.account_id && Number(row?.amount || 0) > 0,
  )

  if (journalRows.length > 0) {
    for (const row of journalRows) {
      rows.push({
        journal_type_id: JOURNAL_TYPE_COUNTER_ACCOUNT,
        account_id: Number(row.account_id),
        credit_debit: counterSide,
        amount: Number(row.amount),
        note: row.note || "",
        cost_centers: Array.isArray(row.cost_centers) ? row.cost_centers : [],
        order_no: orderNo++,
      })
    }
  } else if (data.to_account_id) {
    rows.push({
      journal_type_id: JOURNAL_TYPE_COUNTER_ACCOUNT,
      account_id: Number(data.to_account_id),
      credit_debit: counterSide,
      amount: Number(data.amount || 0),
      note: "",
      cost_centers: [],
      order_no: orderNo++,
    })
  }

  return rows.map((row) => ({
    ...row,
    currency_id: currencyId,
    rate,
    base_curr_amount: Math.round(row.amount * rate * 100) / 100,
  }))
}

// خط دفاع ثانٍ خلف فحص الواجهة (checkAccountCurrencyCompatibility في unified-journal.tsx /
// unified-receipt-voucher.tsx) — إعداد الحساب allow_trans_with_diff_curr: 0 = مسموح بدون تنبيه،
// 1 = مسموح مع تنبيه (لا يُرفض هنا، التنبيه تكفّلت به الواجهة)، 2 = ممنوع تماماً فيُرفض الحفظ.
export const validateJournalAccountCurrencies = async (
  journalRows: { account_id: number }[],
  voucherCurrencyId: number | null,
): Promise<string | null> => {
  if (voucherCurrencyId == null) return null

  const accountIds = Array.from(new Set(journalRows.map((row) => Number(row.account_id)).filter((id) => id > 0)))
  if (accountIds.length === 0) return null

  const accounts = await sql`
    SELECT id, code, name, currency_id, allow_trans_with_diff_curr
    FROM account_tbl
    WHERE id = ANY(${accountIds}::int[])
  `

  for (const account of accounts) {
    if (account.currency_id == null || Number(account.currency_id) === Number(voucherCurrencyId)) continue
    if (Number(account.allow_trans_with_diff_curr) === 2) {
      return `عملة السند تختلف عن عملة الحساب لا يمكن اختياره: ${account.code} - ${account.name}`
    }
  }

  return null
}

export const saveJournalRows = async (voucherId: number, journalRows: any[]) => {
  await sql`DELETE FROM voucher_journal_detail_tbl WHERE voucher_id = ${voucherId}`

  const accountCurrencyCache = new Map<number, number | null>()

  for (const row of journalRows) {
    let accountCurrencyId = accountCurrencyCache.get(row.account_id)
    if (accountCurrencyId === undefined) {
      const accountRows = await sql`SELECT currency_id FROM account_tbl WHERE id = ${row.account_id}`
      const resolvedCurrencyId: number | null = accountRows[0]?.currency_id ?? null
      accountCurrencyId = resolvedCurrencyId
      accountCurrencyCache.set(row.account_id, resolvedCurrencyId)
    }

    // v1 simplification: no cross-rate table exists yet, so the account's own-currency
    // amount mirrors the voucher's amount/rate even when the account's currency differs.
    const resolvedAccountCurrencyId = accountCurrencyId ?? row.currency_id
    const accountRate = row.rate
    const accountAmount = row.amount

    const inserted = await sql`
      INSERT INTO voucher_journal_detail_tbl (
        voucher_id, order_no, journal_type_id, account_id, credit_debit,
        amount, currency_id, rate, base_curr_amount, account_currency_id, account_rate, account_amount, note
      ) VALUES (
        ${voucherId}, ${row.order_no}, ${row.journal_type_id}, ${row.account_id}, ${row.credit_debit},
        ${row.amount}, ${row.currency_id}, ${row.rate}, ${row.base_curr_amount},
        ${resolvedAccountCurrencyId}, ${accountRate}, ${accountAmount}, ${row.note || ""}
      )
      RETURNING id
    `
    const journalId = inserted[0].id

    for (const costCenter of row.cost_centers || []) {
      if (!costCenter?.cost_center_id) continue
      await sql`
        INSERT INTO voucher_costcenter_tbl (voucher_journal_id, cost_center_id)
        VALUES (${journalId}, ${Number(costCenter.cost_center_id)})
      `
    }
  }
}

// خط دفاع ثانٍ خلف تحقق الحقول المطلوبة في الواجهة — نفس الشيك (رقم الشيك + رقم الحساب معاً، وليس
// أحدهما بمفرده) قد يُدخَل فعلياً في سندين مختلفين لو أُنشئ السندان في نفس اللحظة تقريباً (سباق)
// أو عبر استدعاء مباشر لواجهة الـ API. voucherId يُستثنى من المطابقة (تعديل نفس السند لا يُعتبر
// تكراراً)؛ عند سند جديد (voucherId = null) لا يوجد استثناء فيُقارَن مع كل السندات المحفوظة.
export const validateChequeDuplicates = async (voucherId: number | null, cheques: any[]): Promise<string | null> => {
  const rows = (Array.isArray(cheques) ? cheques : []).filter((row) => row?.cheq_num && row?.bank_account)

  for (const row of rows) {
    const cheqNum = String(row.cheq_num)
    const bankAccount = String(row.bank_account)
    const matches = await sql`
      SELECT vh.vch_code
      FROM cheques_tbl c
      JOIN voucher_header_tbl vh ON vh.id = c.voucher_id
      WHERE c.cheq_num = ${cheqNum} AND c.bank_account = ${bankAccount}
        AND c.voucher_id IS DISTINCT FROM ${voucherId ?? -1}
      LIMIT 1
    `
    if (matches.length > 0) {
      return `رقم الشيك ${cheqNum} مدخل في سند آخر رقم السند ${matches[0].vch_code} - لا يمكن الاستمرار`
    }
  }

  return null
}

// إعداد "عدم السماح بادخال شيكات يدويا في سند الصرف" (vouchers-general-settings.tsx) — عند
// تفعيله يجب أن يأتي كل سطر شيك من ورقة محجوزة ضمن دفتر شيكات (cheque_book_cheque_id)، لا كتابة حرة.
export const validateManualChequeEntry = async (vchType: number, cheques: any[]): Promise<string | null> => {
  if (vchType !== PAYMENT_VCH_TYPE) return null
  const disallowManual = await getSystemSettingValue<boolean>("disallow_manual_cheque_entry_in_payment", false)
  if (!disallowManual) return null

  const rows = (Array.isArray(cheques) ? cheques : []).filter((row) => row?.cheq_num || row?.bank_account)
  for (const row of rows) {
    if (!row.cheque_book_cheque_id) {
      return "غير مسموح بإدخال شيكات يدوياً في سند الصرف - يجب اختيار الشيك من دفتر الشيكات"
    }
  }
  return null
}

// رقم الحساب في سند الصرف يجب أن يطابق حساباً بنكياً فعلياً (bank_accounts)، وجميع شيكات نفس
// السند يجب أن تكون من نفس الحساب البنكي (لا يجوز خلط حسابات بنكية ضمن سند واحد).
export const validateChequeBankAccounts = async (vchType: number, cheques: any[]): Promise<string | null> => {
  if (vchType !== PAYMENT_VCH_TYPE) return null
  const rows = (Array.isArray(cheques) ? cheques : []).filter((row) => row?.cheq_num || row?.bank_account)
  if (rows.length === 0) return null

  const codes = Array.from(new Set(rows.map((row) => String(row.bank_account || "").trim()).filter(Boolean)))
  if (codes.length > 0) {
    const accounts = await sql`SELECT code FROM bank_accounts WHERE code = ANY(${codes}::text[])`
    const existingCodes = new Set(accounts.map((a: any) => a.code))
    for (const code of codes) {
      if (!existingCodes.has(code)) {
        return "الحساب البنكي المدخل غير موجود"
      }
    }
  }

  const distinctAccounts = new Set(rows.map((row) => String(row.bank_account || "").trim()).filter(Boolean))
  if (distinctAccounts.size > 1) {
    return "يجب أن تكون جميع الشيكات من نفس الحساب البنكي"
  }
  return null
}

// يمنع سباق التزامن: ورقة حُجزت من مستخدم آخر بين لحظة اختيارها في الواجهة ولحظة الحفظ الفعلي.
export const validateChequeBookLeaves = async (voucherId: number | null, cheques: any[]): Promise<string | null> => {
  const leafIds = (Array.isArray(cheques) ? cheques : [])
    .map((row) => (row?.cheque_book_cheque_id ? Number(row.cheque_book_cheque_id) : null))
    .filter((id): id is number => Boolean(id))
  if (leafIds.length === 0) return null

  const rows = await sql`SELECT id, cheque_code, status, voucher_id FROM cheque_book_cheque_tbl WHERE id = ANY(${leafIds}::int[])`
  for (const leafId of leafIds) {
    const row = rows.find((r: any) => Number(r.id) === leafId)
    if (!row) return "الشيك المحدد من دفتر الشيكات غير موجود"
    if (Number(row.status) === 2) {
      return `الشيك رقم ${row.cheque_code} من دفتر الشيكات تالف ولا يمكن استخدامه`
    }
    if (Number(row.status) === 3 && row.voucher_id != null && Number(row.voucher_id) !== Number(voucherId ?? -1)) {
      return `الشيك رقم ${row.cheque_code} من دفتر الشيكات مستخدم مسبقاً في سند آخر`
    }
  }
  return null
}

// يُطلق أي أوراق شيكات كانت محجوزة لهذا السند (متوفر=1) — يُستخدم عند الإلغاء المنطقي والحذف
// الفعلي، وكخطوة أولى قبل إعادة الحجز عند كل حفظ (consumeChequeBookLeaves) حتى تعكس الحجوزات
// آخر حالة للسند بدل تراكم حجوزات قديمة لم تعد ضمن أسطر الشيكات الحالية.
export const releaseChequeBookLeaves = async (voucherId: number) => {
  await sql`
    UPDATE cheque_book_cheque_tbl SET status = 1, voucher_id = NULL, voucher_date = NULL
    WHERE voucher_id = ${voucherId}
  `
}

// "ChangeStatus" المكافئ لهذا المخطط: الحجز هنا على مستوى الورقة الفردية (cheque_book_cheque_tbl)
// لا الدفتر ذاته، لأن الدفتر يحتوي عشرات الأوراق ولا يصح اعتباره كله "غير متوفر" لاستخدام ورقة واحدة.
export const consumeChequeBookLeaves = async (voucherId: number, vchDate: string, cheques: any[]) => {
  await releaseChequeBookLeaves(voucherId)
  const leafIds = (Array.isArray(cheques) ? cheques : [])
    .map((row) => (row?.cheque_book_cheque_id ? Number(row.cheque_book_cheque_id) : null))
    .filter((id): id is number => Boolean(id))

  for (const leafId of leafIds) {
    await sql`
      UPDATE cheque_book_cheque_tbl SET status = 3, voucher_id = ${voucherId}, voucher_date = ${vchDate}
      WHERE id = ${leafId}
    `
  }
}

interface ChequeContext {
  vchType: number
  currencyId: number | null
  rate: number
  vchDate: string
  checkAccountId: number | null
}

export const saveChequeRows = async (voucherId: number, cheques: any[], ctx: ChequeContext) => {
  await sql`DELETE FROM cheques_tbl WHERE voucher_id = ${voucherId}`
  const rows = (Array.isArray(cheques) ? cheques : []).filter((row) => row?.cheq_num || row?.bank_account)
  // cheques_type_tbl: 1 = شيكات واردة (in, سند قبض), 2 = شيكات صادرة (out, سند صرف)
  const cheqType = ctx.vchType === RECEIPT_VCH_TYPE ? 1 : 2

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    await sql`
      INSERT INTO cheques_tbl (
        voucher_id, cheq_type, bank_account, bank_account_id, cheq_num, bank_id, branch_id, amount,
        currency_id, rate, received_date, trans_date, due_date, cheq_owner_name,
        rec_cheq_account_id, current_account_id, status_id, manual_insert, cheq_book_id, is_printed, order_no
      ) VALUES (
        ${voucherId}, ${cheqType}, ${row.bank_account || ""}, ${row.bank_account_id || null}, ${row.cheq_num || ""}, ${row.bank_id || null}, ${row.branch_id || null},
        ${Number(row.amount || 0)}, ${ctx.currencyId}, ${ctx.rate}, ${ctx.vchDate}, ${ctx.vchDate}, ${row.due_date || null},
        ${row.cheq_owner_name || ""}, ${ctx.checkAccountId}, ${ctx.checkAccountId}, 1, ${row.cheque_book_cheque_id ? 0 : 1}, ${row.cheque_book_cheque_id || null}, 0, ${i + 1}
      )
    `
  }
}

export const saveCardRows = async (voucherId: number, cards: any[], defaultCurrencyId: number | null) => {
  await sql`DELETE FROM voucher_cards_detail_tbl WHERE voucher_id = ${voucherId}`
  const rows = (Array.isArray(cards) ? cards : []).filter((row) => row?.card_no || Number(row?.amount || 0) > 0)

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const amount = Number(row.amount || 0)
    const bankAmount = Number(row.bank_amount || 0)
    const netAmount = row.net_amount !== null && row.net_amount !== undefined && row.net_amount !== ""
      ? Number(row.net_amount)
      : amount - bankAmount
    // Each card has its own currency (drives which نوع البطاقة options are offered),
    // separate from the voucher header's currency.
    const cardCurrencyId = row.currency_id || defaultCurrencyId

    await sql`
      INSERT INTO voucher_cards_detail_tbl (
        voucher_id, card_type_id, card_no, expire_date, account_id, amount, bank_amount, net_amount,
        currency_id, bank_currency_id, card_currency_id, order_no
      ) VALUES (
        ${voucherId}, ${row.card_type_id || null}, ${row.card_no || ""}, ${row.expire_date || null}, ${row.account_id || null},
        ${amount}, ${bankAmount}, ${netAmount}, ${cardCurrencyId}, ${cardCurrencyId}, ${cardCurrencyId}, ${i + 1}
      )
    `
  }
}

export const saveNoteRows = async (voucherId: number, notes: any[]) => {
  await sql`DELETE FROM voucher_notes_tbl WHERE voucher_id = ${voucherId}`
  const rows = (Array.isArray(notes) ? notes : []).filter((row) => row?.note && row.note.trim())
  for (let i = 0; i < rows.length; i++) {
    await sql`
      INSERT INTO voucher_notes_tbl (voucher_id, note, order_no)
      VALUES (${voucherId}, ${rows[i].note}, ${i + 1})
    `
  }
}

export const fetchDetails = async (voucherId: number) => {
  const [journalRaw, cashCheckCardRows, costCenterRows, cheques, notes, cards] = await Promise.all([
    // نقدي/شيكات/بطاقات (JOURNAL_TYPE_CASH/CHEQUE/CARD) هي أسطر تركيبية تعكس حقول الرئيسية
    // المخصصة (cash_amount/check_amount/credit_card_amount) وليست جزءاً من تبويب "الحسابات" —
    // فقط JOURNAL_TYPE_COUNTER_ACCOUNT (الحساب المقابل الفعلي الذي يُدخله المستخدم في تلك
    // الشبكة) يجب أن يُعرض فيها، وإلا تظهر أسطر نقدي/شيكات/بطاقات مكرَّرة مع سطر الحساب الحقيقي.
    // vjd.* لا يحمل رقم/اسم الحساب (voucher_journal_detail_tbl يخزّن account_id فقط) — لذا
    // يُنضمّ إلى account_tbl هنا، وإلا تظهر شبكة الحسابات فارغة الحقول عند عرض سند محفوظ سابقاً.
    sql`
      SELECT vjd.*, acc.code AS account_code, acc.name AS account_name
      FROM voucher_journal_detail_tbl vjd
      LEFT JOIN account_tbl acc ON acc.id = vjd.account_id
      WHERE vjd.voucher_id = ${voucherId} AND vjd.journal_type_id = ${JOURNAL_TYPE_COUNTER_ACCOUNT}
      ORDER BY vjd.order_no, vjd.id
    `,
    sql`
      SELECT id, journal_type_id FROM voucher_journal_detail_tbl
      WHERE voucher_id = ${voucherId}
        AND journal_type_id = ANY(${[JOURNAL_TYPE_CASH, JOURNAL_TYPE_CHEQUE, JOURNAL_TYPE_CARD]}::int[])
    `,
    sql`
      SELECT vc.id, vc.voucher_journal_id, vc.cost_center_id, cc.cost_type_id AS cost_center_type_id, cc.name AS cost_center_name
      FROM voucher_costcenter_tbl vc
      INNER JOIN voucher_journal_detail_tbl vjd ON vjd.id = vc.voucher_journal_id
      LEFT JOIN cost_centers cc ON cc.id = vc.cost_center_id
      WHERE vjd.voucher_id = ${voucherId}
    `,
    sql`
      SELECT c.*, b.bank_code AS bank_no, b.bank_name, br.branch_code AS branch_no, br.branch_name
      FROM cheques_tbl c
      LEFT JOIN banks b ON b.id = c.bank_id
      LEFT JOIN branches br ON br.id = c.branch_id
      WHERE c.voucher_id = ${voucherId}
      ORDER BY c.order_no, c.id
    `,
    sql`SELECT * FROM voucher_notes_tbl WHERE voucher_id = ${voucherId} ORDER BY order_no, id`,
    sql`SELECT * FROM voucher_cards_detail_tbl WHERE voucher_id = ${voucherId} ORDER BY order_no, id`,
  ])

  const costCentersByJournalId = new Map<number, any[]>()
  for (const row of costCenterRows) {
    const list = costCentersByJournalId.get(row.voucher_journal_id) || []
    list.push({
      cost_center_id: row.cost_center_id,
      cost_center_type_id: row.cost_center_type_id,
      cost_center_name: row.cost_center_name,
    })
    costCentersByJournalId.set(row.voucher_journal_id, list)
  }

  const journal = journalRaw.map((row: any) => ({
    ...row,
    cost_centers: costCentersByJournalId.get(row.id) || [],
  }))

  // نقدي/شيكات/بطاقات ليست أسطراً في تبويب "الحسابات" (انظر التعليق أعلاه) لذا تُعاد مراكز
  // تكلفتها كحقول مستقلة على مستوى السند بدل ضمن `journal`.
  const cashCheckCardCostCenters = new Map<number, any[]>()
  for (const row of cashCheckCardRows) {
    cashCheckCardCostCenters.set(row.journal_type_id, costCentersByJournalId.get(row.id) || [])
  }

  return {
    journal,
    cheques,
    notes,
    cards,
    cash_account_cost_centers: cashCheckCardCostCenters.get(JOURNAL_TYPE_CASH) || [],
    check_account_cost_centers: cashCheckCardCostCenters.get(JOURNAL_TYPE_CHEQUE) || [],
    credit_card_account_cost_centers: cashCheckCardCostCenters.get(JOURNAL_TYPE_CARD) || [],
  }
}

// الحذف الفعلي متاح فقط لسند بحالة "فعال" (status=1، لم يُرحَّل بعد) — سند مُرحَّل (status=2)
// يُلغى منطقياً (status=3) بدل حذفه، فيبقى مؤرشفاً في voucher_header_tbl نفسها. هنا فقط نؤرشف
// نسخة كاملة من السند (رأسية + حسابات + مراكز تكلفة + ملاحظات) إلى جداول الـ log قبل حذفه فعلياً
// حتى لا تضيع الحركة نهائياً. الشيكات وتفاصيل البطاقات تُحذف دون أرشفة (خارج نطاق هذه الميزة حالياً).
export const archiveAndDeleteVoucher = async (voucherId: number): Promise<{ error?: string }> => {
  const headerRows = await sql`SELECT * FROM voucher_header_tbl WHERE id = ${voucherId}`
  if (headerRows.length === 0) return { error: "السند غير موجود" }
  const voucher = headerRows[0]
  if (Number(voucher.status) !== 1) {
    return { error: "لا يمكن الحذف الفعلي إلا لسند بحالة فعال (غير مرحّل)" }
  }

  const loggedHeader = await sql`
    INSERT INTO voucher_header_log_tbl (
      id, vch_type, vch_code, vch_date, currency_id, rate, cash_amount, cash_account_id,
      amount, note, status, vch_status, vch_book_id, account_id,
      customer_name, to_account_id, check_amount, check_account_id, credit_card_amount,
      credit_card_account_id, payment_classification_id, salesman_id, manual_voucher,
      manual_date, is_printed, insert_user, update_user, insert_date, last_update_date,
      company_id, discount, updated_vch_id, payment_type_id, approved, location_id,
      internal_voucher_id, language_id, print_setting_id, print_attachment_id, phone,
      vat_reg, vat_duedate, vat_type_id, vat_classification_id, vat_included, vat,
      invoice_type, is_maqasa, maqasa_type, to_store_id, vat_percent, cheq_operation_id,
      is_breakpoint, pricing_way_id, exit_time, returnedable_voucher_id, due_date,
      is_exported_sales, draft_code, twins_vch_id
    )
    SELECT
      id, vch_type, vch_code, vch_date, currency_id, rate, cash_amount, cash_account_id,
      amount, note, status, vch_status, vch_book_id, account_id,
      customer_name, to_account_id, check_amount, check_account_id, credit_card_amount,
      credit_card_account_id, payment_classification_id, salesman_id, manual_voucher,
      manual_date, is_printed, insert_user, update_user, insert_date, last_update_date,
      company_id, discount, updated_vch_id, payment_type_id, approved, location_id,
      internal_voucher_id, language_id, print_setting_id, print_attachment_id, phone,
      vat_reg, vat_duedate, vat_type_id, vat_classification_id, vat_included, vat,
      invoice_type, is_maqasa, maqasa_type, to_store_id, vat_percent, cheq_operation_id,
      is_breakpoint, pricing_way_id, exit_time, returnedable_voucher_id, due_date,
      is_exported_sales, draft_code, twins_vch_id
    FROM voucher_header_tbl WHERE id = ${voucherId}
    RETURNING serial
  `
  const headerSerial = loggedHeader[0].serial

  await sql`
    INSERT INTO voucher_journal_detail_log_tbl (
      header_serial, id, voucher_id, order_no, journal_type_id, account_id, credit_debit,
      amount, currency_id, rate, base_curr_amount, account_currency_id, account_rate, account_amount, note
    )
    SELECT
      ${headerSerial}, id, voucher_id, order_no, journal_type_id, account_id, credit_debit,
      amount, currency_id, rate, base_curr_amount, account_currency_id, account_rate, account_amount, note
    FROM voucher_journal_detail_tbl WHERE voucher_id = ${voucherId}
  `

  await sql`
    INSERT INTO voucher_costcenter_log_tbl (header_serial, id, voucher_journal_id, cost_center_id)
    SELECT ${headerSerial}, vc.id, vc.voucher_journal_id, vc.cost_center_id
    FROM voucher_costcenter_tbl vc
    INNER JOIN voucher_journal_detail_tbl vjd ON vjd.id = vc.voucher_journal_id
    WHERE vjd.voucher_id = ${voucherId}
  `

  await sql`
    INSERT INTO voucher_notes_log_tbl (header_serial, id, voucher_id, note, order_no)
    SELECT ${headerSerial}, id, voucher_id, note, order_no
    FROM voucher_notes_tbl WHERE voucher_id = ${voucherId}
  `

  // تحرير أي أوراق شيكات كانت محجوزة من دفتر شيكات لهذا السند قبل حذفه فعلياً.
  await releaseChequeBookLeaves(voucherId)

  // cheques_tbl.voucher_id هو ON DELETE RESTRICT (وليس CASCADE) — يجب حذفها صراحة قبل حذف
  // الرأسية وإلا يفشل الحذف بخرق قيد مرجعي. غير مؤرشفة هنا (خارج النطاق المطلوب).
  await sql`DELETE FROM cheques_tbl WHERE voucher_id = ${voucherId}`

  await sql`DELETE FROM voucher_header_tbl WHERE id = ${voucherId}`

  return {}
}

// يُستدعى عند ضغط زر الطباعة (وليس ضمن حفظ عادي) — لا يمر عبر PUT الرئيسي لأن ذاك يرفض أي
// تعديل على سند مُرحَّل (status=2) بخلاف إلغائه. مقيَّد بـ status=2 لأن is_printed علامة "طُبع
// كسند مرحّل" فقط؛ طباعة سند فعال (status=1) تُعتبر "نسخة للتدقيق" ولا تُسجَّل هنا.
export const markVoucherPrinted = async (voucherId: number): Promise<{ error?: string }> => {
  const result = await sql`
    UPDATE voucher_header_tbl SET is_printed = 1 WHERE id = ${voucherId} AND status = 2
    RETURNING id
  `
  if (result.length === 0) return { error: "السند غير موجود أو غير مرحّل" }
  return {}
}
