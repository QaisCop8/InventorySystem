"use client"

import { tr, appDir } from "@/lib/i18n"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useWindowManager } from "@/contexts/window-manager-context"
import { useAuth } from "@/components/auth/auth-context"
import {
  Star,
  Plus,
  X,
  ShoppingCart,
  Truck,
  Package,
  BarChart3,
  Users,
  FileText,
  Settings,
  TrendingUp,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"

interface Favorite {
  id: number
  favorite_type: string
  favorite_name: string
  favorite_title: string
  favorite_icon: string
  favorite_component: string
  favorite_color: string
  display_order: number
}

const iconMap: Record<string, any> = {
  ShoppingCart,
  Truck,
  Package,
  BarChart3,
  Users,
  FileText,
  Settings,
  TrendingUp,
  Star,
}

const availableScreens = [
  { name: "sales-orders", title: tr("طلبيات المبيعات"), icon: "ShoppingCart", color: "bg-blue-500", type: "screen" },
  { name: "purchase-orders", title: tr("طلبيات المشتريات"), icon: "Truck", color: "bg-green-500", type: "screen" },
  { name: "products", title: tr("الأصناف"), icon: "Package", color: "bg-purple-500", type: "screen" },
  { name: "customers", title: tr("العملاء"), icon: "Users", color: "bg-cyan-500", type: "screen" },
  { name: "suppliers", title: tr("الموردين"), icon: "Truck", color: "bg-teal-500", type: "screen" },
  { name: "order-reports", title: tr("تقارير الطلبيات"), icon: "BarChart3", color: "bg-orange-500", type: "report" },
  { name: "product-reports", title: tr("تقارير الأصناف"), icon: "FileText", color: "bg-pink-500", type: "report" },
  {
    name: "inventory-analytics",
    title: tr("تحليلات المخزون"),
    icon: "TrendingUp",
    color: "bg-indigo-500",
    type: "screen",
  },
]

export function QuickAccessFavorites() {
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [selectedScreen, setSelectedScreen] = useState("")
  const { openWindow } = useWindowManager()
  const { user } = useAuth()

  const fetchFavorites = useCallback(async () => {
    console.log("[v0] Fetching favorites for user:", user?.id)
    if (!user?.id) {
      console.log("[v0] No user ID available")
      return
    }

    try {
      setIsLoading(true)
      const response = await fetch("/api/user-favorites", {
        headers: {
          "x-user-id": user.id.toString(),
        },
      })
      console.log("[v0] Favorites response status:", response.status)

      if (response.ok) {
        const data = await response.json()
        console.log("[v0] Favorites data received:", data)
        setFavorites(data.favorites || [])
      } else {
        const error = await response.json()
        console.error("[v0] Failed to fetch favorites:", error)
      }
    } catch (error) {
      console.error("[v0] Error fetching favorites:", error)
    } finally {
      setIsLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (user?.id) {
      fetchFavorites()
    } else {
      setIsLoading(false)
    }
  }, [user?.id, fetchFavorites])

  const handleAddFavorite = async () => {
    if (!selectedScreen) {
      toast({
        title: tr("خطأ"),
        description: tr("الرجاء اختيار شاشة أو تقرير"),
        variant: "destructive",
      })
      return
    }

    if (!user?.id) {
      console.log("[v0] No user ID available")
      toast({
        title: tr("خطأ"),
        description: tr("لم يتم العثور على معلومات المستخدم"),
        variant: "destructive",
      })
      return
    }

    const screen = availableScreens.find((s) => s.name === selectedScreen)
    if (!screen) return

    console.log("[v0] Adding favorite:", screen)

    try {
      const response = await fetch("/api/user-favorites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id.toString(),
        },
        body: JSON.stringify({
          favorite_type: screen.type,
          favorite_name: screen.name,
          favorite_title: screen.title,
          favorite_icon: screen.icon,
          favorite_component: screen.name,
          favorite_color: screen.color,
        }),
      })

      console.log("[v0] Add favorite response status:", response.status)

      if (response.ok) {
        const result = await response.json()
        console.log("[v0] Add favorite result:", result)
        toast({
          title: tr("تم الإضافة"),
          description: tr("تم إضافة {0} إلى المفضلة", screen.title),
        })
        fetchFavorites()
        setIsAddDialogOpen(false)
        setSelectedScreen("")
      } else {
        const error = await response.json()
        console.error("[v0] Failed to add favorite:", error)
        toast({
          title: tr("خطأ"),
          description: error.error || tr("فشل في إضافة المفضلة"),
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("[v0] Error adding favorite:", error)
      toast({
        title: tr("خطأ"),
        description: tr("فشل في إضافة المفضلة"),
        variant: "destructive",
      })
    }
  }

  const handleRemoveFavorite = async (favoriteId: number) => {
    if (!user?.id) {
      console.log("[v0] No user ID available")
      return
    }

    try {
      const response = await fetch(`/api/user-favorites?id=${favoriteId}`, {
        method: "DELETE",
        headers: {
          "x-user-id": user.id.toString(),
        },
      })

      if (response.ok) {
        toast({
          title: tr("تم الحذف"),
          description: tr("تم حذف الاختصار من المفضلة"),
        })
        fetchFavorites()
      } else {
        const error = await response.json()
        console.error("[v0] Failed to remove favorite:", error)
        toast({
          title: tr("خطأ"),
          description: error.error || tr("فشل في حذف المفضلة"),
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("[v0] Error removing favorite:", error)
      toast({
        title: tr("خطأ"),
        description: tr("فشل في حذف المفضلة"),
        variant: "destructive",
      })
    }
  }

  const handleOpenFavorite = (favorite: Favorite) => {
    const sectionTitles: Record<string, string> = {
      "sales-orders": tr("طلبيات المبيعات"),
      "purchase-orders": tr("طلبيات المشتريات"),
      products: tr("الأصناف"),
      customers: tr("العملاء"),
      suppliers: tr("الموردين"),
      "order-reports": tr("تقارير الطلبيات"),
      "product-reports": tr("تقارير الأصناف"),
      "inventory-analytics": tr("تحليلات المخزون"),
    }

    openWindow({
      title: sectionTitles[favorite.favorite_component] || favorite.favorite_title,
      component: favorite.favorite_component,
      type: "tab",
    })
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            {tr("الاختصارات السريعة")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">{tr("جاري التحميل...")}</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="h-5 w-5 text-yellow-500" />
          {tr("الاختصارات السريعة")}
        </CardTitle>
        <CardAction>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4" />
                <span className="ms-2">{tr("إضافة")}</span>
              </Button>
            </DialogTrigger>
            <DialogContent dir={appDir()}>
              <DialogHeader>
                <DialogTitle>{tr("إضافة اختصار جديد")}</DialogTitle>
                <DialogDescription>{tr("اختر الشاشة أو التقرير الذي تريد إضافته إلى المفضلة")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="screen-select">{tr("الشاشة أو التقرير")}</Label>
                  <Select value={selectedScreen} onValueChange={setSelectedScreen}>
                    <SelectTrigger id="screen-select">
                      <SelectValue placeholder={tr("اختر شاشة أو تقرير")} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableScreens
                        .filter((screen) => !favorites.some((f) => f.favorite_component === screen.name))
                        .map((screen) => (
                          <SelectItem key={screen.name} value={screen.name}>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={`${screen.color} text-white border-0`}>
                                {screen.type === "screen" ? tr("شاشة") : tr("تقرير")}
                              </Badge>
                              <span>{screen.title}</span>
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    {tr("إلغاء")}
                  </Button>
                  <Button onClick={handleAddFavorite}>{tr("إضافة")}</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        {favorites.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Star className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="mb-2">{tr("لا توجد اختصارات مفضلة بعد")}</p>
            <p className="text-sm">{tr("انقر على \"إضافة\" لإضافة اختصارات سريعة للشاشات والتقارير المفضلة لديك")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {favorites.map((favorite) => {
              const Icon = iconMap[favorite.favorite_icon] || Star
              return (
                <div
                  key={favorite.id}
                  className="group relative"
                  onClick={() => handleOpenFavorite(favorite)}
                  role="button"
                  tabIndex={0}
                >
                  <div
                    className={`${favorite.favorite_color} hover:opacity-90 transition-all cursor-pointer rounded-lg p-4 text-white shadow-sm hover:shadow-md`}
                  >
                    <div className="flex flex-col items-center gap-2 text-center">
                      <Icon className="h-8 w-8" />
                      <span className="text-sm font-medium">{favorite.favorite_title}</span>
                      <Badge variant="secondary" className="text-xs bg-white/20 text-white border-0">
                        {favorite.favorite_type === "screen" ? tr("شاشة") : tr("تقرير")}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="absolute -top-2 -end-2 h-6 w-6 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveFavorite(favorite.id)
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
