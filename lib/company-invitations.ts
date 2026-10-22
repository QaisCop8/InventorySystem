import managementSql, { ensureManagementTables } from "@/lib/management-db"
import sql, { withTenantDb } from "@/lib/database"

// دعوات الشركات: إضافة مستخدم ببريد ليس له حساب إدارة بعد لا تُنشئ حساباً في management.users (كان التسجيل
// لاحقاً بنفس البريد يُرفض "البريد الإلكتروني مستخدَم مسبقاً") — تُسجَّل دعوة معلّقة فقط، وتتحوّل لعضوية
// شركة (user_company) عند التسجيل أو تعيين كلمة المرور من بريد الدعوة. تغيير بريد مستخدم الشركة ينقل
// العضوية/الدعوة للبريد الجديد.

let ensured: Promise<void> | null = null
function ensureTable() {
  if (!ensured) {
    ensured = (async () => {
      await ensureManagementTables()
      await managementSql`
        CREATE TABLE IF NOT EXISTS company_invitations (
          id SERIAL PRIMARY KEY,
          email VARCHAR(150) NOT NULL,
          company_id INTEGER NOT NULL,
          db_name VARCHAR(100),
          tenant_user_id VARCHAR(60),
          full_name VARCHAR(200),
          status VARCHAR(16) NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          accepted_at TIMESTAMP
        )`
      await managementSql`CREATE INDEX IF NOT EXISTS idx_company_invitations_email ON company_invitations (LOWER(email), status)`
    })().catch((error) => { ensured = null; throw error })
  }
  return ensured
}

const normalize = (email: unknown) => String(email || "").trim().toLowerCase()

/** دعوة معلّقة (تستبدل أي دعوة معلّقة سابقة لنفس مستخدم الشركة). */
export async function inviteEmailToCompany(input: { email: string; companyId: number; dbName: string; tenantUserId: string | number; fullName?: string | null }) {
  await ensureTable()
  const email = normalize(input.email)
  if (!email) return
  await managementSql`
    UPDATE company_invitations SET status = 'cancelled'
    WHERE company_id = ${input.companyId} AND tenant_user_id = ${String(input.tenantUserId)} AND status = 'pending'`
  await managementSql`
    INSERT INTO company_invitations (email, company_id, db_name, tenant_user_id, full_name)
    VALUES (${email}, ${input.companyId}, ${input.dbName}, ${String(input.tenantUserId)}, ${input.fullName || null})`
}

/** اسم المدعو (لإنشاء حساب الإدارة عند تعيين كلمة المرور من بريد الدعوة). */
export async function invitedFullName(email: string): Promise<string | null> {
  await ensureTable()
  const row = (await managementSql`
    SELECT full_name FROM company_invitations WHERE LOWER(email) = ${normalize(email)} AND status = 'pending'
    ORDER BY id DESC LIMIT 1`)[0] as any
  return row?.full_name || null
}

/** تحويل الدعوات المعلّقة لهذا البريد إلى عضويات شركة وربط مستخدمي الشركات بحساب الإدارة. */
export async function acceptCompanyInvitations(email: string, managementUserId: number, passwordHash?: string | null) {
  await ensureTable()
  const pending = await managementSql`
    SELECT id, company_id, db_name, tenant_user_id FROM company_invitations
    WHERE LOWER(email) = ${normalize(email)} AND status = 'pending' ORDER BY id` as any[]
  for (const invite of pending) {
    await managementSql`
      INSERT INTO user_company (user_id, company_id, role, is_active) VALUES (${managementUserId}, ${invite.company_id}, 'employee', true)
      ON CONFLICT (user_id, company_id) DO UPDATE SET is_active = true`
    if (invite.db_name && invite.tenant_user_id) {
      await withTenantDb(String(invite.db_name), () => sql`
        UPDATE user_settings SET management_user_id = ${managementUserId},
          password_hash = COALESCE(${passwordHash ?? null}, password_hash), updated_at = CURRENT_TIMESTAMP
        WHERE user_id::text = ${String(invite.tenant_user_id)}`)
        .catch((error) => console.error(`[company-invitations] could not link user in ${invite.db_name}`, error))
    }
    await managementSql`UPDATE company_invitations SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP WHERE id = ${invite.id}`
  }
  return pending.length
}

/**
 * بعد تغيير بريد مستخدم الشركة (أو عدم تطابق ربطه مع بريده): يُربط بحساب الإدارة صاحب البريد الجديد إن وُجد،
 * وإلا تُنشأ دعوة للبريد الجديد. تُزال عضوية الحساب القديم في هذه الشركة إن لم يبق له مستخدم فيها.
 */
export async function relinkTenantUserEmail(input: {
  dbName: string; companyId: number; tenantUserId: string | number; email: string; fullName?: string | null; previousManagementUserId?: number | null
}): Promise<{ linked: boolean; invited: boolean }> {
  await ensureTable()
  const email = normalize(input.email)
  if (!email) return { linked: false, invited: false }
  const identity = (await managementSql`SELECT id, password_hash FROM users WHERE LOWER(email) = ${email} LIMIT 1`)[0] as any
  await managementSql`
    UPDATE company_invitations SET status = 'cancelled'
    WHERE company_id = ${input.companyId} AND tenant_user_id = ${String(input.tenantUserId)} AND status = 'pending'`

  const previous = Number(input.previousManagementUserId) || null
  if (previous && (!identity || Number(identity.id) !== previous)) {
    // الحساب القديم: تُزال عضويته في الشركة إن لم يعد له مستخدم آخر فيها
    const stillUsed: any[] = await withTenantDb(input.dbName, () => sql`
      SELECT 1 FROM user_settings WHERE management_user_id = ${previous} AND user_id::text <> ${String(input.tenantUserId)} LIMIT 1`)
    if (!stillUsed.length) await managementSql`DELETE FROM user_company WHERE user_id = ${previous} AND company_id = ${input.companyId} AND COALESCE(role, 'owner') <> 'owner'`
  }

  if (identity) {
    await managementSql`
      INSERT INTO user_company (user_id, company_id, role, is_active) VALUES (${Number(identity.id)}, ${input.companyId}, 'employee', true)
      ON CONFLICT (user_id, company_id) DO UPDATE SET is_active = true`
    await withTenantDb(input.dbName, () => sql`
      UPDATE user_settings SET management_user_id = ${Number(identity.id)},
        password_hash = COALESCE(${identity.password_hash ?? null}, password_hash), updated_at = CURRENT_TIMESTAMP
      WHERE user_id::text = ${String(input.tenantUserId)}`)
    return { linked: true, invited: false }
  }

  await withTenantDb(input.dbName, () => sql`UPDATE user_settings SET management_user_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id::text = ${String(input.tenantUserId)}`)
  await inviteEmailToCompany({ email, companyId: input.companyId, dbName: input.dbName, tenantUserId: input.tenantUserId, fullName: input.fullName })
  return { linked: false, invited: true }
}
