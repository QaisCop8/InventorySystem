"use client"

import React, { useEffect, useState, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import DataGridView from "@/components/common/DataGridView"
import Messages from "@/components/common/Messages"
import AccountSearchDialog from "@/components/customer/account-search-dialog"
import StoresSearchPopup from "@/components/products/StoresSearchPopup"
import "./virtual-accounts.css"
import { Search, Eraser, Save, RefreshCw, Loader2, Wallet, UsersRound, Info, Warehouse, SlidersHorizontal } from "lucide-react"
import { ReportMultiChoice } from "@/components/reports/account-statement-report"
import { KeyAction } from "@grapecity/wijmo.grid"

type WarehouseField = "default_item_warehouse_id" | "finished_goods_warehouse_id" | "raw_materials_warehouse_id"

const WAREHOUSE_FIELDS: { field: WarehouseField; nameField: string; label: string }[] = [
  { field: "default_item_warehouse_id", nameField: "default_item_warehouse_name", label: "المستودع الافتراضي للصنف في السندات" },
  { field: "finished_goods_warehouse_id", nameField: "finished_goods_warehouse_name", label: "مستودع المواد الجاهزة في سند الانتاج" },
  { field: "raw_materials_warehouse_id", nameField: "raw_materials_warehouse_name", label: "مستودع المواد الخام في سند الانتاج" },
]

const emptyWarehouseDefaults: Record<string, any> = {
  default_item_warehouse_id: null,
  default_item_warehouse_name: "",
  finished_goods_warehouse_id: null,
  finished_goods_warehouse_name: "",
  raw_materials_warehouse_id: null,
  raw_materials_warehouse_name: "",
}

export default function VirtualAccounts() {
  const [users, setUsers] = useState<any[]>([])
  const [branches, setBranches] = useState<any[]>([])
  // اختيار متعدد (ReportMultiChoice): تُعرض إعدادات أول مستخدم/فرع محدَّد، والحفظ يُطبَّق على كل
  // المستخدمين × الفروع المحددة (الحسابات لكل مستخدم+فرع، والمستودعات والإعدادات الأخرى لكل مستخدم).
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])
  const [selectedBranchIds, setSelectedBranchIds] = useState<number[]>([])
  const userKey = (user: any) => Number(user?.user_id) || Number(user?.id)
  const selectedUser = useMemo(() => users.find((user) => userKey(user) === selectedUserIds[0]) ?? null, [users, selectedUserIds])
  const branchId = selectedBranchIds[0] ?? null
  const selectedUsers = useMemo(() => users.filter((user) => selectedUserIds.includes(userKey(user))), [users, selectedUserIds])
  const [currencies, setCurrencies] = useState<any[]>([])
  const [rows, setRows] = useState<any[]>([])
  const [userCurrencyMappings, setUserCurrencyMappings] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const requestRef = useRef(0)
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const [selectedRowIndex, setSelectedRowIndex] = useState(-1)
  const [selectedField, setSelectedField] = useState<string | null>(null)

  const [warehouses, setWarehouses] = useState<any[]>([])
  const [warehouseDefaults, setWarehouseDefaults] = useState<Record<string, any>>(emptyWarehouseDefaults)
  const [warehousesSectionOpen, setWarehousesSectionOpen] = useState(true)
  const [warehouseSearchOpen, setWarehouseSearchOpen] = useState(false)
  const [warehouseSearchField, setWarehouseSearchField] = useState<WarehouseField | null>(null)

  // "اعدادات اخرى" — عند التفعيل يُعامَل السعر المُدخَل يدوياً في عمود "السعر" بسندات المبيعات كسعر
  // شامل الضريبة، فيُحوَّل فوراً لسعر غير شامل قبل تخزينه (انظر handleCellEditEnded في
  // unified-sales-delivery.tsx).
  const [otherSettingsSectionOpen, setOtherSettingsSectionOpen] = useState(true)
  const [priceEntryIncludesTax, setPriceEntryIncludesTax] = useState(false)

  const gridRef = useRef<any>(null)
  const messagesRef = useRef<any>(null)

  const showErrorMessage = (detail: string) => {
    messagesRef.current?.show?.([{ severity: 'error', summary: '', detail, life: 5000 }])
  }

  const showSuccessMessage = (detail: string) => {
    messagesRef.current?.show?.([{ severity: 'success', summary: '', detail, life: 5000 }])
  }

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/settings/user')
      const data = await res.json()
      const list = Array.isArray(data) ? data : []
      setUsers(list.map((u) => ({ ...u, display_name: u.full_name || u.username || '' })))
    } catch (err) {
      console.error(err)
    }
  }

  const loadCurrencies = async () => {
    try {
      const res = await fetch('/api/exchange-rates')
      const data = await res.json()
      const list = data?.rates ?? []
      setCurrencies(list.map((currency: any) => ({ ...currency, id: currency.currency_id ?? currency.id })))
    } catch (err) {
      console.error(err)
    }
  }

  const loadWarehouses = async () => {
    try {
      const res = await fetch('/api/warehouses')
      const data = await res.json()
      setWarehouses(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
      setWarehouses([])
    }
  }

  useEffect(() => {
    loadUsers()
    loadCurrencies()
    loadWarehouses()
    fetch('/api/branches').then(response => response.json()).then(data => setBranches(Array.isArray(data) ? data : [])).catch(() => showErrorMessage('تعذر تحميل الفروع'))
  }, [])

  const loadDefaults = async (userId: string | number) => {
    const requestId = ++requestRef.current
    setLoading(true)
    try {
      const query = encodeURIComponent(String(userId))
      const responses = await Promise.all([
        branchId ? fetch(`/api/settings/users-currencies-default?user_id=${query}&branch_id=${branchId}`, { cache: 'no-store' }) : Promise.resolve(new Response(JSON.stringify({ rows: [] }))),
        fetch(`/api/settings/user-warehouse-defaults?user_id=${query}`, { cache: 'no-store' }),
      ])
      const [accounts, defaults] = await Promise.all(responses.map(response => response.json()))
      if (!responses[0].ok || !responses[1].ok) throw new Error(accounts.error || defaults.error || 'Failed to load defaults')
      if (requestId !== requestRef.current) return false
      setUserCurrencyMappings(Array.isArray(accounts.rows) ? accounts.rows : [])
      setWarehouseDefaults({ ...emptyWarehouseDefaults, ...defaults })
      setPriceEntryIncludesTax(Boolean(defaults.price_entry_includes_tax))
      return true
    } catch (error) {
      if (requestId === requestRef.current) showErrorMessage(error instanceof Error ? error.message : 'Failed to load defaults')
      return false
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    setUserCurrencyMappings([])
    setWarehouseDefaults(emptyWarehouseDefaults)
    setPriceEntryIncludesTax(false)
    if (selectedUser) void loadDefaults(selectedUser.user_id)
    else setLoading(false)
    return () => { requestRef.current += 1 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser?.user_id, branchId])

  const openWarehouseSearch = (field: WarehouseField) => {
    if (!selectedUser) {
      showErrorMessage('اختر مستخدما اولا')
      return
    }
    setWarehouseSearchField(field)
    setWarehouseSearchOpen(true)
  }

  const handleWarehouseSelect = (store: { id: number; warehouse_name: string }) => {
    setWarehouseSearchOpen(false)
    if (!warehouseSearchField) return
    const config = WAREHOUSE_FIELDS.find((f) => f.field === warehouseSearchField)
    if (!config) return
    setWarehouseDefaults((prev) => ({
      ...prev,
      [config.field]: store.id,
      [config.nameField]: store.warehouse_name,
    }))
    setWarehouseSearchField(null)
  }

  const clearWarehouseField = (field: WarehouseField) => {
    const config = WAREHOUSE_FIELDS.find((f) => f.field === field)
    if (!config) return
    setWarehouseDefaults((prev) => ({ ...prev, [config.field]: null, [config.nameField]: '' }))
  }

  useEffect(() => {
    const nextRows = (currencies || []).map((c) => {
      const mapping = userCurrencyMappings.find((m) => Number(m.currency_id) === Number(c.id))

      return {
        id: c.id,
        currency_id: c.id,
        currency_code: c.currency_code || c.code || '',
        currency_name: c.currency_name || c.name || '',
        cash_account_id: mapping?.cash_account_id ?? null,
        cash_account_display:
          mapping?.cash_account_code && mapping?.cash_account_name
            ? `${mapping.cash_account_code} / ${mapping.cash_account_name}`
            : mapping?.cash_account_id
            ? String(mapping.cash_account_id)
            : '',
        incoming_checks_account_id: mapping?.incoming_checks_account_id ?? null,
        incoming_checks_account_display:
          mapping?.incoming_checks_account_code && mapping?.incoming_checks_account_name
            ? `${mapping.incoming_checks_account_code} / ${mapping.incoming_checks_account_name}`
            : mapping?.incoming_checks_account_id
            ? String(mapping.incoming_checks_account_id)
            : '',
        returned_checks_account_id: mapping?.returned_checks_account_id ?? null,
        returned_checks_account_display:
          mapping?.returned_checks_account_code && mapping?.returned_checks_account_name
            ? `${mapping.returned_checks_account_code} / ${mapping.returned_checks_account_name}`
            : mapping?.returned_checks_account_id
            ? String(mapping.returned_checks_account_id)
            : '',
        card_account_id: mapping?.card_account_id ?? null,
        card_account_display:
          mapping?.card_account_code && mapping?.card_account_name
            ? `${mapping.card_account_code} / ${mapping.card_account_name}`
            : mapping?.card_account_id
            ? String(mapping.card_account_id)
            : '',
      }
    })

    setRows(nextRows)
  }, [currencies, userCurrencyMappings])

  const accountColumns = [
    { name: 'cash_account_display', field: 'cash_account' },
    { name: 'incoming_checks_account_display', field: 'incoming_checks_account' },
    { name: 'returned_checks_account_display', field: 'returned_checks_account' },
    { name: 'card_account_display', field: 'card_account' },
  ] as const

  const openAccountSearch = (rowIndex: number, field: (typeof accountColumns)[number]['field']) => {
    if (!selectedUser) {
      showErrorMessage('اختر مستخدما اولا')
      return
    }
    setSelectedRowIndex(rowIndex)
    setSelectedField(field)
    setAccountDialogOpen(true)
  }

  // Enter and Tab move through account cells in row order. Shift reverses the
  // direction. F2 opens account search and Delete clears the selected account.
  const handleGridKeyDown = (grid: any, event: KeyboardEvent) => {
    if (!selectedUser || !grid?.selection || !event) return
    const row = grid.selection.row
    const col = grid.selection.col
    if (row < 0 || col < 0) return
    const binding = grid.columns?.[col]?.binding
    const accountColumnIndex = accountColumns.findIndex((item) => item.name === binding)

    if (event.key === 'F2' && accountColumnIndex >= 0) {
      event.preventDefault()
      event.stopPropagation()
      openAccountSearch(row, accountColumns[accountColumnIndex].field)
      return
    }

    if (event.key === 'Delete' && accountColumnIndex >= 0) {
      event.preventDefault()
      const field = accountColumns[accountColumnIndex].field
      const idField = field === 'cash_account'
        ? 'cash_account_id'
        : field === 'incoming_checks_account'
          ? 'incoming_checks_account_id'
          : field === 'returned_checks_account'
            ? 'returned_checks_account_id'
            : 'card_account_id'
      setRows((current) => current.map((item, index) => index === row ? { ...item, [idField]: null, [binding]: '' } : item))
      return
    }

    if (event.key !== 'Enter' && event.key !== 'Tab') return
    event.preventDefault()
    event.stopPropagation()

    let position = accountColumnIndex >= 0 ? accountColumnIndex : (event.shiftKey ? accountColumns.length : -1)
    let targetRow = row
    position += event.shiftKey ? -1 : 1
    if (position >= accountColumns.length) {
      position = 0
      targetRow += 1
    } else if (position < 0) {
      position = accountColumns.length - 1
      targetRow -= 1
    }
    if (targetRow < 0 || targetRow >= grid.rows.length) return
    const targetCol = grid.columns.findIndex((column: any) => column.binding === accountColumns[position].name)
    if (targetCol < 0) return
    grid.select(targetRow, targetCol)
    grid.focus()
  }

  const scheme = useMemo(() => ({
    name: 'UserCurrencyAccounts',
    allowGrouping: false,
    filter: false,
    columns: [
      { header: 'العملة', name: 'currency_name', width: '*', minWidth: 180, isReadOnly: true },
      { header: 'حساب الصندوق', name: 'cash_account_display', width: '*', minWidth: 240, isReadOnly: true },
      {
        name: 'btnCashSearch',
        header: ' ',
        width: 44,
        buttonBody: 'button',
        align: 'center',
        title: 'بحث',
        iconType: 'search',
        className: 'btn-search',
        isReadOnly: true,
        onClick: (e: any, ctx: any) => {
          e.stopPropagation()
          if (!selectedUser) {
            showErrorMessage('اختر مستخدما اولا')
            return
          }
          openAccountSearch(ctx.row.index, 'cash_account')
        },
      },
      {
        name: 'btnCashClear',
        header: ' ',
        width: 44,
        buttonBody: 'button',
        align: 'center',
        title: 'مسح',
        iconType: 'delete',
        className: 'btn-delete',
        isReadOnly: true,
        onClick: (e: any, ctx: any) => {
          e.stopPropagation()
          setRows((prev) => prev.map((r, i) => (i === ctx.row.index ? { ...r, cash_account_id: null, cash_account_display: '' } : r)))
        },
      },
      { header: 'حساب الشيكات الواردة', name: 'incoming_checks_account_display', width: '*', minWidth: 240, isReadOnly: true },
      {
        name: 'btnIncomingSearch',
        header: ' ',
        width: 44,
        buttonBody: 'button',
        align: 'center',
        title: 'بحث',
        iconType: 'search',
        className: 'btn-search',
        isReadOnly: true,
        onClick: (e: any, ctx: any) => {
          e.stopPropagation()
          if (!selectedUser) {
            showErrorMessage('اختر مستخدما اولا')
            return
          }
          openAccountSearch(ctx.row.index, 'incoming_checks_account')
        },
      },
      {
        name: 'btnIncomingClear',
        header: ' ',
        width: 44,
        buttonBody: 'button',
        align: 'center',
        title: 'مسح',
        iconType: 'delete',
        className: 'btn-delete',
        isReadOnly: true,
        onClick: (e: any, ctx: any) => {
          e.stopPropagation()
          setRows((prev) => prev.map((r, i) => (i === ctx.row.index ? { ...r, incoming_checks_account_id: null, incoming_checks_account_display: '' } : r)))
        },
      },
      { header: 'حساب الشيكات الراجعة', name: 'returned_checks_account_display', width: '*', minWidth: 240, isReadOnly: true },
      {
        name: 'btnReturnedSearch',
        header: ' ',
        width: 44,
        buttonBody: 'button',
        align: 'center',
        title: 'بحث',
        iconType: 'search',
        className: 'btn-search',
        isReadOnly: true,
        onClick: (e: any, ctx: any) => {
          e.stopPropagation()
          if (!selectedUser) {
            showErrorMessage('اختر مستخدما اولا')
            return
          }
          openAccountSearch(ctx.row.index, 'returned_checks_account')
        },
      },
      {
        name: 'btnReturnedClear',
        header: ' ',
        width: 44,
        buttonBody: 'button',
        align: 'center',
        title: 'مسح',
        iconType: 'delete',
        className: 'btn-delete',
        isReadOnly: true,
        onClick: (e: any, ctx: any) => {
          e.stopPropagation()
          setRows((prev) => prev.map((r, i) => (i === ctx.row.index ? { ...r, returned_checks_account_id: null, returned_checks_account_display: '' } : r)))
        },
      },
      { header: 'حساب البطاقات', name: 'card_account_display', width: '*', minWidth: 240, isReadOnly: true },
      {
        name: 'btnCardSearch',
        header: ' ',
        width: 44,
        buttonBody: 'button',
        align: 'center',
        title: 'بحث',
        iconType: 'search',
        className: 'btn-search',
        isReadOnly: true,
        onClick: (e: any, ctx: any) => {
          e.stopPropagation()
          if (!selectedUser) {
            showErrorMessage('اختر مستخدما اولا')
            return
          }
          openAccountSearch(ctx.row.index, 'card_account')
        },
      },
      {
        name: 'btnCardClear',
        header: ' ',
        width: 44,
        buttonBody: 'button',
        align: 'center',
        title: 'مسح',
        iconType: 'delete',
        className: 'btn-delete',
        isReadOnly: true,
        onClick: (e: any, ctx: any) => {
          e.stopPropagation()
          setRows((prev) => prev.map((r, i) => (i === ctx.row.index ? { ...r, card_account_id: null, card_account_display: '' } : r)))
        },
      },
    ],
  }), [selectedUser])

  const handleAccountSelect = (account: { id: number; code: string; name: string }) => {
    if (selectedRowIndex < 0 || !selectedField) return

    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== selectedRowIndex) return r
        const display = `${account.code} / ${account.name}`
        if (selectedField === 'cash_account') {
          return { ...r, cash_account_id: account.id, cash_account_display: display }
        }
        if (selectedField === 'incoming_checks_account') {
          return { ...r, incoming_checks_account_id: account.id, incoming_checks_account_display: display }
        }
        if (selectedField === 'returned_checks_account') {
          return { ...r, returned_checks_account_id: account.id, returned_checks_account_display: display }
        }
        if (selectedField === 'card_account') {
          return { ...r, card_account_id: account.id, card_account_display: display }
        }
        return r
      }),
    )
    setSelectedRowIndex(-1)
    setSelectedField(null)
    setAccountDialogOpen(false)
  }

  const handleSaveAll = async () => {
    if (!selectedBranchIds.length) { showErrorMessage('يجب تحديد الفرع'); return }
    if (!selectedUsers.length || saving || loading) { showErrorMessage('اختر مستخدما اولا'); return }
    const accountRows = rows.map((r) => ({
      currency_id: r.currency_id,
      cash_account_id: r.cash_account_id,
      incoming_checks_account_id: r.incoming_checks_account_id,
      returned_checks_account_id: r.returned_checks_account_id,
      card_account_id: r.card_account_id,
    }))
    setSaving(true)
    try {
      const failures: string[] = []
      for (const user of selectedUsers) {
        for (const targetBranchId of selectedBranchIds) {
          const response = await fetch('/api/settings/users-currencies-default', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: user.user_id, branch_id: targetBranchId, rows: accountRows }),
          })
          const data = await response.json().catch(() => ({}))
          if (!response.ok || !data.success) {
            const branchName = branches.find((branch) => branch.id === targetBranchId)?.branch_name || targetBranchId
            failures.push(`${user.display_name} / ${branchName}: ${data.error || 'فشل الحفظ'}`)
          }
        }
        const warehousesResponse = await fetch('/api/settings/user-warehouse-defaults', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.user_id,
            default_item_warehouse_id: warehouseDefaults.default_item_warehouse_id,
            finished_goods_warehouse_id: warehouseDefaults.finished_goods_warehouse_id,
            raw_materials_warehouse_id: warehouseDefaults.raw_materials_warehouse_id,
            price_entry_includes_tax: priceEntryIncludesTax,
          }),
        })
        const warehousesData = await warehousesResponse.json().catch(() => ({}))
        if (!warehousesResponse.ok || !warehousesData.success) failures.push(`${user.display_name}: ${warehousesData.error || 'فشل حفظ المستودعات'}`)
      }
      if (failures.length) {
        showErrorMessage(failures.slice(0, 3).join(' — '))
      } else if (selectedUser && await loadDefaults(selectedUser.user_id)) {
        const combos = selectedUsers.length * selectedBranchIds.length
        showSuccessMessage(combos > 1 ? `تم الحفظ على ${selectedUsers.length} مستخدم × ${selectedBranchIds.length} فرع` : 'تم الحفظ وإعادة تحميل الإعدادات بنجاح')
      }
    } catch (error) {
      showErrorMessage(error instanceof Error ? error.message : 'تعذر حفظ الإعدادات')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div dir="rtl" className="virtual-accounts-page flex min-h-screen w-full flex-col gap-4 bg-slate-50/50 p-3 sm:p-4 dark:bg-slate-950">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-emerald-700 via-emerald-600 to-teal-600 px-5 py-5 text-white shadow-lg">
        <div className="pointer-events-none absolute -left-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25"><Wallet className="h-6 w-6" /></span>
            <div>
              <h1 className="text-xl font-extrabold sm:text-2xl">الحسابات والمستودعات الافتراضية</h1>
              <p className="text-xs text-emerald-50/90 sm:text-sm">حسابات الصناديق والبنوك لكل عملة، والمستودعات الافتراضية — لمستخدم أو عدة مستخدمين وفروع دفعة واحدة</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="h-10 gap-2 rounded-xl border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white" disabled={!selectedUser || loading || saving} onClick={() => { if (selectedUser) void loadDefaults(selectedUser.user_id) }}>
              <RefreshCw className="h-4 w-4" />تحديث
            </Button>
            <Button className="h-10 gap-2 rounded-xl bg-white font-bold text-emerald-700 hover:bg-emerald-50" onClick={handleSaveAll} disabled={!selectedUser || !selectedBranchIds.length || loading || saving || !rows.length}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ
            </Button>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><UsersRound className="h-4 w-4" /></span>
          <div>
            <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">لمن تُطبَّق الإعدادات؟</h2>
            <p className="text-xs text-slate-500">اختر مستخدماً أو أكثر وفرعاً أو أكثر</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <ReportMultiChoice
            label="المستخدمون *"
            options={users.map((user) => ({ id: userKey(user), name: user.display_name }))}
            selected={selectedUserIds}
            onChange={(ids) => !saving && setSelectedUserIds(ids)}
            placeholder="اختر مستخدماً أو أكثر"
          />
          <ReportMultiChoice
            label="الفروع *"
            options={branches.map((branch) => ({ id: Number(branch.id), name: branch.branch_name, code: branch.branch_code }))}
            selected={selectedBranchIds}
            onChange={(ids) => !saving && setSelectedBranchIds(ids)}
            placeholder="اختر فرعاً أو أكثر"
          />
        </div>
        {selectedUser && selectedBranchIds.length > 0 && (selectedUserIds.length > 1 || selectedBranchIds.length > 1) && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              يتم عرض إعدادات <b>{selectedUser.display_name}</b> في <b>{branches.find((branch) => branch.id === branchId)?.branch_name}</b>.
              عند الحفظ تُطبَّق الحسابات على <b>{selectedUserIds.length} مستخدم × {selectedBranchIds.length} فرع</b>، والمستودعات والإعدادات الأخرى على كل المستخدمين المحددين.
            </span>
          </div>
        )}
        {(!selectedUser || !selectedBranchIds.length) && (
          <p className="mt-3 rounded-xl border border-dashed border-slate-200 px-3 py-2 text-center text-xs text-slate-500">اختر المستخدم والفرع لعرض الإعدادات وتعديلها</p>
        )}
      </section>

      <Card className="w-full overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-200 bg-gradient-to-l from-teal-50 to-sky-50 px-6 py-5 dark:from-slate-900 dark:to-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg text-slate-900 dark:text-slate-100">حسابات الصناديق والبنوك الافتراضية</CardTitle>
              <p className="mt-1 text-xs text-slate-500">Enter أو Tab للتنقل، Shift للرجوع، F2 للبحث، وDelete للمسح</p>
            </div>
            <div className="rounded-full bg-white px-3 py-1 text-xs text-teal-700 ring-1 ring-teal-200">{rows.length} عملات</div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col bg-slate-50/70 p-0">
          <div className="px-6 pt-6">
            <Messages innerRef={messagesRef} />
          </div>
          <div className="relative m-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" style={{ height: `${Math.max(170, Math.min(420, 94 + rows.length * 46))}px` }}>
            <div className="h-full w-full overflow-hidden">
              <DataGridView
                className="h-full w-full border-0 [&_.wj-cell]:!border-slate-200 [&_.wj-cell]:!text-sm [&_.wj-header]:!bg-teal-50 [&_.wj-header]:!font-bold [&_.wj-header]:!text-teal-900 [&_.wj-state-selected]:!bg-emerald-100 [&_.wj-state-selected]:!text-emerald-950"
                scheme={scheme}
                dataSource={rows}
                innerRef={gridRef}
                isReadOnly={!selectedUser || loading || saving}
                defaultRowHeight={44}
                autoRowHeights={false}
                columnHeaderHeight={46}
                onKeyDownCapture={(grid: any, event: KeyboardEvent) => handleGridKeyDown(grid, event)}
                onRowDoubleClick={(_row: any, selection: any) => {
                  const control = gridRef.current?.control || gridRef.current
                  const binding = control?.columns?.[selection?.col]?.binding
                  const accountColumn = accountColumns.find((item) => item.name === binding)
                  if (accountColumn && selection?.row >= 0) openAccountSearch(selection.row, accountColumn.field)
                }}
                keyActionEnter={KeyAction.None}
                keyActionTab={KeyAction.None}
                dontConvertToCards
                showContextMenu={false}
                containerStyle={{ height: '100%', minHeight: 0, maxHeight: '100%' }}
                style={{ height: '100%', minHeight: 0, maxHeight: '100%', width: '100%' }}
              />
            </div>
            {(loading || saving) && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                  جاري التحميل...
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="w-full overflow-hidden border-slate-200 shadow-sm">
        <SectionHeading icon={Warehouse} title="المستودعات الافتراضية" description="تُطبَّق على المستخدم (لكل الفروع)" />
        {warehousesSectionOpen && (
          <CardContent className="grid grid-cols-1 gap-5 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">
            {WAREHOUSE_FIELDS.map((config) => (
              <div key={config.field} className="space-y-1.5">
                <label className="block text-right text-sm font-medium text-slate-700">{config.label}</label>
                <div className="flex items-center gap-2" dir="rtl">
                  <Input
                    readOnly
                    value={
                      warehouseDefaults[config.field]
                        ? `${warehouseDefaults[config.field]} / ${warehouseDefaults[config.nameField] || ''}`
                        : ''
                    }
                    className="text-right"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="بحث"
                    onClick={() => openWarehouseSearch(config.field)}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="مسح"
                    onClick={() => clearWarehouseField(config.field)}
                  >
                    <Eraser className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      <Card className="w-full overflow-hidden border-slate-200 shadow-sm">
        <SectionHeading icon={SlidersHorizontal} title="اعدادات اخرى" description="تفضيلات إدخال السندات للمستخدم" />
        {otherSettingsSectionOpen && (
          <CardContent className="p-4 sm:p-6" dir="rtl">
            <label htmlFor="price-entry-includes-tax" className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 transition hover:border-emerald-300 hover:bg-emerald-50/40">
            <span>
              <span className="block text-sm font-semibold text-slate-800">السعر عند الادخال يشمل الضريبة</span>
              <span className="block text-xs text-slate-500">السعر المُدخَل يدوياً بسندات المبيعات يُعامَل كشامل للضريبة ويُحوَّل لغير شامل</span>
            </span>
            <Switch
              id="price-entry-includes-tax"
              checked={priceEntryIncludesTax}
              onCheckedChange={setPriceEntryIncludesTax}
              disabled={!selectedUser}
            />
            </label>
          </CardContent>
        )}
      </Card>

      <StoresSearchPopup
        visible={warehouseSearchOpen}
        onClose={() => {
          setWarehouseSearchOpen(false)
          setWarehouseSearchField(null)
        }}
        onSelect={handleWarehouseSelect}
        stores={warehouses.map((w) => ({ id: w.id, warehouse_name: w.warehouse_name, code: w.warehouse_code }))}
      />

      {accountDialogOpen && (
        <AccountSearchDialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen} accounts={[]} onSelect={handleAccountSelect} />
      )}
    </div>
  )
}

function SectionHeading({ icon: Icon, title, description }: { icon: typeof Wallet; title: string; description?: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-200 bg-gradient-to-l from-emerald-50 to-teal-50/40 px-4 py-3 sm:px-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-900">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm"><Icon className="h-4 w-4" /></span>
      <div>
        <h3 className="text-sm font-extrabold text-slate-800 sm:text-base dark:text-slate-100">{title}</h3>
        {description && <p className="text-xs text-slate-500">{description}</p>}
      </div>
    </div>
  )
}
