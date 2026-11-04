import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"
import sql, { resolveCurrentDbName, withTenantDb, withTenantTransaction } from "@/lib/database"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { getSmsSettings } from "@/lib/sms"
import {
  AID_STATUS, AidInputError, CODE_STATUS, ensureAidTables, insertLedger, issueCodeAndPin, sendParticipantSms, unallocatedBudget,
} from "@/lib/aid-program"

const MAX_IMPORT_ROWS = 5000
const round2 = (value: number) => Math.round(value * 100) / 100

// المستفيدون: GET قائمة نشاط (بحث بالاسم/الهوية/الجوال/الرمز)، POST action = import | topup | cancel | resend | unlock
export async function GET(request: NextRequest) {
  try {
    const authorization = await authorizeTransaction(request, "aid_program", "view")
    if (!authorization.ok) return authorization.response
    await ensureAidTables()
    const params = request.nextUrl.searchParams
    const activityId = Number(params.get("activity_id"))
    if (!(activityId > 0)) return NextResponse.json({ error: "اختر النشاط" }, { status: 400 })
    const q = String(params.get("q") || "").trim()
    const like = `%${q}%`
    const limit = Math.min(500, Math.max(1, Number(params.get("limit")) || 200))
    const offset = Math.max(0, Number(params.get("offset")) || 0)
    const rows = await sql`
      SELECT id, national_id, full_name, phone, household_size, balance, allocated, redeemed, redemptions,
        -- الرمز يُعرض مقنّعاً: الصرف يحتاج الرمز + الرقم السري، والرمز الكامل يصل للمستفيد بالرسالة
        CASE WHEN code IS NULL THEN NULL ELSE '******' || RIGHT(code, 4) END code_masked,
        code_status, (locked_until IS NOT NULL AND locked_until > CURRENT_TIMESTAMP) locked, sms_sent_at, created_at
      FROM aid_participants_tbl
      WHERE activity_id = ${activityId}
        AND (${q} = '' OR full_name ILIKE ${like} OR national_id LIKE ${like} OR phone LIKE ${like} OR code = ${q})
      ORDER BY id
      LIMIT ${limit} OFFSET ${offset}`
    const total = (await sql`SELECT COUNT(*)::int count FROM aid_participants_tbl WHERE activity_id = ${activityId}`)[0] as any
    return NextResponse.json({ rows, total: Number(total.count) })
  } catch (error) {
    console.error("[aid participants] GET failed", error)
    return NextResponse.json({ error: "تعذر تحميل المستفيدين" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json().catch(() => ({}))
    const action = String(data?.action || "")
    const authorization = await authorizeTransaction(request, "aid_program", action === "import" ? "create" : "update")
    if (!authorization.ok) return authorization.response
    await ensureAidTables()
    const userId = Number(authorization.userId) || null
    if (action === "import") return NextResponse.json(await importParticipants(data, userId))
    if (action === "topup") return NextResponse.json(await topUp(data, userId))
    if (action === "cancel") return NextResponse.json(await cancelCode(Number(data?.participant_id), userId))
    if (action === "resend") return NextResponse.json(await resendCode(Number(data?.participant_id), String(authorization.userId)))
    if (action === "unlock") {
      await sql`UPDATE aid_participants_tbl SET pin_failed = 0, locked_until = NULL WHERE id = ${Number(data?.participant_id)}`
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 })
  } catch (error) {
    if (error instanceof AidInputError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error("[aid participants] POST failed", error)
    return NextResponse.json({ error: "تعذر تنفيذ العملية" }, { status: 500 })
  }
}

async function loadActivity(activityId: number, forUpdate = false) {
  const rows = forUpdate
    ? await sql`SELECT a.*, (SELECT currency_code FROM currency c WHERE c.id = a.currency_id) currency_code FROM aid_activities_tbl a WHERE a.id = ${activityId} FOR UPDATE`
    : await sql`SELECT a.*, (SELECT currency_code FROM currency c WHERE c.id = a.currency_id) currency_code FROM aid_activities_tbl a WHERE a.id = ${activityId}`
  const activity = rows[0] as any
  if (!activity) throw new AidInputError("النشاط غير موجود", 404)
  if (Number(activity.status) === AID_STATUS.closed) throw new AidInputError("النشاط مغلق")
  return activity
}

type ImportRow = { national_id: string; full_name: string; phone: string; household_size: number | null; amount: number }

async function importParticipants(data: any, userId: number | null) {
  const activityId = Number(data?.activity_id)
  const input = Array.isArray(data?.rows) ? data.rows : []
  if (!input.length) throw new AidInputError("الملف لا يحتوي على مستفيدين")
  if (input.length > MAX_IMPORT_ROWS) throw new AidInputError(`الحد الأقصى ${MAX_IMPORT_ROWS} مستفيد في كل استيراد`)
  const activity = await loadActivity(activityId)
  const defaultAmount = Number(activity.amount_per_participant)

  // التحقق من كل صف: أخطاء الملف تُعاد كلها معاً ولا يُستورد شيء حتى يُصحَّح
  const errors: { row: number; error: string }[] = []
  const seen = new Set<string>()
  const valid: ImportRow[] = []
  input.forEach((raw: any, index: number) => {
    const row = index + 2 // الصف 1 عناوين الأعمدة في ملف Excel
    const nationalId = String(raw?.national_id ?? "").replace(/\s/g, "")
    const fullName = String(raw?.full_name ?? "").trim()
    const phone = String(raw?.phone ?? "").replace(/[^\d+]/g, "")
    const amount = raw?.amount === undefined || raw?.amount === null || raw?.amount === "" ? defaultAmount : round2(Number(raw.amount))
    const household = Number(raw?.household_size) > 0 ? Math.floor(Number(raw.household_size)) : null
    if (!/^\d{5,20}$/.test(nationalId)) return errors.push({ row, error: "رقم الهوية يجب أن يكون أرقاماً (5-20)" })
    if (!fullName) return errors.push({ row, error: "الاسم مطلوب" })
    if (phone.replace(/\D/g, "").length < 9) return errors.push({ row, error: "رقم الجوال غير صحيح (يصل عليه رمز الصرف)" })
    if (!Number.isFinite(amount) || amount <= 0) return errors.push({ row, error: "المبلغ يجب أن يكون أكبر من صفر" })
    if (seen.has(nationalId)) return errors.push({ row, error: `رقم الهوية ${nationalId} مكرر في الملف` })
    seen.add(nationalId)
    valid.push({ national_id: nationalId, full_name: fullName.slice(0, 200), phone: phone.slice(0, 30), household_size: household, amount })
  })
  if (valid.length) {
    const existing = await sql`SELECT national_id FROM aid_participants_tbl WHERE activity_id = ${activityId} AND national_id = ANY(${valid.map((row) => row.national_id)}::text[])`
    for (const row of existing as any[]) {
      errors.push({ row: input.findIndex((raw: any) => String(raw?.national_id ?? "").replace(/\s/g, "") === row.national_id) + 2, error: `رقم الهوية ${row.national_id} مسجّل مسبقاً في هذا النشاط` })
    }
  }
  if (errors.length) return { imported: 0, errors: errors.sort((a, b) => a.row - b.row) }

  const credentials = await Promise.all(valid.map(() => issueCodeAndPin()))
  // الرموز تُولَّد بالتوازي فقد تتكرر نادراً داخل الدفعة نفسها
  const codes = new Set<string>()
  for (const credential of credentials) {
    while (codes.has(credential.code)) credential.code = (await issueCodeAndPin()).code
    codes.add(credential.code)
  }
  const total = round2(valid.reduce((sum, row) => sum + row.amount, 0))

  const inserted = await withTenantTransaction(async () => {
    await loadActivity(activityId, true)
    const remaining = await unallocatedBudget(activityId)
    if (total > remaining + 0.004) throw new AidInputError(`مجموع أرصدة الملف (${total.toFixed(2)}) أكبر من ميزانية النشاط غير الموزّعة (${remaining.toFixed(2)})`)
    const rows = await sql`
      INSERT INTO aid_participants_tbl (activity_id, national_id, full_name, phone, household_size, balance, allocated, code, pin_hash, created_by)
      SELECT ${activityId}, n, f, p, h, a, a, c, ph, ${userId}
      FROM UNNEST(${valid.map((row) => row.national_id)}::text[], ${valid.map((row) => row.full_name)}::text[], ${valid.map((row) => row.phone)}::text[],
        ${valid.map((row) => row.household_size)}::int[], ${valid.map((row) => row.amount)}::numeric[], ${credentials.map((row) => row.code)}::text[],
        ${credentials.map((row) => row.pinHash)}::text[]) AS t(n, f, p, h, a, c, ph)
      RETURNING id, national_id, full_name, phone, balance, code`
    await sql`
      INSERT INTO aid_ledger_tbl (idem_key, activity_id, participant_id, entry_type, amount, program_delta, participant_delta, participant_balance_after, user_id, note)
      SELECT 'alloc:' || id, ${activityId}, id, 'allocate', balance, -balance, balance, balance, ${userId}, 'استيراد مستفيدين'
      FROM aid_participants_tbl WHERE id = ANY(${rows.map((row: any) => Number(row.id))}::int[])`
    return rows as any[]
  })

  const pinByCode = new Map(credentials.map((row) => [row.code, row.pin]))
  const smsReady = data?.send_sms !== false && Boolean((await getSmsSettings()).send_link?.trim())
  if (smsReady) {
    // الإرسال بعد الحفظ وفي الخلفية (قد يكون آلاف الرسائل): withTenantDb لأن سياق الطلب ينتهي بعد الرد
    const dbName = await resolveCurrentDbName()
    void withTenantDb(dbName, async () => {
      for (const row of inserted) {
        await sendParticipantSms(row, activity, row.code, pinByCode.get(row.code) || "", Number(row.balance), activity.currency_code || "", userId ? String(userId) : null)
          .catch((error) => console.error("[aid import] sms failed", error))
      }
    })
    return { imported: inserted.length, errors: [], sms: "background" }
  }
  // بلا مزوّد رسائل: تُعرض الرموز والأرقام السرية مرة واحدة فقط لتسليمها/طباعتها (لا تُحفظ صريحة في أي مكان)
  return {
    imported: inserted.length, errors: [], sms: "not_configured",
    credentials: inserted.map((row) => ({ national_id: row.national_id, full_name: row.full_name, phone: row.phone, code: row.code, pin: pinByCode.get(row.code), balance: Number(row.balance) })),
  }
}

async function topUp(data: any, userId: number | null) {
  const activityId = Number(data?.activity_id)
  const amount = round2(Number(data?.amount))
  if (!(amount > 0)) throw new AidInputError("مبلغ التعبئة يجب أن يكون أكبر من صفر")
  // request_id من المتصفح: إعادة إرسال نفس الطلب (انقطاع اتصال) لا تعبّئ مرتين
  const requestId = String(data?.request_id || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 60) || crypto.randomUUID()
  const ids = data?.all === true ? null : [...new Set((Array.isArray(data?.participant_ids) ? data.participant_ids : []).map(Number).filter((id: number) => id > 0))]
  if (ids && !ids.length) throw new AidInputError("اختر المستفيدين")
  return withTenantTransaction(async () => {
    await loadActivity(activityId, true)
    const targets = await sql`
      SELECT id FROM aid_participants_tbl
      WHERE activity_id = ${activityId} AND code_status = ${CODE_STATUS.active} AND (${ids === null} OR id = ANY(${ids || []}::int[]))
        AND NOT EXISTS (SELECT 1 FROM aid_ledger_tbl l WHERE l.idem_key = 'topup:' || ${requestId} || ':' || aid_participants_tbl.id)
      FOR UPDATE`
    if (!targets.length) return { updated: 0 }
    const total = round2(amount * targets.length)
    const remaining = await unallocatedBudget(activityId)
    if (total > remaining + 0.004) throw new AidInputError(`مجموع التعبئة (${total.toFixed(2)}) أكبر من ميزانية النشاط غير الموزّعة (${remaining.toFixed(2)})`)
    const targetIds = targets.map((row: any) => Number(row.id))
    await sql`UPDATE aid_participants_tbl SET balance = balance + ${amount}, allocated = allocated + ${amount} WHERE id = ANY(${targetIds}::int[])`
    await sql`
      INSERT INTO aid_ledger_tbl (idem_key, activity_id, participant_id, entry_type, amount, program_delta, participant_delta, participant_balance_after, user_id, note)
      SELECT 'topup:' || ${requestId} || ':' || id, ${activityId}, id, 'topup', ${amount}, ${-amount}, ${amount}, balance, ${userId}, ${String(data?.note || "").trim() || null}
      FROM aid_participants_tbl WHERE id = ANY(${targetIds}::int[])`
    return { updated: targets.length, total }
  })
}

async function cancelCode(participantId: number, userId: number | null) {
  return withTenantTransaction(async () => {
    const participant = (await sql`SELECT * FROM aid_participants_tbl WHERE id = ${participantId} FOR UPDATE`)[0] as any
    if (!participant) throw new AidInputError("المستفيد غير موجود", 404)
    if (Number(participant.code_status) !== CODE_STATUS.active) throw new AidInputError("الرمز ملغى مسبقاً")
    const balance = Number(participant.balance)
    await sql`UPDATE aid_participants_tbl SET code_status = ${CODE_STATUS.cancelled}, balance = 0 WHERE id = ${participantId}`
    // باقي الرصيد يعود لميزانية النشاط غير الموزّعة
    if (balance > 0) {
      await insertLedger({
        idemKey: `cancel:${participantId}`, activityId: Number(participant.activity_id), participantId, type: "cancel", amount: balance,
        programDelta: balance, participantDelta: -balance, balanceAfter: 0, userId, note: "إلغاء رمز المستفيد",
      })
    }
    return { success: true, returned: balance }
  })
}

/** رقم سري جديد (الرمز نفسه يبقى) ويُرسل برسالة؛ إن تعذّر الإرسال يُعاد الرقم مرة واحدة للتسليم اليدوي. */
async function resendCode(participantId: number, userId: string) {
  const participant = (await sql`SELECT * FROM aid_participants_tbl WHERE id = ${participantId}`)[0] as any
  if (!participant) throw new AidInputError("المستفيد غير موجود", 404)
  if (Number(participant.code_status) !== CODE_STATUS.active) throw new AidInputError("الرمز ملغى")
  const activity = await loadActivity(Number(participant.activity_id))
  const { pin, pinHash } = await issueCodeAndPin()
  await sql`UPDATE aid_participants_tbl SET pin_hash = ${pinHash}, pin_failed = 0, locked_until = NULL WHERE id = ${participantId}`
  const result = await sendParticipantSms(participant, activity, String(participant.code), pin, Number(participant.balance), activity.currency_code || "", userId)
  return result.sent ? { sent: true } : { sent: false, error: result.error, code: participant.code, pin }
}
