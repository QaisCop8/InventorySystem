"use client"

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CheckCheck, CircleCheck, RotateCcw, Search, ShieldCheck, X } from "lucide-react"

export interface PermissionItem {
  access_id: number
  access_name: string | null
  category_name: string | null
  is_granted: boolean
  permission_source?: string
}

interface Props {
  items: PermissionItem[]
  values: Record<number, boolean>
  onChange: (values: Record<number, boolean>) => void
  search: string
  onSearchChange: (value: string) => void
  loading?: boolean
  dirty?: boolean
}

export function BranchPermissionEditor({ items, values, onChange, search, onSearchChange, loading, dirty }: Props) {
  const [selectedCategory, setSelectedCategory] = useState("")
  const categories = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ar")
    const seenNames = new Set<string>()
    return items.reduce<Record<string, PermissionItem[]>>((result, item) => {
      const accessName = String(item.access_name || "")
      const categoryName = String(item.category_name || "أخرى")
      const normalizedName = accessName.trim().toLocaleLowerCase("ar")
      if (!normalizedName || seenNames.has(normalizedName)) return result
      seenNames.add(normalizedName)
      if (term && !accessName.toLocaleLowerCase("ar").includes(term) && !categoryName.toLocaleLowerCase("ar").includes(term)) return result
      ;(result[categoryName] ??= []).push({ ...item, access_name: accessName, category_name: categoryName })
      return result
    }, {})
  }, [items, search])

  const categoryNames = Object.keys(categories)
  const activeCategory = categoryNames.includes(selectedCategory) ? selectedCategory : categoryNames[0] || ""
  const visibleItems = Object.values(categories).flat()
  const granted = items.filter((item) => values[item.access_id]).length
  const updateVisible = (value: boolean | "toggle") => {
    const next = { ...values }
    visibleItems.forEach((item) => {
      next[item.access_id] = value === "toggle" ? !next[item.access_id] : value
    })
    onChange(next)
  }

  return (
    <div className={loading ? "pointer-events-none space-y-4 opacity-55" : "space-y-4"}>
      <div className="flex flex-col gap-4 border-b border-border pb-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 xl:max-w-sm">
          <h2 className="text-base font-bold">صلاحيات العمليات</h2>
          <p className="mt-1 text-xs text-muted-foreground">اختر مجموعة ثم عدّل كل معاملة على حدة.</p>
        </div>
        <div className="relative min-w-0 flex-1 xl:max-w-sm">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="ابحث عن معاملة أو مجموعة..." className="h-10 rounded-lg pr-9" />
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <Badge variant={dirty ? "default" : "secondary"} className="h-8 px-3">{dirty ? "تعديلات غير محفوظة" : `${granted} من ${items.length} مفعّلة`}</Badge>
          <Button type="button" variant="outline" size="sm" onClick={() => updateVisible(true)} disabled={!visibleItems.length}>
            <CheckCheck className="ml-1.5 h-4 w-4" />تفعيل الظاهر
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => updateVisible(false)} disabled={!visibleItems.length}>
            <X className="ml-1.5 h-4 w-4" />تعطيل الظاهر
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => updateVisible("toggle")} disabled={!visibleItems.length}>
            <RotateCcw className="ml-1.5 h-4 w-4" />عكس الظاهر
          </Button>
        </div>
      </div>

      {!loading && items.length === 0 ? (
        <div className="border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">لا توجد صلاحيات معرفة في النظام.</div>
      ) : categoryNames.length === 0 ? (
        <div className="border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">لا توجد نتائج مطابقة للبحث.</div>
      ) : (
        <Tabs value={activeCategory} onValueChange={setSelectedCategory} dir="rtl" className="space-y-4">
          <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg border border-border bg-muted/60 p-1">
            {categoryNames.map((category) => {
              const categoryItems = categories[category]
              const categoryGranted = categoryItems.filter((item) => values[item.access_id]).length
              return <TabsTrigger key={category} value={category} className="min-w-max gap-2 rounded-md px-3 py-2 text-xs data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:text-sm">
                <span>{category}</span><span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{categoryGranted}/{categoryItems.length}</span>
              </TabsTrigger>
            })}
          </TabsList>
          {categoryNames.map((category) => {
            const categoryItems = categories[category]
            const categoryGranted = categoryItems.filter((item) => values[item.access_id]).length
            const allGranted = categoryGranted === categoryItems.length
            return (
              <TabsContent key={category} value={category} className="mt-0 space-y-4 focus-visible:outline-none">
                <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><ShieldCheck className="size-4" /></span>
                    <div className="min-w-0"><h3 className="truncate text-sm font-bold">{category}</h3><p className="text-xs text-muted-foreground">{categoryGranted} من {categoryItems.length} معاملة مفعّلة</p></div>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg" onClick={() => {
                    const next = { ...values }
                    categoryItems.forEach((item) => { next[item.access_id] = !allGranted })
                    onChange(next)
                  }}>{allGranted ? <X className="ml-1.5 h-4 w-4" /> : <CheckCheck className="ml-1.5 h-4 w-4" />}{allGranted ? "تعطيل المجموعة" : "تفعيل المجموعة"}</Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {categoryItems.map((item) => {
                    const checked = Boolean(values[item.access_id])
                    return (
                      <Card key={item.access_id} className={`overflow-hidden rounded-lg transition-colors ${checked ? "border-primary/40 bg-primary/[0.025]" : "border-border bg-card"}`}>
                        <CardContent className="flex min-h-[88px] items-center justify-between gap-4 p-4">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md ${checked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                              {checked ? <CircleCheck className="size-4" /> : <ShieldCheck className="size-4" />}
                            </span>
                            <div className="min-w-0"><p className="font-semibold leading-6">{item.access_name}</p><p className="mt-1 text-[11px] text-muted-foreground">{checked ? "الوصول مفعّل" : "الوصول غير مفعّل"}</p></div>
                          </div>
                          <Switch checked={checked} onCheckedChange={(value) => onChange({ ...values, [item.access_id]: value })} aria-label={`صلاحية ${item.access_name}`} />
                        </CardContent>
                        {item.permission_source && <div className="border-t border-border/70 px-4 py-1.5 text-[10px] text-muted-foreground">المصدر: {item.permission_source}</div>}
                      </Card>
                    )
                  })}
                </div>
              </TabsContent>
            )
          })}
        </Tabs>
      )}
    </div>
  )
}
