"use client";

import { useState, forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { useAuth } from "@/components/auth/auth-context";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Icons } from "@/components/ui/icons";

interface HeaderProps {
  onMenuClick: () => void;
  activeSection: string;
  onProfileClick?: () => void;
  onSettingsClick?: () => void;
}

// ForwardRef button so Radix can attach properly
const RefButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  (props, ref) => <button ref={ref} {...props} />
);
RefButton.displayName = "RefButton";

export function Header({ onMenuClick, activeSection, onProfileClick, onSettingsClick }: HeaderProps) {
  const { user, logout } = useAuth();
  const [search, setSearch] = useState("");

  const sectionTitles: Record<string, string> = {
    "home-dashboard": "الرئيسية",
    dashboard: "لوحة التحكم الرئيسية",
    "order-tracking": "متابعة الطلبيات",
    customers: "إدارة الزبائن",
    suppliers: "إدارة الموردين",
    products: "الأصناف",
    services: "الخدمات",
    "product-groups": "مجموعات الأصناف",
    definitions: "التعريفات",
    "sales-orders": "طلبيات المبيعات",
    "purchase-orders": "طلبيات المشتريات",
    "exchange-rates": "أسعار الصرف اليومية",
    "order-reports": "تقارير الطلبيات",
    "product-reports": "تقارير الأصناف والخدمات",
    "user-settings": "إعدادات المستخدمين",
    "print-settings": "إعدادات الطباعة",
    "voucher-settings": "إعدادات السندات وطباعتها",
    "system-settings": "إعدادات النظام",
    permissions: "إدارة المستخدمين والصلاحيات",
    "api-settings": "إعدادات API والتكامل",
  };

  return (
    <header
      className="h-14 md:h-16 border-b border-border bg-card px-3 md:px-6 flex items-center justify-between shadow-sm"
      dir="rtl"
    >
      {/* Left: Menu + title */}
      <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
        <RefButton
          className="p-2 rounded-md hover:bg-muted"
          onClick={onMenuClick}
        >
          <Icons.Menu />
        </RefButton>
        <h1 className="text-sm md:text-xl font-semibold text-card-foreground truncate">
          {sectionTitles[activeSection] || "نظام أساس للحلول المحاسبية"}
        </h1>
      </div>

      {/* Right: Search, notifications, user */}
      <div className="flex items-center gap-2 md:gap-4 shrink-0">
        {/* Search */}
        <div className="relative hidden lg:block">
          <Input
            placeholder="البحث..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 xl:w-64 pr-10 pl-4 bg-muted/50 border-0 focus:bg-background text-right"
          />
          <Icons.Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        </div>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <RefButton className="p-2 rounded-md hover:bg-muted">
              <Icons.Bell className="h-5 w-5" />
            </RefButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <NotificationCenter
              userId={user?.id}
              department={user?.department}
            />
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <RefButton className="flex items-center gap-2 h-auto p-1 md:p-2">
              <div className="w-7 h-7 md:w-8 md:h-8 bg-emerald-600 rounded-full flex items-center justify-center">
                <Icons.User className="h-3 w-3 md:h-4 md:w-4 text-white" />
              </div>
              <div className="text-right hidden md:block">
                <p className="text-sm font-medium">{user?.fullName}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </RefButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 md:w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1 text-right">
                <p className="text-sm font-medium leading-none">{user?.fullName}</p>
                <p className="text-xs leading-none text-muted-foreground">{user?.role}</p>
                <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={() => onProfileClick?.()} className="justify-center cursor-pointer">
              الملف الشخصي
            </DropdownMenuItem>

            <DropdownMenuItem onClick={() => onSettingsClick?.()} className="justify-center cursor-pointer">
              الإعدادات
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={logout} className="text-red-600 justify-center cursor-pointer">
              تسجيل الخروج
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
