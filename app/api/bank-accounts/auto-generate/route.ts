import { type NextRequest, NextResponse } from "next/server"
import { authorizeFile } from "@/lib/file-permissions"
import { BankAutoGenerateError, loadBankAutoParents, previewBankAccountAccounts, saveBankAutoParents } from "@/lib/bank-account-autogen"

// الإنشاء الآلي لحسابات الحساب البنكي: GET = اعدادات الحسابات الاب (أو ?preview=1 عرض الحسابات التي ستُنشأ)، PUT = حفظ الاعدادات
export async function GET(request: NextRequest) {
  try {
    const authorization = await authorizeFile(request, "bank-accounts", "create")
    if (!authorization.ok) return authorization.response
    const params = new URL(request.url).searchParams
    if (params.get("preview") === "1") {
      const items = await previewBankAccountAccounts({
        branchId: Number(params.get("branch_id")) || 0,
        currencyId: Number(params.get("currency_id")) || 0,
        actualCode: params.get("actual_bank_code") || "",
      })
      return NextResponse.json({ items })
    }
    return NextResponse.json({ parents: await loadBankAutoParents() })
  } catch (error: any) {
    if (error instanceof BankAutoGenerateError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("[bank-accounts/auto-generate] GET", error)
    return NextResponse.json({ error: error?.message || "تعذر تحميل اعدادات الإنشاء الآلي" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authorization = await authorizeFile(request, "bank-accounts", "update")
    if (!authorization.ok) return authorization.response
    await saveBankAutoParents(await request.json())
    return NextResponse.json({ parents: await loadBankAutoParents() })
  } catch (error: any) {
    if (error instanceof BankAutoGenerateError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("[bank-accounts/auto-generate] PUT", error)
    return NextResponse.json({ error: error?.message || "تعذر حفظ اعدادات الإنشاء الآلي" }, { status: 500 })
  }
}
