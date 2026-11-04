"use client"

import { tr } from "@/lib/i18n"
import type * as React from "react"
import {
  AudioWaveform,
  Building,
  Command,
  GalleryVerticalEnd,
  MapPin,
  PieChart,
  Settings2,
  Home,
  Package,
  ShoppingCart,
  Truck,
  Warehouse,
  Search,
  FileText,
  Settings,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import { GlobalSearch } from "@/components/global-search"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from "@/components/ui/sidebar"

// This is sample data.
const data = {
  user: {
    name: "نظام إدارة المخزون",
    email: "admin@inventory.com",
    avatar: "/avatars/shadcn.jpg",
  },
  teams: [
    {
      name: "نظام إدارة المخزون",
      logo: GalleryVerticalEnd,
      plan: "Enterprise",
    },
    {
      name: "فرع المبيعات",
      logo: AudioWaveform,
      plan: "Startup",
    },
    {
      name: "فرع المشتريات",
      logo: Command,
      plan: "Free",
    },
  ],
  navMain: [
    {
      title: tr("لوحة التحكم"),
      url: "/",
      icon: Home,
      isActive: true,
    },
    {
      title: tr("الأصناف"),
      url: "#",
      icon: Package,
      items: [
        {
          title: tr("مجموعات الأصناف"),
          url: "/product-groups",
        },
        {
          title: tr("تصنيفات الأصناف"),
          url: "/product-categories",
        },
      ],
    },
    {
      title: tr("المبيعات"),
      url: "#",
      icon: ShoppingCart,
      items: [
        {
          title: tr("طلبيات المبيعات"),
          url: "/sales-orders",
        },
        {
          title: tr("مسودات طلبيات المبيعات"),
          url: "/order-drafts/new",
        },
        {
          title: tr("تأكيد الطلبيات"),
          url: "/order-confirmation",
        },
        {
          title: tr("قوائم تحقق الطلبيات"),
          url: "/order-checklists",
        },
        {
          title: tr("طلبيات المبيعات الحديثة"),
          url: "/orders/modern",
        },
        {
          title: tr("فواتير المبيعات"),
          url: "/sales-invoices",
        },
        {
          title: tr("إدارة العملاء"),
          url: "/customers",
        },
      ],
    },
    {
      title: tr("المشتريات"),
      url: "#",
      icon: Truck,
      items: [
        {
          title: tr("طلبيات المشتريات"),
          url: "/purchase-orders",
        },
        {
          title: tr("فواتير المشتريات"),
          url: "/purchase-invoices",
        },
        {
          title: tr("إدارة الموردين"),
          url: "/suppliers",
        },
        {
          title: tr("المشتركين"),
          url: "/admin/subscribers",
        },
        {
          title: tr("البنوك"),
          url: "/admin/banks",
          icon: Building,
        },
        {
          title: tr("الفروع"),
          url: "/admin/branches",
          icon: MapPin,
        },
      ],
    },
    {
      title: tr("المخزون"),
      url: "#",
      icon: Warehouse,
      items: [
        {
          title: tr("حركة المخزون"),
          url: "/inventory-movements",
        },
        {
          title: tr("تقارير المخزون"),
          url: "/inventory-reports",
        },
        {
          title: tr("إدارة المستودعات"),
          url: "/warehouses",
        },
      ],
    },
    {
      title: tr("البحث"),
      url: "#",
      icon: Search,
      items: [
        {
          title: tr("البحث عن الأصناف"),
          url: "/search?type=products",
        },
        {
          title: tr("البحث عن العملاء والموردين"),
          url: "/search?type=customers",
        },
      ],
    },
    {
      title: tr("التقارير"),
      url: "#",
      icon: FileText,
      items: [
        {
          title: tr("تقارير المبيعات"),
          url: "/sales-reports",
        },
        {
          title: tr("تقارير المشتريات"),
          url: "/purchase-reports",
        },
        {
          title: tr("تقارير المخزون"),
          url: "/inventory-reports",
        },
      ],
    },
    {
      title: tr("الإعدادات"),
      url: "#",
      icon: Settings,
      items: [
        {
          title: tr("فحص الجودة"),
          url: "/qa-dashboard",
        },
        {
          title: tr("إعدادات النظام"),
          url: "/settings",
        },
        {
          title: tr("إدارة المستخدمين"),
          url: "/users",
        },
        {
          title: tr("الصلاحيات"),
          url: "/permissions",
        },
      ],
    },
  ],
  projects: [
    {
      name: "البحث السريع",
      url: "/search",
      icon: Search,
    },
    {
      name: "التقارير السريعة",
      url: "/quick-reports",
      icon: PieChart,
    },
    {
      name: "الإعدادات السريعة",
      url: "/quick-settings",
      icon: Settings2,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  console.log("propspropspropspropsprops ",props)
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
        <div className="px-2 py-2">
          <GlobalSearch />
        </div>
        <div className="flex items-center justify-center px-2 py-1">
          <ThemeToggle />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProjects projects={data.projects} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}



