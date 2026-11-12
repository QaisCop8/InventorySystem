"use client"

import { tr, appDir } from "@/lib/i18n"
import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import { suggestTemplateDefaults } from "@/lib/account-template-defaults"

type Parent = { kind: string; label: string; account_id: number | null; code: string; name: string }

// الآباء الافتراضيون من هيكل الحسابات الجاهز (عمود default_type) — تُعبّأ بها الحقول الفارغة ويمكن تغييرها قبل الحفظ
const TEMPLATE_PARENTS = {
  jary: { defaultType: "حساب محاسبي - الحساب البنكي" },
  tahsil: { defaultType: "حساب التحصيل - حساب بنكي" },
  tahsil_commission: { defaultType: "حساب عمولة - حساب بنكي" },
  payed_checks: { defaultType: "حساب شيكات صادرة - حساب بنكي" },
  returned_checks: { defaultType: "حساب الشيكات الراجعة" },
}

/**
 * "اعدادات" الإنشاء الآلي في حسابات البنوك: الحساب الاب لكل حساب من حسابات الحساب البنكي (كما في الشامل:
 * الحسابات الافتراضية للحساب البنكي ...). تحت كل اب يُنشأ حساب للبنك ثم حساب فرعي لكل حساب بنكي.
 */
export default function BankAccountsAutoSettings({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved?: () => void }) {
  const [parents, setParents] = useState<Parent[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    setError("")
    setLoading(true)
    fetch("/api/bank-accounts/auto-generate", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data?.error || tr("تعذر تحميل الاعدادات"))
        const rows: Parent[] = Array.isArray(data.parents) ? data.parents : []
        setParents(rows)
        const saved: Record<string, string> = Object.fromEntries(rows.map((row) => [row.kind, row.account_id ? String(row.account_id) : ""]))
        setValues(saved)
        const suggestions = await suggestTemplateDefaults(TEMPLATE_PARENTS, saved).catch(() => ({}))
        if (Object.keys(suggestions).length) setValues((current) => ({ ...current, ...Object.fromEntries(Object.entries(suggestions).filter(([key]) => !current[key])) }))
      })
      .catch((err) => setError(err instanceof Error ? err.message : tr("تعذر تحميل الاعدادات")))
      .finally(() => setLoading(false))
  }, [open])

  const save = async () => {
    setSaving(true)
    setError("")
    try {
      const response = await fetch("/api/bank-accounts/auto-generate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(parents.map((row) => [row.kind, Number(values[row.kind]) || null]))),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || tr("تعذر حفظ الاعدادات"))
      onSaved?.()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("تعذر حفظ الاعدادات"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={appDir()} className="w-[calc(100vw-1rem)] max-w-2xl" onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader><DialogTitle>{tr("اعدادات الإنشاء الآلي للحسابات البنكية")}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          {tr("تحت كل حساب اب يُنشأ حساب باسم البنك (مرة واحدة لكل بنك)، ثم حساب فرعي لكل حساب بنكي باسم البنك ورقم الحساب الفعلي والعملة. حساب عمولة التحصيل: حساب واحد لكل بنك تحت الحساب الاب.")}
        </p>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid gap-3">
            {parents.map((row) => (
              <AutoCompleteAccount
                key={row.kind}
                label={row.label}
                valueMode="id"
                value={values[row.kind] || ""}
                onValueChange={(value) => setValues((current) => ({ ...current, [row.kind]: value }))}
                showCostCenterButton={false}
                searchAllowedTypeValues={[1]}
                leafOnly={false}
              />
            ))}
          </div>
        )}
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tr("إلغاء")}</Button>
          <Button onClick={() => void save()} disabled={saving || loading}>{saving && <Loader2 className="me-1 h-4 w-4 animate-spin" />}{tr("حفظ")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
