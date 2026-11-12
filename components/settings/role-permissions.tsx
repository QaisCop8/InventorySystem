"use client"

import { tr, appDir } from "@/lib/i18n"
import { VoucherListHero } from "@/components/common/voucher-list-shell"
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
        if (!rolesResponse.ok || !branchesResponse.ok) throw new Error(tr("تعذر تحميل الأدوار أو الفروع"))
        const [rolesData, branchesData]: [JobRole[], Branch[]] = await Promise.all([rolesResponse.json(), branchesResponse.json()])
        setRoles(rolesData); setBranches(branchesData)
        setRoleId(String(rolesData[0]?.id || "")); setBranchId(String(branchesData[0]?.id || ""))
      } catch (error) {
        toast({ title: tr("تعذر فتح الصلاحيات"), description: error instanceof Error ? error.message : tr("حدث خطأ"), variant: "destructive" })
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
        if (!response.ok) throw new Error(tr("تعذر تحميل صلاحيات الدور"))
        const data: PermissionItem[] = await response.json()
        const next = Object.fromEntries(data.map((item) => [item.access_id, Boolean(item.is_granted)]))
        setItems(data); setValues(next); setInitialValues(next)
      } catch (error) {
        toast({ title: tr("فشل التحميل"), description: error instanceof Error ? error.message : tr("حدث خطأ"), variant: "destructive" })
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
      if (!response.ok) throw new Error(tr("تعذر حفظ صلاحيات الدور"))
      toast({ title: inherit ? tr("تمت استعادة الصلاحيات العامة") : tr("تم حفظ الصلاحيات"), description: `${selectedRole?.name} — ${selectedBranch?.branch_name}` })
      if (inherit) {
        const reload = await fetch(`/api/settings/job-roles/role-access?roleId=${roleId}&branchId=${branchId}`)
        const data: PermissionItem[] = await reload.json()
        const next = Object.fromEntries(data.map((item) => [item.access_id, Boolean(item.is_granted)]))
        setItems(data); setValues(next); setInitialValues(next)
      } else setInitialValues({ ...values })
    } catch (error) {
      toast({ title: tr("فشل الحفظ"), description: error instanceof Error ? error.message : tr("حدث خطأ"), variant: "destructive" })
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex h-64 items-center justify-center text-muted-foreground">{tr("جاري تحميل شاشة الصلاحيات...")}</div>

  return (
    <div className="w-full space-y-5 p-4 md:p-6" dir={appDir()}>
<VoucherListHero title={tr("صلاحيات الأدوار الوظيفية")} subtitle={tr("حدد صلاحيات كل دور بصورة مستقلة في كل فرع.")} icon={Shield} category={tr("الإعدادات")} actions={<><Button variant="outline" onClick={() => void save(true)} disabled={!roleId || !branchId || saving}><RotateCcw className="me-2 h-4 w-4" />{tr("استعادة صلاحيات الدور العامة")}</Button><Button onClick={() => void save(false)} disabled={!roleId || !branchId || permissionsLoading || saving}><Save className="me-2 h-4 w-4" />{saving ? tr("جاري الحفظ...") : tr("حفظ الصلاحيات")}</Button></>} />

      {roles.length === 0 || branches.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">{roles.length === 0 ? tr("لا توجد أدوار وظيفية. أضف دوراً وظيفياً أولاً.") : tr("لا توجد فروع معرفة. أضف فرعاً أولاً.")}</div> : <>
        <Card><CardContent className="grid gap-4 p-4 md:grid-cols-2">
          <div><Label className="mb-2 block text-xs text-muted-foreground">{tr("1. الدور الوظيفي")}</Label><Select value={roleId} onValueChange={(value) => { setRoleId(value); setSearch("") }}><SelectTrigger><BriefcaseBusiness className="me-2 h-4 w-4 text-muted-foreground" /><SelectValue placeholder={tr("اختر الدور الوظيفي")} /></SelectTrigger><SelectContent>{roles.map((role) => <SelectItem key={role.id} value={String(role.id)}>{role.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="mb-2 block text-xs text-muted-foreground">{tr("2. الفرع الذي ستطبق فيه الصلاحيات")}</Label><Dropdown id="role-permissions-branch" value={Number(branchId) || null} options={branches} optionLabel="branch_name" optionLabelCode="branch_code" optionValue="id" placeholder={tr("اختر الفرع")} filter onChange={(event) => setBranchId(String(event.value))} /></div>
          <div className="flex flex-wrap gap-2 md:col-span-2"><Badge variant="secondary">{tr("الدور: ")}{selectedRole?.name}</Badge><Badge variant="outline">{tr("الفرع: ")}{selectedBranch?.branch_name}</Badge><span className="text-xs text-muted-foreground self-center">{tr("أي تعديل هنا يخص هذا الدور في هذا الفرع فقط.")}</span></div>
        </CardContent></Card>
        <BranchPermissionEditor items={items} values={values} onChange={setValues} search={search} onSearchChange={setSearch} loading={permissionsLoading} dirty={dirty} />
      </>}
    </div>
  )
}
