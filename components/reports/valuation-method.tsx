"use client"
import Dropdown from "@/components/common/FocusDropdown"

export const valuationMethods = [
  { value: "average", label: "متوسط الكلفة" },
  { value: "last", label: "آخر سعر شراء" },
  { value: "fifo", label: "حسب الداخل أولاً خارج أولاً" },
]

export function ValuationMethod({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Dropdown value={value} options={valuationMethods} optionLabel="label" optionValue="value"
    onChange={event => onChange(event.value)} aria-label="طريقة تقييم المخزون" className="w-full rounded-xl" />
}
