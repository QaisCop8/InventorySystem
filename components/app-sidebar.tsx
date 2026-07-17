"use client"

import type * as React from "react"
import {
  AudioWaveform,
  Command,
  GalleryVerticalEnd,
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
      title: "لوحة التحكم",
      url: "/",
      icon: Home,
      isActive: true,
    },
    {
      title: "الأصناف",
      url: "#",
      icon: Package,
      items: [
        {
          title: "إدارة الأصناف",
          url: "/products",
        },
        {
          title: "مجموعات الأصناف",
          url: "/product-groups",
        },
        {
          title: "تصنيفات الأصناف",
          url: "/product-categories",
        },
      ],
    },
    {
      title: "المبيعات",
      url: "#",
      icon: ShoppingCart,
      items: [
        {
          title: "طلبيات المبيعات",
          url: "/sales-orders",
        },
        {
          title: "طلبيات المبيعات الحديثة",
          url: "/orders/modern",
        },
        {
          title: "فواتير المبيعات",
          url: "/sales-invoices",
        },
        {
          title: "إدارة العملاء",
          url: "/customers",
        },
      ],
    },
    {
      title: "المشتريات",
      url: "#",
      icon: Truck,
      items: [
        {
          title: "طلبيات المشتريات",
          url: "/purchase-orders",
        },
        {
          title: "فواتير المشتريات",
          url: "/purchase-invoices",
        },
        {
          title: "إدارة الموردين",
          url: "/suppliers",
        },
      ],
    },
    {
      title: "المخزون",
      url: "#",
      icon: Warehouse,
      items: [
        {
          title: "حركة المخزون",
          url: "/inventory-movements",
        },
        {
          title: "تقارير المخزون",
          url: "/inventory-reports",
        },
        {
          title: "إدارة المستودعات",
          url: "/warehouses",
        },
      ],
    },
    {
      title: "البحث",
      url: "#",
      icon: Search,
      items: [
        {
          title: "البحث عن الأصناف",
          url: "/search?type=products",
        },
        {
          title: "البحث عن العملاء والموردين",
          url: "/search?type=customers",
        },
      ],
    },
    {
      title: "التقارير",
      url: "#",
      icon: FileText,
      items: [
        {
          title: "تقارير المبيعات",
          url: "/sales-reports",
        },
        {
          title: "تقارير المشتريات",
          url: "/purchase-reports",
        },
        {
          title: "تقارير المخزون",
          url: "/inventory-reports",
        },
      ],
    },
    {
      title: "الإعدادات",
      url: "#",
      icon: Settings,
      items: [
        {
          title: "فحص الجودة",
          url: "/qa-dashboard",
        },
        {
          title: "إعدادات النظام",
          url: "/settings",
        },
        {
          title: "إدارة المستخدمين",
          url: "/users",
        },
        {
          title: "الصلاحيات",
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



