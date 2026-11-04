import crypto from "crypto"
import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"
import { getSmsSettings, logSms, normalizeMobile, sendSmsRaw } from "@/lib/sms"

// برامج المساعدات (قسائم بلا بطاقة): نشاط مساعدة (ممول/جهة مانحة + ميزانية + فترة + أصناف ونقاط بيع مسموحة)،
// مستفيدون برصيد ورمز + PIN يصلهم برسالة SMS، والصرف من كاشير نقطة البيع كطريقة دفع "قسيمة مساعدة".
//
// الدفاتر الثلاثة في سجل واحد غير قابل للتعديل (aid_ledger_tbl)، كل قيد يحمل أثره على كل دفتر:
//   program_delta     — رصيد الميزانية غير الموزّع للنشاط (الجهة المانحة): التوزيع ينقصه، إلغاء رمز يعيد باقيه
//   participant_delta — رصيد المستفيد: التوزيع/التعبئة تزيده، الصرف ينقصه، العكس يعيده
//   vendor_delta      — مستحقات نقطة البيع (المتجر) على الجهة المانحة: الصرف يزيدها، العكس ينقصها
// المعادلة دائماً: الميزانية = غير الموزّع + أرصدة المستفيدين + مستحقات المتاجر (+ المسدد لاحقاً).
// idem_key فريد: نفس عملية البيع (pos_client_sale_id) لا تُخصم مرتين مهما أُعيد إرسالها.

export const AID_STATUS = { active: 1, frozen: 2, closed: 3 } as const
export const CODE_STATUS = { active: 1, cancelled: 3 } as const
export const AID_ENTRY_LABELS: Record<string, string> = {
  allocate: "توزيع رصيد", topup: "تعبئة رصيد", redeem: "صرف من نقطة بيع", reverse: "عكس صرف", cancel: "إلغاء رمز وإرجاع الباقي",
}
const MAX_PIN_FAILURES = 5
const PIN_LOCK_MINUTES = 30

export class AidInputError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export function ensureAidTables() {
  return runSchemaOnce("lib/aid-program.ts#ensureAidTables", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS aid_activities_tbl (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        donor_name VARCHAR(200),
        donor_account_id INTEGER NOT NULL,
        currency_id INTEGER NOT NULL,
        amount_per_participant NUMERIC(14,2) NOT NULL DEFAULT 0,
        budget NUMERIC(14,2) NOT NULL DEFAULT 0,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        all_items BOOLEAN NOT NULL DEFAULT TRUE,
        all_points BOOLEAN NOT NULL DEFAULT TRUE,
        max_redemptions INTEGER,
        status SMALLINT NOT NULL DEFAULT 1,
        notes TEXT,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    await sql`
      CREATE TABLE IF NOT EXISTS aid_activity_items_tbl (
        id SERIAL PRIMARY KEY,
        activity_id INTEGER NOT NULL REFERENCES aid_activities_tbl(id) ON DELETE CASCADE,
        product_id INTEGER,
        category_id INTEGER
      )`
    await sql`CREATE INDEX IF NOT EXISTS idx_aid_activity_items_activity ON aid_activity_items_tbl(activity_id)`
    await sql`
      CREATE TABLE IF NOT EXISTS aid_activity_points_tbl (
        activity_id INTEGER NOT NULL REFERENCES aid_activities_tbl(id) ON DELETE CASCADE,
        pos_point_id INTEGER NOT NULL,
        PRIMARY KEY (activity_id, pos_point_id)
      )`
    await sql`
      CREATE TABLE IF NOT EXISTS aid_participants_tbl (
        id SERIAL PRIMARY KEY,
        activity_id INTEGER NOT NULL REFERENCES aid_activities_tbl(id),
        national_id VARCHAR(30) NOT NULL,
        full_name VARCHAR(200) NOT NULL,
        phone VARCHAR(30),
        household_size INTEGER,
        balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
        allocated NUMERIC(14,2) NOT NULL DEFAULT 0,
        redeemed NUMERIC(14,2) NOT NULL DEFAULT 0,
        redemptions INTEGER NOT NULL DEFAULT 0,
        code VARCHAR(20) UNIQUE,
        pin_hash TEXT,
        pin_failed INTEGER NOT NULL DEFAULT 0,
        locked_until TIMESTAMP,
        code_status SMALLINT NOT NULL DEFAULT 1,
        sms_sent_at TIMESTAMP,
        notes TEXT,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (activity_id, national_id)
      )`
    await sql`
      CREATE TABLE IF NOT EXISTS aid_ledger_tbl (
        id BIGSERIAL PRIMARY KEY,
        idem_key VARCHAR(160) NOT NULL UNIQUE,
        activity_id INTEGER NOT NULL REFERENCES aid_activities_tbl(id),
        participant_id INTEGER REFERENCES aid_participants_tbl(id),
        pos_point_id INTEGER,
        entry_type VARCHAR(20) NOT NULL,
        amount NUMERIC(14,2) NOT NULL,
        program_delta NUMERIC(14,2) NOT NULL DEFAULT 0,
        participant_delta NUMERIC(14,2) NOT NULL DEFAULT 0,
        vendor_delta NUMERIC(14,2) NOT NULL DEFAULT 0,
        participant_balance_after NUMERIC(14,2),
        voucher_id INTEGER,
        reverses_id BIGINT REFERENCES aid_ledger_tbl(id),
        user_id INTEGER,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    await sql`CREATE INDEX IF NOT EXISTS idx_aid_ledger_activity ON aid_ledger_tbl(activity_id, created_at)`
    await sql`CREATE INDEX IF NOT EXISTS idx_aid_ledger_participant ON aid_ledger_tbl(participant_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_aid_ledger_voucher ON aid_ledger_tbl(voucher_id)`
  })
}

const round2 = (value: number) => Math.round(value * 100) / 100

// الرقم السري 4 أرقام: حمايته الفعلية قفل الرمز بعد 5 محاولات، لا قوة التجزئة. HMAC بسر الخادم + ملح لكل صف يمنع
// استنتاجه من نسخة قاعدة بيانات مسرّبة دون السر، وسريع لاستيراد آلاف المستفيدين (bcrypt كان سيستغرق دقائق).
function pinSecret() {
  return process.env.AID_PIN_SECRET || crypto.createHash("sha256").update(`aid-pin:${process.env.DATABASE_URL || ""}`).digest("hex")
}

function hashPin(pin: string) {
  const salt = crypto.randomBytes(8).toString("hex")
  return `h1$${salt}$${crypto.createHmac("sha256", pinSecret()).update(`${salt}:${pin}`).digest("hex")}`
}

function pinMatches(pin: string, stored: string) {
  const [version, salt, digest] = String(stored || "").split("$")
  if (version !== "h1" || !salt || !digest) return false
  const expected = crypto.createHmac("sha256", pinSecret()).update(`${salt}:${pin}`).digest("hex")
  return expected.length === digest.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(digest))
}

function randomDigits(length: number) {
  let out = ""
  while (out.length < length) out += String(crypto.randomInt(0, 10))
  return out
}

/** رمز من 10 أرقام (أول رقم ليس صفراً) فريد على مستوى الشركة. */
async function newUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = String(crypto.randomInt(1, 10)) + randomDigits(9)
    if (!(await sql`SELECT 1 FROM aid_participants_tbl WHERE code = ${code}`).length) return code
  }
  throw new Error("تعذر توليد رمز فريد")
}

export async function issueCodeAndPin(): Promise<{ code: string; pin: string; pinHash: string }> {
  const pin = randomDigits(4)
  return { code: await newUniqueCode(), pin, pinHash: hashPin(pin) }
}

export async function insertLedger(entry: {
  idemKey: string; activityId: number; participantId?: number | null; posPointId?: number | null; type: string; amount: number
  programDelta?: number; participantDelta?: number; vendorDelta?: number; balanceAfter?: number | null; voucherId?: number | null
  reversesId?: number | null; userId?: number | null; note?: string | null
}): Promise<number | null> {
  const rows = await sql`
    INSERT INTO aid_ledger_tbl (idem_key, activity_id, participant_id, pos_point_id, entry_type, amount, program_delta, participant_delta,
      vendor_delta, participant_balance_after, voucher_id, reverses_id, user_id, note)
    VALUES (${entry.idemKey}, ${entry.activityId}, ${entry.participantId ?? null}, ${entry.posPointId ?? null}, ${entry.type}, ${round2(entry.amount)},
      ${round2(entry.programDelta || 0)}, ${round2(entry.participantDelta || 0)}, ${round2(entry.vendorDelta || 0)}, ${entry.balanceAfter ?? null},
      ${entry.voucherId ?? null}, ${entry.reversesId ?? null}, ${entry.userId ?? null}, ${entry.note ?? null})
    ON CONFLICT (idem_key) DO NOTHING
    RETURNING id`
  return rows[0] ? Number(rows[0].id) : null
}

/** غير الموزّع من ميزانية النشاط = الميزانية + مجموع program_delta. */
export async function unallocatedBudget(activityId: number): Promise<number> {
  const row = (await sql`
    SELECT a.budget + COALESCE((SELECT SUM(program_delta) FROM aid_ledger_tbl l WHERE l.activity_id = a.id), 0) AS remaining
    FROM aid_activities_tbl a WHERE a.id = ${activityId}`)[0]
  return Number(row?.remaining || 0)
}

/** إضافة رصيد لمستفيد (توزيع أول أو تعبئة) من ميزانية النشاط — داخل معاملة. */
export async function creditParticipant(input: { activityId: number; participantId: number; amount: number; type: "allocate" | "topup"; idemKey: string; userId: number | null; note?: string | null }) {
  const amount = round2(input.amount)
  if (!(amount > 0)) throw new AidInputError("المبلغ يجب أن يكون أكبر من صفر")
  await sql`SELECT id FROM aid_activities_tbl WHERE id = ${input.activityId} FOR UPDATE`
  if (amount > (await unallocatedBudget(input.activityId)) + 0.004) throw new AidInputError("ميزانية النشاط غير الموزّعة لا تكفي لهذا المبلغ")
  const participant = (await sql`
    UPDATE aid_participants_tbl SET balance = balance + ${amount}, allocated = allocated + ${amount}
    WHERE id = ${input.participantId} AND activity_id = ${input.activityId} AND code_status = ${CODE_STATUS.active}
    RETURNING balance`)[0]
  if (!participant) throw new AidInputError("المستفيد غير موجود أو رمزه ملغى")
  await insertLedger({
    idemKey: input.idemKey, activityId: input.activityId, participantId: input.participantId, type: input.type, amount,
    programDelta: -amount, participantDelta: amount, balanceAfter: Number(participant.balance), userId: input.userId, note: input.note,
  })
}

export async function sendParticipantSms(participant: { id: number; full_name: string; phone: string | null }, activity: { name: string }, code: string, pin: string, balance: number, currencyCode: string, userId: string | null) {
  if (!participant.phone) return { sent: false, error: "لا يوجد رقم جوال" }
  const settings = await getSmsSettings()
  const mobile = normalizeMobile(participant.phone, settings.country_code || "")
  const message = `${activity.name}: رصيدك ${balance.toFixed(2)} ${currencyCode}. رمز الصرف ${code} والرقم السري ${pin}. لا تشارك الرقم السري مع أحد.`
  const result = await sendSmsRaw(mobile, message, settings)
  // السجل يحفظ الرسالة بدون الرقم السري
  await logSms({ docKey: "aid_code", documentId: participant.id, code, partyName: participant.full_name, mobile, message: message.replace(pin, "****"), result, userId })
  if (result.sent) await sql`UPDATE aid_participants_tbl SET sms_sent_at = CURRENT_TIMESTAMP WHERE id = ${participant.id}`
  return { sent: result.sent, error: result.error }
}

type EligibleLine = { product_id: number; amount: number }

/** نشاط الرمز صالح لهذه النقطة واليوم؟ يعيد سبب الرفض أو null. */
function activityProblem(row: any, pointId: number, pointCurrencyId: number, today: string, pointAllowed: boolean) {
  if (Number(row.status) !== AID_STATUS.active) return "نشاط المساعدة غير فعّال"
  if (String(row.start_date) > today) return "نشاط المساعدة لم يبدأ بعد"
  if (String(row.end_date) < today) return "انتهت فترة نشاط المساعدة"
  if (!row.all_points && !pointAllowed) return "نقطة البيع هذه غير معتمدة لهذا النشاط"
  if (Number(row.currency_id) !== pointCurrencyId) return "عملة نشاط المساعدة تختلف عن عملة نقطة البيع"
  if (Number(row.max_redemptions) > 0 && Number(row.redemptions) >= Number(row.max_redemptions)) return "استنفد المستفيد عدد مرات الصرف المسموحة"
  void pointId
  return null
}

async function eligibleAmount(activity: any, lines: EligibleLine[]) {
  const total = round2(lines.reduce((sum, line) => sum + Math.max(0, Number(line.amount) || 0), 0))
  if (activity.all_items) return total
  const productIds = [...new Set(lines.map((line) => Number(line.product_id)).filter((id) => id > 0))]
  if (!productIds.length) return 0
  const allowed = new Set((await sql`
    SELECT p.id FROM products p
    WHERE p.id = ANY(${productIds}::int[]) AND EXISTS (
      SELECT 1 FROM aid_activity_items_tbl i WHERE i.activity_id = ${Number(activity.id)} AND (i.product_id = p.id OR (i.category_id IS NOT NULL AND i.category_id = p.category_id))
    )`).map((row: any) => Number(row.id)))
  return round2(lines.filter((line) => allowed.has(Number(line.product_id))).reduce((sum, line) => sum + Math.max(0, Number(line.amount) || 0), 0))
}

/**
 * التحقق من رمز + PIN لنقطة بيع. lock=true (داخل معاملة الحفظ) يقفل صف المستفيد حتى نهاية المعاملة.
 * PIN خاطئ يزيد العداد (يُحفظ حتى لو أُلغيت معاملة الاستدعاء لأنه أمر منفصل خارجها عند lock=false فقط).
 */
export async function checkAidCode(input: { code: string; pin: string; point: any; lines: EligibleLine[]; lock: boolean; today: string }) {
  const code = String(input.code || "").replace(/\D/g, "")
  const pin = String(input.pin || "").replace(/\D/g, "")
  if (code.length !== 10 || pin.length !== 4) throw new AidInputError("أدخل رمز الصرف (10 أرقام) والرقم السري (4 أرقام)")
  const rows = input.lock
    ? await sql`SELECT * FROM aid_participants_tbl WHERE code = ${code} FOR UPDATE`
    : await sql`SELECT * FROM aid_participants_tbl WHERE code = ${code}`
  const participant = rows[0]
  if (!participant) throw new AidInputError("رمز الصرف غير صحيح")
  if (Number(participant.code_status) !== CODE_STATUS.active) throw new AidInputError("رمز الصرف ملغى")
  if (participant.locked_until && new Date(participant.locked_until) > new Date()) {
    throw new AidInputError(`الرمز مقفل بسبب محاولات خاطئة متكررة — حاول بعد ${PIN_LOCK_MINUTES} دقيقة أو اطلب فك القفل من إدارة البرنامج`, 423)
  }
  const ok = participant.pin_hash ? pinMatches(pin, String(participant.pin_hash)) : false
  if (!ok) {
    const failed = Number(participant.pin_failed || 0) + 1
    const lock = failed >= MAX_PIN_FAILURES
    await sql`UPDATE aid_participants_tbl SET pin_failed = ${lock ? 0 : failed}, locked_until = ${lock ? new Date(Date.now() + PIN_LOCK_MINUTES * 60_000) : null} WHERE id = ${Number(participant.id)}`
    throw new AidInputError(lock ? "تم قفل الرمز بعد 5 محاولات خاطئة" : `الرقم السري غير صحيح (تبقى ${MAX_PIN_FAILURES - failed} محاولات)`)
  }
  if (Number(participant.pin_failed) > 0) await sql`UPDATE aid_participants_tbl SET pin_failed = 0, locked_until = NULL WHERE id = ${Number(participant.id)}`

  const pointId = Number(input.point.id)
  const activity = (await sql`
    SELECT a.*, EXISTS (SELECT 1 FROM aid_activity_points_tbl p WHERE p.activity_id = a.id AND p.pos_point_id = ${pointId}) point_allowed,
      (SELECT currency_code FROM currency c WHERE c.id = a.currency_id) currency_code
    FROM aid_activities_tbl a WHERE a.id = ${Number(participant.activity_id)}`)[0] as any
  const problem = activityProblem({ ...activity, redemptions: participant.redemptions }, pointId, Number(input.point.currency_id), input.today, Boolean(activity?.point_allowed))
  if (!activity || problem) throw new AidInputError(problem || "نشاط المساعدة غير موجود")
  const eligible = await eligibleAmount(activity, input.lines)
  return {
    participant, activity, eligible,
    available: round2(Math.min(Number(participant.balance), eligible)),
  }
}

/**
 * صرف قسيمة ضمن معاملة حفظ فاتورة الكاشير — يُستدعى بعد حفظ الفاتورة (voucherId) بنفس المعاملة.
 * idem_key = pos:<clientSaleId>: إعادة إرسال نفس البيع لا تخصم مرة ثانية.
 */
export async function redeemAidVoucher(input: { checked: Awaited<ReturnType<typeof checkAidCode>>; amount: number; voucherId: number; pointId: number; clientSaleId: string; userId: number | null }) {
  const amount = round2(input.amount)
  const { participant, activity } = input.checked
  if (!(amount > 0)) throw new AidInputError("مبلغ القسيمة غير صالح")
  if (amount > input.checked.available + 0.004) throw new AidInputError(`مبلغ القسيمة يتجاوز المتاح (${input.checked.available.toFixed(2)}) — رصيد المستفيد أو قيمة الأصناف المسموحة`)
  // القيد أولاً: إن كانت العملية مصروفة مسبقاً (نفس idem_key) يتوقف هنا قبل أي تغيير على الرصيد. صف المستفيد مقفل
  // (checkAidCode lock=true) فرصيده بعد الصرف محسوب بثقة.
  const balanceAfter = round2(Number(participant.balance) - amount)
  const id = await insertLedger({
    idemKey: `pos:${input.clientSaleId}`, activityId: Number(activity.id), participantId: Number(participant.id), posPointId: input.pointId,
    type: "redeem", amount, participantDelta: -amount, vendorDelta: amount, balanceAfter, voucherId: input.voucherId, userId: input.userId,
  })
  if (!id) throw new AidInputError("تم صرف هذه العملية مسبقاً", 409)
  const updated = (await sql`
    UPDATE aid_participants_tbl SET balance = balance - ${amount}, redeemed = redeemed + ${amount}, redemptions = redemptions + 1
    WHERE id = ${Number(participant.id)} AND balance >= ${amount}
    RETURNING balance`)[0]
  // القيد المُدرج أعلاه يُلغى مع المعاملة كلها عند هذا الخطأ
  if (!updated) throw new AidInputError("رصيد المستفيد غير كافٍ")
}

/** عكس صرف قسائم فاتورة ملغاة — قيد جديد مرتبط بالأصل (لا يُعدَّل الأصل)، مرة واحدة لكل قيد. */
export async function reverseAidForVoucher(voucherId: number, userId: number | null) {
  const exists = (await sql`SELECT to_regclass('aid_ledger_tbl') t`)[0]
  if (!exists?.t) return
  const entries = await sql`
    SELECT l.* FROM aid_ledger_tbl l
    WHERE l.voucher_id = ${voucherId} AND l.entry_type = 'redeem'
      AND NOT EXISTS (SELECT 1 FROM aid_ledger_tbl r WHERE r.reverses_id = l.id)
    ORDER BY l.id FOR UPDATE`
  for (const entry of entries) {
    const amount = Number(entry.amount)
    const updated = (await sql`
      UPDATE aid_participants_tbl SET balance = balance + ${amount}, redeemed = redeemed - ${amount}, redemptions = GREATEST(redemptions - 1, 0)
      WHERE id = ${Number(entry.participant_id)} RETURNING balance`)[0]
    await insertLedger({
      idemKey: `reverse:${entry.id}`, activityId: Number(entry.activity_id), participantId: Number(entry.participant_id), posPointId: entry.pos_point_id,
      type: "reverse", amount, participantDelta: amount, vendorDelta: -amount, balanceAfter: updated ? Number(updated.balance) : null,
      voucherId, reversesId: Number(entry.id), userId, note: "إلغاء فاتورة الكاشير",
    })
  }
}

/** ملخص الدفاتر الثلاثة لنشاط + فحص التوازن. */
export async function aidLedgerSummary(activityId: number) {
  const activity = (await sql`SELECT a.*, (SELECT currency_code FROM currency c WHERE c.id = a.currency_id) currency_code FROM aid_activities_tbl a WHERE a.id = ${activityId}`)[0] as any
  if (!activity) return null
  const totals = (await sql`
    SELECT COALESCE(SUM(program_delta), 0) program, COALESCE(SUM(participant_delta), 0) participants, COALESCE(SUM(vendor_delta), 0) vendors,
      COALESCE(SUM(amount) FILTER (WHERE entry_type = 'redeem'), 0) redeemed, COALESCE(SUM(amount) FILTER (WHERE entry_type = 'reverse'), 0) reversed,
      COUNT(*) FILTER (WHERE entry_type = 'redeem')::int redeem_count
    FROM aid_ledger_tbl WHERE activity_id = ${activityId}`)[0] as any
  const participants = (await sql`
    SELECT COUNT(*)::int count, COALESCE(SUM(balance), 0) balance, COUNT(*) FILTER (WHERE code_status = ${CODE_STATUS.active})::int active
    FROM aid_participants_tbl WHERE activity_id = ${activityId}`)[0] as any
  // شركة لم تُعرّف نقاط بيع بعد لا جدول pos_points_tbl لديها
  const pointNames = (await sql`SELECT to_regclass('pos_points_tbl') t`)[0]?.t
    ? sql`(SELECT name FROM pos_points_tbl pp WHERE pp.id = l.pos_point_id)` : sql`NULL::text`
  const vendors = await sql`
    SELECT l.pos_point_id, ${pointNames} point_name, SUM(l.vendor_delta) due, COUNT(*) FILTER (WHERE l.entry_type = 'redeem')::int redeem_count
    FROM aid_ledger_tbl l
    WHERE l.activity_id = ${activityId} AND l.pos_point_id IS NOT NULL
    GROUP BY l.pos_point_id ORDER BY l.pos_point_id`
  const budget = Number(activity.budget)
  const unallocated = round2(budget + Number(totals.program))
  const participantBalances = round2(Number(totals.participants))
  const vendorDue = round2(Number(totals.vendors))
  // التحقق المزدوج: رصيد المستفيدين المخزّن = مجموع قيودهم
  const storedBalances = round2(Number(participants.balance))
  return {
    activity,
    program: { budget, unallocated, allocated: round2(budget - unallocated) },
    participants: { count: participants.count, active: participants.active, balance: participantBalances, stored_balance: storedBalances },
    vendors: { due: vendorDue, rows: vendors.map((row: any) => ({ ...row, due: Number(row.due) })) },
    redeemed: round2(Number(totals.redeemed) - Number(totals.reversed)),
    redeem_count: totals.redeem_count,
    balanced: Math.abs(budget - (unallocated + participantBalances + vendorDue)) < 0.01 && Math.abs(participantBalances - storedBalances) < 0.01,
  }
}
