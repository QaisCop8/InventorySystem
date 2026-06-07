"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { LayoutDashboard, ShoppingCart, Package, BookOpen, LogOut, Menu, Loader2 } from "lucide-react"
import type { CustomerSession } from "@/lib/customer-auth"

interface CustomerLayoutProps {
  children: React.ReactNode
}

export function CustomerLayout({ children }: CustomerLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [session, setSession] = useState<CustomerSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    let isMounted = true

    const checkSession = async () => {
      try {
        const response = await fetch("/api/customer-auth/session")

        if (!isMounted) return

        if (!response.ok) {
          // Development bypass - create mock session for testing
          if (process.env.NODE_ENV === 'development') {
            console.log("[DEV] Creating mock customer session for testing")
            setSession({
              user: { 
                id: 1, 
                customer_id: 1, 
                username: "dev-user", 
                email: "dev@test.com", 
                is_active: true, 
                last_login: null, 
                created_at: new Date() 
              },
              customer: { 
                id: 1,
                customer_code: "DEV001", 
                customer_name: "Development Customer",
                name: "Development Customer",
                email: "dev@test.com",
                mobile1: "0000000000",
                status: "active"
              },
              permissions: {
                can_view_orders: true,
                can_create_orders: true,
                can_view_balance: true,
                can_view_products: true,
                can_view_prices: true,
                can_view_stock: true,
              },
            } as any)
            setLoading(false)
            return
          }
          
          router.push("/customer/login")
          return
        }

        const data = await response.json()
        if (isMounted) setSession(data.session)
      } catch (error) {
        console.error("Session check error:", error)
        // Development bypass on error
        if (isMounted && process.env.NODE_ENV === 'development') {
          console.log("[DEV] Creating mock customer session due to error")
          setSession({
            user: { 
              id: 1, 
              customer_id: 1, 
              username: "dev-user", 
              email: "dev@test.com", 
              is_active: true, 
              last_login: null, 
              created_at: new Date() 
            },
            customer: { 
              id: 1,
              customer_code: "DEV001", 
              customer_name: "Development Customer",
              name: "Development Customer",
              email: "dev@test.com",
              mobile1: "0000000000",
              status: "active"
            },
            permissions: {
              can_view_orders: true,
              can_create_orders: true,
              can_view_balance: true,
              can_view_products: true,
              can_view_prices: true,
              can_view_stock: true,
            },
          } as any)
        } else if (isMounted) {
          router.push("/customer/login")
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    checkSession()

    return () => {
      isMounted = false
    }
  }, [])

  const handleLogout = async () => {
    try {
      await fetch("/api/customer-auth/logout", { method: "POST" })
      router.push("/customer/login")
      router.refresh()
    } catch (error) {
      console.error("Logout error:", error)
    }
  }

  const navItems = [
    {
      href: "/customer/dashboard",
      label: "لوحة التحكم",
      icon: LayoutDashboard,
      show: true,
    },
    {
      href: "/customer/accounts",
      label: "الحسابات المحاسبية",
      icon: BookOpen,
      show: session?.permissions.can_view_accounts ?? true,
    },
    {
      href: "/customer/orders",
      label: "طلبياتي",
      icon: ShoppingCart,
      show: session?.permissions.can_view_orders ?? false,
    },
    {
      href: "/customer/products",
      label: "الأصناف",
      icon: Package,
      show: session?.permissions.can_view_products ?? false,
    },
  ]

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!session) {
    return null
  }

  const customerInitials = session.customer.name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild className="lg:hidden">
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-64">
                <nav className="flex flex-col gap-2 mt-8">
                  {navItems
                    .filter((item) => item.show)
                    .map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                          pathname === item.href ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                        }`}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    ))}
                </nav>
              </SheetContent>
            </Sheet>

            <h1 className="text-xl font-bold">بوابة العملاء</h1>
          </div>

          <nav className="hidden lg:flex items-center gap-2">
            {navItems
              .filter((item) => item.show)
              .map((item) => (
                <Link key={item.href} href={item.href}>
                  <Button variant={pathname === item.href ? "default" : "ghost"} className="gap-2">
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                </Link>
              ))}
          </nav>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>{customerInitials}</AvatarFallback>
                </Avatar>
                <span className="hidden md:inline">{session.customer.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">{session.customer.name}</p>
                  <p className="text-xs text-muted-foreground">{session.user.username}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                <LogOut className="ml-2 h-4 w-4" />
                تسجيل الخروج
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6">{children}</main>
    </div>
  )
}
