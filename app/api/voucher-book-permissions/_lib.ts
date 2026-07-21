import sql from "@/lib/database"

// صلاحيات المستخدمين على دفاتر السندات.
//
// voucher_types_tbl and voucher_books_tbl are the real, pre-existing tables (already used by
// vouchers/vouchers_log/customer_vouchers under the older names voucher_types/voucher_books —
// this app's `_tbl` naming convention just hadn't caught up with them yet). ensureTables()
// migrates those legacy tables into the `_tbl`-named ones exactly once (repointing every FK
// that referenced them), then becomes a no-op on subsequent calls once the legacy tables are
// gone. voucher_books_tbl is a single global list of codes (not per voucher type) — which type
// a book applies to is decided per-user by voucher_book_user_permissions_tbl, not by the book
// row itself.
export const ensureTables = async () => {
  // --- voucher_types_tbl (migrated from legacy voucher_types) ---
  await sql`
    CREATE TABLE IF NOT EXISTS voucher_types_tbl (
      id INTEGER PRIMARY KEY,
      name VARCHAR(50),
      status INTEGER DEFAULT 1
    )
  `
  await sql`ALTER TABLE voucher_types_tbl ADD COLUMN IF NOT EXISTS status INTEGER DEFAULT 1`

  const legacyTypes = await sql`SELECT to_regclass('public.voucher_types') AS reg`
  if (legacyTypes[0]?.reg) {
    await sql`
      INSERT INTO voucher_types_tbl (id, name, status)
      SELECT id, name, COALESCE(status, 1) FROM voucher_types
      ON CONFLICT (id) DO NOTHING
    `
    await sql`ALTER TABLE vouchers DROP CONSTRAINT IF EXISTS vouchers_vch_type_fkey`
    await sql`ALTER TABLE vouchers ADD CONSTRAINT vouchers_vch_type_fkey FOREIGN KEY (vch_type) REFERENCES voucher_types_tbl(id)`
    await sql`ALTER TABLE vouchers_log DROP CONSTRAINT IF EXISTS vouchers_log_voucher_type_fkey`
    await sql`ALTER TABLE vouchers_log ADD CONSTRAINT vouchers_log_voucher_type_fkey FOREIGN KEY (voucher_type) REFERENCES voucher_types_tbl(id)`
    await sql`ALTER TABLE customer_vouchers DROP CONSTRAINT IF EXISTS fk_voucher`
    await sql`
      ALTER TABLE customer_vouchers
      ADD CONSTRAINT fk_voucher FOREIGN KEY (voucher_id) REFERENCES voucher_types_tbl(id) ON DELETE CASCADE
    `
    await sql`DROP TABLE voucher_types`
  }

  // --- voucher_books_tbl (renamed from legacy voucher_books) ---
  const legacyBooks = await sql`SELECT to_regclass('public.voucher_books') AS reg`
  const booksTbl = await sql`SELECT to_regclass('public.voucher_books_tbl') AS reg`
  if (legacyBooks[0]?.reg && !booksTbl[0]?.reg) {
    await sql`ALTER TABLE voucher_books RENAME TO voucher_books_tbl`
  }
  await sql`
    CREATE TABLE IF NOT EXISTS voucher_books_tbl (
      id SERIAL PRIMARY KEY,
      name VARCHAR(10) NOT NULL
    )
  `
  // The legacy table used a fixed-length CHAR(2), which left codes like "B " space-padded.
  await sql`ALTER TABLE voucher_books_tbl ALTER COLUMN name TYPE VARCHAR(10) USING TRIM(name)`
  await sql`INSERT INTO voucher_books_tbl (id, name) VALUES (1, 'A') ON CONFLICT (id) DO NOTHING`
  await sql`
    INSERT INTO voucher_books_tbl (name)
    SELECT '0' WHERE NOT EXISTS (SELECT 1 FROM voucher_books_tbl WHERE name = '0')
  `

  await sql`
    CREATE TABLE IF NOT EXISTS voucher_book_user_permissions_tbl (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES user_settings(id) ON DELETE CASCADE,
      voucher_type_id INTEGER REFERENCES voucher_types_tbl(id) ON DELETE CASCADE,
      vch_book_id INTEGER,
      is_default INTEGER DEFAULT 0
    )
  `
  await sql`ALTER TABLE voucher_book_user_permissions_tbl DROP CONSTRAINT IF EXISTS voucher_book_user_permissions_tbl_vch_book_id_fkey`
  await sql`
    ALTER TABLE voucher_book_user_permissions_tbl
    ADD CONSTRAINT voucher_book_user_permissions_tbl_vch_book_id_fkey
    FOREIGN KEY (vch_book_id) REFERENCES voucher_books_tbl(id) ON DELETE CASCADE
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_voucher_book_user_permissions_user ON voucher_book_user_permissions_tbl(user_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_voucher_book_user_permissions_type ON voucher_book_user_permissions_tbl(voucher_type_id)`

  // Superseded by voucher_books_tbl above.
  await sql`DROP TABLE IF EXISTS receipt_voucher_books_tbl`
}

export const fetchPermissionsForUser = async (userId: number) => {
  // Every voucher type gets a row now — book permissions aren't only for سند قبض/سند صرف.
  const types = await sql`SELECT id, name FROM voucher_types_tbl WHERE COALESCE(status, 1) != 3 ORDER BY id`
  const books = await sql`SELECT id, name FROM voucher_books_tbl ORDER BY name`
  const permissions = await sql`
    SELECT voucher_type_id, vch_book_id, is_default
    FROM voucher_book_user_permissions_tbl
    WHERE user_id = ${userId}
  `

  return types.map((type: any) => {
    const typeId = Number(type.id)
    const typePermissions = permissions.filter((p: any) => Number(p.voucher_type_id) === typeId)
    const assignedBookIds = typePermissions.map((p: any) => Number(p.vch_book_id))
    const defaultPermission = typePermissions.find((p: any) => Number(p.is_default) === 1)

    return {
      voucher_type_id: typeId,
      voucher_type_name: type.name,
      books: books.map((b: any) => ({ id: b.id, name: b.name })),
      assigned_book_ids: assignedBookIds,
      default_book_id: defaultPermission ? Number(defaultPermission.vch_book_id) : null,
    }
  })
}
