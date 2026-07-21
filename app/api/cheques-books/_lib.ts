import sql from "@/lib/database"

// دفاتر الشيكات.
// حالة الشيك هنا مفهوم مختلف تماماً عن cheque_status_tbl (المُستخدم في app/api/receipts/_lib.ts
// لحالة شيك مُستلم/مُصدر ضمن سند فعلي: مستحق/مؤجل/راجع...) — هذه حالة توفّر الورقة الفارغة
// نفسها داخل الدفتر: 1 متوفر (الافتراضي عند الإصدار الآلي)، 2 تالف، 3 غير متوفر (مستخدمة).
// company_id: لا يوجد مفهوم شركات متعددة حقيقي في هذا التطبيق (لا يوجد companies_tbl) —
// يبقى عمود بسيط بقيمة 1 ثابتة كما في بقية الجداول التي تحمل هذا العمود.
export const ensureTables = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS cheque_book_status_tbl (
      id INTEGER PRIMARY KEY,
      name VARCHAR(50)
    )
  `
  await sql`
    INSERT INTO cheque_book_status_tbl (id, name) VALUES
      (1, 'متوفر'), (2, 'تالف'), (3, 'غير متوفر')
    ON CONFLICT (id) DO NOTHING
  `

  await sql`
    CREATE TABLE IF NOT EXISTS cheque_books_tbl (
      id SERIAL PRIMARY KEY,
      company_id INTEGER DEFAULT 1,
      code VARCHAR(8),
      bank_account_id INTEGER REFERENCES bank_accounts(id),
      insert_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      notes VARCHAR(100),
      status INTEGER DEFAULT 1
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS cheque_book_cheque_tbl (
      id SERIAL PRIMARY KEY,
      cheque_books_id INTEGER REFERENCES cheque_books_tbl(id) ON DELETE CASCADE,
      cheque_code VARCHAR(20),
      voucher_id INTEGER,
      voucher_date DATE,
      notes VARCHAR(70),
      operation_user_id INTEGER REFERENCES user_settings(id),
      status INTEGER,
      order_no INTEGER DEFAULT 1
    )
  `
  // كانت مربوطة بـ cheque_status_tbl (المفهوم الخاطئ) — تُعاد الربط بجدول الحالة الصحيح.
  // أي قيم قديمة خارج 1/2/3 (من قبل هذا التصحيح) تُصحّح إلى "متوفر" حتى لا يفشل القيد أدناه.
  await sql`UPDATE cheque_book_cheque_tbl SET status = 1 WHERE status IS NULL OR status NOT IN (1, 2, 3)`
  await sql`ALTER TABLE cheque_book_cheque_tbl DROP CONSTRAINT IF EXISTS cheque_book_cheque_tbl_status_fkey`
  await sql`
    ALTER TABLE cheque_book_cheque_tbl
    ADD CONSTRAINT cheque_book_cheque_tbl_status_fkey FOREIGN KEY (status) REFERENCES cheque_book_status_tbl(id)
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_cheque_book_cheque_tbl_book_id ON cheque_book_cheque_tbl(cheque_books_id)`
}

// user.id من useAuth() في الواجهة هو user_settings.user_id النصي وليس المفتاح الرقمي —
// نفس نمط الحل المستخدم في app/api/receipts/voucher-books/route.ts.
export const resolveUserId = async (varcharUserId: string | null | undefined): Promise<number | null> => {
  if (!varcharUserId) return null
  const rows = await sql`SELECT id FROM user_settings WHERE user_id = ${varcharUserId}`
  return rows[0]?.id ?? null
}

// عند الحفظ: الأسطر القديمة (لها id سابق) تحتفظ بمُصدرها الأصلي operation_user_id، والأسطر
// الجديدة (من "إصدار الشيكات آلياً") تُنسب للمستخدم الحالي.
export const saveChequeRows = async (bookId: number, cheques: any[], currentUserId: number | null) => {
  await sql`DELETE FROM cheque_book_cheque_tbl WHERE cheque_books_id = ${bookId}`
  const rows = (Array.isArray(cheques) ? cheques : []).filter((row) => row?.cheque_code)

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const operationUserId = row.operation_user_id || currentUserId
    await sql`
      INSERT INTO cheque_book_cheque_tbl (
        cheque_books_id, cheque_code, notes, operation_user_id, status, order_no
      ) VALUES (
        ${bookId}, ${row.cheque_code}, ${row.notes || ""}, ${operationUserId}, ${row.status || 1}, ${i + 1}
      )
    `
  }
}

// رقم الدفتر التالي (00000001 فصاعداً) — مُشترك بين شاشة الفتح (توليد رقم مبدئي) والحفظ
// (إعادة التوليد إذا استُبق الرقم من مستخدم آخر حفظ في نفس اللحظة تقريباً).
export const generateNextCode = async (): Promise<string> => {
  const rows = await sql`SELECT code FROM cheque_books_tbl`
  let maxNumber = 0
  for (const row of rows) {
    const value = Number(row.code)
    if (Number.isFinite(value) && value > maxNumber) maxNumber = value
  }
  return String(maxNumber + 1).padStart(8, "0")
}

export const fetchCheques = async (bookId: number) => sql`
  SELECT c.*, cs.name AS status_name, u.full_name AS operation_user_name
  FROM cheque_book_cheque_tbl c
  LEFT JOIN cheque_book_status_tbl cs ON cs.id = c.status
  LEFT JOIN user_settings u ON u.id = c.operation_user_id
  WHERE c.cheque_books_id = ${bookId}
  ORDER BY c.order_no, c.id
`

export const fetchBookWithJoins = async (id: number) => {
  const rows = await sql`
    SELECT cb.*, ba.code AS bank_account_code, ba.name AS bank_account_name, ba.currency_id,
           cur.currency_name, cur.currency_code
    FROM cheque_books_tbl cb
    LEFT JOIN bank_accounts ba ON ba.id = cb.bank_account_id
    LEFT JOIN currency cur ON cur.id = ba.currency_id
    WHERE cb.id = ${id}
  `
  if (!rows.length) return null
  const cheques = await fetchCheques(id)
  return { ...rows[0], cheques }
}
