import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"

// هوية منفِّذ الإجراء تؤخذ من جلسة الخادم، لا من userId المرسَل بجسم الطلب/الرابط — سابقاً كان أي
// مستخدم مسجَّل يستطيع إرسال userId لمدير النظام فينفّذ باسمه إجراءات إدارية (تحويل، إنهاء/رفض
// إجباري، إغلاق طلبية، حذف سير عمل، اعتماد...). الواجهة ما زالت ترسل userId ويُتجاهَل هنا.
export async function resolveActingUserId(request: NextRequest): Promise<string | null> {
  const user = await getSessionUser(request)
  return user ? String(user.user_id) : null
}

export function unauthenticated() {
  return NextResponse.json({ error: "انتهت الجلسة — يرجى تسجيل الدخول مجدداً" }, { status: 401 })
}
