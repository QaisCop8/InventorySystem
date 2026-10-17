import { NextResponse, type NextRequest } from "next/server"
import { generateText } from "ai"
import { google } from "@ai-sdk/google"
import { resolveCurrentDbName } from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { aiCallOptions, aiFailureMessage, runWithAiRetry } from "@/lib/ai-model"

export const maxDuration = 120
import { briefingBranchIds, briefingPromptData, buildMorningBriefing, type MorningBriefing } from "@/lib/morning-briefing"

// الملخص الصباحي: GET ?date=YYYY-MM-DD (افتراضياً أمس) &ai=1 لإضافة فقرة التحليل بالذكاء الاصطناعي.
// النتيجة تُخزَّن 10 دقائق لكل (شركة، يوم، فروع) — فتح الصفحة عدة مرات لا يعيد الاستعلامات ولا يستهلك حصة النموذج.
const CACHE_MS = 10 * 60_000
const cache = new Map<string, { at: number; briefing: MorningBriefing; summary?: { text: string | null; error?: string } }>()

const yesterday = () => {
  const date = new Date()
  date.setDate(date.getDate() - 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

const INSTRUCTIONS = `أنت محلل أعمال لشركة تجارية. ستصلك أرقام يوم عمل واحد بصيغة JSON.
اكتب بالعربية ملخصاً قصيراً لصاحب العمل:
- فقرة واحدة (3-4 جمل) عن أداء اليوم مقارنة بنفس اليوم من الأسبوع الماضي وأبرز سبب ظاهر في الأرقام (فرع، مردودات، خصومات...).
- ثم "إجراءات مقترحة:" وتحتها 3 نقاط عملية مرقمة بالأولوية (تحصيل، مخزون، شيكات، فروقات صناديق...).
لا تخترع أرقاماً غير موجودة، واذكر المبالغ بالعملة المعطاة. لا تستخدم تنسيق Markdown غير الترقيم البسيط.`

async function aiSummary(briefing: MorningBriefing): Promise<{ text: string | null; error?: string }> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return { text: null, error: "لم يُعرَّف مفتاح خدمة الذكاء الاصطناعي" }
  const prompt = JSON.stringify(briefingPromptData(briefing))
  try {
    // إعادة تلقائية عند الانشغال المؤقت (النموذج الأساسي ثم الاحتياطية، بانتظار متزايد)
    const text = await runWithAiRetry(async (modelName, remainingMs) => {
      const result = await generateText({ ...aiCallOptions(modelName, { timeoutMs: Math.min(45_000, remainingMs), thinking: "low" }), model: google(modelName), instructions: INSTRUCTIONS, prompt })
      return result.text
    }, { deadlineMs: 75_000 })
    return { text: text.trim() || null }
  } catch (error) {
    console.error("Morning briefing AI summary failed:", error)
    return { text: null, error: aiFailureMessage(error, "تعذر إنشاء التحليل الذكي") }
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const params = request.nextUrl.searchParams
    const requested = params.get("date") || ""
    const day = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : yesterday()
    const withAi = params.get("ai") === "1"
    const refresh = params.get("refresh") === "1"

    const branchIds = await briefingBranchIds(user.user_id)
    const key = `${await resolveCurrentDbName()}|${day}|${branchIds.join(",")}`
    let entry = cache.get(key)
    if (!entry || refresh || Date.now() - entry.at > CACHE_MS) {
      entry = { at: Date.now(), briefing: await buildMorningBriefing(day, branchIds) }
      cache.set(key, entry)
      if (cache.size > 200) cache.delete(cache.keys().next().value as string)
    }
    // تحليل فشل سابقاً (انشغال الخدمة) لا يُخزَّن — يُعاد طلبه عند الفتح التالي
    if (withAi && (!entry.summary || !entry.summary.text)) entry.summary = await aiSummary(entry.briefing)
    return NextResponse.json({ ...entry.briefing, summary: entry.summary ?? null, generated_at: new Date(entry.at).toISOString() })
  } catch (error) {
    console.error("Morning briefing error:", error)
    return NextResponse.json({ error: "تعذر إعداد الملخص الصباحي" }, { status: 500 })
  }
}
