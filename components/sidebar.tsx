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
  Archive,
  TrendingUp,
  Unlock,
  Sparkles,
  Lightbulb,
} from "lucide-react"
import { useWindowManager } from "@/contexts/window-manager-context"

interface SidebarProps {
  isOpen: boolean
  onToggle: () => void
  activeSection: string
  onSectionChange: (section: string) => void
  isMobile?: boolean
}

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

  const getSectionUrl = (section: string): string => {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || ""
    const sectionRoutes: Record<string, string> = {
      dashboard: "/admin",
      accounts: "/admin/accounts",
      customers: "/customers",
      suppliers: "/admin/suppliers",
      products: "/products",
      "product-groups": "/admin/product-groups",
      definitions: "/admin/definitions",
      "purchase-orders": "/admin/purchase-orders",
      "sales-orders": "/admin/sales-orders",
      "sale-invoices": "/admin/sale-invoices",
      "order-management": "/admin/order-management",
      "batch-movements": "/admin/batch-movements",
      "order-reports": "/reports/orders",
      "product-reports": "/reports/products",
      "batch-log-report": "/reports/batch-log",
      "user-settings": "/settings/users",
      permissions: "/settings/permissions",
      "system-settings": "/settings/system",
      "print-settings": "/settings/print",
      "voucher-settings": "/settings/vouchers",
      "api-settings": "/settings/api",
      "orders-migration": "/admin/orders-migration",
      "smart-analytics": "/smart-analytics",
      "smart-inventory": "/smart-inventory",
      "inventory-analytics": "/admin/inventory-analytics",
      "order-tracking": "/admin/order-tracking",
      "exchange-rates": "/admin/exchange-rates",
    }
    return sectionRoutes[section] || "/admin"
  }

  const handleItemClick = (item: any) => {
    if (item.submenu) {
      toggleMenu(item.id)
      return
    }

    onSectionChange(item.section)
  }

  const handleContextMenu = (e: React.MouseEvent<HTMLButtonElement>, item: any) => {
    e.preventDefault()
    onSectionChange(item.section)
  }

  const menuItems = [
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
        { title: "الزبائن", section: "customers", icon: Users },
        { title: "الموردين", section: "suppliers", icon: Truck },
        { title: "الأصناف", section: "products", icon: Package },
        { title: "الخدمات", section: "services", icon: Package },
        { title: "مجموعات الأصناف", section: "product-groups", icon: Package },
        { title: "التعريفات", section: "definitions", icon: Settings },
        { title: "العملات", section: "exchange-rates", icon: DollarSign },
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
        { title: "إعدادات المستخدمين", section: "user-settings", icon: UserCheck },
        { title: "الصلاحيات", section: "permissions", icon: Shield },
        { title: "إعدادات النظام", section: "system-settings", icon: Settings },
        { title: "إعدادات الطباعة", section: "print-settings", icon: Printer },
        { title: "إعدادات السندات وطباعتها", section: "voucher-settings", icon: Printer },
        { title: "إعدادات API", section: "api-settings", icon: Database },
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
      className={`fixed top-0 right-0 h-screen flex flex-col bg-slate-100 shadow-md transition-all duration-300 ${isMobile ? "w-96 z-50" : isOpen ? "w-96" : "w-28"} ${isMobile && !isOpen ? "translate-x-full" : "translate-x-0"}`}
      dir="rtl"
    >
      <div className="border-b border-slate-200 bg-white/90 px-4 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            {isOpen && (
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Menu</p>
                <h2 className="text-sm font-semibold text-slate-900">القائمة</h2>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="rounded-xl text-slate-600 hover:bg-slate-200"
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Menu */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="rounded-[2rem] bg-white shadow-sm ring-1 ring-slate-200/80 px-3 py-4">
          {menuItems.map((item) => {
            const ItemIcon = item.icon
            return (
              <div key={item.id} className="mb-2 last:mb-0">
                <button
                  type="button"
                  className={`group flex w-full items-center justify-between gap-3 rounded-3xl px-4 py-3 text-right text-sm font-medium transition-all duration-200 ${activeSection === item.section ? "!bg-emerald-100 !text-emerald-900 shadow-lg shadow-emerald-200/70 ring-1 ring-emerald-200" : "bg-slate-50 text-slate-700 hover:bg-slate-200 hover:text-slate-900"}`}
                  onClick={() => (item.submenu ? toggleMenu(item.id) : handleItemClick(item))}
                >
                  <div className="flex items-center gap-3">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-2xl transition ${activeSection === item.section ? "!bg-emerald-200 !text-emerald-900" : "bg-slate-100 text-slate-700 group-hover:bg-slate-200"}`}>
                      <ItemIcon className="h-5 w-5" />
                    </span>
                    {isOpen && <span>{item.title}</span>}
                  </div>
                  {isOpen && item.submenu && (
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full transition ${expandedMenus.includes(item.id) ? "bg-slate-200" : "bg-slate-100"}`}>
                      <ChevronDown className={`h-4 w-4 transition-transform ${expandedMenus.includes(item.id) ? "-rotate-180" : ""}`} />
                    </span>
                  )}
                </button>

                {isOpen && item.submenu && expandedMenus.includes(item.id) && (
                  <div className="mt-2 ml-4 rounded-3xl border border-slate-200 bg-slate-50 px-3 py-3 shadow-sm">
                    <div className="relative pl-4">
                      <span className="absolute left-2 top-3 h-full w-px bg-slate-300"></span>
                      <div className="space-y-1">
                        {item.submenu.map((subItem) => {
                          const SubItemIcon = subItem.icon
                          const hasNestedSubmenu = Boolean(subItem.submenu)
                          return (
                            <div key={subItem.section} className="space-y-1">
                              <button
                                type="button"
                                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-right text-sm transition-all duration-200 ${activeSection === subItem.section ? "!bg-emerald-100 !text-emerald-900 shadow ring-1 ring-emerald-200" : "text-slate-600 hover:bg-slate-200 hover:text-slate-900"}`}
                                onClick={() => (hasNestedSubmenu ? toggleMenu(subItem.section) : handleItemClick(subItem))}
                              >
                                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                                  <SubItemIcon className="h-4 w-4" />
                                </span>
                                <span>{subItem.title}</span>
                                {hasNestedSubmenu && (
                                  <span className="mr-auto flex h-7 w-7 items-center justify-center rounded-full bg-slate-100">
                                    <ChevronDown className={`h-4 w-4 transition-transform ${expandedMenus.includes(subItem.section) ? "-rotate-180" : ""}`} />
                                  </span>
                                )}
                              </button>

                              {hasNestedSubmenu && expandedMenus.includes(subItem.section) && (
                                <div className="ml-4 space-y-1 rounded-2xl border border-slate-200 bg-white px-2 py-2">
                                  {subItem.submenu.map((nestedItem) => {
                                    const NestedItemIcon = nestedItem.icon
                                    return (
                                      <button
                                        key={nestedItem.section}
                                        type="button"
                                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-right text-sm transition-all duration-200 ${activeSection === nestedItem.section ? "!bg-emerald-100 !text-emerald-900 shadow ring-1 ring-emerald-200" : "text-slate-600 hover:bg-slate-200 hover:text-slate-900"}`}
                                        onClick={() => handleItemClick(nestedItem)}
                                      >
                                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                                          <NestedItemIcon className="h-4 w-4" />
                                        </span>
                                        <span>{nestedItem.title}</span>
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
