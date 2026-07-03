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
    { id: "dashboard", title: "لوحة التحكم", icon: LayoutDashboard, section: "dashboard" },
    //{ id: "ai-assistant", title: "المساعد الذكي", icon: Sparkles, section: "ai-assistant" },
    { id: "smart-analytics", title: "التحليلات الذكية", icon: BarChart3, section: "smart-analytics" },
    { id: "smart-inventory", title: "توصيات المخزون الذكية", icon: Lightbulb, section: "smart-inventory" },
    { id: "inventory-analytics", title: "تحليلات المخزون", icon: TrendingUp, section: "inventory-analytics" },
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
        { title: "الأصناف والخدمات", section: "products", icon: Package },
        { title: "مجموعات الأصناف", section: "product-groups", icon: Package },
        { title: "التعريفات", section: "definitions", icon: Settings },
        { title: "العملات", section: "exchange-rates", icon: DollarSign },
      ],
    },
    {
      id: "transactions",
      title: "الحركات",
      icon: ShoppingCart,
      submenu: [
        { title: "طلبيات المشتريات", section: "purchase-orders", icon: Truck },
        { title: "طلبيات المبيعات", section: "sales-orders", icon: ShoppingCart },
        { title: "فواتير المبيعات", section: "sale-invoices", icon: FileText },
        { title: "معالجة حالة الطلبيات", section: "order-management", icon: Package },
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
      className={`fixed top-0 right-0 h-screen flex flex-col border-l border-slate-200/80 bg-gradient-to-b from-slate-50 via-white to-slate-100 shadow-[0_0_40px_rgba(15,23,42,0.08)] transition-all duration-300
        ${isMobile ? "w-72 z-50" : isOpen ? "w-72" : "w-16"}
        ${isMobile && !isOpen ? "translate-x-full" : "translate-x-0"}
      `}
      dir="rtl"
    >
      {/* Header */}
      <div className="border-b border-slate-200/80 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 p-4">
        {isOpen ? (
          <div className="flex items-center gap-2 flex-row-reverse">
            <div className="text-right">
              <h2 className="text-base font-semibold text-white">أساس (Asas) Accounting System</h2>
              <p className="text-xs text-slate-300">نظام إدارة متكامل</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 shadow-inner ring-1 ring-white/20">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-emerald-300" aria-hidden="true">
                <path
                  d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zm0 2.3L6 8.2v7.6l6 2.9 6-2.9V8.2l-6-2.9z"
                  fill="currentColor"
                />
                <path d="M12 8.8l3.4 1.9v3.8L12 16.4l-3.4-1.9v-3.8L12 8.8z" fill="currentColor" opacity="0.6" />
              </svg>
            </div>
          </div>
        ) : (
          <div className="w-full flex justify-center">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" aria-hidden="true">
              <path
                d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zm0 2.3L6 8.2v7.6l6 2.9 6-2.9V8.2l-6-2.9z"
                fill="currentColor"
              />
              <path d="M12 8.8l3.4 1.9v3.8L12 16.4l-3.4-1.9v-3.8L12 8.8z" fill="currentColor" opacity="0.6" />
            </svg>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="rounded-xl text-white hover:bg-white/10"
        >
          <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </Button>
      </div>

      {/* Menu */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {menuItems.map((item) => (
          <div key={item.id}>
            <Button
              variant={activeSection === item.section ? "secondary" : "ghost"}
              className={`w-full justify-between rounded-2xl border border-transparent p-2.5 text-right shadow-sm transition-all duration-200 ${!isOpen ? "flex items-center justify-center" : ""
                } ${activeSection === item.section ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-200" : "bg-white/80 text-slate-700 hover:bg-gradient-to-r hover:from-emerald-50 hover:to-sky-50 hover:text-slate-900 hover:shadow-md"}`}
              onClick={() => (item.submenu ? toggleMenu(item.id) : handleItemClick(item))}
              onContextMenu={(e) => !item.submenu && handleContextMenu(e, item)}
              dir="rtl"
              title="Right-click to open in new tab"
            >
              <div className={`flex items-center gap-2 ${!isOpen ? "justify-center" : ""}`}>
                <div className={`rounded-xl p-1.5 transition-all duration-200 ${activeSection === item.section ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600 group-hover:bg-emerald-100 group-hover:text-emerald-700"}`}>
                  <item.icon className="h-4 w-4" />
                </div>
                {isOpen && <span className="font-medium">{item.title}</span>}
              </div>
              {isOpen && item.submenu && (
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${expandedMenus.includes(item.id) ? "rotate-180" : ""
                    }`}
                />
              )}
            </Button>

            {isOpen && item.submenu && expandedMenus.includes(item.id) && (
              <div className="mr-3 mt-2 space-y-1 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-2 shadow-sm" dir="rtl">
                {item.submenu.map((subItem) => (
                  <Button
                    key={subItem.section}
                    variant={activeSection === subItem.section ? "secondary" : "ghost"}
                    size="sm"
                    className={`w-full justify-start rounded-xl p-2 text-right text-sm transition-all ${activeSection === subItem.section ? "bg-emerald-100 text-emerald-700" : "text-slate-600 hover:bg-gradient-to-r hover:from-white hover:to-emerald-50 hover:text-slate-900 hover:shadow-sm"}`}
                    onClick={() => handleItemClick(subItem)}
                    onContextMenu={(e) => handleContextMenu(e, subItem)}
                    dir="rtl"
                    title="Right-click to open in new tab"
                  >
                    <div className="flex items-center gap-2">
                      <subItem.icon className="h-4 w-4" />
                      <span>{subItem.title}</span>
                    </div>
                  </Button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
