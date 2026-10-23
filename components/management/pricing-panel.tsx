"use client"

import { useEffect, useState } from "react"
import { CreditCard, Loader2, Save } from "lucide-react"
import { priceFor, type Pricing } from "@/lib/company-pricing"

// تبويب "الأسعار" بلوحة إدارة المنصة: سعر اشتراك الشركة السنوي الذي يُدفع عبر لحظة عند إنشاء شركة جديدة.
export function PricingPanel() {
  const [pricing, setPricing] = useState<Pricing | null>(null)
  const [contacts, setContacts] = useState({ phone: "", whatsapp: "" })
  const [enabled, setEnabled] = useState(false)
  const [testMode, setTestMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    fetch("/api/management/pricing", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => { setPricing(data.pricing); setContacts(data.contacts || { phone: "", whatsapp: "" }); setEnabled(Boolean(data.enabled)); setTestMode(Boolean(data.testMode)) })
      .catch(() => setMessage({ type: "error", text: "تعذّر تحميل الأسعار" }))
  }, [])

  const save = async () => {
    if (!pricing) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch("/api/management/pricing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...pricing, contacts }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "تعذّر حفظ الأسعار")
      setPricing(data.pricing)
      if (data.contacts) setContacts(data.contacts)
      setMessage({ type: "success", text: "تم حفظ الأسعار" })
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "تعذّر حفظ الأسعار" })
    } finally {
      setSaving(false)
    }
  }

  if (!pricing) return <div className="grid h-40 place-items-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
  const example = priceFor(pricing, { users: 5, branches: 2, posPoints: 1, restaurantLocations: 1 })
  const field = (key: keyof Omit<Pricing, "currency">, label: string, hint: string) => (
    <label className="block text-sm">
      <span className="font-semibold text-slate-700">{label}</span>
      <input type="number" min={0} step="0.01" value={pricing[key]} onChange={(event) => setPricing({ ...pricing, [key]: Number(event.target.value) })}
        className="mt-1 block h-10 w-full rounded-lg border border-slate-300 px-3 text-right tabular-nums focus:border-violet-500 focus:outline-none" />
      <span className="mt-1 block text-xs text-slate-500">{hint}</span>
    </label>
  )

  return (
    <div className="space-y-4" dir="rtl">
      <div className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${enabled ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
        <CreditCard className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <b>{enabled ? `الدفع عبر لحظة مفعّل${testMode ? " (وضع تجريبي)" : ""}` : "الدفع عبر لحظة غير مفعّل"}</b>
          <p className="mt-1 text-xs leading-6">
            {enabled
              ? "عند إنشاء شركة جديدة يدفع المستخدم الاشتراك السنوي ببطاقة، وتُنشأ الشركة تلقائياً بعد نجاح الدفع."
              : "اضبط LAHZA_SECRET_KEY على الخادم وسعراً أساسياً أكبر من صفر لتفعيله. بدونه تبقى الشركات الجديدة بانتظار موافقتك."}
          </p>
        </div>
      </div>
      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-6">
        <label className="block text-sm">
          <span className="font-semibold text-slate-700">العملة</span>
          <select value={pricing.currency} onChange={(event) => setPricing({ ...pricing, currency: event.target.value as Pricing["currency"] })}
            className="mt-1 block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 focus:border-violet-500 focus:outline-none">
            <option value="USD">USD — دولار</option><option value="ILS">ILS — شيكل</option><option value="JOD">JOD — دينار</option>
          </select>
        </label>
        {field("base_price", "السعر الأساسي", "يشمل مستخدماً وفرعاً واحداً")}
        {field("per_user", "لكل مستخدم إضافي", "سنوياً")}
        {field("per_branch", "لكل فرع إضافي", "سنوياً")}
        {field("per_pos_point", "لكل نقطة بيع", "سنوياً")}
        {field("per_restaurant_location", "لكل موقع مطعم", "سنوياً")}
      </div>
      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
        <p className="text-sm font-bold text-slate-700 sm:col-span-2">التواصل مع المبيعات (يظهر في صفحة خيارات الدفع)</p>
        <label className="block text-sm">
          <span className="font-semibold text-slate-700">رقم الهاتف</span>
          <input dir="ltr" value={contacts.phone} onChange={(event) => setContacts({ ...contacts, phone: event.target.value })} maxLength={40}
            className="mt-1 block h-10 w-full rounded-lg border border-slate-300 px-3 text-left focus:border-violet-500 focus:outline-none" placeholder="+970 ..." />
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-slate-700">رقم الواتساب</span>
          <input dir="ltr" value={contacts.whatsapp} onChange={(event) => setContacts({ ...contacts, whatsapp: event.target.value })} maxLength={40}
            className="mt-1 block h-10 w-full rounded-lg border border-slate-300 px-3 text-left focus:border-violet-500 focus:outline-none" placeholder="+970 ..." />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <span className="text-slate-600">مثال: 5 مستخدمين، فرعان، نقطة بيع، موقع مطعم = <b className="tabular-nums text-slate-900" dir="ltr">{example.total.toFixed(2)} {example.currency}</b> سنوياً</span>
        <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-violet-600 px-5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ الأسعار
        </button>
      </div>
      {message && <p className={`text-sm ${message.type === "success" ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>}
    </div>
  )
}
