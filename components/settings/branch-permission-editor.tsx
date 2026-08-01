"use client"

import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { CheckCheck, RotateCcw, Search, ShieldCheck, X } from "lucide-react"

export interface PermissionItem {
  access_id: number
  access_name: string
  category_name: string
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
  const categories = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ar")
    return items.reduce<Record<string, PermissionItem[]>>((result, item) => {
      if (term && !item.access_name.toLocaleLowerCase("ar").includes(term) && !item.category_name.toLocaleLowerCase("ar").includes(term)) return result
      ;(result[item.category_name || "أخرى"] ??= []).push(item)
      return result
    }, {})
  }, [items, search])

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
    <div className={loading ? "pointer-events-none opacity-55" : ""}>
      <div className="mb-4 flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1 lg:max-w-sm">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="ابحث باسم الصلاحية أو المجموعة..." className="pr-9" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={dirty ? "default" : "secondary"}>{dirty ? "تعديلات غير محفوظة" : `${granted} من ${items.length} مفعّلة`}</Badge>
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
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">لا توجد صلاحيات معرفة في النظام.</div>
      ) : Object.keys(categories).length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">لا توجد نتائج مطابقة للبحث.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {Object.entries(categories).map(([category, categoryItems]) => {
            const categoryGranted = categoryItems.filter((item) => values[item.access_id]).length
            const allGranted = categoryGranted === categoryItems.length
            return (
              <Card key={category} className="overflow-hidden border-border/70 shadow-sm">
                <CardHeader className="border-b bg-muted/35 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                      <CardTitle className="truncate text-sm font-semibold">{category}</CardTitle>
                      <Badge variant="outline" className="font-normal">{categoryGranted}/{categoryItems.length}</Badge>
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => {
                      const next = { ...values }
                      categoryItems.forEach((item) => { next[item.access_id] = !allGranted })
                      onChange(next)
                    }}>{allGranted ? "تعطيل المجموعة" : "تفعيل المجموعة"}</Button>
                  </div>
                </CardHeader>
                <CardContent className="divide-y p-0">
                  {categoryItems.map((item) => {
                    const checked = Boolean(values[item.access_id])
                    return (
                      <label key={item.access_id} className={`flex cursor-pointer items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/40 ${checked ? "bg-primary/[0.035]" : ""}`}>
                        <span className="text-sm font-medium leading-6">{item.access_name}</span>
                        <Switch checked={checked} onCheckedChange={(value) => onChange({ ...values, [item.access_id]: value })} aria-label={`صلاحية ${item.access_name}`} />
                      </label>
                    )
                  })}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
