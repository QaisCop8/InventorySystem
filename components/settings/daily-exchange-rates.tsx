"use client"

import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Save } from "lucide-react"
import * as wjcCore from "@grapecity/wijmo"
import { KeyAction } from "@grapecity/wijmo.grid"
import DataGridView from "@/components/common/DataGridView"

interface CurrencyRateRow {
  ser: number
  currency_id: number
  currency_code: string
  currency_name: string
  is_base: boolean
  buy_rate: number
  sell_rate: number
  exchange_rate: number
  inverse_rate: number
}

interface DailyExchangeRatesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

const EDITABLE_COLUMNS = ["buy_rate", "sell_rate", "exchange_rate"] as const

function withDerivedFields(rows: Omit<CurrencyRateRow, "ser" | "inverse_rate">[]): CurrencyRateRow[] {
  return rows.map((row, index) => ({
    ...row,
    ser: index + 1,
    inverse_rate: row.exchange_rate > 0 ? 1 / row.exchange_rate : 0,
  }))
}

const scheme = {
  name: "DailyExchangeRatesScheme",
  showFooter: false,
  columns: [
    { header: "#", name: "ser", width: 45, isReadOnly: true, dataType: "Number", align: "center" },
    { header: "رئيسية", name: "is_base", width: 70, isReadOnly: true, dataType: "Boolean", align: "center" },
    { header: "رمز العملة", name: "currency_code", width: 110, isReadOnly: true },
    { header: "اسم العملة (ar)", name: "currency_name", width: "*", minWidth: 200, isReadOnly: true },
    { header: "سعر الشراء", name: "buy_rate", width: 130, dataType: "Number" },
    { header: "سعر البيع", name: "sell_rate", width: 130, dataType: "Number" },
    { header: "سعر الصرف", name: "exchange_rate", width: 130, dataType: "Number" },
    { header: "سعر الصرف المقابل", name: "inverse_rate", width: 160, isReadOnly: true, dataType: "Number" },
  ],
}

// نافذة إدخال/تحديث أسعار الصرف اليومية لكل العملات دفعة واحدة — تُفتح يدوياً من زر شريط الأدوات
// العلوي، أو تلقائياً عبر useDailyExchangeRatesCheck عند اكتشاف عملة بلا سعر صرف مسجَّل لليوم.
// العملة الرئيسية (الأصغر معرّفاً في جدول currency) سعرها ثابت دوماً عند 1 ولا تُعرَض قابلة للتعديل،
// بنفس افتراض /api/exchange-rates/lookup. تغيير التاريخ يُعيد التحميل من /api/exchange-rates?date=...
// التي تعرض السعر المسجَّل لذلك التاريخ إن وُجد، أو تنسخ آخر سعر سابق وتحفظه تلقائياً كسعر ذلك اليوم
// إن لم يوجد (انظر lib/database.ts's getOrCreateRatesForDate).
export function DailyExchangeRatesDialog({ open, onOpenChange, onSaved }: DailyExchangeRatesDialogProps) {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  const [rateDate, setRateDate] = useState(today)
  const [rows, setRows] = useState<CurrencyRateRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const savingRef = useRef(false)

  // مرجع دوماً بآخر rows حيّة — تُقرَأ من داخل مُعالِجات Wijmo (cellEditEnded/beginningEdit/onKeyDown)
  // التي لا يُعاد ربطها بالضرورة عند كل عرض (render)، فتتجنَّب الإغلاق المتجمِّد (stale closure).
  const rowsRef = useRef(rows)
  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  const gridRef = useRef<any>(null)
  const pendingNavigationRef = useRef<{ row: number; col: number } | null>(null)
  const [collectionView] = useState(() => new wjcCore.CollectionView<CurrencyRateRow>([]))
  useEffect(() => {
    if (!open) return
    const currentRows = collectionView.sourceCollection as CurrencyRateRow[]
    const isSameGridData =
      currentRows.length === rows.length && currentRows.every((row, index) => row === rows[index])
    // Cell editing already mutates the object used by FlexGrid. Refreshing the
    // CollectionView for that same set of objects resets its selection to row 0.
    if (isSameGridData) {
      gridRef.current?.invalidate?.()
      return
    }
    collectionView.sourceCollection = rows
    collectionView.refresh()
  }, [open, rows, collectionView])

  useEffect(() => {
    if (!open) return
    setError("")
    setLoading(true)
    fetch(`/api/exchange-rates?date=${rateDate}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("فشل تحميل أسعار الصرف"))))
      .then((data) => {
        const list = Array.isArray(data?.rates) ? data.rates : []
        const baseId = list.length > 0 ? Math.min(...list.map((r: any) => Number(r.currency_id))) : null
        const mapped = list
          .filter((r: any) => r.is_active !== false)
          .map((r: any) => {
            const isBase = Number(r.currency_id) === baseId
            return {
              currency_id: Number(r.currency_id),
              currency_code: r.currency_code ?? "",
              currency_name: r.currency_name ?? "",
              is_base: isBase,
              buy_rate: Number(r.buy_rate) || 0,
              sell_rate: Number(r.sell_rate) || 0,
              exchange_rate: Number(r.exchange_rate) || 0,
            }
          })
          .sort((a: any, b: any) => a.currency_id - b.currency_id)
        setRows(withDerivedFields(mapped))
      })
      .catch((err) => setError(err instanceof Error ? err.message : "حدث خطأ أثناء تحميل أسعار الصرف"))
      .finally(() => setLoading(false))
  }, [open, rateDate])

  const updateRow = (currencyId: number, field: (typeof EDITABLE_COLUMNS)[number], value: number) => {
    setRows((prev) => {
      const row = prev.find((item) => item.currency_id === currencyId)
      if (!row) return prev
      row[field] = value
      row.inverse_rate = row.exchange_rate > 0 ? 1 / row.exchange_rate : 0
      return [...prev]
    })
  }

  // يمنع بدء تحرير خلايا السعر (شراء/بيع/صرف) لسطر العملة الرئيسية — سعرها ثابت دوماً عند 1.
  const handleBeginningEdit = (grid: any, e: any) => {
    const colName = grid?.columns?.[e.col]?.binding
    const row = rowsRef.current[e.row]
    if (row?.is_base && (EDITABLE_COLUMNS as readonly string[]).includes(colName)) {
      e.cancel = true
    }
  }

  const handleCellEditEnded = (grid: any, e: any) => {
    const colName = grid?.columns?.[e.col]?.binding
    const row = rowsRef.current[e.row]
    if (!row || !(EDITABLE_COLUMNS as readonly string[]).includes(colName)) return
    const raw = grid.getCellData(e.row, e.col, false)
    const numeric = raw === "" || raw === null || raw === undefined ? 0 : Number(raw)
    updateRow(row.currency_id, colName, Number.isFinite(numeric) ? numeric : 0)
  }

  // Tab/Enter تنتقل بين أعمدة السعر القابلة للتحرير فقط (تتخطّى الأعمدة القرائية)، وتنتقل لأول عمود
  // قابل بالسطر التالي عند الوصول لآخر عمود — تتخطّى أي سطر رئيسي (غير قابل للتحرير) في طريقها.
  const handleKeyDown = (grid: any, e: any) => {
    // يُستدعى مرتين لكل ضغطة مفتاح فعلياً: مرة بمعطيات Wijmo الصحيحة، ومرة أخرى بمعطيات غير مكتملة
    // (onKeyDown ليس حدثاً مُوثَّقاً بـFlexGridInputs) — بلا هذا الحارس، قراءة e.keyCode على undefined
    // بالاستدعاء الثاني تُطلِق استثناءً غير مُلتقَط قد يمنع Wijmo من بدء تحرير الخلية.
    if (!grid || !grid.selection || !e || typeof e.keyCode === "undefined") return
    if (e.keyCode !== Util_TAB && e.keyCode !== Util_ENTER) return
    if (e.defaultPrevented || pendingNavigationRef.current) return
    // أثناء التحرير قد يعيد Wijmo selection لأول صف قبل وصول keydown؛ editRange
    // هو المصدر الصحيح لموقع الخلية التي كتب فيها المستخدم.
    const editRange = grid.editRange
    const row = editRange?.row ?? grid.selection.row
    const col = editRange?.col ?? grid.selection.col
    if (row < 0 || col < 0) return
    const colName = grid.columns[col]?.binding
    const idx = EDITABLE_COLUMNS.indexOf(colName as any)
    if (idx === -1) return

    e.preventDefault()
    e.stopPropagation()
    grid.finishEditing?.()

    let nextIdx = idx + 1
    let nextRow = row
    if (nextIdx >= EDITABLE_COLUMNS.length) {
      nextIdx = 0
      nextRow = row + 1
      while (nextRow < grid.rows.length && rowsRef.current[nextRow]?.is_base) {
        nextRow += 1
      }
    }
    if (nextRow >= grid.rows.length) return

    const nextColIndex = grid.columns.findIndex((c: any) => c.binding === EDITABLE_COLUMNS[nextIdx])
    if (nextColIndex === -1) return
    pendingNavigationRef.current = { row: nextRow, col: nextColIndex }
    // Move after Wijmo has completed the current editor lifecycle; otherwise its
    // own edit-ending work may restore the selection to the cell just committed.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
      try {
        const target = pendingNavigationRef.current
        if (!target) return
        // FlexGrid.select expects a numeric column index. Passing the binding
        // string made Enter resolve an invalid range and jump to an earlier row.
        grid.select(target.row, target.col)
        grid.focus()
        grid.startEditing(true, target.row, target.col)
      } catch {
        // The dialog may have closed while the deferred navigation was pending.
      } finally {
        pendingNavigationRef.current = null
      }
      })
    })
  }

  const handleSave = async () => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError("")
    try {
      for (const row of rowsRef.current) {
        if (row.is_base) continue
        const res = await fetch("/api/exchange-rates", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: 0,
            type: 1,
            currency_id: row.currency_id,
            buy_rate: row.buy_rate,
            sell_rate: row.sell_rate,
            exchange_rate: row.exchange_rate,
            is_active: true,
            rate_date: rateDate,
          }),
        })
        if (!res.ok) throw new Error("فشل حفظ سعر صرف بعض العملات")
      }
      onSaved?.()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ أثناء الحفظ")
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key !== "F3") return
      event.preventDefault()
      event.stopPropagation()
      if (!savingRef.current && !loading && rowsRef.current.length > 0) {
        void handleSave()
      }
    }
    document.addEventListener("keydown", handleShortcut, true)
    return () => document.removeEventListener("keydown", handleShortcut, true)
  }, [open, loading])

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && savingRef.current) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        className="flex h-[min(85vh,720px)] max-w-6xl flex-col overflow-hidden"
        dir="rtl"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>أسعار الصرف اليومية</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <Label htmlFor="daily-exchange-rate-date" className="whitespace-nowrap text-sm text-muted-foreground">
            أسعار الصرف بتاريخ
          </Label>
          <Input
            id="daily-exchange-rate-date"
            type="date"
            value={rateDate}
            max={today}
            onChange={(e) => setRateDate(e.target.value || today)}
            className="w-48"
          />
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="relative min-h-0 w-full flex-1 overflow-hidden [&_.wj-flexgrid]:overflow-x-hidden">
          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/75 backdrop-blur-[1px]">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
            <DataGridView
              innerRef={gridRef}
              containerStyle={{ height: "100%", minHeight: 0, maxHeight: "100%", overflow: "hidden" }}
              style={{ height: "100%", minHeight: 0, maxHeight: "100%", width: "100%", overflowX: "hidden" }}
              scheme={scheme}
              dataSource={collectionView}
              idProperty="currency_id"
              isReport={false}
              showContextMenu={false}
              cellEditEnded={(s: any, e: any) => handleCellEditEnded(s, e)}
              beginningEdit={(s: any, e: any) => handleBeginningEdit(s, e)}
              onKeyDownCapture={(s: any, e: any) => handleKeyDown(s, e)}
              keyActionEnter={KeyAction.None}
              keyActionTab={KeyAction.None}
              dontConvertToCards={true}
            />
        </div>

        <div className="flex shrink-0 justify-end gap-3">
          <Button onClick={handleSave} disabled={saving || loading || rows.length === 0}>
            {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
            حفظ
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            إغلاق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// أكواد المفاتيح (Tab=9, Enter=13) — بلا اعتماد على Util.keyboardKeys (خاص بسندات المخزون) لإبقاء
// هذا المكوّن مستقلاً بلا استيراد إضافي غير ضروري.
const Util_TAB = 9
const Util_ENTER = 13
