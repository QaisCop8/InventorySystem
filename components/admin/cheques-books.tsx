"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Search, Edit, Plus } from "lucide-react"
import { useAuth } from "@/components/auth/auth-context"
import UnifiedChequesBooks, { type ChequeBookRecord, type ChequeBookRow } from "@/components/admin/unified-cheques-books"
import type { BankAccountRecord } from "@/components/admin/unified-bank-accounts"

interface CurrencyOption {
  currency_id?: number
  id?: number
  currency_name?: string
  currency_code?: string
}

interface ChequeBookListRow extends ChequeBookRecord {
  currency_name?: string
  currency_code?: string
}

const initialForm: ChequeBookRecord = {
  id: 0,
  code: "",
  bank_account_id: null,
  bank_account_code: "",
  bank_account_name: "",
  bank_account_name_lang2: "",
  currency_id: null,
  currency_name: "",
  currency_code: "",
  insert_date: new Date().toISOString().slice(0, 10),
  notes: "",
  status: 1,
  cheques: [],
}

const normalizeRecord = (record: any): ChequeBookRecord => ({
  id: record.id,
  code: record.code || "",
  bank_account_id: record.bank_account_id ?? null,
  bank_account_code: record.bank_account_code || "",
  bank_account_name: record.bank_account_name || "",
  bank_account_name_lang2: record.bank_account_name_lang2 || "",
  currency_id: record.currency_id ?? null,
  currency_name: record.currency_name || "",
  currency_code: record.currency_code || "",
  insert_date: record.insert_date || "",
  notes: record.notes || "",
  status: Number(record.status ?? 1),
  cheques: Array.isArray(record.cheques) ? (record.cheques as ChequeBookRow[]) : [],
})

export default function ChequesBooks() {
  const { user } = useAuth()
  const [books, setBooks] = useState<ChequeBookListRow[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccountRecord[]>([])
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([])

  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<ChequeBookRecord>(initialForm)
  const [isSaving, setIsSaving] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isNewMode, setIsNewMode] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [loadingRecord, setLoadingRecord] = useState(false)
  const [searchText, setSearchText] = useState("")
  const [errorMessages, setErrorMessages] = useState<string[]>([])

  const visibleBooks = useMemo(() => books.filter((b) => b.status !== 3), [books])

  const filteredBooks = useMemo(
    () =>
      visibleBooks
        .map((book, index) => ({ book, index }))
        .filter(({ book }) => {
          const lower = searchText.trim().toLowerCase()
          if (!lower) return true
          return book.code.toLowerCase().includes(lower) || book.bank_account_name.toLowerCase().includes(lower)
        }),
    [visibleBooks, searchText],
  )

  useEffect(() => {
    fetchBooks()
    fetchLookups()
  }, [])

  const fetchBooks = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/cheques-books")
      const data = await response.json()
      const updated = Array.isArray(data) ? data : []
      setBooks(updated)
      return updated
    } catch (error) {
      console.error("Failed to fetch cheque books", error)
      setBooks([])
      return []
    } finally {
      setLoading(false)
    }
  }

  const fetchLookups = async () => {
    try {
      const [currenciesRes, bankAccountsRes] = await Promise.all([
        fetch("/api/exchange-rates").catch(() => null),
        fetch("/api/bank-accounts").catch(() => null),
      ])

      if (currenciesRes?.ok) {
        const data = await currenciesRes.json()
        setCurrencies(Array.isArray(data?.rates) ? data.rates : [])
      }
      if (bankAccountsRes?.ok) {
        const data = await bankAccountsRes.json()
        setBankAccounts(Array.isArray(data) ? data : [])
      }
    } catch (error) {
      console.error("Failed to fetch lookups", error)
    }
  }

  const fetchBookDetails = async (id: number): Promise<ChequeBookRecord | null> => {
    try {
      const response = await fetch(`/api/cheques-books/${id}`)
      if (!response.ok) return null
      return normalizeRecord(await response.json())
    } catch (error) {
      console.error("Failed to fetch cheque book details", error)
      return null
    }
  }

  const generateCode = async () => {
    try {
      const response = await fetch("/api/cheques-books/generate-number")
      if (!response.ok) return ""
      const data = await response.json()
      return data.code || ""
    } catch (error) {
      console.error("Failed to generate cheque book number", error)
      return ""
    }
  }

  const openNewDialog = async () => {
    setErrorMessages([])
    setForm(initialForm)
    setIsNewMode(true)
    setDialogOpen(true)
    setLoadingRecord(true)
    try {
      const code = await generateCode()
      setForm({ ...initialForm, code })
    } finally {
      setLoadingRecord(false)
    }
  }

  const openEditDialog = async (book: ChequeBookListRow, index: number) => {
    setErrorMessages([])
    setForm(normalizeRecord(book))
    setIsNewMode(false)
    setCurrentIndex(index)
    setDialogOpen(true)
    setLoadingRecord(true)
    try {
      const details = await fetchBookDetails(book.id)
      if (details) setForm(details)
    } finally {
      setLoadingRecord(false)
    }
  }

  // عند الخروج من حقل رقم الدفتر (بعد إكماله لـ 8 خانات في المكوّن الابن): إن كان الرقم
  // لدفتر موجود بالفعل يُعرض للتعديل، وإلا تُصفّر بقية الحقول لإدخال دفتر جديد بهذا الرقم.
  const handleCodeBlur = async (code: string) => {
    const existing = books.find((b) => b.code === code)
    if (existing) {
      const index = filteredBooks.findIndex(({ book }) => book.id === existing.id)
      await openEditDialog(existing, index >= 0 ? index : 0)
    } else {
      setErrorMessages([])
      setForm({ ...initialForm, code })
      setIsNewMode(true)
    }
  }

  const validateForm = (data: ChequeBookRecord): string | null => {
    if (!data.code.trim()) return "رقم الدفتر مطلوب"
    if (!data.bank_account_id) return "رقم الحساب البنكي مطلوب"
    return null
  }

  const canSaveForm = !!form.code.trim() && !!form.bank_account_id

  const saveBook = async () => {
    const error = validateForm(form)
    if (error) {
      setErrorMessages([error])
      return
    }
    setErrorMessages([])
    setIsSaving(true)
    try {
      const method = form.id > 0 ? "PUT" : "POST"
      const response = await fetch("/api/cheques-books", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, user_id: user?.id }),
      })
      if (!response.ok) {
        const responseError = await response.json()
        setErrorMessages([responseError.error || "فشل في حفظ دفتر الشيكات"])
        return
      }
      await fetchBooks()
      const code = await generateCode()
      setForm({ ...initialForm, code })
      setIsNewMode(true)
      setDialogOpen(true)
    } catch (error) {
      console.error(error)
      setErrorMessages(["فشل في حفظ دفتر الشيكات"])
    } finally {
      setIsSaving(false)
    }
  }

  const deleteBook = async () => {
    if (!form.id) return
    setIsSaving(true)
    try {
      const response = await fetch("/api/cheques-books", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, status: 3, user_id: user?.id }),
      })
      if (!response.ok) {
        const error = await response.json()
        setShowDeleteConfirm(false)
        setErrorMessages([error.error || "فشل في حذف دفتر الشيكات"])
        return
      }
      setErrorMessages([])
      const updated = await fetchBooks()
      setShowDeleteConfirm(false)

      const visibleUpdated = updated.filter((b: ChequeBookListRow) => b.status !== 3)
      const nextIndex = Math.min(currentIndex, Math.max(0, visibleUpdated.length - 1))
      if (visibleUpdated.length > 0) {
        const next = visibleUpdated[nextIndex]
        const details = await fetchBookDetails(next.id)
        setForm(details || normalizeRecord(next))
        setCurrentIndex(nextIndex)
        setIsNewMode(false)
        setDialogOpen(true)
      } else {
        const code = await generateCode()
        setForm({ ...initialForm, code })
        setIsNewMode(true)
      }
    } catch (error) {
      console.error(error)
      setShowDeleteConfirm(false)
      setErrorMessages(["فشل في حذف دفتر الشيكات"])
    } finally {
      setIsSaving(false)
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open && showDeleteConfirm) return
    setDialogOpen(open)
  }

  const handleNavigateRecord = (record: any) => {
    setForm(normalizeRecord(record))
    const targetIndex = filteredBooks.findIndex(({ book }) => book.id === record.id)
    setCurrentIndex(targetIndex >= 0 ? targetIndex : 0)
    setShowDeleteConfirm(false)
    setIsNewMode(false)
    setErrorMessages([])
    setDialogOpen(true)
  }

  const openRow = (book: ChequeBookListRow) => {
    const index = filteredBooks.findIndex(({ book: b }) => b.id === book.id)
    openEditDialog(book, index >= 0 ? index : 0)
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="bg-slate-50">
          <CardHeader>
            <CardTitle className="text-base">إجمالي دفاتر الشيكات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{visibleBooks.length}</div>
            <div className="text-sm text-muted-foreground">عدد الدفاتر المسجلة</div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50">
          <CardHeader>
            <CardTitle className="text-base">إجمالي الشيكات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{visibleBooks.reduce((sum, b) => sum + (b.cheques?.length || 0), 0)}</div>
            <div className="text-sm text-muted-foreground">عدد الشيكات الصادرة في كل الدفاتر</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="text-xl font-semibold">دفاتر الشيكات</div>
          <div className="text-sm text-muted-foreground">إدارة دفاتر الشيكات البنكية وإصدار الشيكات</div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Input
              placeholder="بحث برقم الدفتر أو اسم الحساب"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="min-w-[260px]"
              disabled={loading}
            />
            <Button variant="outline" size="sm" disabled={loading}>
              <Search className="h-4 w-4" />
              بحث
            </Button>
          </div>
          <Button onClick={openNewDialog} className="whitespace-nowrap" disabled={loading}>
            <Plus className="h-4 w-4" />
            إضافة دفتر شيكات
          </Button>
        </div>
      </div>

      <div className="overflow-auto rounded-lg border border-slate-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">رقم الدفتر</TableHead>
              <TableHead className="text-right">رقم الحساب البنكي</TableHead>
              <TableHead className="text-right">اسم الحساب البنكي</TableHead>
              <TableHead className="text-right">العملة</TableHead>
              <TableHead className="text-right">تاريخ الاصدار</TableHead>
              <TableHead className="text-right">عدد الشيكات</TableHead>
              <TableHead className="text-right">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBooks.map(({ book, index }) => (
              <TableRow key={book.id} className="cursor-pointer transition hover:bg-slate-50" onClick={() => openEditDialog(book, index)}>
                <TableCell className="text-right">{book.code}</TableCell>
                <TableCell className="text-right">{book.bank_account_code}</TableCell>
                <TableCell className="text-right">{book.bank_account_name}</TableCell>
                <TableCell className="text-right">{book.currency_name || book.currency_code}</TableCell>
                <TableCell className="text-right">{book.insert_date?.slice(0, 10)}</TableCell>
                <TableCell className="text-right">{book.cheques?.length || 0}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      openRow(book)
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filteredBooks.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  لا توجد نتائج
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <UnifiedChequesBooks
        dialogOpen={dialogOpen}
        currentIndex={currentIndex}
        totalRecords={filteredBooks.length}
        form={form}
        isSaving={isSaving}
        isLoading={loadingRecord}
        showDeleteConfirm={showDeleteConfirm}
        bankAccounts={bankAccounts}
        currencies={currencies}
        onOpenChange={handleOpenChange}
        onNew={openNewDialog}
        onSave={saveBook}
        onDelete={() => form.id && setShowDeleteConfirm(true)}
        onNavigateRecord={handleNavigateRecord}
        onFormChange={(field, value) => setForm((f) => ({ ...f, [field]: value }))}
        onChequesChange={(cheques) => setForm((f) => ({ ...f, cheques }))}
        onCodeBlur={handleCodeBlur}
        onConfirmDelete={deleteBook}
        onCancelDelete={() => setShowDeleteConfirm(false)}
        canSave={canSaveForm}
        isFirstRecord={currentIndex <= 0}
        isLastRecord={filteredBooks.length === 0 ? true : currentIndex >= filteredBooks.length - 1}
        isNewMode={isNewMode}
        errorMessages={errorMessages}
      />
    </div>
  )
}
