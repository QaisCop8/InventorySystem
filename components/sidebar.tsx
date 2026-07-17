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
        { title: "العملاء", section: "customers", icon: Users },
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
      className={`fixed top-0 right-0 h-screen flex flex-col bg-gradient-to-b from-white via-gray-50 to-white text-gray-900 shadow-2xl transition-all duration-300 ${isMobile ? "w-80 z-50" : isOpen ? "w-80" : "w-20"} ${isMobile && !isOpen ? "translate-x-full" : "translate-x-0"}`}
      dir="rtl"
    >
      {/* Header */}
      <div className="border-b border-gray-200 bg-white/80 px-4 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-white font-bold text-lg shadow-lg shadow-cyan-500/50">
              <Sparkles className="h-5 w-5" />
            </div>
            {isOpen && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">نظام</p>
                <h2 className="text-base font-bold text-gray-900">أساس للحلول المحاسبية</h2>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="rounded-md text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-all"
          >
            <ChevronRight className={`h-5 w-5 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Menu */}
      <div className="flex-1 overflow-y-auto px-2 py-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
        <div className="space-y-1">
          {menuItems.map((item) => {
            const ItemIcon = item.icon
            const isActive = activeSection === item.section
            return (
              <div key={item.id} className="mb-2">
                <button
                  type="button"
                  className={`group w-full flex items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-cyan-600/15 text-cyan-700 border-l-4 border-cyan-600 shadow-md shadow-cyan-600/20"
                      : "text-gray-600 hover:bg-gray-200/60 hover:text-gray-900"
                  }`}
                  onClick={() => (item.submenu ? toggleMenu(item.id) : handleItemClick(item))}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg transition-all ${
                      isActive
                        ? "bg-cyan-600/20 text-cyan-700 shadow-md shadow-cyan-600/20"
                        : "bg-gray-200 text-gray-600 group-hover:bg-gray-300 group-hover:text-gray-800"
                    }`}>
                      <ItemIcon className="h-5 w-5" />
                    </span>
                    {isOpen && <span className="text-right text-base font-semibold text-slate-900">{item.title}</span>}
                  </div>
                  {isOpen && item.submenu && (
                    <span className={`flex h-6 w-6 items-center justify-center rounded transition-all ${
                      expandedMenus.includes(item.id) ? "bg-gray-300" : "bg-gray-200"
                    }`}>
                      <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${
                        expandedMenus.includes(item.id) ? "-rotate-180" : ""
                      }`} />
                    </span>
                  )}
                </button>

                {isOpen && item.submenu && expandedMenus.includes(item.id) && (
                  <div className="mt-2 ml-2 space-y-1 rounded-lg border border-gray-200 bg-gray-100/60 p-2">
                    {item.submenu.map((subItem) => {
                      const SubItemIcon = subItem.icon
                      const hasNestedSubmenu = Boolean(subItem.submenu)
                      const isSubActive = activeSection === subItem.section
                      return (
                        <div key={subItem.section} className="space-y-1">
                          <button
                            type="button"
                            className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200 ${
                              isSubActive
                                ? "bg-cyan-600/15 text-cyan-700 border-r-2 border-cyan-600 shadow-md shadow-cyan-600/20"
                                : "text-gray-600 hover:bg-gray-200/60 hover:text-gray-900"
                            }`}
                            onClick={() => (hasNestedSubmenu ? toggleMenu(subItem.section) : handleItemClick(subItem))}
                          >
                            <span className={`flex h-7 w-7 items-center justify-center rounded transition-all ${
                              isSubActive
                                ? "bg-cyan-600/20 text-cyan-700"
                                : "bg-gray-200"
                            }`}>
                              <SubItemIcon className="h-4 w-4" />
                            </span>
                            <span className="text-right flex-1 text-sm font-semibold text-slate-900">{subItem.title}</span>
                            {hasNestedSubmenu && (
                              <span className="ml-auto">
                                <ChevronDown className={`h-3 w-3 transition-transform duration-300 ${
                                  expandedMenus.includes(subItem.section) ? "-rotate-180" : ""
                                }`} />
                              </span>
                            )}
                          </button>

                          {hasNestedSubmenu && expandedMenus.includes(subItem.section) && (
                            <div className="ml-2 space-y-1 rounded border border-gray-300 bg-white/80 p-1.5">
                              {subItem.submenu.map((nestedItem) => {
                                const NestedItemIcon = nestedItem.icon
                                const isNestedActive = activeSection === nestedItem.section
                                return (
                                  <button
                                    key={nestedItem.section}
                                    type="button"
                                    className={`w-full flex items-center gap-2 rounded px-3 py-1.5 text-xs transition-all duration-200 ${
                                      isNestedActive
                                        ? "bg-cyan-600/15 text-cyan-700 shadow-md shadow-cyan-600/20"
                                        : "text-gray-600 hover:bg-gray-200/60 hover:text-gray-900"
                                    }`}
                                    onClick={() => handleItemClick(nestedItem)}
                                  >
                                    <span className={`flex h-6 w-6 items-center justify-center rounded transition-all text-xs font-bold ${
                                      isNestedActive
                                        ? "bg-cyan-600/20 text-cyan-700"
                                        : "bg-gray-200"
                                    }`}>
                                      <NestedItemIcon className="h-3 w-3" />
                                    </span>
                                    <span className="text-right flex-1 text-sm font-semibold text-slate-900">{nestedItem.title}</span>
                                  </button>
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
      <div className="border-t border-gray-200 bg-white/80 px-4 py-4">
        <div className="flex items-center justify-center gap-2 text-xs text-gray-600">
          <div className="h-2 w-2 rounded-full bg-green-600 shadow-lg shadow-green-600/30"></div>
          {isOpen && <span>النظام متصل</span>}
        </div>
      </div>
    </div>
  )
}



