"use client"

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  ArrowLeftRight, BookOpen, Boxes, Building2, Car, Check, CheckCheck, ChevronDown, CreditCard, FileText, FolderOpen, Info, Landmark, LayoutGrid, Minus, PackageMinus, PackagePlus,
  Receipt, RotateCcw, Search, ShieldCheck, ShoppingBag, ShoppingCart, TrendingUp, Truck, Undo2, Users, Wallet, WalletCards, X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  FILE_ACTION_LABELS, FILE_FAMILIES, FILE_PERMISSION_CATEGORY, parseFilePermission,
  type FileAction, type FileFamily,
} from "@/lib/file-permission-definitions"
import { REPORT_DEFINITIONS, reportPermissionNameForTitle, type ReportPermissionAction } from "@/lib/report-permission-definitions"

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

type Action = "access" | "view" | "create" | "update" | "delete" | "post"
const ACTIONS: { key: Action; label: string; tone: string }[] = [
  { key: "access", label: "الدخول للشاشة", tone: "teal" },
  { key: "view", label: "استعلام", tone: "sky" },
  { key: "create", label: "إدخال", tone: "emerald" },
  { key: "update", label: "تعديل", tone: "amber" },
  { key: "delete", label: "حذف", tone: "rose" },
  { key: "post", label: "ترحيل", tone: "violet" },
]
const REPORT_ACTIONS: { key: ReportPermissionAction; label: string; tone: string }[] = [
  { key: "access", label: "الدخول إلى التقرير", tone: "teal" },
  { key: "print", label: "طباعة", tone: "sky" },
  { key: "whatsapp", label: "إرسال واتساب", tone: "emerald" },
]
const FILE_ACTIONS: { key: FileAction; label: string; tone: string }[] = [
  { key: "access", label: FILE_ACTION_LABELS.access, tone: "violet" },
  { key: "view", label: FILE_ACTION_LABELS.view, tone: "sky" },
  { key: "create", label: FILE_ACTION_LABELS.create, tone: "emerald" },
  { key: "update", label: FILE_ACTION_LABELS.update, tone: "amber" },
  { key: "delete", label: FILE_ACTION_LABELS.delete, tone: "rose" },
]
const toneClasses: Record<string, { on: string; soft: string; text: string }> = {
  sky: { on: "bg-sky-500 border-sky-500 text-white", soft: "bg-sky-50", text: "text-sky-700" },
  emerald: { on: "bg-emerald-500 border-emerald-500 text-white", soft: "bg-emerald-50", text: "text-emerald-700" },
  amber: { on: "bg-amber-500 border-amber-500 text-white", soft: "bg-amber-50", text: "text-amber-700" },
  rose: { on: "bg-rose-500 border-rose-500 text-white", soft: "bg-rose-50", text: "text-rose-700" },
  violet: { on: "bg-violet-500 border-violet-500 text-white", soft: "bg-violet-50", text: "text-violet-700" },
  teal: { on: "bg-teal-600 border-teal-600 text-white", soft: "bg-teal-50", text: "text-teal-700" },
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
      { name: "تخطيط المشتريات الذكي", icon: TrendingUp },
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

const FILE_SECTIONS: { title: string; icon: any; gradient: string; families: { family: FileFamily; icon: any }[] }[] = [
  {
    title: "الأشخاص والجهات", icon: Users, gradient: "from-emerald-600 to-teal-600",
    families: [
      { family: "customers", icon: Users },
      { family: "suppliers", icon: Truck },
      { family: "employees", icon: Users },
      { family: "subscribers", icon: Users },
    ],
  },
  {
    title: "الأصناف والخدمات", icon: Boxes, gradient: "from-amber-600 to-orange-600",
    families: [{ family: "items", icon: Boxes }, { family: "services", icon: FileText }],
  },
  {
    title: "المركبات والسائقون", icon: Car, gradient: "from-sky-600 to-indigo-600",
    families: [{ family: "cars", icon: Car }, { family: "drivers", icon: Users }],
  },
  {
    title: "المالية والفروع", icon: Landmark, gradient: "from-violet-600 to-fuchsia-600",
    families: [
      { family: "accounts", icon: BookOpen },
      { family: "banks", icon: Landmark },
      { family: "branches", icon: Building2 },
      { family: "bank-accounts", icon: Wallet },
      { family: "credit-cards", icon: CreditCard },
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
  { action: "access", prefixes: ["الدخول لشاشه", "الدخول الي شاشه", "الدخول لشاشات", "فتح شاشه"] },
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
export type FileRow = { family: FileFamily; cells: Partial<Record<FileAction, PermissionItem[]>> }
type ReportRow = { definition: (typeof REPORT_DEFINITIONS)[number]; cells: Partial<Record<ReportPermissionAction, PermissionItem[]>> }
const fileRowAll = (row: FileRow) => Object.values(row.cells).flat() as PermissionItem[]
const reportRowAll = (row: ReportRow) => Object.values(row.cells).flat() as PermissionItem[]

export function setFilePermissionValues(rows: FileRow[], values: Record<number, boolean>, action: FileAction | "all", value: boolean) {
  const next = { ...values }
  const assign = (list: PermissionItem[]) => list.forEach((item) => { next[item.access_id] = value })
  for (const row of rows) {
    const list = action === "all" ? fileRowAll(row) : row.cells[action] || []
    if (!list.length) continue
    assign(list)
    if (action === "access" && !value) assign(fileRowAll(row))
    if (action !== "access" && value) {
      ;(row.cells.access || []).forEach((item) => { next[item.access_id] = true })
    }
  }
  return next
}

export function classify(items: PermissionItem[]) {
  const rows = new Map<string, VoucherRow>()
  const fileRows = new Map<FileFamily, FileRow>()
  const reportRows = new Map<string, ReportRow>()
  const others = new Map<string, PermissionItem[]>()
  const seen = new Set<number>()
  for (const item of items) {
    if (seen.has(item.access_id)) continue
    seen.add(item.access_id)
    const filePermission = parseFilePermission(item.access_name || "")
    if (filePermission) {
      const row: FileRow = fileRows.get(filePermission.family) ?? { family: filePermission.family, cells: {} }
      fileRows.set(filePermission.family, row)
      ;(row.cells[filePermission.action] ??= []).push(item)
      continue
    }
    const name = normalize(item.access_name || "")
    if (!name) continue
    const reportDefinition = REPORT_DEFINITIONS.find((definition) =>
      (["access", "print", "whatsapp"] as ReportPermissionAction[]).some((action) =>
        item.access_name === reportPermissionNameForTitle(definition.title, action),
      ),
    )
    if (reportDefinition) {
      const row = reportRows.get(reportDefinition.section) ?? { definition: reportDefinition, cells: {} }
      const action = (["access", "print", "whatsapp"] as ReportPermissionAction[]).find((candidate) =>
        item.access_name === reportPermissionNameForTitle(reportDefinition.title, candidate),
      )
      if (action) (row.cells[action] ??= []).push(item)
      reportRows.set(reportDefinition.section, row)
      continue
    }
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
  return { rows, fileRows, reportRows, others }
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
  const [tab, setTab] = useState<"vouchers" | "files" | "reports" | "general">("vouchers")
  const [filter, setFilter] = useState<Filter>("all")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const { rows, fileRows, reportRows, others } = useMemo(() => classify(items), [items])
  const term = normalize(search)
  const isOn = (list: PermissionItem[] = []) => list.length > 0 && list.every((item) => values[item.access_id])
  const isPartial = (list: PermissionItem[] = []) => list.some((item) => values[item.access_id]) && !isOn(list)

  const set = (list: PermissionItem[], value: boolean, base = values) => {
    const next = { ...base }
    list.forEach((item) => { next[item.access_id] = value })
    return next
  }
  const rowAll = (row: VoucherRow) => [...Object.values(row.cells).flat(), ...row.extras.flatMap((extra) => extra.items)] as PermissionItem[]

  // أي عملية على السند تتطلب الدخول لشاشته والاستعلام عنه: تفعيلها يفعّلهما. إلغاء "الدخول للشاشة" يلغي كل عمليات السند،
  // وإلغاء الاستعلام يلغي باقي العمليات ويُبقي الدخول للشاشة.
  const withoutAccess = (row: VoucherRow) => rowAll(row).filter((item) => !(row.cells.access || []).includes(item))
  const toggleCell = (row: VoucherRow, action: Action) => {
    const list = row.cells[action] || []
    const value = !isOn(list)
    let next = set(list, value)
    if (value && action !== "access") next = set(row.cells.access || [], true, next)
    if (value && action !== "view" && action !== "access") next = set(row.cells.view || [], true, next)
    if (!value && action === "access") next = set(rowAll(row), false, next)
    if (!value && action === "view") next = set(withoutAccess(row), false, next)
    onChange(next)
  }
  const toggleExtra = (row: VoucherRow, list: PermissionItem[]) => {
    const value = !isOn(list)
    let next = set(list, value)
    if (value) next = set([...(row.cells.view || []), ...(row.cells.access || [])], true, next)
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

  const fileSections = useMemo(() => FILE_SECTIONS.map((section) => ({
    ...section,
    rows: section.families
      .map((entry) => ({ ...entry, name: FILE_FAMILIES[entry.family], row: fileRows.get(entry.family) }))
      .filter((entry): entry is typeof entry & { row: FileRow } => Boolean(entry.row))
      .filter((entry) => {
        const all = fileRowAll(entry.row)
        if (term && !normalize(entry.name).includes(term) && !normalize(section.title).includes(term) && !normalize(FILE_PERMISSION_CATEGORY).includes(term) && !all.some((item) => normalize(item.access_name || "").includes(term))) return false
        if (filter === "granted") return all.some((item) => values[item.access_id])
        if (filter === "denied") return all.some((item) => !values[item.access_id])
        return true
      }),
  })).filter((section) => section.rows.length > 0), [fileRows, filter, term, values])

  const visibleReportRows = useMemo(() => REPORT_DEFINITIONS
    .map((definition) => reportRows.get(definition.section))
    .filter((row): row is ReportRow => Boolean(row))
    .filter((row) => {
      const all = reportRowAll(row)
      if (term && !normalize(row.definition.title).includes(term) && !all.some((item) => normalize(item.access_name || "").includes(term))) return false
      if (filter === "granted") return all.some((item) => values[item.access_id])
      if (filter === "denied") return all.some((item) => !values[item.access_id])
      return true
    }), [filter, reportRows, term, values])

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
  const fileItems = useMemo(() => Array.from(fileRows.values()).flatMap(fileRowAll), [fileRows])
  const reportItems = useMemo(() => Array.from(reportRows.values()).flatMap(reportRowAll), [reportRows])
  const generalItems = useMemo(() => Array.from(others.values()).flat(), [others])
  const count = (list: PermissionItem[]) => list.filter((item) => values[item.access_id]).length
  const totalGranted = count(items)
  const percent = items.length ? Math.round((totalGranted / items.length) * 100) : 0

  const visibleItems = tab === "vouchers"
    ? sections.flatMap((section) => section.rows.flatMap((entry) => rowAll(entry.row)))
    : tab === "files" ? fileSections.flatMap((section) => section.rows.flatMap((entry) => fileRowAll(entry.row)))
    : tab === "reports" ? visibleReportRows.flatMap(reportRowAll)
    : generalGroups.flatMap((group) => group.entries.flat())
  const setVisible = (value: boolean) => onChange(tab === "files"
    ? setFilePermissionValues(fileSections.flatMap((section) => section.rows.map((entry) => entry.row)), values, "all", value)
    : set(visibleItems, value))
  const toggleReportCell = (row: ReportRow, action: ReportPermissionAction) => {
    const value = !isOn(row.cells[action] || [])
    let next = set(row.cells[action] || [], value)
    if (action === "access" && !value) next = set(reportRowAll(row), false, next)
    else if (action !== "access" && value) next = set(row.cells.access || [], true, next)
    onChange(next)
  }
  const setReportColumn = (rowsToUpdate: ReportRow[], action: ReportPermissionAction, value: boolean) => {
    let next = values
    for (const row of rowsToUpdate) {
      next = set(row.cells[action] || [], value, next)
      if (action === "access" && !value) next = set(reportRowAll(row), false, next)
      else if (action !== "access" && value) next = set(row.cells.access || [], true, next)
    }
    onChange(next)
  }
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
            <Input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="ابحث عن سند أو ملف أو صلاحية..." className="h-10 rounded-xl pr-9" />
          </div>
          <div className="flex rounded-xl border bg-muted/50 p-1 text-xs font-semibold">
            {([["all", "الكل"], ["granted", "المفعّلة"], ["denied", "غير المفعّلة"]] as [Filter, string][]).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setFilter(key)} className={cn("rounded-lg px-3 py-1.5 transition", filter === key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>{label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setVisible(true)} disabled={!visibleItems.length}><CheckCheck className="ml-1.5 h-4 w-4" />تفعيل الظاهر</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setVisible(false)} disabled={!visibleItems.length}><X className="ml-1.5 h-4 w-4" />تعطيل الظاهر</Button>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <TabButton active={tab === "vouchers"} onClick={() => setTab("vouchers")} icon={Receipt} label="الحركات حسب نوع السند" granted={count(voucherItems)} total={voucherItems.length} />
          <TabButton active={tab === "files"} onClick={() => setTab("files")} icon={FolderOpen} label={FILE_PERMISSION_CATEGORY} granted={count(fileItems)} total={fileItems.length} />
          <TabButton active={tab === "reports"} onClick={() => setTab("reports")} icon={FileText} label="صلاحيات التقارير" granted={count(reportItems)} total={reportItems.length} />
          <TabButton active={tab === "general"} onClick={() => setTab("general")} icon={LayoutGrid} label="الشاشات والصلاحيات العامة" granted={count(generalItems)} total={generalItems.length} />
        </div>
      </div>

      {!loading && items.length === 0 ? (
        <Empty text="لا توجد صلاحيات معرفة في النظام." />
      ) : tab === "vouchers" ? (
        sections.length === 0 ? <Empty text="لا توجد سندات مطابقة للبحث أو الفلتر." /> : (
          <>
            <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5" />تفعيل أي عملية على السند يفعّل الدخول لشاشته والاستعلام عنه تلقائياً، وإلغاء الدخول للشاشة يلغي كل عملياته (ويختفي السند من القائمة). اضغط رأس العمود لتبديله لكل سندات المجموعة.</p>
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
                                      if (!on && action.key !== "access") next = set(section.rows.flatMap((entry) => entry.row.cells[action.key]?.length ? entry.row.cells.access || [] : []), true, next)
                                      if (!on && action.key !== "view" && action.key !== "access") next = set(section.rows.flatMap((entry) => entry.row.cells[action.key]?.length ? entry.row.cells.view || [] : []), true, next)
                                      if (on && action.key === "access") next = set(section.rows.flatMap((entry) => rowAll(entry.row)), false, next)
                                      if (on && action.key === "view") next = set(section.rows.flatMap((entry) => withoutAccess(entry.row)), false, next)
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
      ) : tab === "files" ? (
        fileSections.length === 0 ? <Empty text="لا توجد ملفات وتعريفات مطابقة للبحث أو الفلتر." /> : (
          <>
            <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5 shrink-0" />تفعيل أي عملية يفعّل الدخول للشاشة تلقائياً، وإلغاء الدخول يلغي جميع صلاحيات الملف. الاستعلام مستقل عن الإضافة. اضغط رأس العمود لتبديله لكل ملفات المجموعة.</p>
            {fileSections.map((section) => {
              const sectionRows = section.rows.map((entry) => entry.row)
              const sectionItems = sectionRows.flatMap(fileRowAll)
              const sectionGranted = count(sectionItems)
              const allOn = isOn(sectionItems)
              const collapseKey = `files:${section.title}`
              const open = !collapsed.has(collapseKey)
              const SectionIcon = section.icon
              return (
                <section key={section.title} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                  <header className={cn("flex flex-wrap items-center justify-between gap-3 bg-gradient-to-l p-4 text-white", section.gradient)}>
                    <button type="button" onClick={() => toggleCollapsed(collapseKey)} aria-expanded={open} className="flex items-center gap-3 text-right">
                      <span className="grid size-10 place-items-center rounded-xl bg-white/15"><SectionIcon className="h-5 w-5" /></span>
                      <span>
                        <span className="block text-base font-black">{section.title}</span>
                        <span className="block text-xs text-white/80">{section.rows.length} ملفات · {sectionGranted}/{sectionItems.length} مفعّلة</span>
                      </span>
                      <ChevronDown className={cn("h-4 w-4 transition", !open && "-rotate-90")} />
                    </button>
                    <div className="flex items-center gap-3">
                      <div className="hidden h-2 w-32 overflow-hidden rounded-full bg-white/25 sm:block"><div className="h-full rounded-full bg-white" style={{ width: `${sectionItems.length ? (sectionGranted / sectionItems.length) * 100 : 0}%` }} /></div>
                      <Button type="button" size="sm" variant="secondary" className="h-8 bg-white/90 text-slate-900 hover:bg-white"
                        aria-label={`${allOn ? "إلغاء" : "تفعيل"} كل صلاحيات ${section.title}`}
                        onClick={() => onChange(setFilePermissionValues(sectionRows, values, "all", !allOn))}>
                        {allOn ? <X className="ml-1.5 h-4 w-4" /> : <CheckCheck className="ml-1.5 h-4 w-4" />}{allOn ? "إلغاء الكل" : "تفعيل الكل"}
                      </Button>
                    </div>
                  </header>
                  {open && (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[700px] text-sm">
                        <caption className="sr-only">صلاحيات {section.title}: الدخول والاستعلام والإضافة والتعديل والحذف</caption>
                        <thead>
                          <tr className="border-b bg-muted/40">
                            <th scope="col" className="p-3 text-right text-xs font-semibold text-muted-foreground">الملف / التعريف</th>
                            {FILE_ACTIONS.map((action) => {
                              const columnItems = sectionRows.flatMap((row) => row.cells[action.key] || [])
                              const on = isOn(columnItems)
                              const label = `${on ? "إلغاء" : "تفعيل"} ${action.label} لكل ملفات ${section.title}`
                              return (
                                <th key={action.key} scope="col" className="w-28 p-2 text-center">
                                  <button type="button" disabled={!columnItems.length} aria-pressed={isPartial(columnItems) ? "mixed" : on} aria-label={label} title={label}
                                    onClick={() => onChange(setFilePermissionValues(sectionRows, values, action.key, !on))}
                                    className={cn("w-full rounded-lg px-2 py-1.5 text-xs font-bold transition hover:opacity-80 disabled:opacity-40", toneClasses[action.tone].soft, toneClasses[action.tone].text)}>
                                    {action.label}
                                  </button>
                                </th>
                              )
                            })}
                            <th scope="col" className="w-20 p-3 text-center text-xs font-semibold text-muted-foreground">الكل</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.rows.map(({ family, name, icon: FileIcon, row }) => {
                            const all = fileRowAll(row)
                            return (
                              <tr key={family} className="border-b last:border-0 transition hover:bg-muted/30">
                                <th scope="row" className="p-3 text-right font-normal">
                                  <div className="flex items-center gap-2.5">
                                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", count(all) ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}><FileIcon className="h-4 w-4" /></span>
                                    <div><p className="font-semibold">{name}</p><p className="text-[11px] text-muted-foreground tabular-nums">{count(all)}/{all.length}</p></div>
                                  </div>
                                </th>
                                {FILE_ACTIONS.map((action) => {
                                  const list = row.cells[action.key]
                                  if (!list?.length) return <td key={action.key} className="p-2 text-center text-muted-foreground/40">—</td>
                                  const on = isOn(list), partial = isPartial(list)
                                  const source = SOURCE_LABELS[list[0].permission_source || ""]
                                  return (
                                    <td key={action.key} className="p-2 text-center">
                                      <button type="button" onClick={() => onChange(setFilePermissionValues([row], values, action.key, !on))}
                                        aria-pressed={partial ? "mixed" : on} aria-label={`${action.label} ${name}`}
                                        title={`${action.label} ${name}${source ? ` — ${source}` : ""}`}
                                        className={cn(
                                          "mx-auto grid size-9 place-items-center rounded-xl border-2 transition-all hover:scale-105",
                                          on ? toneClasses[action.tone].on + " shadow-sm" : partial ? "border-dashed border-muted-foreground/50 bg-muted" : "border-muted-foreground/20 bg-background text-transparent hover:border-muted-foreground/50",
                                        )}>
                                        {on ? <Check className="h-4 w-4" strokeWidth={3} /> : partial ? <Minus className="h-4 w-4 text-muted-foreground" /> : <Check className="h-4 w-4" />}
                                      </button>
                                    </td>
                                  )
                                })}
                                <td className="p-2 text-center">
                                  <Switch checked={isOn(all)} onCheckedChange={(value) => onChange(setFilePermissionValues([row], values, "all", value))} aria-label={`كل صلاحيات ${name}`} />
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
      ) : tab === "reports" ? (
        visibleReportRows.length === 0 ? <Empty text="لا توجد تقارير مطابقة للبحث أو الفلتر." /> : (
          <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="border-b bg-muted/30 p-4 text-sm text-muted-foreground">حدد صلاحية الدخول إلى كل تقرير، والطباعة، والإرسال عبر واتساب. إلغاء الدخول يعطّل بقية صلاحيات التقرير تلقائياً.</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <caption className="sr-only">صلاحيات الدخول والطباعة والإرسال عبر واتساب لكل تقرير</caption>
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th scope="col" className="p-3 text-right text-xs font-semibold text-muted-foreground">التقرير</th>
                    {REPORT_ACTIONS.map((action) => {
                      const columnItems = visibleReportRows.flatMap((row) => row.cells[action.key] || [])
                      const on = isOn(columnItems)
                      return <th key={action.key} scope="col" className="w-40 p-2 text-center">
                        <button type="button" disabled={!columnItems.length} aria-pressed={isPartial(columnItems) ? "mixed" : on}
                          title={`${on ? "تعطيل" : "تفعيل"} ${action.label} لجميع التقارير الظاهرة`}
                          onClick={() => setReportColumn(visibleReportRows, action.key, !on)}
                          className={cn("w-full rounded-lg px-2 py-1.5 text-xs font-bold transition hover:opacity-80 disabled:opacity-40", toneClasses[action.tone].soft, toneClasses[action.tone].text)}>
                          {action.label}
                        </button>
                      </th>
                    })}
                    <th scope="col" className="w-20 p-3 text-center text-xs font-semibold text-muted-foreground">الكل</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleReportRows.map((row) => {
                    const all = reportRowAll(row)
                    return <tr key={row.definition.section} className="border-b last:border-0 transition hover:bg-muted/30">
                      <th scope="row" className="p-3 text-right font-semibold">{row.definition.title}</th>
                      {REPORT_ACTIONS.map((action) => {
                        const list = row.cells[action.key] || []
                        if (!list.length) return <td key={action.key} className="p-2 text-center text-muted-foreground/40">—</td>
                        const on = isOn(list)
                        return <td key={action.key} className="p-2 text-center">
                          <Switch checked={on} onCheckedChange={() => toggleReportCell(row, action.key)} aria-label={`${action.label}: ${row.definition.title}`} />
                        </td>
                      })}
                      <td className="p-2 text-center"><Switch checked={isOn(all)} onCheckedChange={(value) => {
                        let next = values
                        for (const action of REPORT_ACTIONS) next = set(row.cells[action.key] || [], value, next)
                        onChange(next)
                      }} aria-label={`كل صلاحيات ${row.definition.title}`} /></td>
                    </tr>
                  })}
                </tbody>
              </table>
            </div>
          </section>
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
