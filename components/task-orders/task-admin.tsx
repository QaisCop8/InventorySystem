"use client"

import { useEffect, useRef, useState } from "react"
import { useAuth } from "@/components/auth/auth-context"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import PrimeDropdown from "@/components/common/FocusDropdown"
import MultiSelect from "@/components/common/MultiSelect"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { Plus, Trash2, Loader2, Save, Users, Search, Pencil } from "lucide-react"
import type { AppUser, TaskSection, TaskWorkflow, TaskWorkflowStep, TaskWorkflowTransition } from "./types"
import ItemGroupSearch, { type ItemGroupRecord } from "./item-group-search"

// فروع النظام الحقيقية (تعريفات) — لا علاقة لها بـtask_branches المحلي القديم؛ نفس الجدول
// المستخدم في تعريف الحسابات البنكية وربط الأقسام (departments.branch_id).
interface RealBranch {
  id: number
  branch_code: string
  branch_name: string
  status: number
}

// أقسام النظام الحقيقية من صفحة "التعريفات" (جدول departments) — مصدر أسماء أقسام تتبع أوامر
// العمل بدل الإدخال الحر، حتى تبقى متسقة مع الهيكل التنظيمي الفعلي المُعرَّف مركزياً.
interface RealDepartment {
  id: number
  department_code: string
  department_name: string
  branch_id: number | null
  is_active: boolean
}

export function TaskAdmin() {
  const { user } = useAuth()
  const { toast } = useToast()
  const userId = user?.id ?? null

  const [branches, setBranches] = useState<RealBranch[]>([])
  const [departments, setDepartments] = useState<RealDepartment[]>([])
  const [sections, setSections] = useState<TaskSection[]>([])
  const [workflows, setWorkflows] = useState<TaskWorkflow[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  // منفصلة عن كل تحديث لاحق (بعد كل حفظ) عمداً — إظهار مؤشر التحميل بعد كل حفظ كان يُخفي كامل
  // الشجرة (Tabs وكل شيء تحتها)، فتُعاد Tabs للتبويب الافتراضي (defaultValue غير مُتحكَّم به)
  // وتفقد WorkflowsAdmin كل حالتها المحلية (السير المختار، النموذج المفتوح، الخطوات قيد التحرير).
  // التحميل الكامل هنا للتحميل الأول فقط؛ التحديثات اللاحقة صامتة (تُحدِّث البيانات فقط دون أي
  // إخفاء/إعادة تركيب للواجهة).
  const [initialLoading, setInitialLoading] = useState(true)

  const loadAll = async () => {
    try {
      const [branchesRes, departmentsRes, sectionsRes, workflowsRes, usersRes] = await Promise.all([
        fetch("/api/branches"),
        fetch("/api/departments"),
        fetch("/api/task-orders/sections"),
        fetch("/api/task-orders/workflows"),
        fetch("/api/settings/user"),
      ])
      setBranches(await branchesRes.json())
      const departmentsData = await departmentsRes.json()
      setDepartments(Array.isArray(departmentsData) ? departmentsData : [])
      setSections(await sectionsRes.json())
      setWorkflows(await workflowsRes.json())
      const usersData = await usersRes.json()
      setUsers(Array.isArray(usersData) ? usersData : [])
    } catch {
      toast({ title: "خطأ", description: "فشل في جلب بيانات الإدارة", variant: "destructive" })
    } finally {
      setInitialLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (initialLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div dir="rtl" className="w-full">
      <Tabs defaultValue="sections" className="w-full">
        <TabsList>
          <TabsTrigger value="workflows">سير العمل</TabsTrigger>
          <TabsTrigger value="sections">الأقسام</TabsTrigger>
        </TabsList>
        <TabsContent value="sections" className="mt-4 w-full">
          <SectionsAdmin sections={sections} branches={branches} departments={departments} users={users} userId={userId} onChanged={loadAll} />
        </TabsContent>
        <TabsContent value="workflows" className="mt-4 w-full">
          <WorkflowsAdmin
            workflows={workflows}
            sections={sections}
            departments={departments}
            branches={branches}
            users={users}
            userId={userId}
            onChanged={loadAll}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SectionsAdmin({
  sections,
  branches,
  departments,
  users,
  userId,
  onChanged,
}: {
  sections: TaskSection[]
  branches: RealBranch[]
  departments: RealDepartment[]
  users: AppUser[]
  userId: string | null
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [departmentId, setDepartmentId] = useState<number | null>(null)
  const [branchId, setBranchId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [memberPicks, setMemberPicks] = useState<Record<number, { userId: string | null; isManager: boolean }>>({})

  const activeDepartments = departments.filter((d) => d.is_active)
  const activeBranches = branches.filter((b) => b.status === 1)

  const createSection = async () => {
    const department = activeDepartments.find((d) => d.id === departmentId)
    if (!department || !userId) return
    // نفس تركيبة القسم (اسم) + الفرع مُضافة مسبقاً — تمنع تكرار نفس الصف بدل الاعتماد على رفض
    // الخادم فقط (تجربة أوضح للمستخدم برسالة فورية).
    const duplicate = sections.some((s) => s.name === department.department_name && (s.branch_id ?? null) === branchId)
    if (duplicate) {
      toast({ title: "تعذّر الإنشاء", description: "الفرع والقسم تم اضافتهم مسبقا", variant: "destructive" })
      return
    }
    setBusy(true)
    try {
      const res = await fetch("/api/task-orders/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, name: department.department_name, branch_id: branchId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error)
      setDepartmentId(null)
      setBranchId(null)
      onChanged()
    } catch (error: any) {
      toast({ title: "تعذّر الإنشاء", description: error?.message, variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (section: TaskSection) => {
    if (!userId) return
    await fetch(`/api/task-orders/sections/${section.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, is_active: !section.is_active }),
    })
    onChanged()
  }

  const changeBranch = async (section: TaskSection, newBranchId: number | null) => {
    if (!userId) return
    await fetch(`/api/task-orders/sections/${section.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, branch_id: newBranchId }),
    })
    onChanged()
  }

  const addMember = async (sectionId: number) => {
    const pick = memberPicks[sectionId]
    if (!pick?.userId || !userId) return
    try {
      const res = await fetch(`/api/task-orders/sections/${sectionId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, user_id: pick.userId, is_manager: pick.isManager }),
      })
      if (!res.ok) throw new Error((await res.json())?.error)
      setMemberPicks((m) => ({ ...m, [sectionId]: { userId: null, isManager: false } }))
      onChanged()
    } catch (error: any) {
      toast({ title: "تعذّر الإضافة", description: error?.message, variant: "destructive" })
    }
  }

  const removeMember = async (sectionId: number, memberUserId: string) => {
    if (!userId) return
    await fetch(`/api/task-orders/sections/${sectionId}/members?user_id=${memberUserId}&userId=${userId}`, { method: "DELETE" })
    onChanged()
  }

  return (
    <Card className="overflow-visible border-indigo-100 bg-gradient-to-b from-indigo-50/40 to-white shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-400 to-purple-600 text-white shadow-sm">
            <Users className="h-4 w-4" />
          </span>
          الأقسام وأعضاؤها
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 overflow-visible">
        <div className="flex flex-wrap gap-2 rounded-xl border border-indigo-100 bg-white/70 p-3">
          <div className="invoice-currency-dropdown-wrap w-72">
            <PrimeDropdown
              value={departmentId}
              options={activeDepartments}
              optionLabel="department_name"
              optionValue="id"
              placeholder="القسم (من تعريفات الأقسام)"
              filter
              className="invoice-currency-dropdown w-full"
              panelClassName="invoice-currency-dropdown-panel"
              appendTo="self"
              onChange={(e: any) => setDepartmentId(e.value ?? null)}
            />
          </div>
          <div className="invoice-currency-dropdown-wrap w-72">
            <PrimeDropdown
              value={branchId}
              options={activeBranches}
              optionLabel="branch_name"
              optionValue="id"
              placeholder="الفرع"
              filter
              showClear
              className="invoice-currency-dropdown w-full"
              panelClassName="invoice-currency-dropdown-panel"
              appendTo="self"
              onChange={(e: any) => setBranchId(e.value ?? null)}
            />
          </div>
          <Button onClick={createSection} disabled={busy || !departmentId} className="shrink-0 gap-1">
            <Plus className="h-4 w-4" /> إضافة
          </Button>
        </div>
        {activeDepartments.length === 0 && (
          <p className="text-xs text-slate-400">لا توجد أقسام معرَّفة بعد — أضِفها أولاً من التعريفات ثم عُد لهذه الصفحة</p>
        )}

        <Separator />

        <div className="space-y-3">
          {sections.map((section) => (
            <div
              key={section.id}
              className="rounded-xl border border-r-4 border-slate-200 border-r-indigo-400 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-slate-800">
                  {section.name}
                  {!section.is_active && (
                    <Badge variant="outline" className="mr-2 border-red-200 text-red-500">
                      معطّل
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="invoice-currency-dropdown-wrap w-44">
                    <PrimeDropdown
                      value={section.branch_id ?? null}
                      options={activeBranches}
                      optionLabel="branch_name"
                      optionValue="id"
                      placeholder="الفرع"
                      filter
                      showClear
                      className="invoice-currency-dropdown h-7 w-full text-xs"
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                      onChange={(e: any) => changeBranch(section, e.value ?? null)}
                    />
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(section)}>
                    {section.is_active ? "تعطيل" : "تفعيل"}
                  </Button>
                </div>
              </div>

              <div className="space-y-1 rounded-lg bg-slate-50 p-2">
                {section.members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <span>
                      {m.full_name} {m.is_manager && <Badge className="mr-1 bg-indigo-50 text-indigo-700 border-indigo-200">مدير القسم</Badge>}
                    </span>
                    <Button size="icon" variant="ghost" onClick={() => removeMember(section.id, m.user_id)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                ))}
                {section.members.length === 0 && <div className="text-xs text-slate-400">لا يوجد أعضاء بعد</div>}
              </div>

              <div className="mt-2 flex items-center gap-2">
                <div className="invoice-currency-dropdown-wrap flex-1">
                  <PrimeDropdown
                    value={memberPicks[section.id]?.userId ?? null}
                    options={users.filter((u) => !section.members.some((m) => m.user_id === u.user_id))}
                    optionLabel="full_name"
                    optionValue="user_id"
                    placeholder="إضافة عضو"
                    filter
                    className="invoice-currency-dropdown h-8 w-full text-xs"
                    panelClassName="invoice-currency-dropdown-panel"
                    appendTo="self"
                    onChange={(e: any) =>
                      setMemberPicks((p) => ({ ...p, [section.id]: { userId: e.value ?? null, isManager: p[section.id]?.isManager || false } }))
                    }
                  />
                </div>
                <label className="flex items-center gap-1 text-xs text-slate-500">
                  <Checkbox
                    checked={!!memberPicks[section.id]?.isManager}
                    onCheckedChange={(c) => setMemberPicks((p) => ({ ...p, [section.id]: { userId: p[section.id]?.userId ?? null, isManager: !!c } }))}
                  />
                  مدير
                </label>
                <Button size="sm" variant="outline" onClick={() => addMember(section.id)} disabled={!memberPicks[section.id]?.userId}>
                  إضافة
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

interface EditableStep {
  key: string
  label: string
  section_id: string
  assignment_type: "all" | "specific"
  assigned_user_id: string
  sla_hours: string
  is_conditional: boolean
  sla_actions: string[]
}
interface EditableTransition {
  from_key: string
  to_key: string
}

// خيارات "عند تجاوز المدة المتوقعة" — إجراء تلقائي (أو أكثر) يُتّخذ إن تجاوز إجمالي وقت العمل على
// الخطوة سقف SLA المحدَّد لها. فارغ = لا إجراء تلقائي (تبقى تنبيهات SLA العادية إن وُجدت فقط).
const SLA_ACTION_OPTIONS = [
  { value: "advance_next", label: "نقل الى المرحلة التالية" },
  { value: "notify_manager", label: "ارسال notification الى مدير القسم" },
  { value: "notify_admin", label: "ارسال notification الى مسؤول النظام" },
]

let stepKeySeq = 0
function newStepKey() {
  stepKeySeq += 1
  return `step_${Date.now()}_${stepKeySeq}`
}

function stepToEditable(s: TaskWorkflowStep): EditableStep {
  return {
    key: s.key,
    label: s.label,
    section_id: String(s.section_id),
    assignment_type: s.assignment_type,
    assigned_user_id: s.assigned_user_id || "",
    sla_hours: s.sla_hours != null ? String(s.sla_hours) : "",
    is_conditional: s.is_conditional,
    sla_actions: s.sla_actions || [],
  }
}
function transitionToEditable(t: TaskWorkflowTransition, steps: TaskWorkflowStep[]): EditableTransition {
  return {
    from_key: steps.find((s) => s.id === t.from_step_id)?.key || "",
    to_key: steps.find((s) => s.id === t.to_step_id)?.key || "",
  }
}

function WorkflowsAdmin({
  workflows,
  sections,
  departments,
  branches,
  users,
  userId,
  onChanged,
}: {
  workflows: TaskWorkflow[]
  sections: TaskSection[]
  departments: RealDepartment[]
  branches: RealBranch[]
  users: AppUser[]
  userId: string | null
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState("")
  const [type, setType] = useState<"general" | "group" | "specific">("general")
  const [groupCode, setGroupCode] = useState("")
  const [groupId, setGroupId] = useState<number | null>(null)
  const [groupSearchOpen, setGroupSearchOpen] = useState(false)
  const [itemIds, setItemIds] = useState<number[]>([])
  const [branchId, setBranchId] = useState<number | null>(null)
  const [products, setProducts] = useState<{ id: number; product_code: string; product_name: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null)
  const [editSteps, setEditSteps] = useState<EditableStep[]>([])
  const [editTransitions, setEditTransitions] = useState<EditableTransition[]>([])
  const [savingSteps, setSavingSteps] = useState(false)
  const groupInputRef = useRef<HTMLInputElement | null>(null)

  const selectedWorkflow = workflows.find((w) => w.id === selectedWorkflowId) || null
  const activeBranches = branches.filter((b) => b.status === 1)
  const branchOptions = [{ id: null as number | null, branch_name: "الكل" }, ...activeBranches]
  const [deletingWorkflow, setDeletingWorkflow] = useState<TaskWorkflow | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  // "القسم" في تعريف الخطوة يُعرَض من تعريفات الأقسام (departments) مباشرة لا من قائمة "الأقسام"
  // المحلية (task_sections) — لكن القيمة الفعلية المخزَّنة تبقى معرّف قسم تتبع أوامر العمل
  // (section_id، وهو ما يحمل الأعضاء الفعليين لتوجيه/إشعار المهام)، فيُطابَق كل تعريف قسم نشِط
  // باسمه مع قسم تتبع أوامر عمل مطابق؛ تعريف بلا قسم مطابق يُستبعد من القائمة (يجب إنشاء قسم له
  // أولاً من تبويب "الأقسام").
  const departmentSectionOptions = departments
    .filter((d) => d.is_active)
    .map((d) => {
      const matchedSection = sections.find((s) => s.name === d.department_name)
      return matchedSection ? { id: matchedSection.id, department_name: d.department_name } : null
    })
    .filter((d): d is { id: number; department_name: string } => d !== null)

  // أصناف من النوع 1 فقط (الأصناف الفعلية لا الخدمات) — تُستخدم في مُتعدِّد الاختيار لسير عمل
  // "لصنف معين". تُجلَب مرة واحدة عند فتح هذا التبويب.
  useEffect(() => {
    fetch("/api/inventory/products?type=1&activeOnly=true")
      .then((res) => res.json())
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => setProducts([]))
  }, [])

  useEffect(() => {
    if (selectedWorkflow) {
      setEditSteps(selectedWorkflow.steps.map(stepToEditable))
      setEditTransitions(selectedWorkflow.transitions.map((t) => transitionToEditable(t, selectedWorkflow.steps)))
    } else {
      setEditSteps([])
      setEditTransitions([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkflowId])

  const handleGroupSelect = (group: ItemGroupRecord) => {
    setGroupId(group.id)
    setGroupCode(`${group.group_code} - ${group.group_name}`)
  }

  const resetForm = () => {
    setEditingId(null)
    setName("")
    setType("general")
    setGroupCode("")
    setGroupId(null)
    setItemIds([])
    setBranchId(null)
  }

  const openCreateForm = () => {
    resetForm()
    setFormOpen(true)
  }

  const openEditForm = (w: TaskWorkflow) => {
    setEditingId(w.id)
    setName(w.name)
    setType(w.type)
    setGroupId(w.group_id ?? null)
    setGroupCode(w.group_name || "")
    setItemIds(w.item_ids || [])
    setBranchId(w.branch_id ?? null)
    setFormOpen(true)
  }

  const saveWorkflow = async () => {
    if (!name.trim() || !userId) return
    if (type === "group" && !groupId) {
      toast({ title: "مطلوب", description: "يجب تحديد مجموعة الصنف", variant: "destructive" })
      groupInputRef.current?.focus()
      return
    }
    if (type === "specific" && itemIds.length === 0) {
      toast({ title: "مطلوب", description: "يجب اختيار صنف واحد على الأقل", variant: "destructive" })
      return
    }
    setBusy(true)
    try {
      const payload = {
        userId,
        name,
        type,
        group_id: type === "group" ? groupId : null,
        item_ids: type === "specific" ? itemIds : [],
        branch_id: branchId,
      }
      const res = await fetch(editingId ? `/api/task-orders/workflows/${editingId}` : "/api/task-orders/workflows", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error)
      // يُتابَع تحديداً بعد التعديل — لو كان السير الذي عُدِّل هو المختار حالياً لعرض خطواته، يبقى
      // معروضاً بعد الحفظ بدل أن يختفي فجأة (حالة النسخ لإصدار جديد تُغيّر المعرّف الفعلي).
      if (editingId && selectedWorkflowId === editingId) setSelectedWorkflowId(data.id)
      resetForm()
      setFormOpen(false)
      onChanged()
    } catch (error: any) {
      toast({ title: editingId ? "تعذّر التعديل" : "تعذّر الإنشاء", description: error?.message, variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  const addStep = () => {
    setEditSteps((steps) => [
      ...steps,
      {
        key: newStepKey(),
        label: "",
        section_id: "",
        assignment_type: "all",
        assigned_user_id: "",
        sla_hours: "",
        is_conditional: false,
        sla_actions: [],
      },
    ])
  }
  const updateStep = (index: number, patch: Partial<EditableStep>) => {
    setEditSteps((steps) => steps.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }
  const removeStep = (index: number) => {
    const removedKey = editSteps[index].key
    setEditSteps((steps) => steps.filter((_, i) => i !== index))
    setEditTransitions((ts) => ts.filter((t) => t.from_key !== removedKey && t.to_key !== removedKey))
  }

  const addTransition = () => {
    if (editSteps.length < 2) return
    setEditTransitions((ts) => [...ts, { from_key: editSteps[0].key, to_key: editSteps[1].key }])
  }
  const updateTransition = (index: number, patch: Partial<EditableTransition>) => {
    setEditTransitions((ts) => ts.map((t, i) => (i === index ? { ...t, ...patch } : t)))
  }
  const removeTransition = (index: number) => {
    setEditTransitions((ts) => ts.filter((_, i) => i !== index))
  }

  const saveSteps = async () => {
    if (!selectedWorkflow || !userId) return
    if (editSteps.some((s) => !s.label.trim() || !s.section_id)) {
      toast({ title: "بيانات ناقصة", description: "لكل خطوة تسمية وقسم مطلوبان", variant: "destructive" })
      return
    }
    if (editSteps.some((s) => s.sla_hours && (Number(s.sla_hours) < 0 || Number(s.sla_hours) > 999))) {
      toast({ title: "بيانات غير صالحة", description: "مدة العمل المتوقعة يجب أن تكون رقماً بين 0 و999", variant: "destructive" })
      return
    }
    if (editSteps.some((s) => s.assignment_type === "specific" && !s.assigned_user_id)) {
      toast({ title: "بيانات ناقصة", description: "يجب اختيار المستخدم عند تحديد ل مستخدم معين", variant: "destructive" })
      return
    }
    setSavingSteps(true)
    try {
      const res = await fetch(`/api/task-orders/workflows/${selectedWorkflow.id}/steps`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          steps: editSteps.map((s) => ({
            key: s.key,
            label: s.label,
            section_id: Number(s.section_id),
            assignment_type: s.assignment_type,
            assigned_user_id: s.assignment_type === "specific" ? s.assigned_user_id || null : null,
            sla_hours: s.sla_hours ? Number(s.sla_hours) : null,
            is_conditional: s.is_conditional,
            sla_actions: s.sla_actions,
          })),
          transitions: editTransitions.map((t) => ({
            from_key: t.from_key,
            to_key: t.to_key,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error)
      // نسخ لإصدار جديد (السير مُستخدَم فعلاً) يُغيّر المعرّف الفعلي — يُتابَع هنا حتى يبقى نفس
      // السير معروضاً بخطواته المحفوظة للتو بدل الاختفاء المفاجئ خلف الإصدار القديم "قديم".
      setSelectedWorkflowId(data.id)
      toast({ title: "تم", description: "تم حفظ خطوات سير العمل" })
      onChanged()
    } catch (error: any) {
      toast({ title: "تعذّر الحفظ", description: error?.message, variant: "destructive" })
    } finally {
      setSavingSteps(false)
    }
  }

  const confirmDeleteWorkflow = async () => {
    if (!deletingWorkflow || !userId) return
    setDeletingBusy(true)
    try {
      const res = await fetch(`/api/task-orders/workflows/${deletingWorkflow.id}?userId=${encodeURIComponent(userId)}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error)
      if (selectedWorkflowId === deletingWorkflow.id) setSelectedWorkflowId(null)
      setDeletingWorkflow(null)
      onChanged()
    } catch (error: any) {
      toast({ title: "تعذّر الحذف", description: error?.message, variant: "destructive" })
    } finally {
      setDeletingBusy(false)
    }
  }

  return (
    <div className="grid w-full gap-4 lg:grid-cols-[460px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">سير العمل</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!formOpen && (
            <Button onClick={openCreateForm} className="w-full gap-1">
              <Plus className="h-4 w-4" /> جديد
            </Button>
          )}

          {formOpen && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <Input placeholder="اسم سير العمل" value={name} onChange={(e) => setName(e.target.value)} />
              <div className="invoice-currency-dropdown-wrap w-full">
                <PrimeDropdown
                  value={type}
                  options={[
                    { value: "general", label: "عام" },
                    { value: "group", label: "حسب مجموعة صنف" },
                    { value: "specific", label: "لصنف معين" },
                  ]}
                  optionLabel="label"
                  optionValue="value"
                  className="invoice-currency-dropdown w-full"
                  panelClassName="invoice-currency-dropdown-panel"
                  appendTo="self"
                  onChange={(e: any) => setType(e.value)}
                />
              </div>
              <div className="invoice-currency-dropdown-wrap w-full">
                <PrimeDropdown
                  value={branchId}
                  options={branchOptions}
                  optionLabel="branch_name"
                  optionValue="id"
                  placeholder="الفرع"
                  filter
                  className="invoice-currency-dropdown w-full"
                  panelClassName="invoice-currency-dropdown-panel"
                  appendTo="self"
                  onChange={(e: any) => setBranchId(e.value ?? null)}
                />
              </div>
              {type === "group" && (
                <div className="flex gap-2">
                  <Input
                    ref={groupInputRef}
                    readOnly
                    value={groupCode}
                    onFocus={() => setGroupSearchOpen(true)}
                    placeholder="مجموعة الصنف"
                    className="flex-1 cursor-pointer"
                    onClick={() => setGroupSearchOpen(true)}
                  />
                  <Button type="button" variant="outline" size="icon" onClick={() => setGroupSearchOpen(true)}>
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {type === "specific" && (
                <MultiSelect
                  value={itemIds}
                  options={products}
                  optionLabel="product_name"
                  optionValue="id"
                  filterBy="product_name,product_code"
                  showFilter
                  showMultiSelect
                  maxSelectedLabels={3}
                  selectedItemsLabel="تم تحديد اكثر من 3 عناصر"
                  placeholder="اختر صنفاً واحداً أو أكثر"
                  className="w-full"
                  onChange={(e: any) => setItemIds(Array.isArray(e.value) ? e.value : [])}
                />
              )}
              <div className="flex gap-2">
                <Button onClick={saveWorkflow} disabled={busy || !name.trim()} className="flex-1 gap-1">
                  <Save className="h-4 w-4" /> {editingId ? "حفظ التعديل" : "إضافة سير عمل"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    resetForm()
                    setFormOpen(false)
                  }}
                >
                  إلغاء
                </Button>
              </div>
            </div>
          )}

          <Separator />

          <div className="space-y-1">
            {workflows.map((w) => (
              <div
                key={w.id}
                onClick={() => setSelectedWorkflowId(w.id)}
                className={`w-full cursor-pointer rounded-md border p-2 text-right text-sm ${
                  selectedWorkflowId === w.id ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {w.name} {w.version > 1 ? `v${w.version}` : ""}
                  </span>
                  <div className="flex items-center gap-1">
                    {!w.is_active && (
                      <Badge variant="outline" className="border-slate-300 text-slate-400 text-[10px]">
                        قديم
                      </Badge>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation()
                        openEditForm(w)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeletingWorkflow(w)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-slate-400">
                  {w.type === "specific"
                    ? `أصناف محددة (${w.item_ids?.length || 0})`
                    : w.type === "group"
                    ? `مجموعة: ${w.group_name || w.group_id || "-"}`
                    : "عام"}{" "}
                  · {w.branch_name || "كل الفروع"} · {w.steps.length} خطوات · {w.usage_count} صنف
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedWorkflow && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">خطوات "{selectedWorkflow.name}"</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedWorkflow.usage_count > 0 && (
              <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-700">
                يوجد {selectedWorkflow.usage_count} صنف يستخدم هذا الإصدار — الحفظ سيُنشئ إصداراً جديداً دون التأثير على الأصناف الجارية.
              </p>
            )}
            {!selectedWorkflow.is_active && <p className="rounded-md bg-slate-100 p-2 text-xs text-slate-500">هذا إصدار قديم غير نشِط — للعرض فقط.</p>}

            <div className="space-y-3">
              {editSteps.map((step, index) => (
                <div key={step.key} className="space-y-3 rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center gap-2">
                    <Input className="flex-1" placeholder="تسمية الخطوة" value={step.label} onChange={(e) => updateStep(index, { label: e.target.value })} />
                    <Button size="icon" variant="ghost" onClick={() => removeStep(index)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">القسم</Label>
                      <div className="invoice-currency-dropdown-wrap">
                        <PrimeDropdown
                          value={step.section_id ? Number(step.section_id) : null}
                          options={departmentSectionOptions}
                          optionLabel="department_name"
                          optionValue="id"
                          placeholder="القسم"
                          filter
                          className="invoice-currency-dropdown w-full"
                          panelClassName="invoice-currency-dropdown-panel"
                          appendTo="self"
                          onChange={(e: any) => updateStep(index, { section_id: e.value != null ? String(e.value) : "" })}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">تحديد ل</Label>
                      <div className="invoice-currency-dropdown-wrap">
                        <PrimeDropdown
                          value={step.assignment_type}
                          options={[
                            { value: "all", label: "كل القسم" },
                            { value: "specific", label: "مستخدم محدد" },
                          ]}
                          optionLabel="label"
                          optionValue="value"
                          className="invoice-currency-dropdown w-full"
                          panelClassName="invoice-currency-dropdown-panel"
                          appendTo="self"
                          onChange={(e: any) => updateStep(index, { assignment_type: e.value })}
                        />
                      </div>
                    </div>

                    {step.assignment_type === "specific" && (
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-500">المستخدم</Label>
                        <div className="invoice-currency-dropdown-wrap">
                          <PrimeDropdown
                            value={step.assigned_user_id || null}
                            options={users}
                            optionLabel="full_name"
                            optionValue="user_id"
                            placeholder="المستخدم"
                            filter
                            className="invoice-currency-dropdown w-full"
                            panelClassName="invoice-currency-dropdown-panel"
                            appendTo="self"
                            onChange={(e: any) => updateStep(index, { assigned_user_id: e.value || "" })}
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">مدة العمل المتوقعة</Label>
                      <Input
                        type="number"
                        min={0}
                        max={999}
                        placeholder="ساعة"
                        value={step.sla_hours}
                        onChange={(e) => {
                          const raw = e.target.value
                          if (raw !== "" && Number(raw) > 999) return
                          updateStep(index, { sla_hours: raw })
                        }}
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                      <Label className="text-xs text-slate-500">عند تجاوز مدة العمل المتوقعة</Label>
                      <MultiSelect
                        value={step.sla_actions}
                        options={SLA_ACTION_OPTIONS}
                        optionLabel="label"
                        optionValue="value"
                        showFilter
                        showMultiSelect
                        maxSelectedLabels={3}
                        selectedItemsLabel="تم تحديد اكثر من 3 عناصر"
                        placeholder="لا شيء"
                        className="w-full"
                        onChange={(e: any) => updateStep(index, { sla_actions: Array.isArray(e.value) ? e.value : [] })}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                    <label className="flex items-center gap-1">
                      <Checkbox checked={step.is_conditional} onCheckedChange={(c) => updateStep(index, { is_conditional: !!c })} /> مرحلة شرطية
                    </label>
                  </div>
                </div>
              ))}
              <Button
                onClick={addStep}
                className="w-full gap-1.5 bg-emerald-600 py-5 text-base font-semibold text-white shadow-md hover:bg-emerald-700"
              >
                <Plus className="h-5 w-5" /> إضافة خطوة
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-600">الانتقالات (من ← إلى)</div>
              {editTransitions.map((t, index) => (
                <div key={index} className="flex items-center gap-2 rounded-md border border-slate-200 p-2">
                  <div className="invoice-currency-dropdown-wrap flex-1 space-y-1">
                    <Label className="text-xs text-slate-500">من خطوة</Label>
                    <PrimeDropdown
                      value={t.from_key || null}
                      options={editSteps.map((s) => ({ key: s.key, label: s.label || s.key }))}
                      optionLabel="label"
                      optionValue="key"
                      placeholder="من خطوة"
                      className="invoice-currency-dropdown w-full"
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                      onChange={(e: any) => updateTransition(index, { from_key: e.value || "" })}
                    />
                  </div>
                  <span className="mt-5 text-slate-400">←</span>
                  <div className="invoice-currency-dropdown-wrap flex-1 space-y-1">
                    <Label className="text-xs text-slate-500">إلى خطوة</Label>
                    <PrimeDropdown
                      value={t.to_key || null}
                      options={editSteps.map((s) => ({ key: s.key, label: s.label || s.key }))}
                      optionLabel="label"
                      optionValue="key"
                      placeholder="إلى خطوة"
                      className="invoice-currency-dropdown w-full"
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                      onChange={(e: any) => updateTransition(index, { to_key: e.value || "" })}
                    />
                  </div>
                  <Button size="icon" variant="ghost" className="mt-5" onClick={() => removeTransition(index)}>
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              ))}
              <Button
                onClick={addTransition}
                disabled={editSteps.length < 2}
                className="w-full gap-1.5 bg-blue-600 py-5 text-base font-semibold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
              >
                <Plus className="h-5 w-5" /> إضافة انتقال
              </Button>
              <p className="text-[11px] text-slate-400">كل الانتقالات غير مشروطة الآن. أكثر من انتقال خارج من نفس الخطوة = تفرّع متوازٍ.</p>
            </div>

            <Button onClick={saveSteps} disabled={savingSteps || editSteps.length === 0} className="gap-1">
              <Save className="h-4 w-4" /> حفظ الخطوات والانتقالات
            </Button>
          </CardContent>
        </Card>
      )}

      <ItemGroupSearch open={groupSearchOpen} onOpenChange={setGroupSearchOpen} onSelect={handleGroupSelect} />

      <ConfirmDialogYesNo
        visible={!!deletingWorkflow}
        message={`هل انت متاكد من حذف سير العمل "${deletingWorkflow?.name}"؟`}
        onConfirm={confirmDeleteWorkflow}
        onCancel={() => setDeletingWorkflow(null)}
      />
    </div>
  )
}
