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
    // OPEN ALL ITEMS IN TAB
    openWindow({
      title: item.title,
      component: item.section,
      type: "tab",
      size: { width: 1000, height: 700 },
    })
  }

  const handleContextMenu = (e: React.MouseEvent<HTMLButtonElement>, item: any) => {
    e.preventDefault()
    const url = getSectionUrl(item.section)
    window.open(url, "_blank")
  }

  const menuItems = [
    { id: "dashboard", title: "لوحة التحكم", icon: LayoutDashboard, section: "dashboard" },
    //{ id: "ai-assistant", title: "المساعد الذكي", icon: Sparkles, section: "ai-assistant" },
    { id: "smart-analytics", title: "التحليلات الذكية", icon: BarChart3, section: "smart-analytics" },
    { id: "smart-inventory", title: "توصيات المخزون الذكية", icon: Lightbulb, section: "smart-inventory" },
    { id: "inventory-analytics", title: "تحليلات المخزون", icon: TrendingUp, section: "inventory-analytics" },
    { id: "order-tracking", title: "متابعة الطلبيات", icon: GitBranch, section: "order-tracking" },
    { id: "exchange-rates", title: "أسعار صرف العملات", icon: GitBranch, section: "exchange-rates" },
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
      className={`fixed top-0 right-0 h-screen bg-background border-l border-sidebar-border flex flex-col transition-all duration-300
        ${isMobile ? "w-72 z-50" : isOpen ? "w-72" : "w-16"}
        ${isMobile && !isOpen ? "translate-x-full" : "translate-x-0"}
      `}
      dir="rtl"
    >
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border bg-primary flex items-center justify-between">
        {isOpen ? (
          <div className="flex items-center gap-2 flex-row-reverse">
            <div className="text-right">
              <h2 className="text-base font-semibold text-white">أساس (Asas) Accounting System</h2>
              <p className="text-xs text-white/80">أساس (Asas) Accounting System</p>
            </div>
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-primary" aria-hidden="true">
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
          className="text-white hover:bg-white/10"
        >
          <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </Button>
      </div>

      {/* Menu */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {menuItems.map((item) => (
          <div key={item.id}>
            <Button
              variant={activeSection === item.section ? "secondary" : "ghost"}
              className={`w-full justify-between text-right p-2 ${!isOpen ? "flex items-center justify-center" : ""
                }`}
              onClick={() => (item.submenu ? toggleMenu(item.id) : handleItemClick(item))}
              onContextMenu={(e) => !item.submenu && handleContextMenu(e, item)}
              dir="rtl"
              title="Right-click to open in new tab"
            >
              <div className={`flex items-center gap-2 ${!isOpen ? "justify-center" : ""}`}>
                <item.icon className="h-5 w-5" />
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
              <div className="mr-4 mt-1 space-y-1 border-r-2 border-sidebar-border pr-2" dir="rtl">
                {item.submenu.map((subItem) => (
                  <Button
                    key={subItem.section}
                    variant={activeSection === subItem.section ? "secondary" : "ghost"}
                    size="sm"
                    className="w-full justify-start text-right text-sm p-2 hover:bg-sidebar-accent/10"
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
