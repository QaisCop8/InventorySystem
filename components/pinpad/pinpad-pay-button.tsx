"use client"

import { useState } from "react"
import { CreditCard, Loader2, Settings2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PinpadSettingsRequired, payWithPinpad, pinpadMachineName, savePinpadSettings, type PinpadResult, type PinpadSettings } from "@/lib/pinpad"

// زر "إرسال للجهاز" لدفعات البطاقة المربوطة بجهاز دفع (lib/pinpad.ts) — يُستخدم في الكاشير وسند القبض.
// عند طلب الخدمة ضبط الإعدادات تظهر نافذة إعدادات الجهاز (منفذ COM/السرعة أو IP للبنك فلسطين...) ثم تُعاد المحاولة تلقائياً.
type Props = {
  machineId: number
  amount: number
  currency: string
  batch: string | number
  disabled?: boolean
  onSuccess: (result: PinpadResult) => void
  onError?: (message: string) => void
  className?: string
}

const PORTS = Array.from({ length: 20 }, (_, index) => `COM${index + 1}`)
const BAUDS = [9600, 19200, 38400, 57600, 115200]
const inputClass = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900"

export function PinpadPayButton({ machineId, amount, currency, batch, disabled, onSuccess, onError, className }: Props) {
  const [busy, setBusy] = useState(false)
  // "retry": فُتحت لأن الخدمة طلبت الإعدادات ← تُعاد المحاولة بعد الحفظ؛ "manual": من زر الإعدادات فقط.
  const [settingsOpen, setSettingsOpen] = useState<false | "retry" | "manual">(false)

  const pay = async () => {
    setBusy(true)
    try {
      onSuccess(await payWithPinpad({ machineId, amount, currency, batch }))
    } catch (error) {
      if (error instanceof PinpadSettingsRequired) setSettingsOpen("retry")
      else onError?.(error instanceof Error ? error.message : "تعذر الدفع عبر الجهاز")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className={`flex gap-1 ${className || ""}`}>
        <Button type="button" onClick={() => void pay()} disabled={disabled || busy || !(amount > 0)} className="flex-1 bg-sky-600 hover:bg-sky-700">
          {busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <CreditCard className="ml-2 h-4 w-4" />}
          {busy ? "بانتظار تمرير البطاقة على الجهاز..." : "إرسال للجهاز"}
        </Button>
        <Button type="button" variant="outline" size="icon" title="إعدادات جهاز الدفع" onClick={() => setSettingsOpen("manual")} disabled={busy}>
          <Settings2 className="h-4 w-4" />
        </Button>
      </div>
      {settingsOpen && (
        <PinpadSettingsDialog
          machineId={machineId}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => { const retry = settingsOpen === "retry"; setSettingsOpen(false); if (retry) void pay() }}
        />
      )}
    </>
  )
}

export function PinpadSettingsDialog({ machineId, onClose, onSaved }: { machineId: number; onClose: () => void; onSaved: () => void }) {
  const [settings, setSettings] = useState<PinpadSettings>({ port: "COM1", baudRate: 9600, ipAddress: "", language: 1, slipPrint: 1, protocol: "1", mid: "", tid: "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const set = <K extends keyof PinpadSettings>(key: K, value: PinpadSettings[K]) => setSettings((current) => ({ ...current, [key]: value }))

  const missing = machineId === 2
    ? !settings.ipAddress?.trim() || !String(settings.port || "").trim()
    : machineId === 3
      ? !settings.port || !settings.protocol?.trim() || !settings.mid?.trim() || !settings.tid?.trim()
      : !settings.port

  const save = async () => {
    setSaving(true); setError("")
    try {
      await savePinpadSettings(machineId, settings)
      onSaved()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر حفظ الإعدادات")
    } finally { setSaving(false) }
  }

  const field = (label: string, control: React.ReactNode) => <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{label}{control}</label>

  return (
    <div className="fixed inset-0 z-[3100] grid place-items-center bg-slate-950/45 p-3" dir="rtl">
      <div role="dialog" aria-modal="true" aria-label="إعدادات جهاز الدفع" className="w-[min(440px,100%)] overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center gap-3 bg-gradient-to-l from-sky-600 to-indigo-600 px-5 py-3 text-white">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15"><Settings2 className="h-5 w-5" /></span>
          <div className="flex-1">
            <h2 className="text-base font-bold">إعدادات جهاز الدفع</h2>
            <p className="text-xs text-white/85">{pinpadMachineName(machineId)} — تُحفظ على هذا الجهاز فقط</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-white/15" aria-label="إغلاق"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {machineId === 2 ? (
            <>
              {field("عنوان IP للجهاز", <input dir="ltr" className={inputClass} value={settings.ipAddress || ""} onChange={(e) => set("ipAddress", e.target.value)} placeholder="192.168.1.50" />)}
              {field("المنفذ (Port)", <input dir="ltr" inputMode="numeric" className={inputClass} value={settings.port === "COM1" ? "" : settings.port || ""} onChange={(e) => set("port", e.target.value.replace(/\D/g, ""))} placeholder="5000" />)}
              {field("لغة الجهاز", <select className={inputClass} value={settings.language} onChange={(e) => set("language", Number(e.target.value) as 1 | 2)}><option value={1}>عربي</option><option value={2}>English</option></select>)}
              {field("طباعة الوصل", <select className={inputClass} value={settings.slipPrint} onChange={(e) => set("slipPrint", Number(e.target.value) as 1 | 2)}><option value={1}>وصل الزبون فقط</option><option value={2}>وصل الزبون والتاجر</option></select>)}
            </>
          ) : (
            <>
              {field("منفذ COM", <select dir="ltr" className={inputClass} value={settings.port} onChange={(e) => set("port", e.target.value)}>{PORTS.map((port) => <option key={port} value={port}>{port}</option>)}</select>)}
              {field("السرعة (Baud rate)", <select dir="ltr" className={inputClass} value={settings.baudRate} onChange={(e) => set("baudRate", Number(e.target.value))}>{BAUDS.map((baud) => <option key={baud} value={baud}>{baud}</option>)}</select>)}
              {machineId === 3 && (
                <>
                  {field("البروتوكول", <input dir="ltr" className={inputClass} value={settings.protocol || ""} onChange={(e) => set("protocol", e.target.value)} />)}
                  {field("MID", <input dir="ltr" className={inputClass} value={settings.mid || ""} onChange={(e) => set("mid", e.target.value)} />)}
                  {field("TID", <input dir="ltr" className={inputClass} value={settings.tid || ""} onChange={(e) => set("tid", e.target.value)} />)}
                </>
              )}
            </>
          )}
          {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 sm:col-span-2">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-3 dark:bg-slate-800">
          <Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button onClick={() => void save()} disabled={saving || missing} className="bg-sky-600 hover:bg-sky-700">
            {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ وإعادة الإرسال
          </Button>
        </div>
      </div>
    </div>
  )
}
