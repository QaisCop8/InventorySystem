// نموذج Gemini لكل ميزات المساعد الذكي (المحادثة، مسودات السندات والطلبيات، تحويل الصوت لنص) — مكان واحد بدل
// تكرار الاسم في كل مسار. gemini-2.5-flash لم يعد متاحاً للمستخدمين الجدد (HTTP 404: "no longer available to new
// users") وتوصي Google بـ gemini-3.8-flash. يمكن تغييره دون تعديل الكود بمتغير البيئة GEMINI_MODEL.
export function geminiModel(): string {
  return (process.env.GEMINI_MODEL || "gemini-3.8-flash").trim()
}
