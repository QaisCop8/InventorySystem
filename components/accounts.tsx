"use client"

import { useEffect, useMemo, useState } from "react"
import { Plus, RefreshCw } from "lucide-react"
import DataGridView from "@/components/common/DataGridView"
import UnifiedAccounts from "@/components/customer/unified-accounts-refactored"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Textarea } from "@/components/ui/textarea"

interface AccountType {
  id: number
  name: string
}

interface Account {
  id: number
  code: string
  name: string
  name_lang2?: string | null
  type?: number | null
  type_name?: string
  father_id?: number | null
  level_no: number
  finanical_list_id: number
  currency_id?: number | null
  allow_trans_with_diff_curr: boolean
  iscalc_curr_diff_rates: boolean
  transaction_type: number
  max_transaction_amount: number
  max_balance_amount: number
  notes?: string | null
  status: string
}

interface FormState {
  code: string
  name: string
  name_lang2: string
  type: string
  father_id: string
  level_no: string
  finanical_list_id: string
  currency_id: string
  allow_trans_with_diff_curr: boolean
  iscalc_curr_diff_rates: boolean
  transaction_type: string
  max_transaction_amount: string
  max_balance_amount: string
  notes: string
  status: string
}

export default function Accounts() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [showUnifiedPopup, setShowUnifiedPopup] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [types, setTypes] = useState<AccountType[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [editingId, setEditingId] = useState<number | null>(null)
  const [search, setSearch] = useState("")
  const [filterType, setFilterType] = useState("")
  const [filterStatus, setFilterStatus] = useState("")

  const [formData, setFormData] = useState<FormState>({
    code: "",
    name: "",
    name_lang2: "",
    type: "",
    father_id: "",
    level_no: "1",
    finanical_list_id: "1",
    currency_id: "",
    allow_trans_with_diff_curr: false,
    iscalc_curr_diff_rates: false,
    transaction_type: "0",
    max_transaction_amount: "0",
    max_balance_amount: "0",
    notes: "",
    status: "نشط",
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError("")
    try {
      const [typesRes, accountsRes] = await Promise.all([
        fetch("/api/account-classification-types"),
        fetch("/api/accounts"),
      ])

      if (!typesRes.ok || !accountsRes.ok) {
        setError("Failed to load data")
        return
      }

      const typesData = await typesRes.json()
      const accountsData = await accountsRes.json()

      setTypes(Array.isArray(typesData) ? typesData : [])
      setAccounts(
        (Array.isArray(accountsData) ? accountsData : []).map((item: any) => ({
          ...item,
          code: item.code || "",
          name: item.name || "",
          type: Number(item.type || 0),
          level_no: Number(item.level_no || 1),
          finanical_list_id: Number(item.finanical_list_id || 1),
        })),
      )
    } catch (err) {
      console.error(err)
      setError("Error loading data")
    } finally {
      setLoading(false)
    }
  }

  const accountScheme = useMemo(
    () => ({
      name: "AccountsScheme",
      columns: [
        { header: "رقم الحساب", name: "code", width: 120, isReadOnly: true },
        { header: "اسم الحساب", name: "name", width: 240, isReadOnly: true },
        { header: "النوع", name: "type_name", width: 180, isReadOnly: true },
        { header: "الحالة", name: "status", width: 100, isReadOnly: true },
      ],
    }),
    [],
  )

  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      const matchSearch =
        !search ||
        account.code.toLowerCase().includes(search.toLowerCase()) ||
        account.name.toLowerCase().includes(search.toLowerCase())
      const matchType = !filterType || account.type === Number(filterType)
      const matchStatus = !filterStatus || account.status === filterStatus
      return matchSearch && matchType && matchStatus
    })
  }, [accounts, search, filterType, filterStatus])

  const stats = useMemo(
    () => [
      { label: "إجمالي الحسابات", value: accounts.length, color: "bg-blue-50" },
      { label: "الحسابات النشطة", value: accounts.filter((item) => item.status === "نشط").length, color: "bg-green-50" },
      { label: "الحسابات الموقوفة", value: accounts.filter((item) => item.status === "موقوف").length, color: "bg-amber-50" },
      { label: "إجمالي الحسابات", value: accounts.length, color: "bg-slate-50" },
    ],
    [accounts],
  )

  const resetForm = () => {
    setFormData({
      code: "",
      name: "",
      name_lang2: "",
      type: types[0] ? String(types[0].id) : "",
      father_id: "",
      level_no: "1",
      finanical_list_id: "1",
      currency_id: "",
      allow_trans_with_diff_curr: false,
      iscalc_curr_diff_rates: false,
      transaction_type: "0",
      max_transaction_amount: "0",
      max_balance_amount: "0",
      notes: "",
      status: "نشط",
    })
    setEditingId(null)
  }

  const handleNew = () => {
    // Open unified accounts as a local dialog (like فاتورة جديدة)
    setShowUnifiedPopup(true)
  }

  

  const handleEdit = (account: Account) => {
    setFormData({
      code: account.code || "",
      name: account.name || "",
      name_lang2: account.name_lang2 || "",
      type: String(account.type || ""),
      father_id: account.father_id ? String(account.father_id) : "",
      level_no: String(account.level_no || 1),
      finanical_list_id: String(account.finanical_list_id || 1),
      currency_id: account.currency_id ? String(account.currency_id) : "",
      allow_trans_with_diff_curr: Boolean(account.allow_trans_with_diff_curr),
      iscalc_curr_diff_rates: Boolean(account.iscalc_curr_diff_rates),
      transaction_type: String(account.transaction_type || 0),
      max_transaction_amount: String(account.max_transaction_amount || 0),
      max_balance_amount: String(account.max_balance_amount || 0),
      notes: account.notes || "",
      status: account.status || "نشط",
    })
    setEditingId(account.id)
    setError("")
    setMessage("")
    setDialogOpen(true)
  }

  const handleSave = async () => {
    setError("")
    setMessage("")

    if (!formData.code.trim() || !formData.name.trim()) {
      setError("Code and Name are required")
      return
    }

    try {
      setSaving(true)
      const isEdit = editingId != null
      const url = isEdit ? `/api/accounts/${editingId}` : "/api/accounts"
      const method = isEdit ? "PUT" : "POST"

      const payload = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        name_lang2: formData.name_lang2.trim() || null,
        type: formData.type ? Number(formData.type) : null,
        father_id: formData.father_id ? Number(formData.father_id) : null,
        level_no: Number(formData.level_no || 1),
        finanical_list_id: Number(formData.finanical_list_id || 1),
        currency_id: formData.currency_id ? Number(formData.currency_id) : null,
        allow_trans_with_diff_curr: formData.allow_trans_with_diff_curr,
        iscalc_curr_diff_rates: formData.iscalc_curr_diff_rates,
        transaction_type: Number(formData.transaction_type || 0),
        max_transaction_amount: Number(formData.max_transaction_amount || 0),
        max_balance_amount: Number(formData.max_balance_amount || 0),
        notes: formData.notes.trim() || null,
        status: formData.status,
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || "Failed to save account")
        return
      }

      setMessage(isEdit ? "تم تعديل الحساب بنجاح" : "تم إنشاء الحساب بنجاح")
      setDialogOpen(false)
      await loadData()
    } catch (err) {
      console.error(err)
      setError("Error saving account")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm("هل أنت متأكد من حذف الحساب؟")) return

    try {
      const response = await fetch(`/api/accounts/${id}`, { method: "DELETE" })
      if (!response.ok) {
        setError("Failed to delete account")
        return
      }
      setMessage("تم حذف الحساب بنجاح")
      await loadData()
    } catch (err) {
      console.error(err)
      setError("Error deleting account")
    }
  }

  if (loading) {
    return <div className="p-6 text-center">جاري التحميل...</div>
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-4 lg:p-6" dir="rtl">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 rounded-xl border bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-muted-foreground">نظام الحسابات</p>
            <h2 className="text-2xl font-semibold">إدارة الحسابات</h2>
            <p className="text-sm text-muted-foreground">إدارة الحسابات المحاسبية وتصنيفاتها</p>
          </div>
          <Button className="h-11 gap-2" onClick={handleNew}>
            <Plus className="h-4 w-4" /> إضافة حساب
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} className={stat.color}>
              <CardContent className="p-6 text-right">
                <p className="text-sm font-medium text-slate-600">{stat.label}</p>
                <p className="mt-2 text-3xl font-semibold">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle>{editingId ? "تعديل حساب" : "إضافة حساب محاسبي جديد"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {error && (
                <Alert className="border-red-200 bg-red-50 text-red-900">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {message && (
                <Alert className="border-green-200 bg-green-50 text-green-900">
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <Label className="mb-2 block">كود الحساب</Label>
                  <Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} />
                </div>
                <div>
                  <Label className="mb-2 block">اسم الحساب</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <Label className="mb-2 block">الاسم بلغة أخرى</Label>
                  <Input value={formData.name_lang2} onChange={(e) => setFormData({ ...formData, name_lang2: e.target.value })} />
                </div>
                <div>
                  <Label className="mb-2 block">نوع الحساب</Label>
                  <Select value={formData.type} onValueChange={(val) => setFormData({ ...formData, type: val })}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر نوع الحساب" />
                    </SelectTrigger>
                    <SelectContent>
                      {types.map((type) => (
                        <SelectItem key={type.id} value={String(type.id)}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="mb-2 block">ملاحظات</Label>
                <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="h-24" />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                إلغاء
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "جاري الحفظ..." : "حفظ الحساب"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Search & Filters */}
        <Card>
          <CardHeader>
            <CardTitle>قائمة الحسابات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label className="mb-2 block text-sm">اسم الحساب</Label>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث برقم أو اسم الحساب" className="h-10" />
              </div>
              <div>
                <Label className="mb-2 block text-sm">النوع</Label>
                <Select
                  value={filterType || "__all_types__"}
                  onValueChange={(value) => setFilterType(value === "__all_types__" ? "" : value)}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="كل الأنواع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all_types__">كل الأنواع</SelectItem>
                    {types.map((type) => (
                      <SelectItem key={type.id} value={String(type.id)}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block text-sm">الحالة</Label>
                <Select
                  value={filterStatus || "__all_statuses__"}
                  onValueChange={(value) => setFilterStatus(value === "__all_statuses__" ? "" : value)}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="كل الحالات" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all_statuses__">كل الحالات</SelectItem>
                    <SelectItem value="نشط">نشط</SelectItem>
                    <SelectItem value="موقوف">موقوف</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button variant="secondary" className="h-10 w-full" onClick={loadData}>
                  <RefreshCw className="mr-2 h-4 w-4" /> تحديث
                </Button>
              </div>
            </div>

            {error && (
              <Alert className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {message && (
              <Alert className="mb-4 border-green-400 bg-green-50 text-green-700">
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}

            {/* Table */}
            <div className="h-[520px] min-h-[260px] overflow-hidden rounded-md border border-muted">
              <DataGridView scheme={accountScheme} dataSource={filteredAccounts} />
            </div>
          </CardContent>
        </Card>
        {/* Unified accounts opened as local popup (like فاتورة جديدة) */}
        <Dialog open={showUnifiedPopup} onOpenChange={setShowUnifiedPopup}>
          <DialogContent className="w-full max-w-[95vw] sm:max-w-[90vw] md:max-w-[85vw] lg:max-w-[100vh] h-[95vh] max-h-[95vh] p-0 gap-0 flex flex-col overflow-hidden" dir="rtl">
            {showUnifiedPopup && (
              <UnifiedAccounts action="new" inWindowManager closeWindow={() => setShowUnifiedPopup(false)} />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
