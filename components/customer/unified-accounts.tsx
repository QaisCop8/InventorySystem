"use client"

import { useEffect, useMemo, useState } from "react"
import { Plus, RefreshCw } from "lucide-react"
import DataGridView from "@/components/common/DataGridView"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface AccountType {
  id: number
  name: string
}

interface AccountItem {
  id: number
  account_code?: string
  name: string
  classification_type_id: number
  classification_type_name: string
  status: number
  status_label: string
  parent_account_id?: number
  parent_account_name?: string
  opening_balance?: number
  description?: string
  created_at: string
  updated_at: string
}

export default function UnifiedAccounts() {
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [types, setTypes] = useState<AccountType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [search, setSearch] = useState("")
  const [accountCode, setAccountCode] = useState("")
  const [name, setName] = useState("")
  const [classificationTypeId, setClassificationTypeId] = useState<string>("")
  const [status, setStatus] = useState<string>("1")
  const [parentAccountId, setParentAccountId] = useState<string>("")
  const [openingBalance, setOpeningBalance] = useState<string>("0")
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
        fetch("/api/account-classifications"),
      ])

      if (!typesResponse.ok || !accountsResponse.ok) {
        setError("حدث خطأ أثناء تحميل بيانات الحسابات")
        return
      }

      const typesData = await typesResponse.json()
      const accountsData = await accountsResponse.json()

      setTypes(typesData || [])
      setAccounts(
        (accountsData || []).map((item: any) => ({
          ...item,
          status_label: item.status === 1 ? "نشط" : "موقوف",
          opening_balance: Number(item.opening_balance ?? 0),
          account_code: item.account_code || "",
          description: item.description || "",
          parent_account_id: item.parent_account_id,
          parent_account_name: item.parent_account_name || "",
        })),
      )

      if (!classificationTypeId && Array.isArray(typesData) && typesData.length) {
        setClassificationTypeId(String(typesData[0].id))
      }
    } catch (err) {
      console.error(err)
      setError("حدث خطأ أثناء تحميل بيانات الحسابات")
    } finally {
      setLoading(false)
    }
  }

  const accountScheme = useMemo(
    () => ({
      name: "AccountsScheme",
      columns: [
        { header: "رقم", name: "id", width: 70, isReadOnly: true },
        { header: "كود الحساب", name: "account_code", width: 120, isReadOnly: true },
        { header: "اسم الحساب", name: "name", width: 240, isReadOnly: true },
        { header: "نوع الحساب", name: "classification_type_name", width: 180, isReadOnly: true },
        { header: "الرصيد الافتتاحي", name: "opening_balance", width: 140, isReadOnly: true },
        { header: "الحالة", name: "status_label", width: 100, isReadOnly: true },
      ],
    }),
    [],
  )

  const filteredAccounts = useMemo(() => {
    if (!search) return accounts
    const term = search.trim().toLowerCase()
    return accounts.filter((account) => {
      return (
        account.name.toLowerCase().includes(term) ||
        account.account_code?.toLowerCase().includes(term) ||
        account.classification_type_name.toLowerCase().includes(term) ||
        account.status_label.toLowerCase().includes(term) ||
        account.opening_balance?.toString().includes(term) ||
        account.parent_account_name?.toLowerCase().includes(term)
      )
    })
  }, [accounts, search])

  const handleCreateAccount = async () => {
    setError("")
    setMessage("")

    if (!name.trim() || !classificationTypeId) {
      setError("يرجى إدخال اسم الحساب واختيار نوع الحساب")
      return
    }

    const parentAccountIdNumber = parentAccountId && parentAccountId !== "none" ? Number(parentAccountId) : null
    const balanceValue = Number(openingBalance || 0)

    try {
      const response = await fetch("/api/account-classifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_code: accountCode.trim() || null,
          name: name.trim(),
          classification_type_id: Number(classificationTypeId),
          status: Number(status),
          parent_account_id: parentAccountIdNumber,
          opening_balance: isNaN(balanceValue) ? 0 : balanceValue,
          description: description.trim() || null,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || "حدث خطأ أثناء إنشاء الحساب")
        return
      }

      setAccountCode("")
      setName("")
      setStatus("1")
      setParentAccountId("")
      setOpeningBalance("0")
      setDescription("")
      setMessage("تم إنشاء الحساب بنجاح")
      await loadData()
    } catch (err) {
      console.error(err)
      setError("حدث خطأ أثناء إنشاء الحساب")
    }
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>قائمة الحسابات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex-1">
                <Label htmlFor="account-search" className="mb-2">
                  بحث في الحسابات
                </Label>
                <Input
                  id="account-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="ابحث باسم الحساب أو النوع"
                />
              </div>
              <Button variant="secondary" className="h-11 w-full sm:w-auto" onClick={loadData}>
                <RefreshCw className="mr-2 h-4 w-4" /> تحديث
              </Button>
            </div>

            {error ? (
              <Alert className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {message ? (
              <Alert className="mb-4 border-green-400 bg-green-50 text-green-700">
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            ) : null}

            <div className="h-[460px] min-h-[260px] overflow-hidden rounded-md border border-muted">
              <DataGridView scheme={accountScheme} dataSource={filteredAccounts} />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>إضافة حساب جديد</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="account-code" className="mb-2 block">
                  كود الحساب
                </Label>
                <Input
                  id="account-code"
                  value={accountCode}
                  onChange={(event) => setAccountCode(event.target.value)}
                  placeholder="كود اختياري"
                />
              </div>

              <div>
                <Label htmlFor="account-name" className="mb-2 block">
                  اسم الحساب
                </Label>
                <Input
                  id="account-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="أدخل اسم الحساب"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="account-type" className="mb-2 block">
                  نوع الحساب
                </Label>
                <Select value={classificationTypeId} onValueChange={setClassificationTypeId}>
                  <SelectTrigger id="account-type" className="w-full">
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
                  حالة الحساب
                </Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="account-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">نشط</SelectItem>
                    <SelectItem value="2">موقوف</SelectItem>
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
                  <SelectTrigger id="parent-account" className="w-full">
                    <SelectValue placeholder="اختيار حساب رئيسي" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون حساب رئيسي</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={String(account.id)}>
                        {account.account_code ? `${account.account_code} - ${account.name}` : account.name}
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
                  onChange={(event) => setOpeningBalance(event.target.value)}
                  placeholder="0"
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
                onChange={(event) => setDescription(event.target.value)}
                className="h-24"
                placeholder="أدخل ملاحظات إضافية"
              />
            </div>

            <Button className="w-full" onClick={handleCreateAccount}>
              <Plus className="mr-2 h-4 w-4" /> إضافة حساب
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
