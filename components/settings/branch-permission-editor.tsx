"use client"

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  ArrowLeftRight, BookOpen, Boxes, Check, CheckCheck, ChevronDown, FileText, Info, LayoutGrid, Minus, PackageMinus, PackagePlus,
  Receipt, RotateCcw, Search, ShieldCheck, ShoppingBag, ShoppingCart, Truck, Undo2, Wallet, WalletCards, X,
} from "lucide-react"
import { cn } from "@/lib/utils"

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

// ───────────── تصنيف الصلاحيات حسب نوع السند ─────────────
// صلاحيات الحركات في access_list أسماؤها "{العملية} {نوع السند}" (lib/transaction-permission-definitions.ts)
// مع صيغ قديمة متفاوتة الإملاء ("ادخال"/"إدخال"، "عرض"/"استعلام") — المطابقة بعد توحيد الحروف، وكل
// الصيغ المكررة لنفس الخلية تُفعَّل/تُعطَّل معاً.

type Action = "view" | "create" | "update" | "delete" | "post"
const ACTIONS: { key: Action; label: string; tone: string }[] = [
  { key: "view", label: "استعلام", tone: "sky" },
  { key: "create", label: "إدخال", tone: "emerald" },
  { key: "update", label: "تعديل", tone: "amber" },
  { key: "delete", label: "حذف", tone: "rose" },
  { key: "post", label: "ترحيل", tone: "violet" },
]
const toneClasses: Record<string, { on: string; soft: string; text: string }> = {
  sky: { on: "bg-sky-500 border-sky-500 text-white", soft: "bg-sky-50", text: "text-sky-700" },
  emerald: { on: "bg-emerald-500 border-emerald-500 text-white", soft: "bg-emerald-50", text: "text-emerald-700" },
  amber: { on: "bg-amber-500 border-amber-500 text-white", soft: "bg-amber-50", text: "text-amber-700" },
  rose: { on: "bg-rose-500 border-rose-500 text-white", soft: "bg-rose-50", text: "text-rose-700" },
  violet: { on: "bg-violet-500 border-violet-500 text-white", soft: "bg-violet-50", text: "text-violet-700" },
}

const VOUCHER_SECTIONS: { title: string; icon: any; gradient: string; vouchers: { name: string; icon: any }[] }[] = [
  {
    title: "المبيعات", icon: ShoppingCart, gradient: "from-emerald-600 to-teal-600",
    vouchers: [
      { name: "طلبية مبيعات", icon: FileText },
      { name: "فاتورة مبيعات", icon: Receipt },
      { name: "إرسالية مبيعات", icon: Truck },
      { name: "إرسالية برسم البيع", icon: Truck },
      { name: "مرتجع إرسالية برسم البيع", icon: Undo2 },
      { name: "مرتجع مبيعات", icon: Undo2 },
      { name: "عمولات المندوبين", icon: Wallet },
    ],
  },
  {
    title: "المشتريات", icon: ShoppingBag, gradient: "from-sky-600 to-indigo-600",
    vouchers: [
      { name: "طلبية مشتريات", icon: FileText },
      { name: "فاتورة مشتريات", icon: Receipt },
      { name: "إرسالية مشتريات", icon: Truck },
      { name: "مرتجع مشتريات", icon: Undo2 },
    ],
  },
  {
    title: "المخزون", icon: Boxes, gradient: "from-amber-600 to-orange-600",
    vouchers: [
      { name: "سند إدخال بضاعة", icon: PackagePlus },
      { name: "سند إخراج بضاعة", icon: PackageMinus },
      { name: "إرسالية داخلية", icon: ArrowLeftRight },
      { name: "سند استعمال", icon: Boxes },
    ],
  },
  {
    title: "المالية والمحاسبة", icon: Wallet, gradient: "from-violet-600 to-fuchsia-600",
    vouchers: [
      { name: "سند قبض", icon: Wallet },
      { name: "سند صرف", icon: Wallet },
      { name: "سند صرف شيكات", icon: WalletCards },
      { name: "سند قيد", icon: BookOpen },
      { name: "إشعار دائن", icon: FileText },
      { name: "إشعار مدين", icon: FileText },
    ],
  },
]

const normalize = (value: string) =>
  String(value || "")
    .replace(/[ً-ٟـ]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ar")

const ACTION_PREFIXES: { action: Action; prefixes: string[] }[] = [
  { action: "view", prefixes: ["استعلام", "عرض"] },
  { action: "create", prefixes: ["ادخال", "اضافه"] },
  { action: "update", prefixes: ["تعديل"] },
  { action: "delete", prefixes: ["حذف"] },
  { action: "post", prefixes: ["ترحيل والغاء ترحيل", "ترحيل"] },
]

// الأطول أولاً: "مرتجع إرسالية برسم البيع" يجب أن يُطابَق قبل "إرسالية برسم البيع".
const VOUCHER_MATCHERS = VOUCHER_SECTIONS.flatMap((section) => section.vouchers.map((voucher) => ({ name: voucher.name, key: normalize(voucher.name) })))
  .sort((a, b) => b.key.length - a.key.length)

type VoucherRow = { name: string; cells: Partial<Record<Action, PermissionItem[]>>; extras: { key: string; label: string; items: PermissionItem[] }[] }

export function classify(items: PermissionItem[]) {
  const rows = new Map<string, VoucherRow>()
  const others = new Map<string, PermissionItem[]>()
  const seen = new Set<number>()
  for (const item of items) {
    if (seen.has(item.access_id)) continue
    seen.add(item.access_id)
    const name = normalize(item.access_name || "")
    if (!name) continue
    const voucher = VOUCHER_MATCHERS.find((matcher) => name.endsWith(matcher.key) || name.includes(` ${matcher.key}`))
    if (voucher) {
      const row = rows.get(voucher.name) ?? { name: voucher.name, cells: {}, extras: [] }
      rows.set(voucher.name, row)
      const prefix = name.slice(0, name.indexOf(voucher.key)).trim()
      const action = name.endsWith(voucher.key) ? ACTION_PREFIXES.find((entry) => entry.prefixes.includes(prefix))?.action : undefined
      if (action) {
        ;(row.cells[action] ??= []).push(item)
      } else {
        // عمليات إضافية (نسخ، طباعة، مسودة...) — تُجمَّع الصيغ المكررة لنفس الاسم.
        // اسم الشريحة بدون اسم السند نفسه (الصف يعرضه أصلاً): "إضافة مسودة طلبية مبيعات" ← "إضافة مسودة".
        const words = String(item.access_name || "").trim().split(/\s+/)
        const voucherWords = voucher.name.split(/\s+/).length
        const label = name.endsWith(voucher.key) && words.length > voucherWords ? words.slice(0, -voucherWords).join(" ") : words.join(" ")
        const existing = row.extras.find((extra) => extra.key === name)
        if (existing) existing.items.push(item)
        else row.extras.push({ key: name, label, items: [item] })
      }
      continue
    }
    const category = String(item.category_name || "أخرى")
    others.set(category, [...(others.get(category) || []), item])
  }
  return { rows, others }
}

const SOURCE_LABELS: Record<string, string> = {
  branch_user: "مخصصة للمستخدم في هذا الفرع",
  user: "مخصصة للمستخدم",
  branch_role: "من الدور الوظيفي في هذا الفرع",
  role: "من الدور الوظيفي",
  legacy: "صلاحية كاملة (نظام قديم)",
}

type Filter = "all" | "granted" | "denied"

export function BranchPermissionEditor({ items, values, onChange, search, onSearchChange, loading, dirty }: Props) {
  const [tab, setTab] = useState<"vouchers" | "general">("vouchers")
  const [filter, setFilter] = useState<Filter>("all")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const { rows, others } = useMemo(() => classify(items), [items])
  const term = normalize(search)
  const isOn = (list: PermissionItem[] = []) => list.length > 0 && list.every((item) => values[item.access_id])
  const isPartial = (list: PermissionItem[] = []) => list.some((item) => values[item.access_id]) && !isOn(list)

  const set = (list: PermissionItem[], value: boolean, base = values) => {
    const next = { ...base }
    list.forEach((item) => { next[item.access_id] = value })
    return next
  }
  const rowAll = (row: VoucherRow) => [...Object.values(row.cells).flat(), ...row.extras.flatMap((extra) => extra.items)] as PermissionItem[]

  // أي عملية على السند تتطلب الاستعلام عنه: تفعيلها يفعّل الاستعلام، وإلغاء الاستعلام يلغي باقي عمليات السند.
  const toggleCell = (row: VoucherRow, action: Action) => {
    const list = row.cells[action] || []
    const value = !isOn(list)
    let next = set(list, value)
    if (value && action !== "view") next = set(row.cells.view || [], true, next)
    if (!value && action === "view") next = set(rowAll(row), false, next)
    onChange(next)
  }
  const toggleExtra = (row: VoucherRow, list: PermissionItem[]) => {
    const value = !isOn(list)
    let next = set(list, value)
    if (value) next = set(row.cells.view || [], true, next)
    onChange(next)
  }

  const sections = useMemo(() => VOUCHER_SECTIONS.map((section) => ({
    ...section,
    rows: section.vouchers
      .map((voucher) => ({ ...voucher, row: rows.get(voucher.name) }))
      .filter((entry): entry is typeof entry & { row: VoucherRow } => Boolean(entry.row))
      .filter((entry) => {
        const all = rowAll(entry.row)
        if (term && !normalize(entry.name).includes(term) && !all.some((item) => normalize(item.access_name || "").includes(term))) return false
        if (filter === "granted") return all.some((item) => values[item.access_id])
        if (filter === "denied") return all.some((item) => !values[item.access_id])
        return true
      }),
  })).filter((section) => section.rows.length > 0), [filter, rows, term, values]) // eslint-disable-line react-hooks/exhaustive-deps

  const generalGroups = useMemo(() => Array.from(others.entries())
    .map(([category, list]) => {
      const unique = new Map<string, PermissionItem[]>()
      list.forEach((item) => {
        const key = normalize(item.access_name || "")
        unique.set(key, [...(unique.get(key) || []), item])
      })
      const entries = Array.from(unique.values())
        .filter((group) => !term || normalize(group[0].access_name || "").includes(term) || normalize(category).includes(term))
        .filter((group) => filter === "all" || (filter === "granted" ? isOn(group) : !isOn(group)))
      return { category, entries }
    })
    .filter((group) => group.entries.length > 0), [filter, others, term, values]) // eslint-disable-line react-hooks/exhaustive-deps

  const voucherItems = useMemo(() => Array.from(rows.values()).flatMap(rowAll), [rows]) // eslint-disable-line react-hooks/exhaustive-deps
  const generalItems = useMemo(() => Array.from(others.values()).flat(), [others])
  const count = (list: PermissionItem[]) => list.filter((item) => values[item.access_id]).length
  const totalGranted = count(items)
  const percent = items.length ? Math.round((totalGranted / items.length) * 100) : 0

  const visibleItems = tab === "vouchers"
    ? sections.flatMap((section) => section.rows.flatMap((entry) => rowAll(entry.row)))
    : generalGroups.flatMap((group) => group.entries.flat())
  const toggleCollapsed = (key: string) => setCollapsed((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })

  return (
    <div className={cn("space-y-4", loading && "pointer-events-none opacity-55")} dir="rtl">
      {/* شريط الأدوات */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="flex items-center gap-3">
            <div className="relative grid size-14 place-items-center rounded-full" style={{ background: `conic-gradient(hsl(var(--primary)) ${percent * 3.6}deg, hsl(var(--muted)) 0deg)` }}>
              <div className="grid size-11 place-items-center rounded-full bg-card text-xs font-black tabular-nums">{percent}%</div>
            </div>
            <div>
              <p className="text-sm font-bold">{totalGranted} من {items.length} صلاحية مفعّلة</p>
              {dirty ? <Badge className="mt-1">تعديلات غير محفوظة</Badge> : <p className="mt-1 text-xs text-muted-foreground">كل التعديلات محفوظة</p>}
            </div>
          </div>
          <div className="relative min-w-0 flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="ابحث عن سند أو صلاحية..." className="h-10 rounded-xl pr-9" />
          </div>
          <div className="flex rounded-xl border bg-muted/50 p-1 text-xs font-semibold">
            {([["all", "الكل"], ["granted", "المفعّلة"], ["denied", "غير المفعّلة"]] as [Filter, string][]).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setFilter(key)} className={cn("rounded-lg px-3 py-1.5 transition", filter === key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>{label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(set(visibleItems, true))} disabled={!visibleItems.length}><CheckCheck className="ml-1.5 h-4 w-4" />تفعيل الظاهر</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(set(visibleItems, false))} disabled={!visibleItems.length}><X className="ml-1.5 h-4 w-4" />تعطيل الظاهر</Button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:w-fit">
          <TabButton active={tab === "vouchers"} onClick={() => setTab("vouchers")} icon={Receipt} label="الحركات حسب نوع السند" granted={count(voucherItems)} total={voucherItems.length} />
          <TabButton active={tab === "general"} onClick={() => setTab("general")} icon={LayoutGrid} label="الشاشات والصلاحيات العامة" granted={count(generalItems)} total={generalItems.length} />
        </div>
      </div>

      {!loading && items.length === 0 ? (
        <Empty text="لا توجد صلاحيات معرفة في النظام." />
      ) : tab === "vouchers" ? (
        sections.length === 0 ? <Empty text="لا توجد سندات مطابقة للبحث أو الفلتر." /> : (
          <>
            <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5" />تفعيل أي عملية على السند يفعّل الاستعلام عنه تلقائياً، وإلغاء الاستعلام يلغي باقي عملياته. اضغط رأس العمود لتبديله لكل سندات المجموعة.</p>
            {sections.map((section) => {
              const sectionItems = section.rows.flatMap((entry) => rowAll(entry.row))
              const sectionGranted = count(sectionItems)
              const allOn = sectionGranted === sectionItems.length
              const open = !collapsed.has(section.title)
              const SectionIcon = section.icon
              return (
                <section key={section.title} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                  <header className={cn("flex flex-wrap items-center justify-between gap-3 bg-gradient-to-l p-4 text-white", section.gradient)}>
                    <button type="button" onClick={() => toggleCollapsed(section.title)} className="flex items-center gap-3 text-right">
                      <span className="grid size-10 place-items-center rounded-xl bg-white/15"><SectionIcon className="h-5 w-5" /></span>
                      <span>
                        <span className="block text-base font-black">{section.title}</span>
                        <span className="block text-xs text-white/80">{section.rows.length} نوع سند · {sectionGranted}/{sectionItems.length} مفعّلة</span>
                      </span>
                      <ChevronDown className={cn("h-4 w-4 transition", !open && "-rotate-90")} />
                    </button>
                    <div className="flex items-center gap-3">
                      <div className="hidden h-2 w-32 overflow-hidden rounded-full bg-white/25 sm:block"><div className="h-full rounded-full bg-white" style={{ width: `${sectionItems.length ? (sectionGranted / sectionItems.length) * 100 : 0}%` }} /></div>
                      <Button type="button" size="sm" variant="secondary" className="h-8 bg-white/90 text-slate-900 hover:bg-white" onClick={() => onChange(set(sectionItems, !allOn))}>
                        {allOn ? <X className="ml-1.5 h-4 w-4" /> : <CheckCheck className="ml-1.5 h-4 w-4" />}{allOn ? "إلغاء الكل" : "تفعيل الكل"}
                      </Button>
                    </div>
                  </header>
                  {open && (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] text-sm">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            <th className="p-3 text-right text-xs font-semibold text-muted-foreground">نوع السند</th>
                            {ACTIONS.map((action) => {
                              const columnItems = section.rows.flatMap((entry) => entry.row.cells[action.key] || [])
                              const on = isOn(columnItems)
                              return (
                                <th key={action.key} className="w-24 p-2 text-center">
                                  <button
                                    type="button"
                                    disabled={!columnItems.length}
                                    title={on ? `إلغاء ${action.label} لكل سندات ${section.title}` : `تفعيل ${action.label} لكل سندات ${section.title}`}
                                    onClick={() => {
                                      let next = set(columnItems, !on)
                                      if (!on && action.key !== "view") next = set(section.rows.flatMap((entry) => entry.row.cells[action.key]?.length ? entry.row.cells.view || [] : []), true, next)
                                      if (on && action.key === "view") next = set(section.rows.flatMap((entry) => rowAll(entry.row)), false, next)
                                      onChange(next)
                                    }}
                                    className={cn("w-full rounded-lg px-2 py-1.5 text-xs font-bold transition hover:opacity-80 disabled:opacity-40", toneClasses[action.tone].soft, toneClasses[action.tone].text)}
                                  >{action.label}</button>
                                </th>
                              )
                            })}
                            <th className="p-3 text-right text-xs font-semibold text-muted-foreground">صلاحيات إضافية</th>
                            <th className="w-20 p-3 text-center text-xs font-semibold text-muted-foreground">الكل</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.rows.map(({ name, icon: VoucherIcon, row }) => {
                            const all = rowAll(row)
                            const rowOn = isOn(all)
                            return (
                              <tr key={name} className="border-b last:border-0 transition hover:bg-muted/30">
                                <td className="p-3">
                                  <div className="flex items-center gap-2.5">
                                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", count(all) ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}><VoucherIcon className="h-4 w-4" /></span>
                                    <div><p className="font-semibold">{name}</p><p className="text-[11px] text-muted-foreground tabular-nums">{count(all)}/{all.length}</p></div>
                                  </div>
                                </td>
                                {ACTIONS.map((action) => {
                                  const list = row.cells[action.key]
                                  if (!list?.length) return <td key={action.key} className="p-2 text-center text-muted-foreground/40">—</td>
                                  const on = isOn(list), partial = isPartial(list)
                                  const source = SOURCE_LABELS[list[0].permission_source || ""]
                                  return (
                                    <td key={action.key} className="p-2 text-center">
                                      <button
                                        type="button"
                                        onClick={() => toggleCell(row, action.key)}
                                        aria-pressed={on}
                                        aria-label={`${action.label} ${name}`}
                                        title={`${action.label} ${name}${source ? ` — ${source}` : ""}`}
                                        className={cn(
                                          "mx-auto grid size-9 place-items-center rounded-xl border-2 transition-all hover:scale-105",
                                          on ? toneClasses[action.tone].on + " shadow-sm" : partial ? "border-dashed border-muted-foreground/50 bg-muted" : "border-muted-foreground/20 bg-background text-transparent hover:border-muted-foreground/50",
                                        )}
                                      >
                                        {on ? <Check className="h-4 w-4" strokeWidth={3} /> : partial ? <Minus className="h-4 w-4 text-muted-foreground" /> : <Check className="h-4 w-4" />}
                                      </button>
                                    </td>
                                  )
                                })}
                                <td className="p-2">
                                  <div className="flex flex-wrap gap-1.5">
                                    {row.extras.map((extra) => {
                                      const on = isOn(extra.items)
                                      return (
                                        <button key={extra.key} type="button" onClick={() => toggleExtra(row, extra.items)} aria-pressed={on}
                                          className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold transition", on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/50")}
                                        >{on && <Check className="-mt-0.5 ml-1 inline h-3 w-3" />}{extra.label}</button>
                                      )
                                    })}
                                    {!row.extras.length && <span className="text-muted-foreground/40">—</span>}
                                  </div>
                                </td>
                                <td className="p-2 text-center">
                                  <Switch checked={rowOn} onCheckedChange={(value) => onChange(set(all, value))} aria-label={`كل صلاحيات ${name}`} />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )
            })}
          </>
        )
      ) : generalGroups.length === 0 ? (
        <Empty text="لا توجد صلاحيات مطابقة للبحث أو الفلتر." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {generalGroups.map((group) => {
            const groupItems = group.entries.flat()
            const groupGranted = count(groupItems)
            const allOn = groupGranted === groupItems.length
            return (
              <section key={group.category} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                <header className="flex items-center justify-between gap-3 border-b bg-muted/40 p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="h-4 w-4" /></span>
                    <div><h3 className="font-bold">{group.category}</h3><p className="text-xs text-muted-foreground">{groupGranted} من {groupItems.length} مفعّلة</p></div>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => onChange(set(groupItems, !allOn))}>
                    {allOn ? <X className="ml-1.5 h-4 w-4" /> : <CheckCheck className="ml-1.5 h-4 w-4" />}{allOn ? "إلغاء الكل" : "تفعيل الكل"}
                  </Button>
                </header>
                <ul className="divide-y">
                  {group.entries.map((entry) => {
                    const on = isOn(entry)
                    const source = SOURCE_LABELS[entry[0].permission_source || ""]
                    return (
                      <li key={entry[0].access_id} className={cn("flex items-center justify-between gap-3 px-4 py-3 transition", on && "bg-primary/[0.03]")}>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{entry[0].access_name}</p>
                          {source && <p className="text-[11px] text-muted-foreground">{source}</p>}
                        </div>
                        <Switch checked={on} onCheckedChange={(value) => onChange(set(entry, value))} aria-label={`صلاحية ${entry[0].access_name}`} />
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TabButton({ active, onClick, icon: Icon, label, granted, total }: { active: boolean; onClick: () => void; icon: any; label: string; granted: number; total: number }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex items-center gap-2 rounded-xl border px-4 py-2.5 text-right text-sm font-semibold transition", active ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-background hover:bg-muted")}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{label}</span>
      <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] tabular-nums", active ? "bg-white/20" : "bg-muted")}>{granted}/{total}</span>
    </button>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
      <RotateCcw className="mx-auto mb-2 h-8 w-8 opacity-30" />{text}
    </div>
  )
}
