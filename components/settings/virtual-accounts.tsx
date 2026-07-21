"use client"

import React, { useEffect, useState, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import Dropdown from "@/components/common/Dropdown"
import DataGridView from "@/components/common/DataGridView"
import Messages from "@/components/common/Messages"
import AccountSearchDialog from "@/components/customer/account-search-dialog"

export default function VirtualAccounts() {
  const [users, setUsers] = useState<any[]>([])
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [currencies, setCurrencies] = useState<any[]>([])
  const [rows, setRows] = useState<any[]>([])
  const [userCurrencyMappings, setUserCurrencyMappings] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const [selectedRowIndex, setSelectedRowIndex] = useState(-1)
  const [selectedField, setSelectedField] = useState<string | null>(null)

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
      setCurrencies(list)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    loadUsers()
    loadCurrencies()
  }, [])

  const loadUserMappings = async (userId: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/settings/users-currencies-default?user_id=${userId}`)
      const data = await res.json()
      setUserCurrencyMappings(Array.isArray(data?.rows) ? data.rows : [])
    } catch (err) {
      console.error(err)
      setUserCurrencyMappings([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!selectedUser) {
      setUserCurrencyMappings([])
      return
    }

    loadUserMappings(selectedUser.id)
  }, [selectedUser])

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
        onClick: (e, ctx) => {
          e.stopPropagation()
          if (!selectedUser) {
            showErrorMessage('اختر مستخدما اولا')
            return
          }
          setSelectedRowIndex(ctx.row.index)
          setSelectedField('cash_account')
          setAccountDialogOpen(true)
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
        onClick: (e, ctx) => {
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
        onClick: (e, ctx) => {
          e.stopPropagation()
          if (!selectedUser) {
            showErrorMessage('اختر مستخدما اولا')
            return
          }
          setSelectedRowIndex(ctx.row.index)
          setSelectedField('incoming_checks_account')
          setAccountDialogOpen(true)
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
        onClick: (e, ctx) => {
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
        onClick: (e, ctx) => {
          e.stopPropagation()
          if (!selectedUser) {
            showErrorMessage('اختر مستخدما اولا')
            return
          }
          setSelectedRowIndex(ctx.row.index)
          setSelectedField('returned_checks_account')
          setAccountDialogOpen(true)
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
        onClick: (e, ctx) => {
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
        onClick: (e, ctx) => {
          e.stopPropagation()
          if (!selectedUser) {
            showErrorMessage('اختر مستخدما اولا')
            return
          }
          setSelectedRowIndex(ctx.row.index)
          setSelectedField('card_account')
          setAccountDialogOpen(true)
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
        onClick: (e, ctx) => {
          e.stopPropagation()
          setRows((prev) => prev.map((r, i) => (i === ctx.row.index ? { ...r, card_account_id: null, card_account_display: '' } : r)))
        },
      },
    ],
  }), [selectedUser])

  const handleAccountSelect = (account) => {
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
    if (!selectedUser) { showErrorMessage('اختر مستخدما اولا'); return }
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
    const res = await fetch('/api/settings/users-currencies-default', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (res.ok && data.success) {
      showSuccessMessage('تمت العملية بنجاح')
      // Keep the current grid values on successful save.
    } else {
      showErrorMessage(data.error || 'فشلت العملية')
    }
  }

  return (
    <div className="flex flex-col h-screen w-full">
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">اعدادات</h2>
          <div className="flex gap-2">
            <Button onClick={handleSaveAll} disabled={!selectedUser}>حفظ</Button>
            <Button variant="outline" onClick={() => { if (selectedUser) loadUserMappings(selectedUser.user_id) }}>تحديث</Button>
          </div>
        </div>

        <div className="w-full max-w-sm invoice-currency-dropdown-wrap">
          <Dropdown
            caption="المستخدم"
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

      <Card className="w-full flex-1">
        <CardHeader>
          <CardTitle>حسابات الصناديق والبنوك الافتراضية</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col h-full p-0">
          <div className="px-6 pt-6">
            <Messages innerRef={messagesRef} />
          </div>
          <div className="mt-4 flex-1 overflow-hidden rounded-md border border-slate-300 bg-white">
            <div className="h-full w-full overflow-hidden">
              <DataGridView
                className="h-full w-full"
                scheme={scheme}
                dataSource={rows}
                innerRef={gridRef}
                isReadOnly={!selectedUser}
                defaultRowHeight={34}
                autoRowHeights={false}
                containerStyle={{ height: '100%', minHeight: 0, maxHeight: '100%' }}
                style={{ height: '100%', minHeight: 0, maxHeight: '100%', width: '100%' }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {accountDialogOpen && (
        <AccountSearchDialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen} accounts={[]} onSelect={handleAccountSelect} />
      )}
    </div>
  )
}
