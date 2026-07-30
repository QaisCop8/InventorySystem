"use client"

import React, { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Shield } from "lucide-react"
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
  const [saving, setSaving] = useState(false)

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
    }
    void fetchAccess()
  }, [selectedRoleId])

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
      <Card className="h-full flex flex-col" dir="rtl">
        <CardHeader className="flex-shrink-0">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            صلاحيات الأدوار الوظيفية
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-auto">
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>اختر الدور الوظيفي</Label>
              <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                <SelectTrigger className="max-w-md">
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

            {roles.length === 0 && (
              <div className="text-muted-foreground text-sm">
                لا توجد أدوار وظيفية بعد — أضِف دوراً من شاشة "الأدوار الوظيفية" أولاً.
              </div>
            )}

            {selectedRoleId && (
              <div className="space-y-6">
                <div className="flex gap-4">
                  <button
                    type="button"
                    className="px-4 py-1 bg-green-500 text-white rounded"
                    onClick={() => {
                      const updated: Record<number, boolean> = {}
                      Object.values(accessList).flat().forEach((item) => {
                        updated[item.access_id] = true
                      })
                      setRoleAccess(updated)
                    }}
                  >
                    تحديد الكل
                  </button>
                  <button
                    type="button"
                    className="px-4 py-1 bg-red-500 text-white rounded"
                    onClick={() => {
                      const updated: Record<number, boolean> = {}
                      Object.values(accessList).flat().forEach((item) => {
                        updated[item.access_id] = false
                      })
                      setRoleAccess(updated)
                    }}
                  >
                    الغاء تحديد الكل
                  </button>
                  <button
                    type="button"
                    className="px-4 py-1 bg-blue-500 text-white rounded"
                    onClick={() => {
                      const updated = { ...roleAccess }
                      Object.values(accessList).flat().forEach((item) => {
                        updated[item.access_id] = !updated[item.access_id]
                      })
                      setRoleAccess(updated)
                    }}
                  >
                    عكس التحديد
                  </button>
                  <button
                    type="button"
                    className="px-4 py-1 bg-primary text-primary-foreground rounded disabled:opacity-50"
                    onClick={() => void savePermissions()}
                    disabled={saving}
                  >
                    {saving ? "جاري الحفظ..." : "حفظ الصلاحيات"}
                  </button>
                </div>

                {Object.entries(accessList).map(([categoryName, items]) => (
                  <div key={categoryName} className="border rounded-lg p-6 mb-4">
                    <h4 className="font-semibold text-lg mb-4">{categoryName}</h4>
                    <div className="grid grid-cols-[1fr_60px] gap-6 items-center">
                      {items.map((item) => {
                        const isChecked = !!roleAccess[item.access_id]
                        return (
                          <React.Fragment key={item.access_id}>
                            <div className="text-base font-medium">{item.access_name}</div>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              className="rounded w-5 h-5"
                              onChange={(e) => {
                                setRoleAccess((prev) => ({ ...prev, [item.access_id]: e.target.checked }))
                              }}
                            />
                          </React.Fragment>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
