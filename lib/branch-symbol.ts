import sql, { resolveCurrentDbName } from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { BRANCH_SYMBOLS } from "@/lib/voucher-code"

// رمز الفرع (حرف واحد: 0 أو A-Z) يدخل في كود كل سند: بادئة السند + رمز الفرع + رمز دفتر السندات
// + التسلسل. يُهيَّأ العمود ويُملأ للفروع القائمة (بترتيب الإنشاء) مرة واحدة لكل قاعدة شركة ولكل عملية خادم.
const ensuredByDb = new Map<string, Promise<void>>()

export const ensureBranchSymbolColumn = async (): Promise<void> => {
  const dbName = await resolveCurrentDbName()
  let ensured = ensuredByDb.get(dbName)
  if (!ensured) {
    ensured = (async () => {
      await sql`ALTER TABLE branches ADD COLUMN IF NOT EXISTS branch_symbol VARCHAR(1)`
      const rows = await sql`SELECT id, branch_symbol FROM branches ORDER BY id ASC`
      const used = new Set(rows.map((row: any) => String(row.branch_symbol || "").toUpperCase()).filter(Boolean))
      for (const row of rows as any[]) {
        if (row.branch_symbol) continue
        const symbol = BRANCH_SYMBOLS.find((candidate) => !used.has(candidate))
        if (!symbol) break
        used.add(symbol)
        await sql`UPDATE branches SET branch_symbol = ${symbol} WHERE id = ${row.id} AND branch_symbol IS NULL`
      }
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS branches_branch_symbol_key ON branches (branch_symbol) WHERE branch_symbol IS NOT NULL`
    })().catch((error) => {
      ensuredByDb.delete(dbName)
      throw error
    })
    ensuredByDb.set(dbName, ensured)
  }
  return ensured
}

export const resolveBranchSymbol = async (branchId: number | string | null | undefined): Promise<string> => {
  const id = Number(branchId)
  if (!Number.isInteger(id) || id <= 0) return ""
  await ensureBranchSymbolColumn()
  const rows = await sql`SELECT branch_symbol FROM branches WHERE id = ${id}`
  return String(rows[0]?.branch_symbol || "").trim().toUpperCase()
}

// جزء الكود بعد بادئة السند: رمز الفرع + رمز الدفتر. يُعاد "" إن لم يوجد دفتر (كما قبل).
export const withBranchSymbol = async (bookName: string, branchId: number | string | null | undefined): Promise<string> => {
  if (!bookName) return ""
  return `${await resolveBranchSymbol(branchId)}${bookName}`
}

// يتحقق من رمز الفرع المُرسَل: إلزامي، حرف واحد من 0 أو A-Z، وغير مكرَّر في فرع آخر. يُعيد رسالة الخطأ أو null.
export const validateBranchSymbol = async (
  raw: unknown,
  excludeBranchId?: number | null,
): Promise<{ symbol: string; error: string | null }> => {
  const symbol = String(raw ?? "").trim().toUpperCase()
  if (!symbol) return { symbol, error: "رمز الفرع مطلوب" }
  if (!BRANCH_SYMBOLS.includes(symbol)) return { symbol, error: "رمز الفرع يجب أن يكون 0 أو حرفاً إنجليزياً واحداً (A-Z)" }
  await ensureBranchSymbolColumn()
  const rows = await sql`SELECT id FROM branches WHERE branch_symbol = ${symbol} AND id <> ${excludeBranchId ?? 0} LIMIT 1`
  if (rows.length > 0) return { symbol, error: "رمز الفرع مستخدم في فرع آخر" }
  return { symbol, error: null }
}

// الفرع المعتمد لتوليد/تفسير رقم السند عندما لا يُمرَّر branch_id صراحةً (مثلاً أول توليد عند فتح سند جديد قبل أن
// يختار حقل الفرع قيمته الافتراضية): branch_id الصريح ثم الفرع النشط (هيدر x-branch-id) ثم فرع المستخدم الافتراضي.
export const requestBranchId = async (request: Request, explicit?: string | number | null): Promise<number | null> => {
  const fromParam = Number(explicit)
  if (Number.isInteger(fromParam) && fromParam > 0) return fromParam
  const fromHeader = Number(request.headers.get("x-branch-id"))
  if (Number.isInteger(fromHeader) && fromHeader > 0) return fromHeader
  try {
    const user = await getSessionUser(request as any)
    if (!user) return null
    const row = (await sql`SELECT branch_id FROM user_settings WHERE user_id = ${user.user_id} LIMIT 1`)[0]
    const fromUser = Number(row?.branch_id)
    return Number.isInteger(fromUser) && fromUser > 0 ? fromUser : null
  } catch {
    return null
  }
}
