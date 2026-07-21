"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Search, Edit, Plus } from "lucide-react"
import UnifiedCreditCards, { type CreditCardRecord } from "@/components/admin/unified-credit-cards"

interface CurrencyOption {
  currency_id?: number
  id?: number
  currency_name?: string
  currency_code?: string
}

interface BankOption {
  id: number
  bank_name: string
}

interface LookupOption {
  id: number
  name: string
}

interface CreditCardListRow extends CreditCardRecord {
  main_type_name?: string
  commission_type_name?: string
  bank_name?: string
  currency_name?: string
  currency_code?: string
}

const initialForm: CreditCardRecord = {
  id: 0,
  main_type: null,
  name: "",
  name_lang2: "",
  currency_id: null,
  bank_id: null,
  holidays: [],
  financial_account_id: null,
  waseet_account_id: null,
  commission_account_id: null,
  commission_type_id: null,
  commission_value: null,
  commission_max_amount: null,
  notes: "",
  status: 1,
  link_bank_machine: false,
  machine_type_id: null,
}

const normalizeRecord = (record: any): CreditCardRecord => ({
  id: record.id,
  main_type: record.main_type ?? null,
  name: record.name || "",
  name_lang2: record.name_lang2 || "",
  currency_id: record.currency_id ?? null,
  bank_id: record.bank_id ?? null,
  holidays: Array.isArray(record.holidays) ? record.holidays : [],
  financial_account_id: record.financial_account_id ?? null,
  waseet_account_id: record.waseet_account_id ?? null,
  commission_account_id: record.commission_account_id ?? null,
  commission_type_id: record.commission_type_id ?? null,
  commission_value: record.commission_value ?? null,
  commission_max_amount: record.commission_max_amount ?? null,
  notes: record.notes || "",
  status: Number(record.status ?? 1),
  link_bank_machine: Boolean(record.link_bank_machine),
  machine_type_id: record.machine_type_id ?? null,
})

export default function CreditCards() {
  const [cards, setCards] = useState<CreditCardListRow[]>([])
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([])
  const [banks, setBanks] = useState<BankOption[]>([])
  const [mainTypes, setMainTypes] = useState<LookupOption[]>([])
  const [commissionTypes, setCommissionTypes] = useState<LookupOption[]>([])

  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<CreditCardRecord>(initialForm)
  const [isSaving, setIsSaving] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isNewMode, setIsNewMode] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [searchText, setSearchText] = useState("")
  const [errorMessages, setErrorMessages] = useState<string[]>([])

  const visibleCards = useMemo(() => cards.filter((c) => c.status !== 3), [cards])

  const filteredCards = useMemo(
    () =>
      visibleCards
        .map((card, index) => ({ card, index }))
        .filter(({ card }) => {
          const lower = searchText.trim().toLowerCase()
          if (!lower) return true
          return card.name.toLowerCase().includes(lower) || card.name_lang2.toLowerCase().includes(lower)
        }),
    [visibleCards, searchText],
  )

  useEffect(() => {
    fetchCards()
    fetchLookups()
  }, [])

  const fetchCards = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/credit-cards")
      const data = await response.json()
      const updated = Array.isArray(data) ? data : []
      setCards(updated)
      return updated
    } catch (error) {
      console.error("Failed to fetch credit card types", error)
      setCards([])
      return []
    } finally {
      setLoading(false)
    }
  }

  const fetchLookups = async () => {
    try {
      const [currenciesRes, banksRes, mainTypesRes, commissionTypesRes] = await Promise.all([
        fetch("/api/exchange-rates").catch(() => null),
        fetch("/api/banks").catch(() => null),
        fetch("/api/credit-card-main-types").catch(() => null),
        fetch("/api/credit-card-commission-types").catch(() => null),
      ])

      if (currenciesRes?.ok) {
        const data = await currenciesRes.json()
        setCurrencies(Array.isArray(data?.rates) ? data.rates : [])
      }
      if (banksRes?.ok) {
        const data = await banksRes.json()
        setBanks(Array.isArray(data) ? data : [])
      }
      if (mainTypesRes?.ok) {
        const data = await mainTypesRes.json()
        setMainTypes(Array.isArray(data) ? data : [])
      }
      if (commissionTypesRes?.ok) {
        const data = await commissionTypesRes.json()
        setCommissionTypes(Array.isArray(data) ? data : [])
      }
    } catch (error) {
      console.error("Failed to fetch lookups", error)
    }
  }

  const fetchCardDetails = async (id: number): Promise<CreditCardRecord | null> => {
    try {
      const response = await fetch(`/api/credit-cards/${id}`)
      if (!response.ok) return null
      return normalizeRecord(await response.json())
    } catch (error) {
      console.error("Failed to fetch credit card type details", error)
      return null
    }
  }

  const openNewDialog = () => {
    setErrorMessages([])
    setForm(initialForm)
    setIsNewMode(true)
    setDialogOpen(true)
  }

  const openEditDialog = async (card: CreditCardListRow, index: number) => {
    const details = await fetchCardDetails(card.id)
    setErrorMessages([])
    setForm(details || normalizeRecord(card))
    setIsNewMode(false)
    setCurrentIndex(index)
    setDialogOpen(true)
  }

  const hasDuplicateName = cards.some(
    (c) => c.id !== form.id && c.status !== 3 && c.name.trim().toLowerCase() === form.name.trim().toLowerCase() && form.name.trim() !== "",
  )

  const validateForm = (data: CreditCardRecord): string | null => {
    if (!data.name.trim()) return "اسم البطاقة (ar) مطلوب"
    if (!data.name_lang2.trim()) return "اسم البطاقة (en) مطلوب"
    if (hasDuplicateName) return "اسم البطاقة مستخدم مسبقاً"
    if (!data.main_type) return "نوع البطاقة مطلوب"
    if (!data.currency_id) return "العملة مطلوبة"
    if (!data.bank_id) return "البنك مطلوب"
    if (!data.financial_account_id) return "الحساب محاسبي مطلوب"
    if (!data.waseet_account_id) return "حساب الوسيط مطلوب"
    if (!data.commission_type_id) return "نوع العمولة مطلوب"
    if (data.link_bank_machine && data.machine_type_id === null) return "نوع الماكينة مطلوب"
    return null
  }

  const canSaveForm =
    !!form.name.trim() &&
    !!form.name_lang2.trim() &&
    !hasDuplicateName &&
    !!form.main_type &&
    !!form.currency_id &&
    !!form.bank_id &&
    !!form.financial_account_id &&
    !!form.waseet_account_id &&
    !!form.commission_type_id &&
    (!form.link_bank_machine || form.machine_type_id !== null)

  const saveCard = async () => {
    const error = validateForm(form)
    if (error) {
      setErrorMessages([error])
      return
    }
    setErrorMessages([])
    setIsSaving(true)
    try {
      const method = form.id > 0 ? "PUT" : "POST"
      const response = await fetch("/api/credit-cards", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!response.ok) {
        const responseError = await response.json()
        setErrorMessages([responseError.error || "فشل في حفظ البطاقة"])
        return
      }
      await fetchCards()
      setForm(initialForm)
      setIsNewMode(true)
      setDialogOpen(true)
    } catch (error) {
      console.error(error)
      setErrorMessages(["فشل في حفظ البطاقة"])
    } finally {
      setIsSaving(false)
    }
  }

  const deleteCard = async () => {
    if (!form.id) return
    setIsSaving(true)
    try {
      const response = await fetch("/api/credit-cards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, status: 3 }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حذف البطاقة")
      }
      const updated = await fetchCards()
      setShowDeleteConfirm(false)

      const visibleUpdated = updated.filter((c: CreditCardListRow) => c.status !== 3)
      const nextIndex = Math.min(currentIndex, Math.max(0, visibleUpdated.length - 1))
      if (visibleUpdated.length > 0) {
        const next = visibleUpdated[nextIndex]
        const details = await fetchCardDetails(next.id)
        setForm(details || normalizeRecord(next))
        setCurrentIndex(nextIndex)
        setIsNewMode(false)
        setDialogOpen(true)
      } else {
        setForm(initialForm)
        setIsNewMode(true)
      }
    } catch (error) {
      console.error(error)
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
    const targetIndex = filteredCards.findIndex(({ card }) => card.id === record.id)
    setCurrentIndex(targetIndex >= 0 ? targetIndex : 0)
    setShowDeleteConfirm(false)
    setIsNewMode(false)
    setErrorMessages([])
    setDialogOpen(true)
  }

  const openRow = (card: CreditCardListRow) => {
    const index = filteredCards.findIndex(({ card: c }) => c.id === card.id)
    openEditDialog(card, index >= 0 ? index : 0)
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-slate-50">
          <CardHeader>
            <CardTitle className="text-base">إجمالي بطاقات الائتمان</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{visibleCards.length}</div>
            <div className="text-sm text-muted-foreground">عدد أنواع البطاقات المسجلة</div>
          </CardContent>
        </Card>
        <Card className="bg-green-50">
          <CardHeader>
            <CardTitle className="text-base">بطاقات ائتمان</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{visibleCards.filter((c) => c.main_type === 1).length}</div>
            <div className="text-sm text-muted-foreground">النوع: بطاقة ائتمان</div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50">
          <CardHeader>
            <CardTitle className="text-base">بطاقات صراف</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{visibleCards.filter((c) => c.main_type === 2).length}</div>
            <div className="text-sm text-muted-foreground">النوع: بطاقة صراف</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="text-xl font-semibold">بطاقات الائتمان</div>
          <div className="text-sm text-muted-foreground">إدارة أنواع بطاقات الائتمان والصراف الآلي</div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Input
              placeholder="بحث باسم البطاقة"
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
            إضافة بطاقة جديدة
          </Button>
        </div>
      </div>

      <div className="overflow-auto rounded-lg border border-slate-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">اسم البطاقة</TableHead>
              <TableHead className="text-right">النوع</TableHead>
              <TableHead className="text-right">البنك</TableHead>
              <TableHead className="text-right">العملة</TableHead>
              <TableHead className="text-right">نوع العمولة</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCards.map(({ card, index }) => (
              <TableRow key={card.id} className="cursor-pointer transition hover:bg-slate-50" onClick={() => openEditDialog(card, index)}>
                <TableCell className="text-right">{card.name}</TableCell>
                <TableCell className="text-right">{card.main_type_name}</TableCell>
                <TableCell className="text-right">{card.bank_name}</TableCell>
                <TableCell className="text-right">{card.currency_name || card.currency_code}</TableCell>
                <TableCell className="text-right">{card.commission_type_name}</TableCell>
                <TableCell className="text-right">{card.status === 1 ? "نشط" : "متوقف"}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      openRow(card)
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filteredCards.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  لا توجد نتائج
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <UnifiedCreditCards
        dialogOpen={dialogOpen}
        currentIndex={currentIndex}
        totalRecords={filteredCards.length}
        form={form}
        isSaving={isSaving}
        showDeleteConfirm={showDeleteConfirm}
        currencies={currencies}
        banks={banks}
        mainTypes={mainTypes}
        commissionTypes={commissionTypes}
        onOpenChange={handleOpenChange}
        onNew={openNewDialog}
        onSave={saveCard}
        onDelete={() => form.id && setShowDeleteConfirm(true)}
        onNavigateRecord={handleNavigateRecord}
        onFormChange={(field, value) => setForm((f) => ({ ...f, [field]: value }))}
        onConfirmDelete={deleteCard}
        onCancelDelete={() => setShowDeleteConfirm(false)}
        canSave={canSaveForm}
        isFirstRecord={currentIndex <= 0}
        isLastRecord={filteredCards.length === 0 ? true : currentIndex >= filteredCards.length - 1}
        isNewMode={isNewMode}
        errorMessages={errorMessages}
      />
    </div>
  )
}
