"use client"

import { tr, appDir } from "@/lib/i18n"
import { useEffect, useMemo, useRef, useState } from "react"
import { useReportAccess } from "@/components/auth/use-report-access"
import { useFileSectionAccess } from "@/components/auth/use-file-access"
import { NoonMark } from "@/components/brand/noon-logo"
import { useTransactionSectionAccess } from "@/components/auth/transaction-access-gate"
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
  MailOpen,
  ListChecks,
  SendHorizontal,
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
  CheckCircle2,
  Clock3,
  CalendarDays,
  Settings2,
  BriefcaseBusiness,
  Store,
  UtensilsCrossed,
  LayoutGrid,
  Search,
  X,
  PanelRightClose,
  PanelRightOpen,
  LucideIcon, FileSpreadsheet, BadgePercent, Sunrise, Globe, Lock, Keyboard, Ship, CalendarCheck2, MessageSquareText, ClipboardList, Layers, PackageSearch, Timer, UserRound, Eye, Factory, KeyRound, HeartHandshake, HandCoins, MinusCircle } from "lucide-react"
import { useMenuTheme } from "@/contexts/menu-theme-context"
import { useSavingLock } from "@/lib/saving-lock"
import { PoweredBy } from "@/components/brand/powered-by"

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
  "morning-briefing": { tile: "bg-orange-50 text-orange-600 ring-orange-100 dark:bg-orange-400/10 dark:text-orange-300 dark:ring-orange-400/20", bar: "bg-orange-500", soft: "bg-orange-50 text-orange-900 dark:bg-orange-400/10 dark:text-orange-50" },
  "ai-assistant": { tile: "bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/20", bar: "bg-violet-500", soft: "bg-violet-50 text-violet-900 dark:bg-violet-400/10 dark:text-violet-50" },
  "smart-analytics": { tile: "bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/20", bar: "bg-violet-500", soft: "bg-violet-50 text-violet-900 dark:bg-violet-400/10 dark:text-violet-50" },
  "task-orders": { tile: "bg-fuchsia-50 text-fuchsia-600 ring-fuchsia-100 dark:bg-fuchsia-400/10 dark:text-fuchsia-300 dark:ring-fuchsia-400/20", bar: "bg-fuchsia-500", soft: "bg-fuchsia-50 text-fuchsia-900 dark:bg-fuchsia-400/10 dark:text-fuchsia-50" },
  definitions: { tile: "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20", bar: "bg-emerald-500", soft: "bg-emerald-50 text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-50" },
  "general-accounting": { tile: "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20", bar: "bg-amber-500", soft: "bg-amber-50 text-amber-900 dark:bg-amber-400/10 dark:text-amber-50" },
  "item-management": { tile: "bg-lime-50 text-lime-700 ring-lime-100 dark:bg-lime-400/10 dark:text-lime-300 dark:ring-lime-400/20", bar: "bg-lime-500", soft: "bg-lime-50 text-lime-900 dark:bg-lime-400/10 dark:text-lime-50" },
  purchases: { tile: "bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/20", bar: "bg-rose-500", soft: "bg-rose-50 text-rose-900 dark:bg-rose-400/10 dark:text-rose-50" },
  sales: { tile: "bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/20", bar: "bg-sky-500", soft: "bg-sky-50 text-sky-900 dark:bg-sky-400/10 dark:text-sky-50" },
  "retail-pos": { tile: "bg-teal-50 text-teal-600 ring-teal-100 dark:bg-teal-400/10 dark:text-teal-300 dark:ring-teal-400/20", bar: "bg-teal-500", soft: "bg-teal-50 text-teal-900 dark:bg-teal-400/10 dark:text-teal-50" },
  "accounting-reports": { tile: "bg-indigo-50 text-indigo-600 ring-indigo-100 dark:bg-indigo-400/10 dark:text-indigo-300 dark:ring-indigo-400/20", bar: "bg-indigo-500", soft: "bg-indigo-50 text-indigo-900 dark:bg-indigo-400/10 dark:text-indigo-50" },
  "cost-center-reports": { tile: "bg-purple-50 text-purple-600 ring-purple-100 dark:bg-purple-400/10 dark:text-purple-300 dark:ring-purple-400/20", bar: "bg-purple-500", soft: "bg-purple-50 text-purple-900 dark:bg-purple-400/10 dark:text-purple-50" },
  reports: { tile: "bg-cyan-50 text-cyan-600 ring-cyan-100 dark:bg-cyan-400/10 dark:text-cyan-300 dark:ring-cyan-400/20", bar: "bg-cyan-500", soft: "bg-cyan-50 text-cyan-900 dark:bg-cyan-400/10 dark:text-cyan-50" },
  "tax-reports": { tile: "bg-orange-50 text-orange-600 ring-orange-100 dark:bg-orange-400/10 dark:text-orange-300 dark:ring-orange-400/20", bar: "bg-orange-500", soft: "bg-orange-50 text-orange-900 dark:bg-orange-400/10 dark:text-orange-50" },
  "orders-reports": { tile: "bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/20", bar: "bg-violet-500", soft: "bg-violet-50 text-violet-900 dark:bg-violet-400/10 dark:text-violet-50" },
  "deliveries-reports": { tile: "bg-cyan-50 text-cyan-600 ring-cyan-100 dark:bg-cyan-400/10 dark:text-cyan-300 dark:ring-cyan-400/20", bar: "bg-cyan-500", soft: "bg-cyan-50 text-cyan-900 dark:bg-cyan-400/10 dark:text-cyan-50" },
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
  { id: "home-dashboard", title: tr("الرئيسية"), icon: LayoutDashboard, section: "home-dashboard" },
  { id: "morning-briefing", title: tr("الملخص الصباحي"), icon: Sunrise, section: "morning-briefing" },
  { id: "ai-assistant", title: tr("المساعد الذكي"), icon: Sparkles, section: "ai-assistant" },
  {
    id: "definitions",
    title: tr("الملفات والتعريفات"),
    icon: Users,
    submenu: [
      { title: tr("التعريفات الاساسية"), section: "definitions", icon: Settings },
      {
        title: tr("ملفات محاسبية"),
        section: "general-accounting-files",
        icon: Users,
        submenu: [
          { title: tr("الحسابات المحاسبية"), section: "accounts", icon: Settings },
          { title: tr("العملات"), section: "exchange-rates", icon: DollarSign },
          { title: tr("البنوك"), section: "banks", icon: Building },
          { title: tr("فروع البنوك"), section: "branches", icon: MapPin },
          { title: tr("حسابات البنوك"), section: "bank-accounts", icon: Landmark },
          { title: tr("بطاقات الائتمان"), section: "credit-cards", icon: CreditCard },
        ],
      },
      {
        title: tr("ملفات العملاء والموردين"),
        section: "customer-supplier-files",
        icon: Users,
        submenu: [
          { title: tr("العملاء"), section: "customers", icon: Users },
          { title: tr("الموردين"), section: "suppliers", icon: Truck },
          { title: tr("المشتركين"), section: "subscribers", icon: UserCheck },
          { title: tr("بوابة العملاء"), section: "customer-portal", icon: Globe },
          { title: tr("المندوبين"), section: "salesmen", icon: UserCheck },
          { title: tr("عمولات المندوبين"), section: "salesman-commissions", icon: WalletCards },
          { title: tr("نماذج العملاء والأصناف"), section: "customer-product-templates", icon: Grid3x3 },
          { title: tr("العروض والأسعار الخاصة"), section: "promotions", icon: Megaphone },
          { title: tr("السيارات"), section: "cars", icon: Car },
          { title: tr("السائقين"), section: "drivers", icon: IdCard },
        ],
      },
      {
        title: tr("ملفات الاصناف"),
        section: "item-management-files",
        icon: Users,
        submenu: [
          { title: tr("المستودعات"), section: "warehouses", icon: Building },
          { title: tr("الأصناف"), section: "products", icon: Package },
          { title: tr("الخدمات"), section: "services", icon: Package },
          { title: tr("مجموعات الأصناف"), section: "product-groups", icon: Package },
          { title: tr("أنواع العلامات التجارية"), section: "brand-types", icon: Package },
          { title: tr("العلامات التجارية"), section: "brands", icon: Package },
        ],
      },
    ],
  },
  {
    id: "general-accounting",
    title: tr("المحاسبة العامة"),
    icon: Wallet,
    submenu: [
      { title: tr("سند قبض"), section: "receipt-vouchers", icon: ArrowDownCircle },
      { title: tr("سند صرف"), section: "payment-vouchers", icon: ArrowUpCircle },
      {
        title: tr("قيود محاسبية"),
        section: "accounting-journals",
        icon: BookOpen,
        submenu: [
          { title: tr("سند قيد"), section: "journal-vouchers", icon: BookOpen },
          { title: tr("قيود عمولة الفيزا"), section: "visa-commission-journals", icon: CreditCard },
          { title: tr("قيد تحويل عملة"), section: "currency-transfer-journal", icon: ArrowLeftRight },
          { title: tr("قيود تحويل عملة حساب"), section: "account-currency-transfer-journals", icon: ArrowLeftRight },
          { title: tr("قيود فرق عملة"), section: "currency-difference-journals", icon: DollarSign },
        ],
      },
      { title: tr("التسوية البنكية"), section: "bank-reconciliation", icon: Landmark },
      { title: tr("اشعار دائن"), section: "credit-notes", icon: FilePlus2 },
      { title: tr("اشعار مدين"), section: "debit-notes", icon: FileMinus2 },
    ],
  },
  {
    id: "cheques-menu",
    title: tr("الشيكات"),
    icon: WalletCards,
    submenu: [
      { title: tr("دفاتر الشيكات"), section: "cheques-books", icon: BookOpen },
      { title: tr("سند صرف شيكات"), section: "cheque-payment-vouchers", icon: WalletCards },
      { title: tr("الشيكات"), section: "cheques", icon: WalletCards },
      { title: tr("عمليات الشيكات"), section: "cheque-operations", icon: ArrowLeftRight },
      { title: tr("إيداع الشيكات"), section: "cheque-deposit-bulk", icon: ArrowDownCircle },
      { title: tr("تجيير الشيكات"), section: "cheque-endorse-bulk", icon: ArrowLeftRight },
      { title: tr("إخراج الشيكات الصادرة"), section: "outgoing-cheque-clear-bulk", icon: ArrowUpCircle },
    ],
  },
  {
    id: "item-management",
    title: tr("ادارة الاصناف"),
    icon: Package,
    submenu: [
      {
        title: tr("الحركات"),
        section: "item-management-transactions",
        icon: Receipt,
        submenu: [
          { title: tr("سند ادخال بضاعة"), section: "stock-in-vouchers", icon: ArrowDownCircle },
          { title: tr("سند اخراج بضاعة"), section: "stock-out-vouchers", icon: ArrowUpCircle },
          { title: tr("ارسالية داخلية"), section: "internal-delivery-vouchers", icon: Truck },
          { title: tr("سند استعمال"), section: "use-vouchers", icon: FileMinus2 },
          { title: tr("سند انتاج بضاعة"), section: "production-vouchers", icon: Factory },
        ],
      },
      {
        title: tr("جرد المخازن"),
        section: "stock-counts-menu",
        icon: ClipboardCheck,
        submenu: [
          { title: tr("تعريف الجلسات وادخال الجرد"), section: "stock-counts", icon: ClipboardList },
          { title: tr("مطابقة الجرد"), section: "stock-count-approval", icon: CheckCircle2 },
        ],
      },
      {
        title: tr("طلبات بضاعة داخلي"),
        section: "internal-manufacturing-orders",
        icon: ClipboardCheck,
        submenu: [
          { title: tr("لوحة متابعة الطلبات"), section: "internal-manufacturing-dashboard", icon: LayoutDashboard },
          { title: tr("إعدادات طلب بضاعة داخلي"), section: "internal-manufacturing-settings", icon: Settings },
          { title: tr("طلب بضاعة داخلي"), section: "internal-manufacturing-request", icon: FilePlus2 },
          { title: tr("تدقيق طلب البضاعة"), section: "internal-manufacturing-request-audit", icon: Shield },
          { title: tr("تجهيز الطلبات"), section: "internal-manufacturing-preparation", icon: PackageCheck },
          { title: tr("تدقيق الطلبات الجاهزة"), section: "internal-manufacturing-ready-audit", icon: Shield },
          { title: tr("إرسال الطلبات"), section: "internal-manufacturing-send", icon: ArrowUpCircle },
          { title: tr("استلام الطلبات"), section: "internal-manufacturing-receive", icon: ArrowDownCircle },
          { title: tr("تدقيق البضاعة المستلمة"), section: "internal-manufacturing-received-audit", icon: Shield },
          { title: tr("تقرير أرشفة الطلبات الداخلية"), section: "internal-manufacturing-archive-report", icon: Archive },
        ],
      },
      { title: tr("الأصول الثابتة"), section: "fixed-assets", icon: Landmark },
    ],
  },
  {
    id: "purchases",
    title: tr("المشتريات"),
    icon: ShoppingCart,
    submenu: [
      { title: tr("طلبية مشتريات"), section: "purchase-orders", icon: ClipboardList },
      { title: tr("إرسالية مشتريات"), section: "delivery-pay", icon: ArrowDownCircle },
      { title: tr("فاتورة مشتريات"), section: "purchase-invoices", icon: ShoppingCart },
      { title: tr("مرتجع مشتريات"), section: "return-purchase", icon: FileMinus2 },
      { title: tr("تخطيط المشتريات الذكي"), section: "purchase-planning", icon: TrendingUp },
      { title: tr("تحميل تكاليف الشحن والجمارك"), section: "landed-costs", icon: Ship },
    ],
  },
  {
    id: "sales",
    title: tr("المبيعات"),
    icon: Truck,
    submenu: [
      { title: tr("طلبية مبيعات"), section: "sales-orders", icon: ClipboardList },
      { title: tr("إرسالية مبيعات"), section: "sales-delivery", icon: Truck },
      { title: tr("فاتورة مبيعات"), section: "sales-invoices", icon: FileText },
      { title: tr("إرسالية برسم البيع"), section: "delivery-consignment-sale", icon: ArrowUpCircle },
      { title: tr("مرتجع إرسالية برسم البيع"), section: "return-delivery-consignment-sale", icon: ArrowDownCircle },
      { title: tr("مرتجع مبيعات"), section: "return-sell", icon: FileMinus2 },
    ],
  },
  {
    id: "task-orders",
    title: tr("تتبع أوامر العمل"),
    icon: KanbanSquare,
    submenu: [
      { title: tr("إدارة الأقسام وسير العمل"), section: "task-orders-admin", icon: Settings },
      { title: tr("قوائم تحقق الطلبيات"), section: "order-checklists", icon: FileText },
      { title: tr("مسودات طلبيات المبيعات"), section: "draft-sales-order", icon: FilePlus2 },
      { title: tr("متابعة طلباتي"), section: "task-orders-board", icon: KanbanSquare },
      { title: tr("تأكيد الطلبيات"), section: "order-confirmation", icon: PackageCheck },
      { title: tr("اعتماد الطلبيات الجاهزة"), section: "task-orders-approval", icon: PackageCheck },
      {
        title: tr("التقارير"),
        section: "task-orders-reports",
        icon: BarChart3,
        submenu: [
          { title: tr("تقارير أوامر العمل"), section: "task-orders-report", icon: BarChart3 },
          { title: tr("تقرير ارشفة مسودات طلبيات المبيعات"), section: "sales-drafts-archive-report", icon: Archive },
        ],
      },
    ],
  },
  {
    id: "employees-payroll",
    title: tr("نظام ادارة الموظفين"),
    icon: BriefcaseBusiness,
    submenu: [
      {
        title: tr("الثوابت"),
        section: "employees-payroll-lookups",
        icon: Settings2,
        submenu: [
          { title: tr("الوظائف"), section: "employee-jobs", icon: BriefcaseBusiness },
          { title: tr("بنود الراتب"), section: "salary-items", icon: DollarSign },
          { title: tr("قوانين ضريبة الدخل"), section: "tax-rules", icon: FileText },
          { title: tr("الإعفاءات الضريبية"), section: "tax-exemptions", icon: FileText },
          { title: tr("الورديات وجدول المناوبات"), section: "shifts", icon: Clock3 },
          { title: tr("العطل الرسمية"), section: "official-holidays", icon: CalendarDays },
          { title: tr("إعداد أجهزة الحضور"), section: "attendance-devices", icon: Settings2 },
        ],
      },
      {
        title: tr("التعريفات"),
        section: "employees-payroll-definitions",
        icon: Users,
        submenu: [
          { title: tr("الموظفين"), section: "employees", icon: Users },
          { title: tr("بنود رواتب الموظفين"), section: "employee-salary-items", icon: Wallet },
        ],
      },
      {
        title: tr("الحركات"),
        section: "employees-payroll-transactions",
        icon: Receipt,
        submenu: [
          { title: tr("فتح راتب شهر"), section: "salary-periods", icon: Unlock },
          { title: tr("حركات البصمة (الحضور والدوام)"), section: "attendance-records", icon: Clock3 },
          { title: tr("معالجة حركات الدخول والخروج"), section: "attendance-processing", icon: Clock3 },
          { title: tr("تعديل سجلات الدوام"), section: "attendance-editor", icon: CalendarDays },
          { title: tr("حركات الدوام (إضافي وخصومات)"), section: "attendance-transactions", icon: Receipt },
          { title: tr("السلف"), section: "salary-advances", icon: HandCoins },
          { title: tr("القروض"), section: "salary-loans", icon: Landmark },
          { title: tr("خصم نقدي"), section: "cash-deductions", icon: MinusCircle },
          { title: tr("إغلاق وتنفيذ قيد الراتب"), section: "salary-journal", icon: Receipt },
        ],
      },
      {
        title: tr("التقارير"),
        section: "employees-payroll-reports",
        icon: BarChart3,
        submenu: [
          { title: tr("كشف الرواتب"), section: "payroll", icon: Receipt },
          { title: tr("تقرير بنود الرواتب"), section: "salary-items-report", icon: BarChart3 },
          { title: tr("ضريبة دخل الموظفين"), section: "income-tax-report", icon: BarChart3 },
          { title: tr("دخول الموظفين تفصيلي"), section: "attendance-detailed-report", icon: BarChart3 },
          { title: tr("دخول الموظفين إجمالي"), section: "attendance-summary-report", icon: BarChart3 },
        ],
      },
    ],
  },
  {
    id: "retail-pos",
    title: tr("نظام البيع بالتجزئة"),
    icon: Store,
    submenu: [
      { title: tr("إعداد نقاط البيع"), section: "pos-points-settings", icon: Settings },
      { title: tr("الحملات"), section: "campaigns", icon: Megaphone },
      { title: tr("بطاقات الخصم"), section: "pos-discount-cards", icon: BadgePercent },
      { title: tr("برامج المساعدات"), section: "aid-program", icon: HeartHandshake },
      { title: tr("كاشير نقطة البيع"), section: "pos-cashier", icon: ShoppingCart },
      {
        title: tr("التقارير"),
        section: "retail-pos-reports",
        icon: BarChart3,
        submenu: [
          { title: tr("تقرير متابعة الكاشير"), section: "cashier-log-report", icon: FileText },
          { title: tr("تقرير حركات الكاشير إجمالي"), section: "cashier-log-total-report", icon: TrendingUp },
          { title: tr("تقرير حركات الكاشير تفصيلي"), section: "cashier-log-detailed-report", icon: BarChart3 },
          { title: tr("تقرير عهد البيع بالتجزئة"), section: "pos-custody-report", icon: Wallet },
        ],
      },
    ],
  },
  {
    id: "restaurants",
    title: tr("نظام ادارة المطاعم"),
    icon: UtensilsCrossed,
    submenu: [
      { title: tr("المواقع"), section: "restaurant-locations", icon: MapPin },
      { title: tr("الطاولات"), section: "restaurant-tables", icon: LayoutGrid },
      { title: tr("شاشة المطعم"), section: "restaurant-pos", icon: UtensilsCrossed },
      {
        title: tr("التقارير"),
        section: "restaurant-reports",
        icon: BarChart3,
        submenu: [
          { title: tr("مراقبة المطعم"), section: "restaurant-monitor-report", icon: Eye },
          { title: tr("تقرير الطاولات"), section: "restaurant-tables-report", icon: LayoutGrid },
          { title: tr("طلبات المطعم تفصيلي"), section: "restaurant-orders-report", icon: ClipboardList },
          { title: tr("الأصناف المباعة في المطعم"), section: "restaurant-items-report", icon: PackageSearch },
          { title: tr("المطعم حسب النادل"), section: "restaurant-waiters-report", icon: UserRound },
          { title: tr("المطعم حسب الموقع"), section: "restaurant-locations-report", icon: MapPin },
          { title: tr("أوقات الذروة في المطعم"), section: "restaurant-hours-report", icon: Timer },
        ],
      },
    ],
  },
  {
    // كل مجموعات التقارير تحت قائمة واحدة "التقارير"
    id: "reports",
    title: tr("التقارير"),
    icon: BarChart3,
    submenu: [
      {
        id: "accounting-reports",
        title: tr("تقارير محاسبية"),
        icon: BookOpen,
        submenu: [
          { title: tr("بيان حساب الذمة"), section: "receivables-statement-report", icon: Users },
          { title: tr("بيان حساب محاسبي"), section: "accounting-statement-report", icon: BookOpen },
          { title: tr("تقرير أرصدة الذمم بتاريخ معين"), section: "receivables-balances-report", icon: BarChart3 },
          { title: tr("تقرير أرصدة الحسابات بتاريخ معين"), section: "accounting-balances-report", icon: BarChart3 },
          { title: tr("تقرير اسعار الصرف"), section: "exchange-rates-report", icon: DollarSign },
          { title: tr("تقرير تعمير الذمم"), section: "receivables-aging-report", icon: Clock3 },
          { title: tr("تقرير السندات"), section: "vouchers-report", icon: FileText },
          { title: tr("تقرير الحركات"), section: "transactions-report", icon: TrendingUp },
          { title: tr("تقرير ارشفة السندات"), section: "voucher-audit-report", icon: Archive },
          { title: tr("تقرير ارشفة التقارير"), section: "report-audit-report", icon: Archive },
          { title: tr("ميزان المراجعة"), section: "trial-balance-report", icon: BarChart3 },
          { title: tr("ميزانية عمومية"), section: "balance-sheet-report", icon: Landmark },
          { title: tr("قائمة الدخل"), section: "income-statement-report", icon: DollarSign },
        ],
      },
      {
        id: "cost-center-reports",
        title: tr("تقارير مراكز التكلفة"),
        icon: Grid3x3,
        submenu: [
          { title: tr("كشف حساب مع اظهار مركز تكلفة"), section: "cc-statement-with-report", icon: FileText },
          { title: tr("كشف حساب حسب مركز تكلفة"), section: "cc-statement-by-report", icon: FileText },
          { title: tr("حركة الحسابات لمراكز التكلفة"), section: "cc-accounts-movement-report", icon: TrendingUp },
          { title: tr("تقرير الحركات مع اظهار مركز تكلفة"), section: "cc-transactions-report", icon: ArrowLeftRight },
          { title: tr("ميزان مراجعة بمراكز التكلفة"), section: "cc-trial-balance-report", icon: BarChart3 },
          { title: tr("ميزان مراجعة بالحسابات"), section: "cc-trial-balance-accounts-report", icon: BarChart3 },
          { title: tr("قائمة الدخل بمراكز التكلفة"), section: "cc-income-statement-report", icon: DollarSign },
          { title: tr("ميزانية عمومية بمراكز التكلفة"), section: "cc-balance-sheet-report", icon: Landmark },
          { title: tr("قائمة الدخل حسب مركز التكلفة"), section: "cc-income-statement-by-report", icon: DollarSign },
          { title: tr("ميزانية عمومية حسب مركز التكلفة"), section: "cc-balance-sheet-by-report", icon: Landmark },
        ],
      },
      {
        id: "tax-reports",
        title: tr("تقارير ضريبية"),
        icon: Receipt,
        submenu: [
            { title: tr("تقرير كشف احتساب الضريبة"), section: "tax-calculation-report", icon: Receipt },
            { title: tr("كشف المبيعات الضريبية"), section: "tax-sales-statement-report", icon: FileText },
            { title: tr("كشف المشتريات الضريبية"), section: "tax-purchases-statement-report", icon: FileText },
            { title: tr("تقرير المبيعات والمشتريات الضريبية"), section: "tax-sales-purchases-report", icon: ArrowLeftRight },
            { title: tr("تقرير مبيعات المقاصة"), section: "tax-maqasa-sales-report", icon: FileText },
            { title: tr("تقرير مشتريات المقاصة"), section: "tax-maqasa-purchases-report", icon: FileText },
          ],
      },
      {
        id: "item-reports",
        title: tr("تقارير الأصناف"),
        icon: BarChart3,
        submenu: [
          { title: tr("بطاقة صنف"), section: "item-card-report", icon: Package },
          { title: tr("أرصدة المخزون بتاريخ معين"), section: "item-balances-report", icon: BarChart3 },
          { title: tr("تقييم المخزون بتاريخ معين"), section: "item-valuation-report", icon: DollarSign },
          { title: tr("أرصدة الأصناف حسب تاريخ الصلاحية"), section: "expiry-balances-report", icon: CalendarDays },
          { title: tr("أرشفة الرقم التشغيلي"), section: "batch-log-report", icon: Package },
          { title: tr("تقرير حركات السيريال"), section: "serial-movements-report", icon: Package },
          {
            title: tr("تقارير الانتاج"),
            section: "production-reports",
            icon: Factory,
            submenu: [
              { title: tr("تقرير الانتاج تفصيلي"), section: "production-detailed-report", icon: ClipboardList },
              { title: tr("المواد المنتجة حسب الصنف"), section: "production-produced-report", icon: PackageSearch },
              { title: tr("استهلاك المواد الخام حسب الصنف"), section: "production-raw-report", icon: Layers },
              { title: tr("تكلفة سندات الانتاج"), section: "production-vouchers-report", icon: Factory },
            ],
          },
        ],
      },
      {
        id: "profit-reports",
        title: tr("تقارير ارباح الاصناف"),
        icon: TrendingUp,
        submenu: [
          { title: tr("تقرير نسبة أرباح المخزون"), section: "items-profit-report", icon: TrendingUp },
          { title: tr("تقرير ارباح فترة معينة"), section: "period-profit-report", icon: BarChart3 },
          { title: tr("تكلفة مبيعات صنف"), section: "item-sales-cost-report", icon: Package },
          { title: tr("أرباح فاتورة معينة"), section: "invoice-profit-report", icon: FileText },
          { title: tr("تسعير الإخراجات"), section: "pricing-inventory", icon: DollarSign },
        ],
      },
      {
        id: "cheques-reports",
        title: tr("تقارير الشيكات"),
        icon: WalletCards,
        submenu: [
          { title: tr("تقرير الشيكات إجمالي"), section: "cheques-total-report", icon: Layers },
          { title: tr("تقرير الشيكات تفصيلي"), section: "cheques-detailed-report", icon: ClipboardList },
        ],
      },
      {
        id: "orders-reports",
        title: tr("تقارير الطلبيات"),
        icon: BarChart3,
        submenu: [
          { title: tr("ملخص الطلبيات"), section: "order-reports", icon: BarChart3 },
          { title: tr("تقرير الطلبيات تفصيلي"), section: "orders-detailed-report", icon: ClipboardList },
          { title: tr("تقرير الطلبيات إجمالي"), section: "orders-total-report", icon: Layers },
          { title: tr("الطلبيات حسب الصنف"), section: "orders-by-item-report", icon: PackageSearch },
          { title: tr("الطلبيات حسب العميل/المورد"), section: "orders-by-party-report", icon: Users },
          { title: tr("الطلبيات غير المسلّمة"), section: "orders-backlog-report", icon: Timer },
          { title: tr("الطلبيات حسب المندوب"), section: "orders-by-salesman-report", icon: UserRound },
        ],
      },
      {
        id: "deliveries-reports",
        title: tr("تقارير الارساليات"),
        icon: Truck,
        submenu: [
            { title: tr("تقرير الارساليات"), section: "deliveries-report", icon: Truck },
            { title: tr("تقرير الارساليات الداخلية"), section: "internal-deliveries-report", icon: ArrowLeftRight },
            { title: tr("الفواتير الصادرة من إرسالية برسم البيع"), section: "consignment-invoices-report", icon: FileText },
          ],
      },
    ],
  },
  {
    id: "settings",
    title: tr("الإعدادات"),
    icon: Settings,
    submenu: [
      {
        id: "user-management",
        title: tr("اعدادات المستخدمين"),
        icon: UserCheck,
        submenu: [
          { title: tr("المستخدمين"), section: "user-settings", icon: UserCheck },
          { title: tr("الصلاحيات"), section: "permissions", icon: Shield },
          { title: tr("الأدوار الوظيفية"), section: "job-roles", icon: UserCheck },
          { title: tr("صلاحيات الأدوار الوظيفية"), section: "role-permissions", icon: Shield },
          // صلاحيات المستخدمين على الفروع: أُزيلت من القائمة مؤقتاً بطلب المستخدم (لم يُقرَّر بعد كيف
          // ستُستخدَم) — الشاشة والمسارات وجدول user_branches ما زالت موجودة، فقط غير مرتبطة بالقائمة.
          // انظر "user-branch-access-matrix" بـapp/page.tsx لإعادتها لاحقاً بسطر واحد هنا.
          { title: tr("اعدادات"), section: "user-default-accounts", icon: Settings },
          { title: tr("صلاحيات دفاتر السندات"), section: "voucher-book-permissions", icon: CreditCard },
        ],
      },
      { title: tr("إعدادات الخطوط"), section: "font-settings", icon: Settings },
      { title: tr("إعدادات النظام"), section: "system-settings", icon: Settings },
      { title: tr("إعدادات الطباعة"), section: "print-settings", icon: Printer },
      { title: tr("إعدادات الرسائل SMS"), section: "sms-settings", icon: MessageSquareText },
      { title: tr("إعدادات السندات وطباعتها"), section: "voucher-settings", icon: Printer },
      // "اعدادات عامة" أصبحت تبويباً داخل "إعدادات النظام" (المسار vouchers-general-settings باقٍ للمفضلة القديمة)
    ],
  },
  {
    id: "tools",
    title: tr("أدوات"),
    icon: Wrench,
    submenu: [
      { title: tr("البداية السريعة"), section: "personal-assistant", icon: Sparkles },
      { title: tr("اختصارات الصفحات"), section: "page-shortcuts", icon: Keyboard },
      { title: tr("إقفال الفترات"), section: "period-locks", icon: Lock },
      { title: tr("إقفال السنة المالية"), section: "year-end-closing", icon: CalendarCheck2 },
      { title: tr("ترحيل السندات"), section: "voucher-posting-tools", icon: ClipboardList },
      { title: tr("صلاحيات المستخدمين على الحسابات"), section: "account-access", icon: KeyRound },
      { title: tr("تعديل الأصناف"), section: "bulk-items", icon: ListChecks },
      { title: tr("استيراد مكونات التصنيع من اكسل"), section: "manufacturing-components-import", icon: FileSpreadsheet },
      { title: tr("التواصل مع الإدارة"), section: "manager-attachments", icon: SendHorizontal },
      { title: tr("بريد رسائل الموظفين"), section: "manager-inbox", icon: MailOpen },
      { title: tr("بريد الرسائل والتحسينات"), section: "feature-requests", icon: Lightbulb },
    ],
  },
  //{ id: "lot-opener", title: "فتح الدفعات", icon: Unlock, section: "lot-opener" },
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
  const canOpenFile = useFileSectionAccess()
  const canOpenTransaction = useTransactionSectionAccess()
  const visibleMenuItems = useMemo(() => filterReportItems(menuItems, section => canOpenReport(section) && canOpenFile(section) && canOpenTransaction(section)), [canOpenReport, canOpenFile, canOpenTransaction])
  const [expandedMenus, setExpandedMenus] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [companyLogo, setCompanyLogo] = useState("")
  const [companyName, setCompanyName] = useState("Noon ERP")
  const { menuDarkMode } = useMenuTheme()
  // أثناء حفظ أي سند لا يُسمح بفتح صفحة أخرى
  const savingLocked = useSavingLock()
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
        setCompanyName(String(settings?.company_name || "Noon ERP"))
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
      if (item.section === "internal-manufacturing-request" && !savingLocked) onSectionChange(item.section)
      return
    }
    if (savingLocked) return
    if (item.section) onSectionChange(item.section)
  }

  // عناصر القائمة بدون قائمة فرعية تُعرض كروابط <a> حقيقية (انظر getSectionUrl) — هذا يجعل
  // الزر الأوسط (فتح بتبويب جديد) وقائمة سياق المتصفح اليمنى تعملان بشكل طبيعي. الكليك العادي
  // فقط يُمنع ليُستبدل بالانتقال داخل الصفحة (SPA)، أما Ctrl/Cmd/Shift+كليك فتُترك للمتصفح.
  const handleItemLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, item: MenuItem) => {
    if (savingLocked) {
      e.preventDefault()
      return
    }
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
          ? "relative ms-[1.4rem] mt-1 space-y-0.5 border-s border-slate-200 pb-1 ps-2.5 dark:border-white/10"
          : "relative ms-3 mt-0.5 space-y-0.5 border-s border-dashed border-slate-200 ps-2.5 dark:border-white/10"
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
          "group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 text-start transition-colors duration-150",
          depth === 1 ? "min-h-9 py-1.5 text-[0.84rem]" : "min-h-8 py-1 text-[0.8rem]",
          active
            ? cn(accent.soft, "font-bold")
            : inTrail
              ? "font-semibold text-slate-900 dark:text-white"
              : "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white",
        )
        const content = (
          <>
            {active && <span className={cn("absolute -start-[11px] top-1.5 bottom-1.5 w-[3px] rounded-full", accent.bar)} />}
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
          "fixed start-0 top-0 z-40 flex h-[100dvh] flex-col border-e border-slate-200/80 bg-white text-slate-800 shadow-[0_0_40px_-20px_rgba(15,23,42,0.25)] transition-[width,transform] duration-300 dark:border-white/10 dark:bg-[linear-gradient(180deg,#0b1220_0%,#0f172a_60%,#0b1220_100%)] dark:text-slate-100",
          isMobile && "z-50 w-[min(22rem,calc(100vw-1rem))]",
          isMobile && !isOpen ? "rtl:translate-x-full ltr:-translate-x-full" : "translate-x-0",
        )}
        style={width ? { width } : undefined}
        dir={appDir()}
        aria-label={tr("القائمة الرئيسية")}
      >
        {/* الهوية */}
        <div className={cn("flex shrink-0 items-center gap-3 border-b border-slate-100 dark:border-white/10", isOpen ? "px-4 py-4" : "flex-col px-2 py-4")}>
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md shadow-emerald-600/20">
            {companyLogo ? (
              <img src={companyLogo} alt={companyName} className="h-full w-full bg-white object-contain p-1" />
            ) : (
              <NoonMark className="h-full w-full" />
            )}
          </div>
          {isOpen && (
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[15px] font-extrabold leading-6 text-slate-900 dark:text-white" title={companyName}>{companyName}</h2>
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {tr("نظام إدارة الموارد")}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={onToggle}
            title={isOpen ? tr("طي القائمة") : tr("توسيع القائمة")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            {isOpen ? <PanelRightClose className="h-[18px] w-[18px]" /> : <PanelRightOpen className="h-[18px] w-[18px]" />}
          </button>
        </div>

        {/* بحث سريع داخل القائمة */}
        {isOpen && (
          <div className="shrink-0 px-3 pb-2 pt-3">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
                placeholder={tr("ابحث في القائمة...")}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 ps-9 pe-8 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/15 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:focus:bg-white/10"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(""); searchInputRef.current?.focus() }}
                  className="absolute end-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-white/10"
                  title={tr("مسح")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* القائمة */}
        <nav aria-busy={savingLocked} title={savingLocked ? tr("جارٍ حفظ السند، يرجى الانتظار") : undefined} className={cn(savingLocked && "pointer-events-none opacity-50", "min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-4 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent dark:scrollbar-thumb-white/10", isOpen ? "px-3 pt-1" : "px-2 pt-3")}>
          {isOpen && (
            <p className="px-2 pb-1.5 pt-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {isSearching ? tr("نتائج البحث ({0})", countLeaves(filteredItems)) : tr("القائمة")}
            </p>
          )}
          {isOpen && isSearching && !filteredItems.length && (
            <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500 dark:border-white/10">
              {tr("لا توجد شاشة بهذا الاسم")}
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
                "group relative flex w-full items-center rounded-xl text-start transition-colors duration-150",
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
                    <span className={cn("absolute start-0 top-2 bottom-2 w-[3px] rounded-e-full", accent.bar, !isOpen && "top-3 bottom-3")} />
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
                <span className="text-emerald-700 dark:text-emerald-300">{tr("متصل")}</span>
                <span className="ms-auto font-mono text-[10.5px] text-slate-400">Noon ERP</span>
              </>
            )}
          </div>
          <div className={cn("mt-1.5 flex", isOpen ? "justify-start" : "justify-center")}><PoweredBy compact={!isOpen} /></div>
        </div>
      </aside>
    </div>
  )
}
