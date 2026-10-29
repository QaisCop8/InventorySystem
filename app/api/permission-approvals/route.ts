import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import { requestPermissionApproval, verifyPermissionApproval, type ApprovalScope } from "@/lib/permission-approvals"

// رمز تفعيل صلاحية غير ممنوحة في الكاشير/المطعم (lib/permission-approvals.ts):
// action=request ⇐ يرسل الرمز لايميلي مدير النظام والمسؤول؛ action=verify ⇐ يتحقق ويعيد رمز موافقة مؤقتاً.
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const data = await request.json().catch(() => ({}))
    const action = String(data?.action || "")
    if (action === "request") {
      const scope = String(data.scope || "") as ApprovalScope
      if (scope !== "pos" && scope !== "restaurant") return NextResponse.json({ error: "نوع الطلب غير صالح" }, { status: 400 })
      const result = await requestPermissionApproval({
        userId: String(user.user_id), userName: user.full_name || user.username || String(user.user_id),
        scope, scopeId: Number(data.scope_id) || 0, permission: String(data.permission || ""),
      })
      return NextResponse.json({ id: result.id, sent_to: result.sentTo, minutes: result.minutes })
    }
    if (action === "verify") {
      const result = await verifyPermissionApproval({ userId: String(user.user_id), id: Number(data.id) || 0, code: String(data.code || "") })
      return NextResponse.json({ token: result.token, scope: result.scope, permission: result.permission, minutes: result.minutes })
    }
    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 })
  } catch (error: any) {
    const status = Number(error?.status) || 500
    if (status >= 500) console.error("[permission-approvals]", error)
    return NextResponse.json({ error: error?.message || "تعذر تنفيذ الطلب" }, { status })
  }
}
