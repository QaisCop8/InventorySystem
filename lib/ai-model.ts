// نموذج Gemini لكل ميزات المساعد الذكي (المحادثة، مسودات السندات والطلبيات، تحويل الصوت لنص) — مكان واحد بدل
// تكرار الاسم في كل مسار. gemini-2.5-flash لم يعد متاحاً للمستخدمين الجدد (HTTP 404: "no longer available to new
// users") وتوصي Google بـ gemini-3.8-flash. يمكن تغييره دون تعديل الكود بمتغير البيئة GEMINI_MODEL.
export function geminiModel(): string {
  return (process.env.GEMINI_MODEL || "gemini-3.8-flash").trim()
}

// النموذج الأساسي ثم نماذج احتياطية اختيارية (GEMINI_FALLBACK_MODELS مفصولة بفواصل) تُجرَّب عند انشغال الأساسي
// ("high demand"/503) أو عدم توفره. بلا قيمة لهذا المتغير يُستخدم الأساسي وحده.
export function geminiModels(): string[] {
  const fallbacks = String(process.env.GEMINI_FALLBACK_MODELS || "").split(",").map((name) => name.trim()).filter(Boolean)
  return [...new Set([geminiModel(), ...fallbacks])]
}

/** خطأ مؤقت من الخدمة (انشغال/تجاوز حصة/عدم توفر) — يستحق تجربة نموذج آخر أو التحليل المحلي */
export function isTemporaryAiError(error: unknown): boolean {
  const status = statusOf(error)
  const message = messageOf(error)
  return [404, 429, 500, 502, 503, 504].includes(status) || /high demand|overloaded|unavailable|quota|rate limit|resource exhausted|try again later|failed after \d+ attempts|timeout|timed out|aborted|fetch failed|ECONNRESET|socket hang up/i.test(message)
}

const statusOf = (error: unknown) => Number((error as { statusCode?: number })?.statusCode
  ?? (error as { lastError?: { statusCode?: number } })?.lastError?.statusCode) || 0
const messageOf = (error: unknown) => {
  const own = error instanceof Error ? error.message : String(error ?? "")
  const last = (error as { lastError?: unknown })?.lastError
  return last instanceof Error ? `${own} ${last.message}` : own
}

/** النموذج غير موجود/غير متاح لهذا المفتاح — إعادة المحاولة عليه لا تفيد (يُجرَّب النموذج الاحتياطي فقط). */
const isModelUnavailable = (error: unknown) => statusOf(error) === 404 || /not found|no longer available|is not supported/i.test(messageOf(error))
/** تجاوز حصة الاستخدام (يومية/دقيقة) */
const isQuotaError = (error: unknown) => statusOf(error) === 429 || /quota|resource exhausted|rate limit/i.test(messageOf(error))

/** مهلة إعادة المحاولة التي يقترحها Gemini نفسه ("retry in 23s" / retryDelay: "23s")، بالمللي ثانية. */
function suggestedRetryMs(error: unknown): number | null {
  const match = /retry (?:in|after) ([\d.]+)\s*s|retryDelay"?\s*:\s*"?([\d.]+)s/i.exec(messageOf(error))
  const seconds = Number(match?.[1] ?? match?.[2])
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : null
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * يستدعي الذكاء الاصطناعي بالنموذج الأساسي ثم الاحتياطية، ثم يعيد الدورة بعد انتظار متزايد (2ث، 5ث...) عند
 * الانشغال المؤقت — بدل الفشل من أول "high demand". لا يتجاوز deadlineMs إجمالاً (المستخدم ينتظر الرد).
 * run يستقبل اسم النموذج والزمن المتبقي (لمهلة الاستدعاء نفسه).
 */
export async function runWithAiRetry<T>(run: (modelName: string, remainingMs: number) => Promise<T>, options: { deadlineMs?: number; rounds?: number } = {}): Promise<T> {
  const deadline = Date.now() + (options.deadlineMs ?? 90_000)
  const rounds = Math.max(1, options.rounds ?? 3)
  const unavailable = new Set<string>()
  let lastError: unknown = new Error("لا يوجد نموذج ذكاء اصطناعي متاح")
  for (let round = 0; round < rounds; round += 1) {
    for (const modelName of geminiModels()) {
      if (unavailable.has(modelName)) continue
      const remaining = deadline - Date.now()
      if (remaining < 5_000) throw lastError
      try {
        return await run(modelName, remaining)
      } catch (error) {
        lastError = error
        if (!isTemporaryAiError(error)) throw error
        if (isModelUnavailable(error)) unavailable.add(modelName)
      }
    }
    if (unavailable.size === geminiModels().length || round === rounds - 1) break
    const wait = Math.min(suggestedRetryMs(lastError) ?? [2_000, 5_000, 10_000][round] ?? 10_000, 20_000)
    if (Date.now() + wait + 5_000 > deadline) break
    await sleep(wait + Math.round(Math.random() * 500))
  }
  throw lastError
}

/** رسالة عربية واضحة لسبب فشل الذكاء الاصطناعي (بدل "مشغولة" لكل الحالات). */
export function aiFailureMessage(error: unknown, fallback: string): string {
  if (isModelUnavailable(error)) return "نموذج الذكاء الاصطناعي المحدد غير متاح لهذا الحساب — راجع إعداد GEMINI_MODEL على الخادم"
  if (isQuotaError(error)) {
    const retry = suggestedRetryMs(error)
    return retry && retry <= 120_000
      ? `تم تجاوز حد الاستخدام المسموح لخدمة الذكاء الاصطناعي مؤقتاً — أعد المحاولة بعد ${Math.ceil(retry / 1000)} ثانية`
      : "تم تجاوز حصة الاستخدام لخدمة الذكاء الاصطناعي — أعد المحاولة لاحقاً أو راجع حصة مفتاح Gemini"
  }
  if (/timeout|timed out|aborted/i.test(messageOf(error))) return "تأخرت خدمة الذكاء الاصطناعي في الرد — أعد المحاولة، أو استخدم ملفاً أصغر/صورة أوضح"
  if (isTemporaryAiError(error)) return "خدمة الذكاء الاصطناعي عليها ضغط عالٍ الآن، وأُعيدت المحاولة تلقائياً دون نجاح — أعد المحاولة بعد دقيقة"
  return fallback
}

/**
 * إعدادات الاستدعاءات السريعة (تحليل أمر قصير إلى JSON): بلا "تفكير" مطوّل، محاولة إعادة واحدة فقط، ومهلة
 * قصوى — كان كل طلب للمساعد ينتظر تفكير النموذج الكامل وإعادات متكررة عند الانشغال فيبقى "جاري المعالجة".
 * Gemini 3+ يستخدم thinkingLevel، و2.5 Flash يستخدم thinkingBudget = 0 (Pro لا يدعم إيقاف التفكير).
 */
export function aiCallOptions(modelName: string, options: { timeoutMs?: number; thinking?: "minimal" | "low" } = {}) {
  const name = modelName.toLowerCase()
  const thinkingConfig = /gemini-([3-9]|\d{2})/.test(name)
    ? { thinkingLevel: options.thinking || "minimal" }
    : /gemini-2\.5-flash/.test(name)
      ? { thinkingBudget: options.thinking === "low" ? 512 : 0 }
      : null
  return {
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    ...(thinkingConfig ? { providerOptions: { google: { thinkingConfig } } } : {}),
  }
}
