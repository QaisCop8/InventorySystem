"use client"

import React, { useEffect, useState, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import Dropdown from "@/components/common/Dropdown"
import DataGridView from "@/components/common/DataGridView"
import Messages from "@/components/common/Messages"
import AccountSearchDialog from "@/components/customer/account-search-dialog"
import StoresSearchPopup from "@/components/products/StoresSearchPopup"
import "./virtual-accounts.css"
import { ChevronDown, ChevronUp, Search, Eraser, Save, RefreshCw, Loader2 } from "lucide-react"
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
  const [selectedUser, setSelectedUser] = useState<any>(null)
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
  }, [])

  const loadDefaults = async (userId: string | number) => {
    const requestId = ++requestRef.current
    setLoading(true)
    try {
      const query = encodeURIComponent(String(userId))
      const responses = await Promise.all([
        fetch(`/api/settings/users-currencies-default?user_id=${query}`, { cache: 'no-store' }),
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
  }, [selectedUser])

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
    if (!selectedUser || saving || loading) { showErrorMessage('اختر مستخدما اولا'); return }
    const payload = {
      user_id: selectedUser.user_id,
      rows: rows.map((r) => ({
        currency_id: r.currency_id,
        cash_account_id: r.cash_account_id,
        incoming_checks_account_id: r.incoming_checks_account_id,
        returned_checks_account_id: r.returned_checks_account_id,
        card_account_id: r.card_account_id,
      })),
    }
    setSaving(true)
    try {
    const [accountsRes, warehousesRes] = await Promise.all([
      fetch('/api/settings/users-currencies-default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      fetch('/api/settings/user-warehouse-defaults', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selectedUser.user_id,
          default_item_warehouse_id: warehouseDefaults.default_item_warehouse_id,
          finished_goods_warehouse_id: warehouseDefaults.finished_goods_warehouse_id,
          raw_materials_warehouse_id: warehouseDefaults.raw_materials_warehouse_id,
          price_entry_includes_tax: priceEntryIncludesTax,
        }),
      }),
    ])
    const data = await accountsRes.json()
    const warehousesData = await warehousesRes.json()
    if (accountsRes.ok && data.success && warehousesRes.ok && warehousesData.success) {
      if (await loadDefaults(selectedUser.user_id)) showSuccessMessage('تم الحفظ وإعادة تحميل الإعدادات بنجاح')
    } else {
      showErrorMessage(data.error || warehousesData.error || 'فشلت العملية')
    }
    } catch (error) {
      showErrorMessage(error instanceof Error ? error.message : 'تعذر حفظ الإعدادات')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div dir="rtl" className="virtual-accounts-page flex min-h-screen w-full flex-col gap-1 bg-slate-50/50 p-4 dark:bg-slate-950">
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">اعدادات</h2>
          <div className="flex gap-2">
            <Button className="gap-2 rounded-xl bg-teal-600 hover:bg-teal-700" onClick={handleSaveAll} disabled={!selectedUser || loading || saving || !rows.length}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ</Button>
            <Button variant="outline" className="gap-2 rounded-xl" disabled={!selectedUser || loading || saving} onClick={() => { if (selectedUser) void loadDefaults(selectedUser.user_id) }}><RefreshCw className="h-4 w-4" />تحديث</Button>
          </div>
        </div>

        <div className="w-full max-w-sm invoice-currency-dropdown-wrap">
          <Dropdown
            caption="المستخدم"
            disabled={saving}
            placeholder="اختر مستخدما"
            optionLabel="display_name"
            optionValue="id"
            options={users}
            value={selectedUser?.id ?? null}
            innerClass="invoice-currency-dropdown w-full"
            panelClassName="invoice-currency-dropdown-panel"
            appendTo="self"
            onChange={(e: any) => {
              const value = e.value
              if (value && typeof value === 'object' && 'id' in value) {
                setSelectedUser(value)
                return
              }
              setSelectedUser(users.find((u) => Number(u.id) === Number(value)) ?? null)
            }}
          />
        </div>
      </div>

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

      <Card className="w-full mt-4">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-t-lg bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
          onClick={() => setWarehousesSectionOpen((prev) => !prev)}
        >
          {warehousesSectionOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <span>المستودعات</span>
        </button>
        {warehousesSectionOpen && (
          <CardContent className="grid grid-cols-1 gap-6 pt-6 sm:grid-cols-2">
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

      <Card className="w-full mt-4">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-t-lg bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
          onClick={() => setOtherSettingsSectionOpen((prev) => !prev)}
        >
          {otherSettingsSectionOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <span>اعدادات اخرى</span>
        </button>
        {otherSettingsSectionOpen && (
          <CardContent className="flex items-center justify-between gap-4 pt-6" dir="rtl">
            <Label htmlFor="price-entry-includes-tax" className="text-sm font-medium text-slate-700">
              السعر عند الادخال يشمل الضريبة
            </Label>
            <Switch
              id="price-entry-includes-tax"
              checked={priceEntryIncludesTax}
              onCheckedChange={setPriceEntryIncludesTax}
              disabled={!selectedUser}
            />
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
