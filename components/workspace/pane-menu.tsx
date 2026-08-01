"use client"

import { useState } from "react"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { SECTION_TITLES } from "@/components/sidebar"

interface PaneMenuProps {
  onOpenSection: (section: string) => void
}

// قائمة فتح صفحة خاصة بهذا الجزء تحديداً من مساحة العمل — ضرورية عند الشاشة المقسمة: القائمة
// الجانبية عنصر واحد مشترك، وبلا هذا الزر لا توجد طريقة مباشرة لفتح صفحة غير الرئيسية بالجزء
// الثاني تحديداً (فقط عبر تركيزه ضمنياً ثم الضغط بالقائمة الجانبية، غير واضح للمستخدم).
export function PaneMenu({ onOpenSection }: PaneMenuProps) {
  const [open, setOpen] = useState(false)
  const entries = Object.entries(SECTION_TITLES)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs shrink-0">
          <Menu className="h-3.5 w-3.5" />
          فتح صفحة
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0" dir="rtl">
        <Command>
          <CommandInput placeholder="ابحث عن صفحة..." />
          <CommandList>
            <CommandEmpty>لا توجد نتائج</CommandEmpty>
            <CommandGroup>
              {entries.map(([section, title]) => (
                <CommandItem
                  key={section}
                  value={title}
                  onSelect={() => {
                    onOpenSection(section)
                    setOpen(false)
                  }}
                >
                  {title}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
