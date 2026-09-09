"use client"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useId } from "react"

export function ReportCurrencyFilter({ currencies, value, onChange }: {
  currencies: { id: number; currency_code?: string; currency_name?: string }[]
  value?: number
  onChange: (id: number) => void
}) {
  const id = useId()
  return <div className="space-y-2"><Label htmlFor={id}>العملة</Label><Select value={value ? String(value) : ""} onValueChange={value => onChange(Number(value))} dir="rtl"><SelectTrigger id={id} className="rounded-xl" disabled={!currencies.length}><SelectValue placeholder="اختر العملة" /></SelectTrigger><SelectContent>{currencies.map(currency => <SelectItem key={currency.id} value={String(currency.id)}>{[currency.currency_code, currency.currency_name].filter(Boolean).join(" — ")}</SelectItem>)}</SelectContent></Select></div>
}

export function OtherCurrenciesFilter({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  const id = useId()
  return <div className="flex items-end"><Label htmlFor={id} className="flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2 text-sm font-normal"><span>إظهار السندات بالعملات الأخرى</span><Switch id={id} checked={checked} onCheckedChange={onCheckedChange} /></Label></div>
}
