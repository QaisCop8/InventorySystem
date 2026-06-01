"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Save, Trash2, Plus, Eye, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
  account_nature?: string
  allowed_ratio?: number
  created_at: string
  updated_at: string
}

interface RelatedAccount {
  id: number
  related_account_id: number
  account_code: string
  account_name: string
  ratio: number
}

export default function UnifiedAccounts() {
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [types, setTypes] = useState<AccountType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedAccount, setSelectedAccount] = useState<AccountItem | null>(null)
  const [relatedAccounts, setRelatedAccounts] = useState<RelatedAccount[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)

  const [accountCode, setAccountCode] = useState("")
  const [accountName, setAccountName] = useState("")
  const [classificationTypeId, setClassificationTypeId] = useState<string>("")
  const [accountNature, setAccountNature] = useState<string>("")
  const [status, setStatus] = useState<string>("نشط")
  const [parentAccountId, setParentAccountId] = useState<string>("none")
  const [openingBalance, setOpeningBalance] = useState<string>("0")
  const [allowedRatio, setAllowedRatio] = useState<string>("0")
  const [description, setDescription] = useState<string>("")

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError("")
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
      setAccounts(
        (accountsData || []).map((item: any) => ({
          ...item,
          account_code: String(item.account_code || ""),
          account_name: String(item.account_name || ""),
          classification_type_name: String(item.classification_type_name || ""),
          parent_account_name: String(item.parent_account_name || ""),
          opening_balance: Number(item.opening_balance ?? 0),
          debit_amount: Number(item.debit_amount ?? 0),
          credit_amount: Number(item.credit_amount ?? 0),
          balance: Number(item.balance ?? 0),
          status: String(item.status || "نشط"),
          account_nature: item.account_nature || "",
          allowed_ratio: Number(item.allowed_ratio ?? 0),
          description: item.description || "",
          created_at: item.created_at || "",
          updated_at: item.updated_at || "",
        })),
      )
    } catch (err) {
      console.error(err)
      setError("حدث خطأ أثناء تحميل البيانات")
    } finally {
      setLoading(false)
    }
  }

  const currentAccount = useMemo(() => {
    return accounts[currentIndex] || null
  }, [accounts, currentIndex])

  const handleSelectAccount = (account: AccountItem) => {
    setSelectedAccount(account)
    setCurrentIndex(accounts.findIndex((a) => a.id === account.id))
    setEditMode(false)
    loadAccountData(account)
  }

  const loadAccountData = (account: AccountItem) => {
    setAccountCode(account.account_code)
    setAccountName(account.account_name)
    setClassificationTypeId(String(account.classification_type_id))
    setAccountNature(account.account_nature || "")
    setStatus(account.status)
    setParentAccountId(account.parent_account_id ? String(account.parent_account_id) : "none")
    setOpeningBalance(String(account.opening_balance))
    setAllowedRatio(String(account.allowed_ratio))
    setDescription(account.description || "")
  }

  const handleNext = () => {
    if (currentIndex < accounts.length - 1) {
      const nextAccount = accounts[currentIndex + 1]
      handleSelectAccount(nextAccount)
    }
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      const prevAccount = accounts[currentIndex - 1]
      handleSelectAccount(prevAccount)
    }
  }

  const handleSave = async () => {
    setError("")
    setMessage("")

    if (!accountCode.trim() || !accountName.trim()) {
      setError("يرجى إدخال كود الحساب واسم الحساب")
      return
    }

    try {
      const url = editMode && currentAccount
        ? `/api/accounts/${currentAccount.id}`
        : "/api/accounts"
      
      const method = editMode ? "PATCH" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_code: accountCode.trim(),
          account_name: accountName.trim(),
          classification_type_id: Number(classificationTypeId),
          account_nature: accountNature.trim() || null,
          parent_account_id: parentAccountId !== "none" ? Number(parentAccountId) : null,
          opening_balance: Number(openingBalance || 0),
          status,
          allowed_ratio: Number(allowedRatio || 0),
          description: description.trim() || null,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || "حدث خطأ أثناء الحفظ")
        return
      }

      setMessage(editMode ? "تم تحديث الحساب بنجاح" : "تم حفظ الحساب بنجاح")
      setEditMode(false)
      await loadData()
      if (!editMode) {
        setAccountCode("")
        setAccountName("")
        setClassificationTypeId("")
        setAccountNature("")
        setStatus("نشط")
        setParentAccountId("none")
        setOpeningBalance("0")
        setAllowedRatio("0")
        setDescription("")
      }
    } catch (err) {
      console.error(err)
      setError("حدث خطأ أثناء الحفظ")
    }
  }

  const handleDelete = async () => {
    if (!currentAccount) return

    try {
      const response = await fetch(`/api/accounts/${currentAccount.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        setError("فشل حذف الحساب")
        return
      }

      setMessage("تم حذف الحساب بنجاح")
      setDeleteDialogOpen(false)
      await loadData()
      setCurrentIndex(0)
      setSelectedAccount(null)
    } catch (err) {
      console.error(err)
      setError("حدث خطأ أثناء الحذف")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">جاري تحميل البيانات...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 lg:p-6 bg-gradient-to-br from-slate-50 to-blue-50 min-h-screen" dir="rtl">
      {/* Toolbar */}
      <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevious}
                disabled={currentIndex === 0 || accounts.length === 0}
              >
                <ChevronRight className="h-4 w-4" />
                السابق
              </Button>
              
              <span className="px-4 py-2 text-sm font-medium text-slate-600">
                {accounts.length > 0 ? `${currentIndex + 1} / ${accounts.length}` : "لا توجد حسابات"}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={handleNext}
                disabled={currentIndex === accounts.length - 1 || accounts.length === 0}
              >
                التالي
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Button
                size="sm"
                onClick={handleSave}
                className="bg-green-600 hover:bg-green-700"
                disabled={!selectedAccount && !editMode}
              >
                <Save className="h-4 w-4 ml-2" />
                حفظ
              </Button>

              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={!currentAccount}
              >
                <Trash2 className="h-4 w-4 ml-2" />
                حذف
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditMode(!editMode)}
                disabled={!currentAccount}
              >
                {editMode ? "إلغاء" : "تحرير"}
              </Button>

              <Button
                size="sm"
                onClick={() => {
                  setAccountCode("")
                  setAccountName("")
                  setClassificationTypeId("")
                  setAccountNature("")
                  setStatus("نشط")
                  setParentAccountId("none")
                  setOpeningBalance("0")
                  setAllowedRatio("0")
                  setDescription("")
                  setSelectedAccount(null)
                  setEditMode(true)
                }}
              >
                <Plus className="h-4 w-4 ml-2" />
                جديد
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        {/* Accounts List */}
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg h-fit">
          <CardHeader>
            <CardTitle className="text-base">قائمة الحسابات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {accounts.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">لا توجد حسابات</p>
              ) : (
                accounts.map((account) => (
                  <div
                    key={account.id}
                    onClick={() => handleSelectAccount(account)}
                    className={`p-3 rounded-lg cursor-pointer transition-all text-right ${
                      selectedAccount?.id === account.id
                        ? "bg-blue-100 border border-blue-400"
                        : "bg-slate-100 hover:bg-slate-200"
                    }`}
                  >
                    <div className="font-semibold text-sm">{account.account_code}</div>
                    <div className="text-xs text-slate-600">{account.account_name}</div>
                    <Badge className={account.status === "نشط" ? "bg-green-100 text-green-800 mt-1" : "bg-red-100 text-red-800 mt-1"} variant="outline">
                      {account.status}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Account Form */}
        {currentAccount || editMode ? (
          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
            <CardHeader>
              <CardTitle>بيانات الحساب</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="basic" className="space-y-4">
                <TabsList className="w-full justify-start" dir="rtl">
                  <TabsTrigger value="basic">البيانات الأساسية</TabsTrigger>
                  <TabsTrigger value="financial">البيانات المالية</TabsTrigger>
                  <TabsTrigger value="related">الحسابات ذات العلاقة</TabsTrigger>
                  <TabsTrigger value="classification">التصنيف</TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label className="mb-2 block">كود الحساب</Label>
                      <Input
                        value={accountCode}
                        onChange={(e) => setAccountCode(e.target.value)}
                        placeholder="مثال: 1000"
                        disabled={!editMode && currentAccount}
                      />
                    </div>
                    <div>
                      <Label className="mb-2 block">اسم الحساب</Label>
                      <Input
                        value={accountName}
                        onChange={(e) => setAccountName(e.target.value)}
                        placeholder="اسم الحساب"
                        disabled={!editMode && currentAccount}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label className="mb-2 block">نوع الحساب</Label>
                      <Select value={classificationTypeId} onValueChange={setClassificationTypeId} disabled={!editMode && currentAccount}>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر النوع" />
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
                      <Label className="mb-2 block">طبيعة الحساب</Label>
                      <Select value={accountNature} onValueChange={setAccountNature} disabled={!editMode && currentAccount}>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر الطبيعة" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="مدين">مدين</SelectItem>
                          <SelectItem value="دائن">دائن</SelectItem>
                          <SelectItem value="حيادي">حيادي</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="mb-2 block">الحالة</Label>
                    <Select value={status} onValueChange={setStatus} disabled={!editMode && currentAccount}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="نشط">نشط</SelectItem>
                        <SelectItem value="موقوف">موقوف</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="mb-2 block">الملاحظات</Label>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="أضف ملاحظات"
                      disabled={!editMode && currentAccount}
                      className="h-20"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="financial" className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label className="mb-2 block">الحساب الرئيسي</Label>
                      <Select value={parentAccountId} onValueChange={setParentAccountId} disabled={!editMode && currentAccount}>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر حساباً رئيسياً" />
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
                      <Label className="mb-2 block">الرصيد الافتتاحي</Label>
                      <Input
                        type="number"
                        value={openingBalance}
                        onChange={(e) => setOpeningBalance(e.target.value)}
                        placeholder="0"
                        disabled={!editMode && currentAccount}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label className="mb-2 block">نسبة الحصول المسموحة</Label>
                      <Input
                        type="number"
                        value={allowedRatio}
                        onChange={(e) => setAllowedRatio(e.target.value)}
                        placeholder="0"
                        disabled={!editMode && currentAccount}
                      />
                    </div>
                    <div>
                      <Label className="mb-2 block">الرصيد الحالي</Label>
                      <Input
                        type="number"
                        value={currentAccount?.balance || 0}
                        readOnly
                        className="bg-slate-100"
                      />
                    </div>
                  </div>

                  {currentAccount && (
                    <div className="grid gap-4 md:grid-cols-3 p-4 bg-slate-50 rounded-lg">
                      <div>
                        <p className="text-xs text-slate-600">المدين</p>
                        <p className="font-semibold">{currentAccount.debit_amount.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">الدائن</p>
                        <p className="font-semibold">{currentAccount.credit_amount.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">الرصيد</p>
                        <p className="font-semibold text-green-600">{currentAccount.balance.toLocaleString()}</p>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="related" className="space-y-4">
                  <div className="text-right">
                    <h4 className="font-semibold mb-3">الحسابات ذات العلاقة على الحساب</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="px-3 py-2 text-right">الكود</th>
                            <th className="px-3 py-2 text-right">الاسم</th>
                            <th className="px-3 py-2 text-right">النسبة</th>
                            <th className="px-3 py-2 text-center">إجراءات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {relatedAccounts.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="text-center py-4 text-slate-500">
                                لا توجد حسابات مرتبطة
                              </td>
                            </tr>
                          ) : (
                            relatedAccounts.map((related) => (
                              <tr key={related.id} className="hover:bg-slate-50">
                                <td className="px-3 py-2">{related.account_code}</td>
                                <td className="px-3 py-2">{related.account_name}</td>
                                <td className="px-3 py-2">{related.ratio}</td>
                                <td className="px-3 py-2 text-center">
                                  <Button size="sm" variant="ghost">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="classification" className="space-y-4">
                  <div className="text-right space-y-3">
                    <div>
                      <Label className="mb-2 block">النوع</Label>
                      <p className="font-semibold">{
                        types.find((t) => String(t.id) === classificationTypeId)?.name || "غير محدد"
                      }</p>
                    </div>
                    <div>
                      <Label className="mb-2 block">طبيعة الحساب</Label>
                      <p className="font-semibold">{accountNature || "غير محدد"}</p>
                    </div>
                    <div>
                      <Label className="mb-2 block">الحساب الرئيسي</Label>
                      <p className="font-semibold">{
                        parentAccountId === "none"
                          ? "بدون"
                          : accounts.find((a) => String(a.id) === parentAccountId)?.account_name || "غير محدد"
                      }</p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg flex items-center justify-center">
            <CardContent className="text-center py-12">
              <p className="text-slate-500">اختر حساباً من القائمة أو أنشئ حساباً جديداً</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle>تأكيد حذف الحساب</DialogTitle>
          </DialogHeader>
          <p className="text-right text-slate-600 text-sm">
            هل أنت متأكد من حذف الحساب <strong>{currentAccount?.account_name}</strong>؟ هذا الإجراء لا يمكن التراجع عنه.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              إلغاء
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
