"use client"

import { useEffect, useMemo, useState } from "react"
import { Plus, RefreshCw, Trash2, Edit } from "lucide-react"
import DataGridView from "@/components/common/DataGridView"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

interface AccountType {
  id: number
  name: string
}

interface AccountItem {
  id: number
  account_code: string
  account_name: string
  classification_type_id: number
  classification_type_name: string
  parent_account_id?: number
  parent_account_name?: string
  opening_balance: number
  debit_amount: number
  credit_amount: number
  balance: number
  status: string
  description?: string
  created_at: string
  updated_at: string
}

export default function Accounts() {
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [types, setTypes] = useState<AccountType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)

  // Form fields
  const [accountCode, setAccountCode] = useState("")
  const [accountName, setAccountName] = useState("")
  const [classificationTypeId, setClassificationTypeId] = useState<string>("")
  const [parentAccountId, setParentAccountId] = useState<string>("none")
  const [openingBalance, setOpeningBalance] = useState<string>("0")
  const [status, setStatus] = useState<string>("نشط")
  const [description, setDescription] = useState<string>("")

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError("")
    setMessage("")

    try {
      const [typesResponse, accountsResponse] = await Promise.all([
        fetch("/api/account-classification-types"),
        fetch("/api/accounts"),
      ])

      if (!typesResponse.ok || !accountsResponse.ok) {
        setError("حدث خطأ أثناء تحميل البيانات")
        return
      }

      const typesData = await typesResponse.json()
      const accountsData = await accountsResponse.json()

      setTypes(typesData || [])
      setAccounts(accountsData || [])

      if (!classificationTypeId && Array.isArray(typesData) && typesData.length) {
        setClassificationTypeId(String(typesData[0].id))
      }
    } catch (err) {
      console.error(err)
      setError("حدث خطأ أثناء تحميل البيانات")
    } finally {
      setLoading(false)
    }
  }

  const accountScheme = useMemo(
    () => ({
      name: "AccountsScheme",
      columns: [
        { header: "رقم الحساب", name: "account_code", width: 120, isReadOnly: true },
        { header: "اسم الحساب", name: "account_name", width: 200, isReadOnly: true },
        { header: "النوع", name: "classification_type_name", width: 140, isReadOnly: true },
        { header: "الرصيد", name: "balance", width: 120, isReadOnly: true },
        { header: "المدين", name: "debit_amount", width: 120, isReadOnly: true },
        { header: "الدائن", name: "credit_amount", width: 120, isReadOnly: true },
        { header: "الحالة", name: "status", width: 100, isReadOnly: true },
      ],
    }),
    [],
  )

  const filteredAccounts = useMemo(() => {
    if (!search) return accounts
    const term = search.trim().toLowerCase()
    return accounts.filter((account) => {
      return (
        account.account_code.toLowerCase().includes(term) ||
        account.account_name.toLowerCase().includes(term) ||
        account.status.toLowerCase().includes(term)
      )
    })
  }, [accounts, search])

  const handleCreateAccount = async () => {
    setError("")
    setMessage("")

    if (!accountCode.trim() || !accountName.trim() || !classificationTypeId) {
      setError("يرجى إدخال رقم الحساب واسم الحساب واختيار نوع الحساب")
      return
    }

    const parentId = parentAccountId !== "none" ? Number(parentAccountId) : null
    const balanceValue = Number(openingBalance || 0)

    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_code: accountCode.trim(),
          account_name: accountName.trim(),
          classification_type_id: Number(classificationTypeId),
          parent_account_id: parentId,
          opening_balance: isNaN(balanceValue) ? 0 : balanceValue,
          status,
          description: description.trim() || null,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || "حدث خطأ أثناء إنشاء الحساب")
        return
      }

      setAccountCode("")
      setAccountName("")
      setStatus("نشط")
      setParentAccountId("none")
      setOpeningBalance("0")
      setDescription("")
      setMessage("تم إنشاء الحساب بنجاح")
      setDialogOpen(false)
      await loadData()
    } catch (err) {
      console.error(err)
      setError("حدث خطأ أثناء إنشاء الحساب")
    }
  }

  const stats = [
    { label: "إجمالي الحسابات", value: accounts.length, color: "bg-blue-50" },
    { label: "الحسابات النشطة", value: accounts.filter((a) => a.status === "نشط").length, color: "bg-green-50" },
    { label: "إجمالي المدين", value: accounts.reduce((sum, a) => sum + (a.debit_amount || 0), 0).toFixed(2), color: "bg-red-50" },
    { label: "إجمالي الدائن", value: accounts.reduce((sum, a) => sum + (a.credit_amount || 0), 0).toFixed(2), color: "bg-emerald-50" },
  ]

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">الحسابات المحاسبية</h1>
          <p className="text-sm text-muted-foreground">إدارة الحسابات المحاسبية وعرض الأرصدة والحركات</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="h-11 bg-green-600 hover:bg-green-700">
              <Plus className="ml-2 h-4 w-4" /> إضافة حساب
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>إضافة حساب جديد</DialogTitle>
              <DialogDescription>أدخل بيانات الحساب الجديد في النموذج أدناه</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto py-4">
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

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="account-code" className="mb-2 block">
                    رقم الحساب
                  </Label>
                  <Input
                    id="account-code"
                    value={accountCode}
                    onChange={(e) => setAccountCode(e.target.value)}
                    placeholder="مثال: 1000"
                    className="text-right"
                  />
                </div>

                <div>
                  <Label htmlFor="account-name" className="mb-2 block">
                    اسم الحساب
                  </Label>
                  <Input
                    id="account-name"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="اسم الحساب"
                    className="text-right"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="classification-type" className="mb-2 block">
                    نوع الحساب
                  </Label>
                  <Select value={classificationTypeId} onValueChange={setClassificationTypeId}>
                    <SelectTrigger id="classification-type">
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

                <div>
                  <Label htmlFor="account-status" className="mb-2 block">
                    الحالة
                  </Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger id="account-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="نشط">نشط</SelectItem>
                      <SelectItem value="موقوف">موقوف</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="parent-account" className="mb-2 block">
                    الحساب الرئيسي
                  </Label>
                  <Select value={parentAccountId} onValueChange={setParentAccountId}>
                    <SelectTrigger id="parent-account">
                      <SelectValue placeholder="بدون حساب رئيسي" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون حساب رئيسي</SelectItem>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={String(account.id)}>
                          {account.account_code} - {account.account_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="opening-balance" className="mb-2 block">
                    الرصيد الافتتاحي
                  </Label>
                  <Input
                    id="opening-balance"
                    type="number"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    placeholder="0"
                    className="text-right"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="account-description" className="mb-2 block">
                  ملاحظات
                </Label>
                <Textarea
                  id="account-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="أضف ملاحظات إضافية"
                  className="h-24 resize-none text-right"
                />
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  إلغاء
                </Button>
                <Button className="bg-green-600 hover:bg-green-700" onClick={handleCreateAccount}>
                  <Plus className="ml-2 h-4 w-4" /> إضافة الحساب
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {stats.map((stat, index) => (
          <Card key={index} className={`${stat.color}`}>
            <CardContent className="pt-6">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold mt-2">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Accounts Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>قائمة الحسابات</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadData}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Label htmlFor="search" className="mb-2 block">
              بحث في الحسابات
            </Label>
            <Input
              id="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث برقم الحساب أو الاسم"
              className="text-right"
            />
          </div>

          {error && (
            <Alert className="mb-4 border-red-200 bg-red-50 text-red-900">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="h-[500px] border rounded-md overflow-hidden">
            <DataGridView scheme={accountScheme} dataSource={filteredAccounts} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
