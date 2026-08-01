"use client"

import { useEffect, useState } from "react"
import { BranchPermissionEditor, type PermissionItem } from "./branch-permission-editor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Dropdown from "@/components/common/Dropdown"
import { BriefcaseBusiness, RotateCcw, Save, Shield } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface JobRole { id: number; name: string; status: number }
interface Branch { id: number; branch_code: string; branch_name: string; status: number }

export default function RolePermissions() {
  const { toast } = useToast()
  const [roles, setRoles] = useState<JobRole[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [roleId, setRoleId] = useState("")
  const [branchId, setBranchId] = useState("")
  const [items, setItems] = useState<PermissionItem[]>([])
  const [values, setValues] = useState<Record<number, boolean>>({})
  const [initialValues, setInitialValues] = useState<Record<number, boolean>>({})
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [permissionsLoading, setPermissionsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(values) !== JSON.stringify(initialValues)
  const selectedRole = roles.find((role) => String(role.id) === roleId)
  const selectedBranch = branches.find((branch) => String(branch.id) === branchId)

  useEffect(() => {
    const load = async () => {
      try {
        const [rolesResponse, branchesResponse] = await Promise.all([fetch("/api/settings/job-roles"), fetch("/api/branches")])
        if (!rolesResponse.ok || !branchesResponse.ok) throw new Error("تعذر تحميل الأدوار أو الفروع")
        const [rolesData, branchesData]: [JobRole[], Branch[]] = await Promise.all([rolesResponse.json(), branchesResponse.json()])
        setRoles(rolesData); setBranches(branchesData)
        setRoleId(String(rolesData[0]?.id || "")); setBranchId(String(branchesData[0]?.id || ""))
      } catch (error) {
        toast({ title: "تعذر فتح الصلاحيات", description: error instanceof Error ? error.message : "حدث خطأ", variant: "destructive" })
      } finally { setLoading(false) }
    }
    void load()
  }, [toast])

  useEffect(() => {
    if (!roleId || !branchId) return
    const loadPermissions = async () => {
      setPermissionsLoading(true)
      try {
        const response = await fetch(`/api/settings/job-roles/role-access?roleId=${roleId}&branchId=${branchId}`)
        if (!response.ok) throw new Error("تعذر تحميل صلاحيات الدور")
        const data: PermissionItem[] = await response.json()
        const next = Object.fromEntries(data.map((item) => [item.access_id, Boolean(item.is_granted)]))
        setItems(data); setValues(next); setInitialValues(next)
      } catch (error) {
        toast({ title: "فشل التحميل", description: error instanceof Error ? error.message : "حدث خطأ", variant: "destructive" })
      } finally { setPermissionsLoading(false) }
    }
    void loadPermissions()
  }, [roleId, branchId, toast])

  const save = async (inherit = false) => {
    if (!roleId || !branchId) return
    setSaving(true)
    try {
      const response = await fetch("/api/settings/job-roles/save-role-access", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: Number(roleId), branchId: Number(branchId), inherit, accesses: items.map((item) => ({ access_id: item.access_id, is_granted: Boolean(values[item.access_id]) })) }),
      })
      if (!response.ok) throw new Error("تعذر حفظ صلاحيات الدور")
      toast({ title: inherit ? "تمت استعادة الصلاحيات العامة" : "تم حفظ الصلاحيات", description: `${selectedRole?.name} — ${selectedBranch?.branch_name}` })
      if (inherit) {
        const reload = await fetch(`/api/settings/job-roles/role-access?roleId=${roleId}&branchId=${branchId}`)
        const data: PermissionItem[] = await reload.json()
        const next = Object.fromEntries(data.map((item) => [item.access_id, Boolean(item.is_granted)]))
        setItems(data); setValues(next); setInitialValues(next)
      } else setInitialValues({ ...values })
    } catch (error) {
      toast({ title: "فشل الحفظ", description: error instanceof Error ? error.message : "حدث خطأ", variant: "destructive" })
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex h-64 items-center justify-center text-muted-foreground">جاري تحميل شاشة الصلاحيات...</div>

  return (
    <div className="w-full space-y-5 p-4 md:p-6" dir="rtl">
      <div className="flex flex-col gap-4 rounded-2xl border bg-gradient-to-l from-primary/10 via-background to-background p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Shield className="h-6 w-6" /></div><div><h1 className="text-xl font-bold">صلاحيات الأدوار الوظيفية</h1><p className="mt-1 text-sm text-muted-foreground">حدد صلاحيات كل دور بصورة مستقلة في كل فرع.</p></div></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void save(true)} disabled={!roleId || !branchId || saving}><RotateCcw className="ml-2 h-4 w-4" />استعادة صلاحيات الدور العامة</Button><Button onClick={() => void save(false)} disabled={!roleId || !branchId || permissionsLoading || saving}><Save className="ml-2 h-4 w-4" />{saving ? "جاري الحفظ..." : "حفظ الصلاحيات"}</Button></div>
      </div>

      {roles.length === 0 || branches.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">{roles.length === 0 ? "لا توجد أدوار وظيفية. أضف دوراً وظيفياً أولاً." : "لا توجد فروع معرفة. أضف فرعاً أولاً."}</div> : <>
        <Card><CardContent className="grid gap-4 p-4 md:grid-cols-2">
          <div><Label className="mb-2 block text-xs text-muted-foreground">1. الدور الوظيفي</Label><Select value={roleId} onValueChange={(value) => { setRoleId(value); setSearch("") }}><SelectTrigger><BriefcaseBusiness className="ml-2 h-4 w-4 text-muted-foreground" /><SelectValue placeholder="اختر الدور الوظيفي" /></SelectTrigger><SelectContent>{roles.map((role) => <SelectItem key={role.id} value={String(role.id)}>{role.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="mb-2 block text-xs text-muted-foreground">2. الفرع الذي ستطبق فيه الصلاحيات</Label><Dropdown id="role-permissions-branch" value={Number(branchId) || null} options={branches} optionLabel="branch_name" optionLabelCode="branch_code" optionValue="id" placeholder="اختر الفرع" filter onChange={(event) => setBranchId(String(event.value))} /></div>
          <div className="flex flex-wrap gap-2 md:col-span-2"><Badge variant="secondary">الدور: {selectedRole?.name}</Badge><Badge variant="outline">الفرع: {selectedBranch?.branch_name}</Badge><span className="text-xs text-muted-foreground self-center">أي تعديل هنا يخص هذا الدور في هذا الفرع فقط.</span></div>
        </CardContent></Card>
        <BranchPermissionEditor items={items} values={values} onChange={setValues} search={search} onSearchChange={setSearch} loading={permissionsLoading} dirty={dirty} />
      </>}
    </div>
  )
}
