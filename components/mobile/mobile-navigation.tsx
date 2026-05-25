"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Menu, Home, Package, ShoppingCart, Users, BarChart3, Settings, Bell, Search, Plus } from "lucide-react"

interface MobileNavigationProps {
  activeSection: string
  onSectionChange: (section: string) => void
}

export function MobileNavigation({ activeSection, onSectionChange }: MobileNavigationProps) {
  const [isOpen, setIsOpen] = useState(false)

  const mainNavItems = [
    { id: "dashboard", title: "الرئيسية", icon: Home, badge: null },
    { id: "products", title: "المنتجات", icon: Package, badge: null },
    { id: "sales-orders", title: "المبيعات", icon: ShoppingCart, badge: 3 },
    { id: "customers", title: "العملاء", icon: Users, badge: null },
    { id: "inventory-analytics", title: "التحليلات", icon: BarChart3, badge: null },
  ]

  const quickActions = [
    { title: "طلبية جديدة", action: () => onSectionChange("sales-orders"), icon: Plus },
    { title: "بحث", action: () => {}, icon: Search },
    { title: "التنبيهات", action: () => {}, icon: Bell, badge: 5 },
  ]

  return (
    <>
      {/* Top Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-background border-b border-border px-4 py-3">
        <div className="flex items-center justify-between" dir="rtl">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" aria-hidden="true">
                <path
                  d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zm0 2.3L6 8.2v7.6l6 2.9 6-2.9V8.2l-6-2.9z"
                  fill="currentColor"
                />
                <path d="M12 8.8l3.4 1.9v3.8L12 16.4l-3.4-1.9v-3.8L12 8.8z" fill="currentColor" opacity="0.6" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">أساس (Asas) Accounting System</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {quickActions.map((action, index) => (
              <Button key={index} variant="ghost" size="sm" onClick={action.action} className="relative">
                <action.icon className="h-5 w-5" />
                {action.badge && <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 text-xs">{action.badge}</Badge>}
              </Button>
            ))}

            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80 p-0" dir="rtl">
                <div className="p-6 border-b border-border bg-primary">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="h-6 w-6 text-primary" aria-hidden="true">
                        <path
                          d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zm0 2.3L6 8.2v7.6l6 2.9 6-2.9V8.2l-6-2.9z"
                          fill="currentColor"
                        />
                        <path d="M12 8.8l3.4 1.9v3.8L12 16.4l-3.4-1.9v-3.8L12 8.8z" fill="currentColor" opacity="0.6" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">أساس (Asas) Accounting System</h2>
                      <p className="text-xs text-primary-foreground/80">أساس (Asas) Accounting System</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-2">
                  {[
                    { section: "dashboard", title: "لوحة التحكم", icon: Home },
                    { section: "inventory-analytics", title: "تحليلات المخزون", icon: BarChart3 },
                    { section: "products", title: "المنتجات", icon: Package },
                    { section: "sales-orders", title: "طلبيات المبيعات", icon: ShoppingCart },
                    { section: "purchase-orders", title: "طلبيات المشتريات", icon: ShoppingCart },
                    { section: "customers", title: "العملاء", icon: Users },
                    { section: "suppliers", title: "الموردين", icon: Users },
                    { section: "settings", title: "الإعدادات", icon: Settings },
                  ].map((item) => (
                    <Button
                      key={item.section}
                      variant={activeSection === item.section ? "secondary" : "ghost"}
                      className="w-full justify-start text-right"
                      onClick={() => {
                        onSectionChange(item.section)
                        setIsOpen(false)
                      }}
                      dir="rtl"
                    >
                      <div className="flex items-center gap-3">
                        <item.icon className="h-5 w-5" />
                        <span>{item.title}</span>
                      </div>
                    </Button>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      {/* Bottom Mobile Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border px-2 py-2 safe-area-bottom">
        <div className="flex items-center justify-around" dir="rtl">
          {mainNavItems.map((item) => (
            <Button
              key={item.id}
              variant={activeSection === item.id ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onSectionChange(item.id)}
              className="flex flex-col items-center gap-1 h-12 px-3 relative"
            >
              <item.icon className="h-5 w-5" />
              <span className="text-xs">{item.title}</span>
              {item.badge && <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 text-xs">{item.badge}</Badge>}
            </Button>
          ))}
        </div>
      </div>
    </>
  )
}
