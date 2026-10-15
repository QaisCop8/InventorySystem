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
  const status = Number((error as { statusCode?: number; lastError?: { statusCode?: number } })?.statusCode
    ?? (error as { lastError?: { statusCode?: number } })?.lastError?.statusCode) || 0
  const message = error instanceof Error ? error.message : String(error ?? "")
  return [404, 429, 500, 502, 503, 504].includes(status) || /high demand|overloaded|unavailable|quota|rate limit|resource exhausted|try again later|failed after \d+ attempts/i.test(message)
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
