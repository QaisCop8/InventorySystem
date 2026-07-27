"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { CheckCircle2, XCircle, Loader2 } from "lucide-react"

export default function VerifyEmailPage() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [error, setError] = useState("")

  useEffect(() => {
    const token = searchParams.get("token")
    if (!token) {
      setStatus("error")
      setError("رابط التأكيد غير صالح")
      return
    }

    fetch(`/api/management/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) {
          setStatus("error")
          setError(data.error || "تعذّر تأكيد البريد الإلكتروني")
          return
        }
        setStatus("success")
      })
      .catch(() => {
        setStatus("error")
        setError("تعذّر الاتصال بالخادم")
      })
  }, [searchParams])

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
        {status === "loading" && (
          <>
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-slate-400" />
            <p className="text-slate-600">جاري تأكيد بريدك الإلكتروني...</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-500" />
            <h1 className="text-xl font-bold text-slate-900">تم تأكيد البريد الإلكتروني بنجاح</h1>
            <Link href="/management/login" className="mt-6 inline-block text-sm font-medium text-violet-600 hover:underline">
              الذهاب لتسجيل الدخول
            </Link>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
            <h1 className="text-xl font-bold text-slate-900">تعذّر تأكيد البريد الإلكتروني</h1>
            <p className="mt-2 text-sm text-slate-500">{error}</p>
            <Link href="/management/login" className="mt-6 inline-block text-sm font-medium text-violet-600 hover:underline">
              الذهاب لتسجيل الدخول
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
