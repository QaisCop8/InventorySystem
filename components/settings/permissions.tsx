"use client"

import { useEffect, useMemo, useState } from "react"
import { BranchPermissionEditor, type PermissionItem } from "./branch-permission-editor"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import Dropdown from "@/components/common/Dropdown"
import { ArrowLeft, Copy, RotateCcw, Save, Search, Shield, UserRound } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface User {
  id: string
  user_id: string
  username: string
  full_name: string
  email: string
  role: string
  department: string
  branch_id?: number | null
  branch_name?: string | null
}

interface Branch { id: number; branch_code: string; branch_name: string; status: number }

export default function Permissions() {
  const { toast } = useToast()
  const [users, setUsers] = useState<User[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedUserId, setSelectedUserId] = useState("")
  const [selectedBranchId, setSelectedBranchId] = useState("")
  const [items, setItems] = useState<PermissionItem[]>([])
  const [values, setValues] = useState<Record<number, boolean>>({})
  const [initialValues, setInitialValues] = useState<Record<number, boolean>>({})
  const [userSearch, setUserSearch] = useState("")
  const [permissionSearch, setPermissionSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [permissionsLoading, setPermissionsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [copying, setCopying] = useState(false)
  const [sourceUserId, setSourceUserId] = useState("")
  const [sourceBranchId, setSourceBranchId] = useState("")

  const selectedUser = users.find((user) => String(user.user_id || user.id) === selectedUserId)
  const selectedBranch = branches.find((branch) => String(branch.id) === selectedBranchId)
  const dirty = JSON.stringify(values) !== JSON.stringify(initialValues)
  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLocaleLowerCase("ar")
    if (!term) return users
    return users.filter((user) => [user.full_name, user.username, user.email, user.department, user.branch_name].some((value) => value?.toLocaleLowerCase("ar").includes(term)))
  }, [users, userSearch])

  useEffect(() => {
    const load = async () => {
      try {
        const [usersResponse, branchesResponse] = await Promise.all([fetch("/api/settings/user"), fetch("/api/branches")])
        if (!usersResponse.ok || !branchesResponse.ok) throw new Error("تعذر تحميل المستخدمين أو الفروع")
        const [usersData, branchesData]: [User[], Branch[]] = await Promise.all([usersResponse.json(), branchesResponse.json()])
        setUsers(usersData)
        setBranches(branchesData)
        const pendingUserId = sessionStorage.getItem("erp_pending_permissions_user_id")
        if (pendingUserId) sessionStorage.removeItem("erp_pending_permissions_user_id")
        const firstUserId = pendingUserId || String(usersData[0]?.user_id || usersData[0]?.id || "")
        setSelectedUserId(firstUserId)
        const firstUser = usersData.find((user) => String(user.user_id || user.id) === firstUserId) || usersData[0]
        setSelectedBranchId(String(firstUser?.branch_id || branchesData[0]?.id || ""))
      } catch (error) {
        toast({ title: "تعذر فتح الصلاحيات", description: error instanceof Error ? error.message : "حدث خطأ", variant: "destructive" })
      } finally { setLoading(false) }
    }
    void load()
  }, [toast])

  useEffect(() => {
    if (!selectedUserId || !selectedBranchId) return
    const loadPermissions = async () => {
      setPermissionsLoading(true)
      try {
        const response = await fetch(`/api/settings/user/user-access?userId=${encodeURIComponent(selectedUserId)}&branchId=${selectedBranchId}`)
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.details || errorData.error || "تعذر تحميل صلاحيات المستخدم")
        }
        const data: PermissionItem[] = await response.json()
        const next = Object.fromEntries(data.map((item) => [item.access_id, Boolean(item.is_granted)]))
        setItems(data); setValues(next); setInitialValues(next)
      } catch (error) {
        toast({ title: "فشل التحميل", description: error instanceof Error ? error.message : "حدث خطأ", variant: "destructive" })
      } finally { setPermissionsLoading(false) }
    }
    void loadPermissions()
  }, [selectedUserId, selectedBranchId, toast])

  const chooseUser = (user: User) => {
    setSelectedUserId(String(user.user_id || user.id))
    if (user.branch_id) setSelectedBranchId(String(user.branch_id))
    setPermissionSearch("")
  }

  const openCopyDialog = () => {
    const fallbackSource = users.find((user) => String(user.user_id || user.id) !== selectedUserId) || selectedUser
    setSourceUserId(String(fallbackSource?.user_id || fallbackSource?.id || ""))
    setSourceBranchId(String(fallbackSource?.branch_id || selectedBranchId || branches[0]?.id || ""))
    setCopyOpen(true)
  }

  const copyPermissions = async () => {
    if (!sourceUserId || !sourceBranchId || !selectedUserId || !selectedBranchId) return
    setCopying(true)
    try {
      const sourceResponse = await fetch(`/api/settings/user/user-access?userId=${encodeURIComponent(sourceUserId)}&branchId=${sourceBranchId}`)
      if (!sourceResponse.ok) throw new Error("تعذر قراءة صلاحيات المصدر")
      const sourceItems: PermissionItem[] = await sourceResponse.json()
      const copiedAccesses = sourceItems.map((item) => ({ access_id: item.access_id, is_granted: Boolean(item.is_granted) }))
      const saveResponse = await fetch("/api/settings/user/save-user-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, branchId: Number(selectedBranchId), accesses: copiedAccesses }),
      })
      if (!saveResponse.ok) throw new Error("تعذر نسخ الصلاحيات إلى الهدف")

      const next = Object.fromEntries(copiedAccesses.map((item) => [item.access_id, item.is_granted]))
      setItems(sourceItems)
      setValues(next)
      setInitialValues(next)
      setCopyOpen(false)
      window.dispatchEvent(new CustomEvent("user-permissions-changed", { detail: { userId: selectedUserId, branchId: Number(selectedBranchId) } }))
      const sourceUser = users.find((user) => String(user.user_id || user.id) === sourceUserId)
      const sourceBranch = branches.find((branch) => String(branch.id) === sourceBranchId)
      toast({
        title: "تم نسخ الصلاحيات بنجاح",
        description: `${sourceUser?.full_name || sourceUser?.username} — ${sourceBranch?.branch_name} ← ${selectedUser?.full_name || selectedUser?.username} — ${selectedBranch?.branch_name}`,
      })
    } catch (error) {
      toast({ title: "فشل نسخ الصلاحيات", description: error instanceof Error ? error.message : "حدث خطأ", variant: "destructive" })
    } finally { setCopying(false) }
  }

  const save = async (inherit = false) => {
    if (!selectedUserId || !selectedBranchId) return
    setSaving(true)
    try {
      const response = await fetch("/api/settings/user/save-user-access", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, branchId: Number(selectedBranchId), inherit, accesses: items.map((item) => ({ access_id: item.access_id, is_granted: Boolean(values[item.access_id]) })) }),
      })
      if (!response.ok) throw new Error("تعذر حفظ الصلاحيات")
      toast({ title: inherit ? "تمت استعادة الصلاحيات الموروثة" : "تم حفظ الصلاحيات", description: `${selectedUser?.full_name || selectedUser?.username} — ${selectedBranch?.branch_name}` })
      if (inherit) {
        const reload = await fetch(`/api/settings/user/user-access?userId=${encodeURIComponent(selectedUserId)}&branchId=${selectedBranchId}`)
        const data: PermissionItem[] = await reload.json()
        const next = Object.fromEntries(data.map((item) => [item.access_id, Boolean(item.is_granted)]))
        setItems(data); setValues(next); setInitialValues(next)
      } else setInitialValues({ ...values })
      window.dispatchEvent(new CustomEvent("user-permissions-changed", { detail: { userId: selectedUserId, branchId: Number(selectedBranchId) } }))
    } catch (error) {
      toast({ title: "فشل الحفظ", description: error instanceof Error ? error.message : "حدث خطأ", variant: "destructive" })
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex h-64 items-center justify-center text-muted-foreground">جاري تحميل شاشة الصلاحيات...</div>

  return (
    <div className="w-full space-y-5 p-4 md:p-6" dir="rtl">
      <div className="flex flex-col gap-4 rounded-2xl border bg-gradient-to-l from-primary/10 via-background to-background p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Shield className="h-6 w-6" /></div>
          <div><h1 className="text-xl font-bold">صلاحيات المستخدمين</h1><p className="mt-1 text-sm text-muted-foreground">خصص وصول كل مستخدم داخل فرع محدد، مع بقاء صلاحيات دوره كأساس.</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={openCopyDialog} disabled={!selectedUserId || !selectedBranchId || permissionsLoading || saving}><Copy className="ml-2 h-4 w-4" />نسخ صلاحيات</Button>
          <Button variant="outline" onClick={() => void save(true)} disabled={!selectedUserId || !selectedBranchId || saving}><RotateCcw className="ml-2 h-4 w-4" />استعادة الموروث</Button>
          <Button onClick={() => void save(false)} disabled={!selectedUserId || !selectedBranchId || permissionsLoading || saving}><Save className="ml-2 h-4 w-4" />{saving ? "جاري الحفظ..." : "حفظ الصلاحيات"}</Button>
        </div>
      </div>

      {branches.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">لا توجد فروع معرفة. أضف فرعاً من شاشة الفروع أولاً.</div> : (
        <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Card className="h-fit lg:sticky lg:top-4"><CardContent className="space-y-4 p-4">
            <div><Label className="mb-2 block text-xs text-muted-foreground">1. اختر المستخدم</Label><div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="بحث عن مستخدم..." className="pr-9" /></div></div>
            <div className="max-h-[360px] space-y-1 overflow-y-auto pl-1">
              {filteredUsers.map((user) => {
                const id = String(user.user_id || user.id); const active = id === selectedUserId
                return <button key={id} type="button" onClick={() => chooseUser(user)} className={`flex w-full items-center gap-3 rounded-xl p-3 text-right transition-colors ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  <Avatar className="h-9 w-9"><AvatarFallback className={active ? "bg-primary-foreground/15 text-primary-foreground" : ""}>{(user.full_name || user.username || "م").charAt(0)}</AvatarFallback></Avatar>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{user.full_name || user.username}</span><span className={`block truncate text-xs ${active ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{user.branch_name || user.department || "غير مرتبط بفرع"}</span></span>
                </button>
              })}
            </div>
          </CardContent></Card>

          <div className="min-w-0 space-y-4">
            <Card><CardContent className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_260px] md:items-end">
              <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted"><UserRound className="h-5 w-5" /></div><div><div className="font-semibold">{selectedUser?.full_name || selectedUser?.username || "اختر مستخدماً"}</div><div className="text-sm text-muted-foreground">{selectedUser?.email || "ستظهر الصلاحيات بعد اختيار المستخدم"}</div></div></div>
              <div><Label className="mb-2 block text-xs text-muted-foreground">2. اختر الفرع الذي ستطبق فيه الصلاحيات</Label><Dropdown id="permissions-branch" value={Number(selectedBranchId) || null} options={branches} optionLabel="branch_name" optionLabelCode="branch_code" optionValue="id" placeholder="اختر الفرع" filter onChange={(event) => setSelectedBranchId(String(event.value))} /></div>
              {selectedUser?.branch_id && String(selectedUser.branch_id) !== selectedBranchId && <div className="md:col-span-2"><Badge variant="outline">تنبيه: هذا ليس الفرع الأساسي للمستخدم ({selectedUser.branch_name})</Badge></div>}
            </CardContent></Card>
            {selectedUserId && selectedBranchId && <BranchPermissionEditor items={items} values={values} onChange={setValues} search={permissionSearch} onSearchChange={setPermissionSearch} loading={permissionsLoading} dirty={dirty} />}
          </div>
        </div>
      )}

      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent className="max-w-xl rounded-2xl" dir="rtl">
          <DialogHeader className="pl-10">
            <DialogTitle className="flex items-center gap-2"><Copy className="h-5 w-5 text-primary" />نسخ الصلاحيات إلى المستخدم الحالي</DialogTitle>
            <DialogDescription>اختر المستخدم والفرع المصدر. سيتم استبدال صلاحيات الهدف الحالية بنسخة من الصلاحيات الفعالة للمصدر.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div><Label className="mb-2 block text-sm">المستخدم المصدر</Label><Dropdown id="copy-source-user" value={sourceUserId || null} options={users} optionLabel="full_name" optionLabelCode="username" optionValue="user_id" placeholder="اختر المستخدم المصدر" filter onChange={(event) => {
              const nextUserId = String(event.value)
              setSourceUserId(nextUserId)
              const nextUser = users.find((user) => String(user.user_id || user.id) === nextUserId)
              if (nextUser?.branch_id) setSourceBranchId(String(nextUser.branch_id))
            }} /></div>
            <div><Label className="mb-2 block text-sm">الفرع المصدر</Label><Dropdown id="copy-source-branch" value={Number(sourceBranchId) || null} options={branches} optionLabel="branch_name" optionLabelCode="branch_code" optionValue="id" placeholder="اختر الفرع المصدر" filter onChange={(event) => setSourceBranchId(String(event.value))} /></div>
          </div>

          <div className="rounded-xl border bg-muted/40 p-4">
            <div className="mb-3 text-xs font-medium text-muted-foreground">الهدف الذي ستُستبدل صلاحياته</div>
            <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
              <span>{selectedUser?.full_name || selectedUser?.username}</span><ArrowLeft className="h-4 w-4 text-muted-foreground" /><span>{selectedBranch?.branch_name}</span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-start">
            <Button onClick={() => void copyPermissions()} disabled={!sourceUserId || !sourceBranchId || copying || (sourceUserId === selectedUserId && sourceBranchId === selectedBranchId)}><Copy className="ml-2 h-4 w-4" />{copying ? "جاري النسخ..." : "نسخ وحفظ"}</Button>
            <Button variant="ghost" onClick={() => setCopyOpen(false)} disabled={copying}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
