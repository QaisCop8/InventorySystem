"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
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
  Wallet,
  Receipt,
  ArrowDownCircle,
  ArrowUpCircle,
  CreditCard,
  BookOpen,
  FilePlus2,
  FileMinus2,
  LucideIcon,
} from "lucide-react"
import { useWindowManager } from "@/contexts/window-manager-context"

interface SidebarProps {
  isOpen: boolean
  onToggle: () => void
  activeSection: string
  onSectionChange: (section: string) => void
  isMobile?: boolean
}

interface MenuItem {
  id?: string
  title: string
  icon: LucideIcon
  section?: string
  submenu?: MenuItem[]
}

interface Accent {
  gradient: string
  glow: string
  chip: string
}

// Each top-level section gets its own colour identity so the whole menu reads
// as a vivid, organised map rather than one flat colour repeated everywhere.
const ACCENTS: Record<string, Accent> = {
  "home-dashboard": { gradient: "from-cyan-400 to-blue-500", glow: "shadow-cyan-500/40", chip: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-200" },
  "smart-analytics": { gradient: "from-violet-400 to-purple-600", glow: "shadow-violet-500/40", chip: "bg-violet-500/15 text-violet-700 dark:text-violet-200" },
  "order-tracking": { gradient: "from-sky-400 to-indigo-500", glow: "shadow-sky-500/40", chip: "bg-sky-500/15 text-sky-700 dark:text-sky-200" },
  definitions: { gradient: "from-emerald-400 to-teal-500", glow: "shadow-emerald-500/40", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200" },
  "general-accounting": { gradient: "from-amber-400 to-orange-500", glow: "shadow-amber-500/40", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-200" },
  orders: { gradient: "from-rose-400 to-pink-600", glow: "shadow-rose-500/40", chip: "bg-rose-500/15 text-rose-700 dark:text-rose-200" },
  invoices: { gradient: "from-indigo-400 to-blue-600", glow: "shadow-indigo-500/40", chip: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-200" },
  batch: { gradient: "from-orange-400 to-red-500", glow: "shadow-orange-500/40", chip: "bg-orange-500/15 text-orange-700 dark:text-orange-200" },
  reports: { gradient: "from-teal-400 to-cyan-600", glow: "shadow-teal-500/40", chip: "bg-teal-500/15 text-teal-700 dark:text-teal-200" },
  settings: { gradient: "from-slate-400 to-slate-600", glow: "shadow-slate-500/40", chip: "bg-slate-500/15 text-slate-700 dark:text-slate-200" },
  postings: { gradient: "from-fuchsia-400 to-purple-600", glow: "shadow-fuchsia-500/40", chip: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-200" },
}

const DEFAULT_ACCENT: Accent = ACCENTS["home-dashboard"]

const getAccent = (id?: string): Accent => (id && ACCENTS[id]) || DEFAULT_ACCENT

export function Sidebar({
  isOpen,
  onToggle,
  activeSection,
  onSectionChange,
  isMobile = false,
}: SidebarProps) {
  const [expandedMenus, setExpandedMenus] = useState<string[]>([])
  const { openWindow } = useWindowManager()

  const toggleMenu = (menuId: string) => {
    setExpandedMenus(prev =>
      prev.includes(menuId) ? prev.filter(id => id !== menuId) : [...prev, menuId]
    )
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
      const menuId = item.id ?? item.section ?? item.title
      toggleMenu(menuId)
      return
    }

    if (item.section) {
      onSectionChange(item.section)
    }
  }

  // عناصر القائمة بدون قائمة فرعية تُعرض كروابط <a> حقيقية (انظر getSectionUrl) — هذا يجعل
  // الزر الأوسط (فتح بتبويب جديد) وقائمة سياق المتصفح اليمنى (فتح الرابط بتبويب جديد...) تعملان
  // بشكل طبيعي دون أي كود إضافي. الكليك العادي فقط يُمنع افتراضياً ليُستبدل بالانتقال السريع
  // داخل الصفحة نفسها (SPA)، أما Ctrl/Cmd/Shift+كليك فتُترك للمتصفح ليفتحها بتبويب/نافذة جديدة.
  const handleItemLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, item: MenuItem) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) return
    e.preventDefault()
    handleItemClick(item)
  }

  const menuItems: MenuItem[] = [
    { id: "home-dashboard", title: "الرئيسية", icon: LayoutDashboard, section: "home-dashboard" },
    //{ id: "ai-assistant", title: "المساعد الذكي", icon: Sparkles, section: "ai-assistant" },
    { id: "smart-analytics", title: "التحليلات الذكية", icon: BarChart3, section: "smart-analytics" },
    { id: "order-tracking", title: "متابعة الطلبيات", icon: GitBranch, section: "order-tracking" },
    //{ id: "lot-opener", title: "فتح الدفعات", icon: Unlock, section: "lot-opener" },
    {
      id: "definitions",
      title: "الملفات والتعريفات",
      icon: Users,
      submenu: [
        { title: "الحسابات المحاسبية", section: "accounts", icon: Settings },
        { title: "العملاء", section: "customers", icon: Users },
        { title: "الموردين", section: "suppliers", icon: Truck },
        { title: "المشتركين", section: "subscribers", icon: UserCheck },
        { title: "المندوبين", section: "salesmen", icon: UserCheck },
        { title: "الأصناف", section: "products", icon: Package },
        { title: "الخدمات", section: "services", icon: Package },
        { title: "مجموعات الأصناف", section: "product-groups", icon: Package },
        { title: "التعريفات", section: "definitions", icon: Settings },
        { title: "العملات", section: "exchange-rates", icon: DollarSign },
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
            { title: "البنوك", section: "banks", icon: Building },
            { title: "الفروع", section: "branches", icon: MapPin },
            { title: "حسابات البنوك", section: "bank-accounts", icon: Landmark },
            { title: "بطاقات الائتمان", section: "credit-cards", icon: CreditCard },
            { title: "دفاتر الشيكات", section: "cheques-books", icon: BookOpen },
          ],
        },
        {
          title: "الحركات",
          section: "accounting-transactions",
          icon: Receipt,
          submenu: [
            { title: "سند قبض", section: "receipt-vouchers", icon: ArrowDownCircle },
            { title: "سند صرف", section: "payment-vouchers", icon: ArrowUpCircle },
            { title: "سند قيد", section: "journal-vouchers", icon: BookOpen },
            { title: "اشعار دائن", section: "credit-notes", icon: FilePlus2 },
            { title: "اشعار مدين", section: "debit-notes", icon: FileMinus2 },
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
      id: "invoices",
      title: "الفواتير",
      icon: FileText,
      submenu: [
        {
          title: "الحركات",
          section: "invoice-transactions",
          icon: FileText,
          submenu: [
            { title: "فواتير المبيعات", section: "sale-invoices", icon: FileText },
          ],
        },
      ],
    },
    {
      id: "batch",
      title: "حركات الرقم التشغيلي",
      icon: Archive,
      submenu: [
        {
          title: "معالجة الرقم التشغيلي",
          section: "batch-movements",
          icon: Archive,
        },
      ],
    },
    {
      id: "reports",
      title: "التقارير",
      icon: FileText,
      submenu: [
        { title: "تقارير الطلبيات", section: "order-reports", icon: BarChart3 },
        { title: "تقارير الأصناف", section: "product-reports", icon: Package },
        { title: "أرشفة الرقم التشغيلي", section: "batch-log-report", icon: Package },
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
            { title: "اعدادات", section: "user-default-accounts", icon: Settings },
            { title: "صلاحيات دفاتر السندات", section: "voucher-book-permissions", icon: CreditCard },
          ],
        },
        { title: "إعدادات النظام", section: "system-settings", icon: Settings },
        { title: "إعدادات الطباعة", section: "print-settings", icon: Printer },
        { title: "إعدادات السندات وطباعتها", section: "voucher-settings", icon: Printer },
        { title: "إعدادات API", section: "api-settings", icon: Database },
        { title: "اعدادات عامة", section: "vouchers-general-settings", icon: Settings },
      ],
    },
    {
      id: "postings",
      title: "التكامل مع الأنظمة الأخرى",
      icon: DollarSign,
      submenu: [
        { title: "ترحيل الطلبيات", section: "orders-migration", icon: UserCheck },
      ],
    },
  ]

  return (
    <div
      className={`fixed top-0 right-0 z-40 flex h-screen flex-col border-l border-slate-200 dark:border-white/10 bg-white dark:bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.16),_transparent_45%),radial-gradient(circle_at_bottom_left,_rgba(167,139,250,0.14),_transparent_50%),linear-gradient(180deg,_#0b1120_0%,_#0f172a_55%,_#0b1120_100%)] text-slate-800 dark:text-slate-100 shadow-[0_25px_80px_-24px_rgba(15,23,42,0.12)] dark:shadow-[0_25px_80px_-24px_rgba(2,6,23,0.9)] backdrop-blur-xl transition-all duration-300 ${isMobile ? "w-96 z-50" : isOpen ? "w-96" : "w-24"} ${isMobile && !isOpen ? "translate-x-full" : "translate-x-0"}`}
      dir="rtl"
    >
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-white/10 px-4 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-600 shadow-lg shadow-blue-500/30">
              <Sparkles className="h-5 w-5 text-white" />
              <span className="absolute -bottom-1 -left-1 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-white dark:ring-slate-950" />
            </div>
            {isOpen && (
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-600 dark:text-cyan-300/80">نظام</p>
                <h2 className="truncate text-[15px] font-bold text-slate-900 dark:text-white">أساس للحلول المحاسبية</h2>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="shrink-0 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-200 transition-colors hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
          >
            <ChevronRight className={`h-5 w-5 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Menu */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-white/10 scrollbar-track-transparent">
        <div className="space-y-1.5">
          {menuItems.map((item) => {
            const itemId = item.id ?? item.section ?? item.title
            const ItemIcon = item.icon
            const isActive = activeSection === item.section
            const isExpanded = expandedMenus.includes(itemId)
            const accent = getAccent(item.id)

            const itemClassName = `group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
              isActive
                ? `bg-slate-100 dark:bg-white/[0.07] text-slate-900 dark:text-white shadow-lg ${accent.glow}`
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white"
            } ${!isOpen ? "justify-center px-2" : "justify-between"}`
            const itemContent = (
              <>
                {isActive && (
                  <span className={`absolute inset-y-1.5 right-0 w-1 rounded-full bg-gradient-to-b ${accent.gradient}`} />
                )}
                <div className={`flex items-center gap-3 ${!isOpen ? "justify-center" : "min-w-0 flex-1"}`}>
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${accent.gradient} text-white shadow-md transition-all duration-200 group-hover:scale-105 ${
                      isActive ? `shadow-lg ${accent.glow}` : "opacity-90 group-hover:opacity-100"
                    }`}
                  >
                    <ItemIcon className="h-5 w-5" />
                  </span>
                  {isOpen && <span className="truncate text-right text-[0.95rem] font-semibold">{item.title}</span>}
                </div>
                {isOpen && item.submenu && (
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400 transition-transform duration-300 ${
                      isExpanded ? "-rotate-180 text-slate-900 dark:text-white" : ""
                    }`}
                  />
                )}
              </>
            )

            return (
              <div key={itemId}>
                {item.submenu ? (
                  <button type="button" title={!isOpen ? item.title : undefined} onClick={() => toggleMenu(itemId)} className={itemClassName}>
                    {itemContent}
                  </button>
                ) : (
                  <a
                    href={getSectionUrl(item.section || "")}
                    title={!isOpen ? item.title : undefined}
                    onClick={(e) => handleItemLinkClick(e, item)}
                    className={itemClassName}
                  >
                    {itemContent}
                  </a>
                )}

                {isOpen && item.submenu && isExpanded && (
                  <div className="mr-5 mt-1.5 space-y-1 border-r-2 border-slate-200 dark:border-white/10 py-1 pr-4">
                    {item.submenu.map((subItem: MenuItem) => {
                      const subItemId = subItem.id ?? subItem.section ?? subItem.title
                      const SubItemIcon = subItem.icon
                      const hasNestedSubmenu = Boolean(subItem.submenu)
                      const isSubActive = activeSection === subItem.section
                      const isSubExpanded = expandedMenus.includes(subItemId)

                      const subItemClassName = `flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-all duration-200 ${
                        isSubActive ? `${accent.chip} font-semibold` : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white"
                      }`
                      const subItemContent = (
                        <>
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-200 ${
                              isSubActive ? `bg-gradient-to-br ${accent.gradient} text-white shadow` : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-300"
                            }`}
                          >
                            <SubItemIcon className="h-3.5 w-3.5" />
                          </span>
                          <span className="flex-1 truncate text-right text-[0.83rem] font-semibold">{subItem.title}</span>
                          {hasNestedSubmenu && (
                            <ChevronDown
                              className={`h-3 w-3 shrink-0 transition-transform duration-300 ${isSubExpanded ? "-rotate-180" : ""}`}
                            />
                          )}
                        </>
                      )

                      return (
                        <div key={subItemId}>
                          {hasNestedSubmenu ? (
                            <button type="button" onClick={() => toggleMenu(subItemId)} className={subItemClassName}>
                              {subItemContent}
                            </button>
                          ) : (
                            <a
                              href={getSectionUrl(subItem.section || "")}
                              onClick={(e) => handleItemLinkClick(e, subItem)}
                              className={subItemClassName}
                            >
                              {subItemContent}
                            </a>
                          )}

                          {hasNestedSubmenu && isSubExpanded && subItem.submenu && (
                            <div className="mr-4 mt-1 space-y-1 border-r border-slate-200 dark:border-white/10 py-1 pr-3">
                              {subItem.submenu.map((nestedItem: MenuItem) => {
                                const NestedItemIcon = nestedItem.icon
                                const isNestedActive = activeSection === nestedItem.section
                                return (
                                  <a
                                    key={nestedItem.section}
                                    href={getSectionUrl(nestedItem.section || "")}
                                    onClick={(e) => handleItemLinkClick(e, nestedItem)}
                                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-all duration-200 ${
                                      isNestedActive ? `${accent.chip} font-semibold` : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white"
                                    }`}
                                  >
                                    <span
                                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                                        isNestedActive ? `bg-gradient-to-br ${accent.gradient} text-white` : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400"
                                      }`}
                                    >
                                      <NestedItemIcon className="h-3 w-3" />
                                    </span>
                                    <span className="flex-1 truncate text-right text-[0.78rem] font-semibold">{nestedItem.title}</span>
                                  </a>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200 dark:border-white/10 px-4 py-4">
        <div
          className={`flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 ${
            !isOpen ? "justify-center" : ""
          }`}
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </span>
          {isOpen && <span>النظام متصل ومستعد</span>}
        </div>
      </div>
    </div>
  )
}
