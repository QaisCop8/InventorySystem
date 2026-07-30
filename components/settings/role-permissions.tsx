"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Shield, Search, CheckCheck, X, RotateCcw, Save } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface JobRole {
  id: number
  name: string
  status: number
}

interface AccessItem {
  access_id: number
  access_name: string
  category_name: string
  is_granted: boolean
}

// نفس شبكة الصلاحيات المستخدَمة بـcomponents/settings/permissions.tsx تماماً (مجمَّعة حسب الفئة +
// أزرار تحديد الكل/الغاء تحديد الكل/عكس التحديد) لكن مفتاحها دور وظيفي بدل مستخدم بعينه، وتُحفَظ في
// role_permissions بدل user_access.
export default function RolePermissions() {
  const { toast } = useToast()
  const [roles, setRoles] = useState<JobRole[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState("")
  const [accessList, setAccessList] = useState<Record<string, AccessItem[]>>({})
  const [roleAccess, setRoleAccess] = useState<Record<number, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [accessLoading, setAccessLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")

  useEffect(() => {
    const fetchRoles = async () => {
      try {
        setLoading(true)
        const res = await fetch("/api/settings/job-roles")
        if (!res.ok) throw new Error("فشل في تحميل الأدوار الوظيفية")
        const data: JobRole[] = await res.json()
        setRoles(data)
        if (data.length > 0) setSelectedRoleId(String(data[0].id))
      } catch (error) {
        console.error(error)
      } finally {
        setLoading(false)
      }
    }
    void fetchRoles()
  }, [])

  useEffect(() => {
    if (!selectedRoleId) return
    const fetchAccess = async () => {
      setAccessLoading(true)
      try {
        const res = await fetch(`/api/settings/job-roles/role-access?roleId=${selectedRoleId}`)
        const data: AccessItem[] = await res.json()
        const grouped: Record<string, AccessItem[]> = {}
        data.forEach((item) => {
          if (!grouped[item.category_name]) grouped[item.category_name] = []
          grouped[item.category_name].push(item)
        })
        setAccessList(grouped)
        const ra: Record<number, boolean> = {}
        data.forEach((item) => {
          ra[item.access_id] = !!item.is_granted
        })
        setRoleAccess(ra)
      } finally {
        setAccessLoading(false)
      }
    }
    void fetchAccess()
  }, [selectedRoleId])

  const allItems = useMemo(() => Object.values(accessList).flat(), [accessList])
  const grantedCount = allItems.filter((item) => roleAccess[item.access_id]).length

  const filteredCategories = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return accessList
    const filtered: Record<string, AccessItem[]> = {}
    Object.entries(accessList).forEach(([category, items]) => {
      const matches = items.filter((item) => item.access_name.toLowerCase().includes(term))
      if (matches.length > 0) filtered[category] = matches
    })
    return filtered
  }, [accessList, search])

  const savePermissions = async () => {
    try {
      setSaving(true)
      const payload = {
        roleId: Number(selectedRoleId),
        accesses: Object.entries(roleAccess).map(([accessId, isGranted]) => ({
          access_id: Number(accessId),
          is_granted: isGranted,
        })),
      }
      const res = await fetch("/api/settings/job-roles/save-role-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error("حدث خطأ في حفظ صلاحيات الدور الوظيفي")
      toast({ title: "تم الحفظ بنجاح", description: "تم تحديث صلاحيات الدور الوظيفي" })
    } catch (error) {
      toast({ title: "فشل الحفظ", description: error instanceof Error ? error.message : "حدث خطأ", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex h-40 items-center justify-center text-muted-foreground">جاري التحميل...</div>
  }

  return (
    <div className="w-full space-y-6 p-6" dir="rtl">
      <Card className="border-none shadow-sm bg-gradient-to-l from-primary/5 to-transparent">
        <CardContent className="py-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">صلاحيات الأدوار الوظيفية</h1>
                <p className="text-sm text-muted-foreground">تحكّم بما يستطيع كل دور وظيفي الوصول إليه في النظام</p>
              </div>
            </div>
            <div className="w-full md:w-64 space-y-1.5">
              <Label className="text-xs text-muted-foreground">الدور الوظيفي</Label>
              <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="اختر دوراً وظيفياً" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={String(role.id)}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {roles.length === 0 && (
        <div className="text-muted-foreground text-sm border rounded-lg p-6 text-center">
          لا توجد أدوار وظيفية بعد — أضِف دوراً من شاشة "الأدوار الوظيفية" أولاً.
        </div>
      )}

      {selectedRoleId && (
        <>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between sticky top-0 z-10 bg-background/95 backdrop-blur py-2">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ابحث عن صلاحية..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-sm">
                {grantedCount} من {allItems.length} صلاحية مفعّلة
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const updated: Record<number, boolean> = {}
                  allItems.forEach((item) => {
                    updated[item.access_id] = true
                  })
                  setRoleAccess(updated)
                }}
              >
                <CheckCheck className="h-4 w-4 ml-1.5" />
                تحديد الكل
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const updated: Record<number, boolean> = {}
                  allItems.forEach((item) => {
                    updated[item.access_id] = false
                  })
                  setRoleAccess(updated)
                }}
              >
                <X className="h-4 w-4 ml-1.5" />
                الغاء تحديد الكل
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const updated = { ...roleAccess }
                  allItems.forEach((item) => {
                    updated[item.access_id] = !updated[item.access_id]
                  })
                  setRoleAccess(updated)
                }}
              >
                <RotateCcw className="h-4 w-4 ml-1.5" />
                عكس التحديد
              </Button>
              <Button type="button" size="sm" onClick={() => void savePermissions()} disabled={saving}>
                <Save className="h-4 w-4 ml-1.5" />
                {saving ? "جاري الحفظ..." : "حفظ الصلاحيات"}
              </Button>
            </div>
          </div>

          <div className={accessLoading ? "opacity-50 pointer-events-none" : undefined}>
            {Object.keys(filteredCategories).length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-10">لا توجد صلاحيات مطابقة للبحث</div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {Object.entries(filteredCategories).map(([categoryName, items]) => {
                const categoryGranted = items.filter((item) => roleAccess[item.access_id]).length
                return (
                  <Card key={categoryName} className="overflow-hidden">
                    <CardHeader className="py-3 bg-muted/40">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-semibold">{categoryName}</CardTitle>
                        <Badge variant={categoryGranted === items.length ? "default" : "secondary"} className="text-xs">
                          {categoryGranted}/{items.length}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y">
                        {items.map((item) => {
                          const isChecked = !!roleAccess[item.access_id]
                          return (
                            <div
                              key={item.access_id}
                              className={`flex items-center justify-between gap-4 px-4 py-3 transition-colors ${
                                isChecked ? "bg-primary/[0.04]" : ""
                              }`}
                            >
                              <span className="text-sm font-medium">{item.access_name}</span>
                              <Switch
                                checked={isChecked}
                                onCheckedChange={(checked) =>
                                  setRoleAccess((prev) => ({ ...prev, [item.access_id]: checked }))
                                }
                              />
                            </div>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
