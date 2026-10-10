"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useReportAccess } from "@/components/auth/use-report-access"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  FileText,
  Settings,
  ChevronDown,
  ChevronRight,
  Package,
  Truck,
  BarChart3,
  DollarSign,
  UserCheck,
  Printer,
  Shield,
  Database,
  Palette,
  GitBranch,
  Building,
  MapPin,
  Archive,
  TrendingUp,
  Unlock,
  Sparkles,
  Lightbulb,
  Landmark,
  Car,
  IdCard,
  Wallet,
  Receipt,
  ArrowDownCircle,
  ArrowUpCircle,
  CreditCard,
  BookOpen,
  FilePlus2,
  FileMinus2,
  ArrowLeftRight,
  WalletCards,
  KanbanSquare,
  PackageCheck,
  Grid3x3,
  Megaphone,
  Wrench,
  ClipboardCheck,
  Clock3,
  CalendarDays,
  Settings2,
  BriefcaseBusiness,
  Store,
  Search,
  X,
  PanelRightClose,
  PanelRightOpen,
  LucideIcon,
} from "lucide-react"
import { useMenuTheme } from "@/contexts/menu-theme-context"

interface SidebarProps {
  isOpen: boolean
  onToggle: () => void
  activeSection: string
  onSectionChange: (section: string) => void
  isMobile?: boolean
}

export interface MenuItem {
  id?: string
  title: string
  icon: LucideIcon
  section?: string
  submenu?: MenuItem[]
}

interface Accent {
  /** مربع أيقونة القسم الرئيسي (لون هادئ بدل التدرج المشبع) */
  tile: string
  /** شريط العنصر النشط ونقطة المستوى الثالث */
  bar: string
  /** خلفية العنصر النشط/المجموعة المفتوحة */
  soft: string
}

// لون هادئ مميز لكل قسم رئيسي — يُسهّل تمييز الأقسام دون ازدحام بصري.
const ACCENTS: Record<string, Accent> = {
  "home-dashboard": { tile: "bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/20", bar: "bg-sky-500", soft: "bg-sky-50 text-sky-900 dark:bg-sky-400/10 dark:text-sky-50" },
  "ai-assistant": { tile: "bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/20", bar: "bg-violet-500", soft: "bg-violet-50 text-violet-900 dark:bg-violet-400/10 dark:text-violet-50" },
  "smart-analytics": { tile: "bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/20", bar: "bg-violet-500", soft: "bg-violet-50 text-violet-900 dark:bg-violet-400/10 dark:text-violet-50" },
  "task-orders": { tile: "bg-fuchsia-50 text-fuchsia-600 ring-fuchsia-100 dark:bg-fuchsia-400/10 dark:text-fuchsia-300 dark:ring-fuchsia-400/20", bar: "bg-fuchsia-500", soft: "bg-fuchsia-50 text-fuchsia-900 dark:bg-fuchsia-400/10 dark:text-fuchsia-50" },
  definitions: { tile: "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20", bar: "bg-emerald-500", soft: "bg-emerald-50 text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-50" },
  "general-accounting": { tile: "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20", bar: "bg-amber-500", soft: "bg-amber-50 text-amber-900 dark:bg-amber-400/10 dark:text-amber-50" },
  "item-management": { tile: "bg-lime-50 text-lime-700 ring-lime-100 dark:bg-lime-400/10 dark:text-lime-300 dark:ring-lime-400/20", bar: "bg-lime-500", soft: "bg-lime-50 text-lime-900 dark:bg-lime-400/10 dark:text-lime-50" },
  orders: { tile: "bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/20", bar: "bg-rose-500", soft: "bg-rose-50 text-rose-900 dark:bg-rose-400/10 dark:text-rose-50" },
  "retail-pos": { tile: "bg-teal-50 text-teal-600 ring-teal-100 dark:bg-teal-400/10 dark:text-teal-300 dark:ring-teal-400/20", bar: "bg-teal-500", soft: "bg-teal-50 text-teal-900 dark:bg-teal-400/10 dark:text-teal-50" },
  reports: { tile: "bg-cyan-50 text-cyan-600 ring-cyan-100 dark:bg-cyan-400/10 dark:text-cyan-300 dark:ring-cyan-400/20", bar: "bg-cyan-500", soft: "bg-cyan-50 text-cyan-900 dark:bg-cyan-400/10 dark:text-cyan-50" },
  "item-reports": { tile: "bg-cyan-50 text-cyan-600 ring-cyan-100 dark:bg-cyan-400/10 dark:text-cyan-300 dark:ring-cyan-400/20", bar: "bg-cyan-500", soft: "bg-cyan-50 text-cyan-900 dark:bg-cyan-400/10 dark:text-cyan-50" },
  settings: { tile: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10", bar: "bg-slate-500", soft: "bg-slate-100 text-slate-900 dark:bg-white/[0.07] dark:text-white" },
  tools: { tile: "bg-blue-50 text-blue-600 ring-blue-100 dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-400/20", bar: "bg-blue-500", soft: "bg-blue-50 text-blue-900 dark:bg-blue-400/10 dark:text-blue-50" },
}

const DEFAULT_ACCENT: Accent = ACCENTS.definitions

const getAccent = (id?: string): Accent => (id && ACCENTS[id]) || DEFAULT_ACCENT

/** عرض القائمة الجانبية (مفتوحة / شريط أيقونات) — يستخدمه ERPLayout لإزاحة المحتوى. */
export const SIDEBAR_WIDTH = 352
export const SIDEBAR_COLLAPSED_WIDTH = 76

// مُصعَّد لمستوى الوحدة (بدل داخل Sidebar) ليُصدَّر ويُعاد استخدامه بمكان آخر (شريط تبويبات
// مساحة العمل) دون تكرار نفس القائمة الضخمة — البيانات ثابتة أصلاً، لا تعتمد على أي prop/hook.
export const menuItems: MenuItem[] = [
  { id: "home-dashboard", title: "الرئيسية", icon: LayoutDashboard, section: "home-dashboard" },
  { id: "ai-assistant", title: "المساعد الذكي", icon: Sparkles, section: "ai-assistant" },
  {
    id: "retail-pos",
    title: "نظام البيع بالتجزئة",
    icon: Store,
    submenu: [
      { title: "إعداد نقاط البيع", section: "pos-points-settings", icon: Settings },
      { title: "الحملات", section: "campaigns", icon: Megaphone },
      { title: "كاشير نقطة البيع", section: "pos-cashier", icon: ShoppingCart },
      {
        title: "التقارير",
        section: "retail-pos-reports",
        icon: BarChart3,
        submenu: [
          { title: "تقرير متابعة الكاشير", section: "cashier-log-report", icon: FileText },
          { title: "تقرير حركات الكاشير إجمالي", section: "cashier-log-total-report", icon: TrendingUp },
          { title: "تقرير حركات الكاشير تفصيلي", section: "cashier-log-detailed-report", icon: BarChart3 },
        ],
      },
    ],
  },
  {
    id: "task-orders",
    title: "تتبع أوامر العمل",
    icon: KanbanSquare,
    submenu: [
      { title: "إدارة الأقسام وسير العمل", section: "task-orders-admin", icon: Settings },
      { title: "قوائم تحقق الطلبيات", section: "order-checklists", icon: FileText },
      { title: "مسودات طلبيات المبيعات", section: "draft-sales-order", icon: FilePlus2 },
      { title: "متابعة طلباتي", section: "task-orders-board", icon: KanbanSquare },
      { title: "تأكيد الطلبيات", section: "order-confirmation", icon: PackageCheck },
      { title: "اعتماد الطلبيات الجاهزة", section: "task-orders-approval", icon: PackageCheck },
      {
        title: "التقارير",
        section: "task-orders-reports",
        icon: BarChart3,
        submenu: [
          { title: "تقارير أوامر العمل", section: "task-orders-report", icon: BarChart3 },
          { title: "تقرير ارشفة مسودات طلبيات المبيعات", section: "sales-drafts-archive-report", icon: Archive },
        ],
      },
    ],
  },
  //{ id: "lot-opener", title: "فتح الدفعات", icon: Unlock, section: "lot-opener" },
  {
    id: "definitions",
    title: "الملفات والتعريفات",
    icon: Users,
    submenu: [
      { title: "العملاء", section: "customers", icon: Users },
      { title: "الموردين", section: "suppliers", icon: Truck },
      { title: "المشتركين", section: "subscribers", icon: UserCheck },
      { title: "السيارات", section: "cars", icon: Car },
      { title: "السائقين", section: "drivers", icon: IdCard },
      { title: "التعريفات", section: "definitions", icon: Settings },
    ],
  },
  {
    id: "general-accounting",
    title: "المحاسبة العامة",
    icon: Wallet,
    submenu: [
      {
        title: "الملفات",
        section: "general-accounting-files",
        icon: Users,
        submenu: [
          { title: "الحسابات المحاسبية", section: "accounts", icon: Settings },
          { title: "العملات", section: "exchange-rates", icon: DollarSign },
          { title: "البنوك", section: "banks", icon: Building },
          { title: "الفروع", section: "branches", icon: MapPin },
          { title: "حسابات البنوك", section: "bank-accounts", icon: Landmark },
          { title: "بطاقات الائتمان", section: "credit-cards", icon: CreditCard },
        ],
      },
      { title: "الأصول الثابتة", section: "fixed-assets", icon: Landmark },
      {
        title: "الحركات",
        section: "accounting-transactions",
        icon: Receipt,
        submenu: [
          { title: "سند قبض", section: "receipt-vouchers", icon: ArrowDownCircle },
          { title: "سند صرف", section: "payment-vouchers", icon: ArrowUpCircle },
          { title: "سند قيد", section: "journal-vouchers", icon: BookOpen },
          { title: "قيود عمولة الفيزا", section: "visa-commission-journals", icon: CreditCard },
          { title: "قيد تحويل عملة", section: "currency-transfer-journal", icon: ArrowLeftRight },
          { title: "قيود تحويل عملة حساب", section: "account-currency-transfer-journals", icon: ArrowLeftRight },
          { title: "قيود فرق عملة", section: "currency-difference-journals", icon: DollarSign },
          { title: "اشعار دائن", section: "credit-notes", icon: FilePlus2 },
          { title: "اشعار مدين", section: "debit-notes", icon: FileMinus2 },
        ],
      },
    ],
  },
  {
    id: "cheques-menu",
    title: "الشيكات",
    icon: WalletCards,
    submenu: [
      { title: "دفاتر الشيكات", section: "cheques-books", icon: BookOpen },
      { title: "سند صرف شيكات", section: "cheque-payment-vouchers", icon: WalletCards },
      { title: "الشيكات", section: "cheques", icon: WalletCards },
      { title: "عمليات الشيكات", section: "cheque-operations", icon: ArrowLeftRight },
      { title: "إيداع الشيكات", section: "cheque-deposit-bulk", icon: ArrowDownCircle },
      { title: "تجيير الشيكات", section: "cheque-endorse-bulk", icon: ArrowLeftRight },
      { title: "إخراج الشيكات الصادرة", section: "outgoing-cheque-clear-bulk", icon: ArrowUpCircle },
    ],
  },
  {
    id: "employees-payroll",
    title: "الموظفين والرواتب",
    icon: BriefcaseBusiness,
    submenu: [
      { title: "الموظفين", section: "employees", icon: Users },
      { title: "الوظائف", section: "employee-jobs", icon: BriefcaseBusiness },
      { title: "بنود الراتب", section: "salary-items", icon: DollarSign },
      { title: "قوانين ضريبة الدخل", section: "tax-rules", icon: FileText },
      { title: "الإعفاءات الضريبية", section: "tax-exemptions", icon: FileText },
      { title: "بنود رواتب الموظفين", section: "employee-salary-items", icon: Wallet },
      { title: "فتح راتب شهر", section: "salary-periods", icon: Unlock },
      { title: "إغلاق وتنفيذ قيد الراتب", section: "salary-journal", icon: Receipt },
      { title: "كشف الرواتب", section: "payroll", icon: Receipt },
      { title: "تقرير بنود الرواتب", section: "salary-items-report", icon: BarChart3 },
      { title: "ضريبة دخل الموظفين", section: "income-tax-report", icon: BarChart3 },
      { title: "الحضور والدوام", section: "attendance-records", icon: Clock3 },
      { title: "دخول الموظفين تفصيلي", section: "attendance-detailed-report", icon: BarChart3 },
      { title: "دخول الموظفين إجمالي", section: "attendance-summary-report", icon: BarChart3 },
      { title: "الورديات والجداول الأسبوعية", section: "shifts", icon: Clock3 },
      { title: "العطل الرسمية", section: "official-holidays", icon: CalendarDays },
      { title: "إعداد أجهزة الحضور", section: "attendance-devices", icon: Settings2 },
    ],
  },
  {
    id: "item-management",
    title: "ادارة الاصناف",
    icon: Package,
    submenu: [
      {
        title: "الملفات",
        section: "item-management-files",
        icon: Users,
        submenu: [
          { title: "المستودعات", section: "warehouses", icon: Building },
          { title: "الأصناف", section: "products", icon: Package },
          { title: "الخدمات", section: "services", icon: Package },
          { title: "مجموعات الأصناف", section: "product-groups", icon: Package },
          { title: "أنواع العلامات التجارية", section: "brand-types", icon: Package },
          { title: "العلامات التجارية", section: "brands", icon: Package },
        ],
      },
      {
        title: "الحركات",
        section: "item-management-transactions",
        icon: Receipt,
        submenu: [
          { title: "سند ادخال بضاعة", section: "stock-in-vouchers", icon: ArrowDownCircle },
          { title: "سند اخراج بضاعة", section: "stock-out-vouchers", icon: ArrowUpCircle },
          { title: "ارسالية داخلية", section: "internal-delivery-vouchers", icon: Truck },
          { title: "سند استعمال", section: "use-vouchers", icon: FileMinus2 },
          { title: "جرد المخازن", section: "stock-counts", icon: ClipboardCheck },
        ],
      },
      {
        title: "طلبات بضاعة داخلي",
        section: "internal-manufacturing-orders",
        icon: ClipboardCheck,
        submenu: [
          { title: "لوحة متابعة الطلبات", section: "internal-manufacturing-dashboard", icon: LayoutDashboard },
          { title: "إعدادات طلب بضاعة داخلي", section: "internal-manufacturing-settings", icon: Settings },
          { title: "طلب بضاعة داخلي", section: "internal-manufacturing-request", icon: FilePlus2 },
          { title: "تدقيق طلب البضاعة", section: "internal-manufacturing-request-audit", icon: Shield },
          { title: "تجهيز الطلبات", section: "internal-manufacturing-preparation", icon: PackageCheck },
          { title: "تدقيق الطلبات الجاهزة", section: "internal-manufacturing-ready-audit", icon: Shield },
          { title: "إرسال الطلبات", section: "internal-manufacturing-send", icon: ArrowUpCircle },
          { title: "استلام الطلبات", section: "internal-manufacturing-receive", icon: ArrowDownCircle },
          { title: "تدقيق البضاعة المستلمة", section: "internal-manufacturing-received-audit", icon: Shield },
          { title: "تقرير أرشفة الطلبات الداخلية", section: "internal-manufacturing-archive-report", icon: Archive },
        ],
      },
    ],
  },
  {
    id: "orders",
    title: "الطلبيات",
    icon: ShoppingCart,
    submenu: [
      {
        title: "الحركات",
        section: "transactions",
        icon: ShoppingCart,
        submenu: [
          { title: "طلبيات المشتريات", section: "purchase-orders", icon: Truck },
          { title: "طلبيات المبيعات", section: "sales-orders", icon: ShoppingCart },
          { title: "معالجة حالة الطلبيات", section: "order-management", icon: Package },
        ],
      },
    ],
  },

  {
    id: "sales-purchase-vouchers",
    title: "المبيعات والمشتريات",
    icon: Truck,
    submenu: [
      {
        title: "الملفات",
        section: "sales-purchase-vouchers-files",
        icon: Users,
        submenu: [
          { title: "المندوبين", section: "salesmen", icon: UserCheck },
          { title: "عمولات المندوبين", section: "salesman-commissions", icon: WalletCards },
          { title: "نماذج العملاء والأصناف", section: "customer-product-templates", icon: Grid3x3 },
        ],
      },
      {
        title: "الحركات",
        section: "sales-purchase-vouchers-transactions",
        icon: Truck,
        submenu: [
          { title: "فاتورة مبيعات", section: "sales-invoices", icon: FileText },
          { title: "إرسالية مبيعات", section: "sales-delivery", icon: Truck },
          { title: "إرسالية برسم البيع", section: "delivery-consignment-sale", icon: ArrowUpCircle },
          { title: "مرتجع إرسالية برسم البيع", section: "return-delivery-consignment-sale", icon: ArrowDownCircle },
          { title: "مرتجع مبيعات", section: "return-sell", icon: FileMinus2 },
          { title: "فاتورة مشتريات", section: "purchase-invoices", icon: ShoppingCart },
          { title: "إرسالية مشتريات", section: "delivery-pay", icon: ArrowDownCircle },
          { title: "مرتجع مشتريات", section: "return-purchase", icon: FileMinus2 },
        ],
      },
    ],
  },

  {
    id: "item-reports",
    title: "تقارير الأصناف",
    icon: BarChart3,
    submenu: [
      { title: "بطاقة صنف", section: "item-card-report", icon: Package },
      { title: "أرصدة المخزون بتاريخ معين", section: "item-balances-report", icon: BarChart3 },
      { title: "تقييم المخزون بتاريخ معين", section: "item-valuation-report", icon: DollarSign },
    ],
  },
  {
    id: "profit-reports",
    title: "تقارير كلفة وأرباح المخزون",
    icon: TrendingUp,
    submenu: [
      { title: "تقرير نسبة أرباح المخزون", section: "items-profit-report", icon: TrendingUp },
      { title: "تقرير ارباح فترة معينة", section: "period-profit-report", icon: BarChart3 },
      { title: "تكلفة مبيعات صنف", section: "item-sales-cost-report", icon: Package },
      { title: "أرباح فاتورة معينة", section: "invoice-profit-report", icon: FileText },
      { title: "تسعير الإخراجات", section: "pricing-inventory", icon: DollarSign },
    ],
  },
  {
    id: "reports",
    title: "التقارير",
    icon: FileText,
    submenu: [
      {
        id: "accounting-reports",
        title: "تقارير محاسبية",
        icon: BookOpen,
        submenu: [
          { title: "بيان حساب الذمة", section: "receivables-statement-report", icon: Users },
          { title: "بيان حساب محاسبي", section: "accounting-statement-report", icon: BookOpen },
          { title: "تقرير أرصدة الذمم بتاريخ معين", section: "receivables-balances-report", icon: BarChart3 },
          { title: "تقرير أرصدة الحسابات بتاريخ معين", section: "accounting-balances-report", icon: BarChart3 },
          { title: "تقرير تعمير الذمم", section: "receivables-aging-report", icon: Clock3 },
          { title: "تقرير السندات", section: "vouchers-report", icon: FileText },
          { title: "تقرير الحركات", section: "transactions-report", icon: TrendingUp },
          { title: "ميزان المراجعة", section: "trial-balance-report", icon: BarChart3 },
          { title: "ميزانية عمومية", section: "balance-sheet-report", icon: Landmark },
          { title: "قائمة الدخل", section: "income-statement-report", icon: DollarSign },
        ],
      },
      { title: "تقارير الطلبيات", section: "order-reports", icon: BarChart3 },
      { title: "أرشفة الرقم التشغيلي", section: "batch-log-report", icon: Package },
      { title: "تقرير حركات السيريال", section: "serial-movements-report", icon: Package },
    ],
  },
  {
    id: "settings",
    title: "الإعدادات",
    icon: Settings,
    submenu: [
      {
        id: "user-management",
        title: "اعدادات المستخدمين",
        icon: UserCheck,
        submenu: [
          { title: "المستخدمين", section: "user-settings", icon: UserCheck },
          { title: "الصلاحيات", section: "permissions", icon: Shield },
          { title: "الأدوار الوظيفية", section: "job-roles", icon: UserCheck },
          { title: "صلاحيات الأدوار الوظيفية", section: "role-permissions", icon: Shield },
          // صلاحيات المستخدمين على الفروع: أُزيلت من القائمة مؤقتاً بطلب المستخدم (لم يُقرَّر بعد كيف
          // ستُستخدَم) — الشاشة والمسارات وجدول user_branches ما زالت موجودة، فقط غير مرتبطة بالقائمة.
          // انظر "user-branch-access-matrix" بـapp/page.tsx لإعادتها لاحقاً بسطر واحد هنا.
          { title: "اعدادات", section: "user-default-accounts", icon: Settings },
          { title: "صلاحيات دفاتر السندات", section: "voucher-book-permissions", icon: CreditCard },
        ],
      },
      { title: "إعدادات الخطوط", section: "font-settings", icon: Settings },
      { title: "إعدادات النظام", section: "system-settings", icon: Settings },
      { title: "إعدادات الطباعة", section: "print-settings", icon: Printer },
      { title: "إعدادات السندات وطباعتها", section: "voucher-settings", icon: Printer },
      // "اعدادات عامة" أصبحت تبويباً داخل "إعدادات النظام" (المسار vouchers-general-settings باقٍ للمفضلة القديمة)
    ],
  },
  {
    id: "tools",
    title: "أدوات",
    icon: Wrench,
    submenu: [
      { title: "البداية السريعة", section: "personal-assistant", icon: Sparkles },
    ],
  },

]

// يُسطِّح menuItems (بمن فيهم submenu المتداخل حتى مستويين) إلى خريطة section -> title واحدة —
// مصدر عناوين موحّد يُستخدم بشريط تبويبات مساحة العمل (WorkspacePane) بدل تكرار عناوين يدوياً.
function flattenSectionTitles(items: MenuItem[], acc: Record<string, string> = {}): Record<string, string> {
  for (const item of items) {
    if (item.section) acc[item.section] = item.title
    if (item.submenu) flattenSectionTitles(item.submenu, acc)
  }
  return acc
}

export const SECTION_TITLES: Record<string, string> = flattenSectionTitles(menuItems)

// يُخفي التقارير التي لا يملك المستخدم صلاحية استعلامها في الفرع النشط، والمجموعات التي تفرغ بسببها.
function filterReportItems(items: MenuItem[], canOpenReport: (section?: string | null) => boolean): MenuItem[] {
  return items.flatMap((item) => {
    if (item.submenu) {
      const submenu = filterReportItems(item.submenu, canOpenReport)
      return submenu.length ? [{ ...item, submenu }] : []
    }
    return canOpenReport(item.section) ? [item] : []
  })
}

const itemKey = (item: MenuItem) => item.id ?? item.section ?? item.title

const normalizeMenuText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()

// فلترة القائمة بنص البحث: عنصر يطابق عنوانه يظهر بكامل فروعه، وإلا تظهر فروعه المطابقة فقط.
function filterMenuByQuery(items: MenuItem[], terms: string[]): MenuItem[] {
  if (!terms.length) return items
  return items.flatMap((item) => {
    const title = normalizeMenuText(item.title)
    if (terms.every((term) => title.includes(term))) return [item]
    if (!item.submenu) return []
    const submenu = filterMenuByQuery(item.submenu, terms)
    return submenu.length ? [{ ...item, submenu }] : []
  })
}

// مفاتيح المجموعات التي تحوي القسم النشط (لفتحها تلقائياً وإبراز القسم الرئيسي الحاوي).
function findAncestorKeys(items: MenuItem[], section: string, trail: string[] = []): string[] | null {
  for (const item of items) {
    if (item.section === section && !item.submenu) return trail
    if (item.submenu) {
      if (item.section === section) return [...trail, itemKey(item)]
      const found = findAncestorKeys(item.submenu, section, [...trail, itemKey(item)])
      if (found) return found
    }
  }
  return null
}

const countLeaves = (items: MenuItem[]): number =>
  items.reduce((total, item) => total + (item.submenu ? countLeaves(item.submenu) : 1), 0)

export function Sidebar({
  isOpen,
  onToggle,
  activeSection,
  onSectionChange,
  isMobile = false,
}: SidebarProps) {
  const canOpenReport = useReportAccess()
  const visibleMenuItems = useMemo(() => filterReportItems(menuItems, canOpenReport), [canOpenReport])
  const [expandedMenus, setExpandedMenus] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [companyLogo, setCompanyLogo] = useState("")
  const [companyName, setCompanyName] = useState("ARAAK ERP System")
  const { menuDarkMode } = useMenuTheme()
  const searchInputRef = useRef<HTMLInputElement>(null)

  const searchTerms = useMemo(() => normalizeMenuText(query).split(" ").filter(Boolean), [query])
  const filteredItems = useMemo(() => filterMenuByQuery(visibleMenuItems, searchTerms), [visibleMenuItems, searchTerms])
  const isSearching = searchTerms.length > 0
  const activeTrail = useMemo(() => findAncestorKeys(visibleMenuItems, activeSection) ?? [], [visibleMenuItems, activeSection])

  // فتح المجموعات الحاوية للقسم النشط تلقائياً (عند التنقل من الهيدر/البحث/الروابط أيضاً)
  useEffect(() => {
    if (!activeTrail.length) return
    setExpandedMenus((current) => {
      const topLevel = activeTrail[0]
      // قسم رئيسي واحد مفتوح في كل مرة: إغلاق بقية الأقسام الرئيسية عند الانتقال لقسم آخر
      const topKeys = new Set(visibleMenuItems.map(itemKey))
      const kept = current.filter((key) => !topKeys.has(key) || key === topLevel)
      return Array.from(new Set([...kept, ...activeTrail]))
    })
  }, [activeTrail, visibleMenuItems])

  useEffect(() => {
    const loadCompanyBrand = async () => {
      try {
        const response = await fetch("/api/settings/system")
        if (!response.ok) return
        const data = await response.json()
        const settings = data?.settings ?? data
        setCompanyLogo(typeof settings?.company_logo === "string" ? settings.company_logo : "")
        setCompanyName(String(settings?.company_name || "ARAAK ERP System"))
      } catch (error) {
        console.error("Failed to load company branding", error)
      }
    }
    void loadCompanyBrand()
    window.addEventListener("system-settings-updated", loadCompanyBrand)
    return () => window.removeEventListener("system-settings-updated", loadCompanyBrand)
  }, [])

  const isTopLevel = (key: string) => visibleMenuItems.some((item) => itemKey(item) === key)

  const toggleMenu = (menuId: string) => {
    setExpandedMenus((prev) => {
      if (prev.includes(menuId)) return prev.filter((id) => id !== menuId)
      // فتح قسم رئيسي يُغلق الأقسام الرئيسية الأخرى (أكورديون) — الفروع الداخلية تبقى كما هي
      if (isTopLevel(menuId)) return [...prev.filter((id) => !isTopLevel(id)), menuId]
      return [...prev, menuId]
    })
  }

  // يُعيد رابطاً حقيقياً لنفس صفحة SPA (app/page.tsx) بمعامل section — تقرأه الصفحة عند
  // التحميل لعرض نفس القسم مباشرة، فيعمل "فتح في تبويب جديد" (كليك أوسط/يمين) بشكل طبيعي دون
  // الحاجة لصفحات Next.js منفصلة لكل قسم (لا تحتوي أصلاً على القائمة الجانبية/الهيدر).
  const getSectionUrl = (section: string): string => {
    if (section === "dashboard" || section === "home-dashboard") return "/"
    return `/?section=${section}`
  }

  const handleItemClick = (item: MenuItem) => {
    if (item.submenu) {
      // شريط الأيقونات (قائمة مطوية): الضغط على قسم يفتح القائمة ويعرض فروعه
      if (!isOpen) {
        onToggle()
        setExpandedMenus((prev) => [...prev.filter((id) => !isTopLevel(id)), itemKey(item)])
      } else {
        toggleMenu(itemKey(item))
      }
      if (item.section === "internal-manufacturing-request") onSectionChange(item.section)
      return
    }
    if (item.section) onSectionChange(item.section)
  }

  // عناصر القائمة بدون قائمة فرعية تُعرض كروابط <a> حقيقية (انظر getSectionUrl) — هذا يجعل
  // الزر الأوسط (فتح بتبويب جديد) وقائمة سياق المتصفح اليمنى تعملان بشكل طبيعي. الكليك العادي
  // فقط يُمنع ليُستبدل بالانتقال داخل الصفحة (SPA)، أما Ctrl/Cmd/Shift+كليك فتُترك للمتصفح.
  const handleItemLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, item: MenuItem) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) return
    e.preventDefault()
    handleItemClick(item)
  }

  const isExpanded = (item: MenuItem) => isSearching || expandedMenus.includes(itemKey(item))

  // ── المستوى الثاني فأعمق ──
  const renderSubItems = (items: MenuItem[], accent: Accent, depth: number) => (
    <div
      className={
        depth === 1
          ? "relative mr-[1.4rem] mt-1 space-y-0.5 border-r border-slate-200 pb-1 pr-2.5 dark:border-white/10"
          : "relative mr-3 mt-0.5 space-y-0.5 border-r border-dashed border-slate-200 pr-2.5 dark:border-white/10"
      }
    >
      {items.map((item) => {
        const key = itemKey(item)
        const Icon = item.icon
        const hasChildren = Boolean(item.submenu?.length)
        const active = activeSection === item.section
        const inTrail = activeTrail.includes(key)
        const expanded = hasChildren && isExpanded(item)
        const rowClass = cn(
          "group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 text-right transition-colors duration-150",
          depth === 1 ? "min-h-9 py-1.5 text-[0.84rem]" : "min-h-8 py-1 text-[0.8rem]",
          active
            ? cn(accent.soft, "font-bold")
            : inTrail
              ? "font-semibold text-slate-900 dark:text-white"
              : "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white",
        )
        const content = (
          <>
            {active && <span className={cn("absolute -right-[11px] top-1.5 bottom-1.5 w-[3px] rounded-full", accent.bar)} />}
            {depth === 1 ? (
              <Icon className={cn("h-4 w-4 shrink-0", active ? "" : "text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300")} />
            ) : (
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", active ? accent.bar : "bg-slate-300 dark:bg-slate-600")} />
            )}
            <span className="min-w-0 flex-1 truncate">{item.title}</span>
            {hasChildren && (
              <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200", expanded && "rotate-180")} />
            )}
          </>
        )
        return (
          <div key={key}>
            {hasChildren ? (
              <button type="button" onClick={() => handleItemClick(item)} className={rowClass} aria-expanded={expanded}>
                {content}
              </button>
            ) : (
              <a href={getSectionUrl(item.section || "")} onClick={(e) => handleItemLinkClick(e, item)} className={rowClass} aria-current={active ? "page" : undefined}>
                {content}
              </a>
            )}
            {expanded && item.submenu && renderSubItems(item.submenu, accent, depth + 1)}
          </div>
        )
      })}
    </div>
  )

  const width = isMobile ? undefined : isOpen ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH

  return (
    // اللف بعنصر خارجي حامل لصنف "dark" (بدل وضعه على نفس عنصر الجذر) — أصناف dark: في العنصر
    // الداخلي تحتاج سلفاً حاملاً لـ.dark فعلياً (محدِّد نسل)، لا العنصر نفسه، حتى تتفعّل بصرياً.
    <div className={`user-typography ${menuDarkMode ? "dark" : ""}`}>
      <aside
        className={cn(
          "fixed right-0 top-0 z-40 flex h-[100dvh] flex-col border-l border-slate-200/80 bg-white text-slate-800 shadow-[0_0_40px_-20px_rgba(15,23,42,0.25)] transition-[width,transform] duration-300 dark:border-white/10 dark:bg-[linear-gradient(180deg,#0b1220_0%,#0f172a_60%,#0b1220_100%)] dark:text-slate-100",
          isMobile && "z-50 w-[min(22rem,calc(100vw-1rem))]",
          isMobile && !isOpen ? "translate-x-full" : "translate-x-0",
        )}
        style={width ? { width } : undefined}
        dir="rtl"
        aria-label="القائمة الرئيسية"
      >
        {/* الهوية */}
        <div className={cn("flex shrink-0 items-center gap-3 border-b border-slate-100 dark:border-white/10", isOpen ? "px-4 py-4" : "flex-col px-2 py-4")}>
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md shadow-emerald-600/20">
            {companyLogo ? (
              <img src={companyLogo} alt={companyName} className="h-full w-full bg-white object-contain p-1" />
            ) : (
              <Sparkles className="h-5 w-5 text-white" />
            )}
          </div>
          {isOpen && (
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[15px] font-extrabold leading-6 text-slate-900 dark:text-white" title={companyName}>{companyName}</h2>
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                نظام إدارة الموارد
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={onToggle}
            title={isOpen ? "طي القائمة" : "توسيع القائمة"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            {isOpen ? <PanelRightClose className="h-[18px] w-[18px]" /> : <PanelRightOpen className="h-[18px] w-[18px]" />}
          </button>
        </div>

        {/* بحث سريع داخل القائمة */}
        {isOpen && (
          <div className="shrink-0 px-3 pb-2 pt-3">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setQuery("")
                  if (event.key === "Enter") {
                    // Enter يفتح أول شاشة مطابقة
                    const firstLeaf = (function find(items: MenuItem[]): MenuItem | null {
                      for (const item of items) {
                        if (!item.submenu && item.section) return item
                        const nested = item.submenu ? find(item.submenu) : null
                        if (nested) return nested
                      }
                      return null
                    })(filteredItems)
                    if (firstLeaf) {
                      onSectionChange(firstLeaf.section!)
                      setQuery("")
                    }
                  }
                }}
                placeholder="ابحث في القائمة..."
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pr-9 pl-8 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/15 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:focus:bg-white/10"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(""); searchInputRef.current?.focus() }}
                  className="absolute left-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-white/10"
                  title="مسح"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* القائمة */}
        <nav className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-4 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent dark:scrollbar-thumb-white/10", isOpen ? "px-3 pt-1" : "px-2 pt-3")}>
          {isOpen && (
            <p className="px-2 pb-1.5 pt-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {isSearching ? `نتائج البحث (${countLeaves(filteredItems)})` : "القائمة"}
            </p>
          )}
          {isOpen && isSearching && !filteredItems.length && (
            <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500 dark:border-white/10">
              لا توجد شاشة بهذا الاسم
            </div>
          )}
          <div className={isOpen ? "space-y-1" : "space-y-1.5"}>
            {(isOpen ? filteredItems : visibleMenuItems).map((item) => {
              const key = itemKey(item)
              const Icon = item.icon
              const accent = getAccent(item.id)
              const hasChildren = Boolean(item.submenu?.length)
              const active = activeSection === item.section
              const containsActive = activeTrail[0] === key
              const expanded = isOpen && hasChildren && isExpanded(item)

              const rowClass = cn(
                "group relative flex w-full items-center rounded-xl text-right transition-colors duration-150",
                isOpen ? "min-h-11 gap-3 px-2 py-1.5" : "h-12 justify-center",
                active || (containsActive && !expanded)
                  ? accent.soft
                  : expanded
                    ? "bg-slate-50 dark:bg-white/[0.04]"
                    : "hover:bg-slate-100 dark:hover:bg-white/[0.06]",
              )
              const content = (
                <>
                  {(active || containsActive) && (
                    <span className={cn("absolute right-0 top-2 bottom-2 w-[3px] rounded-l-full", accent.bar, !isOpen && "top-3 bottom-3")} />
                  )}
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform duration-150 group-hover:scale-[1.04]", accent.tile)}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  {isOpen && (
                    <>
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[0.92rem]",
                          active || containsActive ? "font-extrabold text-slate-900 dark:text-white" : "font-semibold text-slate-700 dark:text-slate-200",
                        )}
                      >
                        {item.title}
                      </span>
                      {hasChildren && (
                        <>
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-500 dark:bg-white/10 dark:text-slate-400">
                            {countLeaves(item.submenu!)}
                          </span>
                          <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200", expanded && "rotate-180 text-slate-700 dark:text-slate-200")} />
                        </>
                      )}
                    </>
                  )}
                </>
              )

              return (
                <div key={key}>
                  {hasChildren ? (
                    <button type="button" title={!isOpen ? item.title : undefined} onClick={() => handleItemClick(item)} className={rowClass} aria-expanded={expanded}>
                      {content}
                    </button>
                  ) : (
                    <a
                      href={getSectionUrl(item.section || "")}
                      title={!isOpen ? item.title : undefined}
                      onClick={(e) => handleItemLinkClick(e, item)}
                      className={rowClass}
                      aria-current={active ? "page" : undefined}
                    >
                      {content}
                    </a>
                  )}
                  {expanded && item.submenu && renderSubItems(item.submenu, accent, 1)}
                </div>
              )
            })}
          </div>
        </nav>

        {/* التذييل */}
        <div className={cn("shrink-0 border-t border-slate-100 dark:border-white/10", isOpen ? "px-4 py-3" : "px-2 py-3")}>
          <div className={cn("flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400", !isOpen && "justify-center")}>
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            {isOpen && (
              <>
                <span className="text-emerald-700 dark:text-emerald-300">متصل</span>
                <span className="mr-auto font-mono text-[10.5px] text-slate-400">ARAAK ERP</span>
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
