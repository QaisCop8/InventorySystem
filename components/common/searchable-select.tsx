"use client"

import { normalizeArabicSearch } from "@/lib/arabic-search"
import { appDir } from "@/lib/i18n"
import { useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"

// قائمة اختيار بحثية (Radix Popover + cmdk) للنوافذ: القائمة تُرسَم في طبقة فوق النافذة كلها (لا داخل منطقة التمرير)،
// فلا تختفي تحت شريط الأزرار أو الأقسام التالية، وتنقلب للأعلى تلقائياً حين لا يتسع لها المكان بالأسفل.
// بديل PrimeDropdown (appendTo="self") في نوافذ Radix — الأخير يُحصَر داخل جسم النافذة القابل للتمرير.
export function SearchableSelect<T extends Record<string, any>>({
  id, value, options, optionLabel, optionValue, placeholder = "اختر", searchPlaceholder = "بحث...", emptyText = "لا توجد نتائج", onChange, disabled, className,
}: {
  id?: string
  value: unknown
  options: T[]
  optionLabel: keyof T & string
  optionValue: keyof T & string
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  onChange: (value: any) => void
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => String(option[optionValue]) === String(value ?? ""))
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 text-start text-sm shadow-sm transition hover:border-emerald-300 focus-visible:border-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900",
            open && "border-emerald-400 ring-2 ring-emerald-500/20",
            className,
          )}
        >
          <span className={cn("min-w-0 truncate", !selected && "text-slate-400")}>{selected ? String(selected[optionLabel]) : placeholder}</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        dir={appDir()}
        align="start"
        collisionPadding={12}
        className="z-[3100] w-[var(--radix-popover-trigger-width)] min-w-[220px] rounded-xl p-0 shadow-xl"
      >
        <Command
          filter={(itemValue, search) => (normalizeArabicSearch(itemValue).includes(normalizeArabicSearch(search).trim()) ? 1 : 0)}
        >
          <CommandInput placeholder={searchPlaceholder} className="text-start" />
          <CommandList className="max-h-64">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const optionKey = String(option[optionValue])
                const isSelected = optionKey === String(value ?? "")
                return (
                  <CommandItem
                    key={optionKey}
                    // قيمة البحث = النص الظاهر (+ المفتاح لتمييز المتكرر)
                    value={`${String(option[optionLabel])} ${optionKey}`}
                    onSelect={() => { onChange(option[optionValue]); setOpen(false) }}
                    className={cn("justify-between gap-2 rounded-lg", isSelected && "bg-emerald-50 font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200")}
                  >
                    <span className="min-w-0 truncate">{String(option[optionLabel])}</span>
                    {isSelected && <Check className="h-4 w-4 shrink-0" />}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
