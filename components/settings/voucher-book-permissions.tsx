"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Copy, RefreshCw } from "lucide-react"
import DataGridView from "@/components/common/DataGridView"
import Messages from "@/components/common/Messages"

interface UserOption {
  id: number
  user_id: string
  full_name: string
  username: string
}

interface BookOption {
  id: number
  name: string
}

interface PermissionRow {
  voucher_type_id: number
  voucher_type_name: string
  books: BookOption[]
  assigned_book_ids: number[]
  default_book_id: number | null
}

export default function VoucherBookPermissions() {
  const [users, setUsers] = useState<UserOption[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [rows, setRows] = useState<PermissionRow[]>([])
  const [loading, setLoading] = useState(false)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerRow, setPickerRow] = useState<PermissionRow | null>(null)
  const [pickerSelectedBooks, setPickerSelectedBooks] = useState<number[]>([])
  const [pickerDefaultBook, setPickerDefaultBook] = useState<number | null>(null)
  const [pickerSearch, setPickerSearch] = useState("")
  const messagesRef = useRef<any>(null)

  const [copyOpen, setCopyOpen] = useState(false)
  const [copyFromUserId, setCopyFromUserId] = useState<number | null>(null)

  useEffect(() => {
    fetchUsers()
  }, [])

  useEffect(() => {
    if (selectedUserId) fetchPermissions(selectedUserId)
    else setRows([])
  }, [selectedUserId])

  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/settings/user")
      const data = await response.json()
      const list = Array.isArray(data) ? data : []
      setUsers(list)
      if (list.length > 0) setSelectedUserId(list[0].id)
    } catch (error) {
      console.error("Failed to fetch users", error)
      setUsers([])
    }
  }

  const fetchPermissions = async (userId: number) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/voucher-book-permissions?user_id=${userId}`)
      const data = await response.json()
      setRows(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Failed to fetch voucher book permissions", error)
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  const openPicker = (row: PermissionRow) => {
    // "0" is a real row in voucher_books_tbl (not a null sentinel) — fall back to it so the
    // dropdown always shows a concrete selection, matching the reference screen's default.
    const zeroBook = row.books.find((b) => b.name === "0")
    setPickerRow(row)
    setPickerSelectedBooks(row.assigned_book_ids)
    setPickerDefaultBook(row.default_book_id ?? zeroBook?.id ?? null)
    setPickerSearch("")
    setPickerOpen(true)
  }

  // Picking a book toggles it in/out of the allowed list; dropping the current default clears it.
  const toggleBook = (bookId: number) => {
    setPickerSelectedBooks((prev) => {
      const isSelected = prev.includes(bookId)
      const next = isSelected ? prev.filter((id) => id !== bookId) : [...prev, bookId]
      if (isSelected && pickerDefaultBook === bookId) setPickerDefaultBook(null)
      return next
    })
  }

  // Choosing a default from the dropdown implies it's allowed, even if not clicked in the list.
  const setDefaultBook = (bookId: number | null) => {
    setPickerDefaultBook(bookId)
    if (bookId !== null) {
      setPickerSelectedBooks((prev) => (prev.includes(bookId) ? prev : [...prev, bookId]))
    }
  }

  const filteredPickerBooks = (pickerRow?.books || []).filter((book) =>
    book.name.toLowerCase().includes(pickerSearch.trim().toLowerCase()),
  )

  const showPickerError = (detail: string) => {
    messagesRef.current?.clear?.()
    messagesRef.current?.show?.([{ severity: "error", summary: "", detail, sticky: false, life: 4000 }])
  }

  const savePicker = async () => {
    if (!selectedUserId || !pickerRow) return
    if (pickerDefaultBook && !pickerSelectedBooks.includes(pickerDefaultBook)) {
      showPickerError("الدفتر الافتراضي يجب ان يكون احد الدفاتر المختارة من الاسفل")
      return
    }
    try {
      const response = await fetch("/api/voucher-book-permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: selectedUserId,
          voucher_type_id: pickerRow.voucher_type_id,
          book_ids: pickerSelectedBooks,
          default_book_id: pickerDefaultBook,
        }),
      })
      if (!response.ok) {
        const error = await response.json()
        showPickerError(error.error || "فشل في الحفظ")
        return
      }
      const data = await response.json()
      setRows(Array.isArray(data) ? data : [])
      setPickerOpen(false)
    } catch (error) {
      console.error("Failed to save voucher book permissions", error)
      showPickerError("فشل في الحفظ")
    }
  }

  const runCopy = async () => {
    if (!selectedUserId || !copyFromUserId) return
    try {
      const response = await fetch("/api/voucher-book-permissions/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_user_id: copyFromUserId, to_user_id: selectedUserId }),
      })
      if (!response.ok) return
      const data = await response.json()
      setRows(Array.isArray(data) ? data : [])
      setCopyOpen(false)
    } catch (error) {
      console.error("Failed to copy voucher book permissions", error)
    }
  }

  const gridData = useMemo(
    () =>
      rows.map((row, index) => {
        const defaultBook = row.books.find((b) => b.id === row.default_book_id)
        const assignedBooks = row.books.filter((b) => row.assigned_book_ids.includes(b.id))
        return {
          ser: index + 1,
          voucher_type_id: row.voucher_type_id,
          voucher_type_name: row.voucher_type_name,
          books_list: assignedBooks.map((b) => b.name).join(", "),
          default_book_name: defaultBook ? defaultBook.name : "",
        }
      }),
    [rows],
  )

  const scheme = useMemo(
    () => ({
      name: "VoucherBookPermissionsScheme",
      filter: false,
      showFooter: false,
      sortable: false,
      columns: [
        { header: "#", name: "ser", width: 50, isReadOnly: true },
        { header: "نوع السند", name: "voucher_type_name", width: 200, isReadOnly: true },
        { header: "دفاتر السندات", name: "books_list", width: "*", minWidth: 220, isReadOnly: true },
        { header: "دفتر السندات الافتراضي", name: "default_book_name", width: 180, isReadOnly: true },
        {
          name: "btnPick",
          header: "تحديد الدفاتر",
          width: 110,
          buttonBody: "button",
          align: "center",
          iconType: "search",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            const row = rows[ctx.row.index]
            if (row) openPicker(row)
          },
          visible: true,
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows],
  )

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-col gap-2">
        <div className="text-xl font-semibold">صلاحيات المستخدمين على دفاتر السندات</div>
        <div className="text-sm text-muted-foreground">تحديد دفاتر السندات المسموحة لكل مستخدم والدفتر الافتراضي له</div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">المستخدم</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5 min-w-[280px]">
              <Label>المستخدم *</Label>
              <select
                value={selectedUserId ?? ""}
                onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : null)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              >
                <option value="">اختر</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.username}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!selectedUserId}
              onClick={() => {
                setCopyFromUserId(null)
                setCopyOpen(true)
              }}
            >
              <Copy className="h-4 w-4" />
              نسخ من مستخدم آخر
            </Button>
            <Button variant="outline" size="sm" disabled={!selectedUserId} onClick={() => selectedUserId && fetchPermissions(selectedUserId)}>
              <RefreshCw className="h-4 w-4" />
              تحديث
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-lg border border-slate-200" style={{ minHeight: 200 }}>
        {selectedUserId ? (
          <DataGridView
            dir="rtl"
            scheme={scheme}
            dataSource={gridData}
            idProperty="ser"
            theme="default-light"
            isReport={false}
            showContextMenu={false}
            columnHeaderHeight={42}
            defaultRowHeight={38}
            dontConvertToCards={true}
          />
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">اختر مستخدماً لعرض صلاحياته</div>
        )}
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-sm p-0 overflow-hidden" dir="rtl">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="text-base">بحث دفاتر السندات</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-4 pb-4 pt-2">
            <div className="grid gap-1.5">
              <Label>دفتر السندات الافتراضي</Label>
              <select
                value={pickerDefaultBook ?? ""}
                onChange={(e) => setDefaultBook(e.target.value === "" ? null : Number(e.target.value))}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              >
                {(pickerRow?.books || []).map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.name}
                  </option>
                ))}
              </select>
            </div>

            <Input
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder="ابحث من خلال دفتر السندات"
              className="text-right"
            />

            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
              {filteredPickerBooks.map((book) => {
                const selected = pickerSelectedBooks.includes(book.id)
                return (
                  <button
                    key={book.id}
                    type="button"
                    onClick={() => toggleBook(book.id)}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-sm ${
                      selected ? "bg-sky-500 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {book.name}
                  </button>
                )
              })}
              {filteredPickerBooks.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-slate-400">لا توجد نتائج</div>
              )}
            </div>

            <Messages innerRef={messagesRef} />

            <div className="flex justify-center gap-2 border-t pt-4">
              <Button onClick={savePicker} className="search-button shadow-sm">
                موافق
              </Button>
              <Button variant="outline" onClick={() => setPickerOpen(false)} className="search-button shadow-sm">
                إغلاق
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>نسخ صلاحيات دفاتر السندات من مستخدم آخر</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label>نسخ من المستخدم</Label>
              <select
                value={copyFromUserId ?? ""}
                onChange={(e) => setCopyFromUserId(e.target.value ? Number(e.target.value) : null)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              >
                <option value="">اختر</option>
                {users.filter((u) => u.id !== selectedUserId).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.username}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-amber-600">سيتم استبدال صلاحيات المستخدم الحالي بصلاحيات المستخدم المصدر لجميع أنواع السندات.</p>
            <div className="flex justify-center gap-2 border-t pt-3">
              <Button size="sm" disabled={!copyFromUserId} onClick={runCopy}>
                نسخ
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCopyOpen(false)}>
                إلغاء
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
