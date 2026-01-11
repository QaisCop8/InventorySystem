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

  const handleItemClick = (item: any) => {
    // OPEN ALL ITEMS IN TAB
    openWindow({
      id: item.section,
      title: item.title,
      component: item.section,
      type: "tab",
      size: { width: 1000, height: 700 },
    })
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
              <h2 className="text-base font-semibold text-white">نظام إدارة المخزون والطلبيات</h2>
              <p className="text-xs text-white/80">إدارة متكاملة</p>
            </div>
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-primary font-bold text-sm">ERP</span>
            </div>
          </div>
        ) : (
          <div className="w-full flex justify-center">
            <span className="text-white font-bold">E</span>
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
              dir="rtl"
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
                    dir="rtl"
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
