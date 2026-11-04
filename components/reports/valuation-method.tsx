"use client"
import { tr } from "@/lib/i18n"
import Dropdown from "@/components/common/FocusDropdown"

export const valuationMethods = [
  { value: "average", label: tr("متوسط الكلفة") },
  { value: "last", label: tr("آخر سعر شراء") },
  { value: "fifo", label: tr("حسب الداخل أولاً خارج أولاً") },
]

export function ValuationMethod({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Dropdown value={value} options={valuationMethods} optionLabel="label" optionValue="value"
    onChange={event => onChange(event.value)} aria-label={tr("طريقة تقييم المخزون")} className="w-full rounded-xl" />
}
