"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"

type Parent = { kind: string; label: string; account_id: number | null; code: string; name: string }

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
        if (!response.ok) throw new Error(data?.error || "تعذر تحميل الاعدادات")
        const rows: Parent[] = Array.isArray(data.parents) ? data.parents : []
        setParents(rows)
        setValues(Object.fromEntries(rows.map((row) => [row.kind, row.account_id ? String(row.account_id) : ""])))
      })
      .catch((err) => setError(err instanceof Error ? err.message : "تعذر تحميل الاعدادات"))
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
      if (!response.ok) throw new Error(data?.error || "تعذر حفظ الاعدادات")
      onSaved?.()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حفظ الاعدادات")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="w-[calc(100vw-1rem)] max-w-2xl" onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader><DialogTitle>اعدادات الإنشاء الآلي للحسابات البنكية</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          تحت كل حساب اب يُنشأ حساب باسم البنك (مرة واحدة لكل بنك)، ثم حساب فرعي لكل حساب بنكي باسم البنك ورقم الحساب الفعلي والعملة.
          حساب عمولة التحصيل: حساب واحد لكل بنك تحت الحساب الاب.
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={() => void save()} disabled={saving || loading}>{saving && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
