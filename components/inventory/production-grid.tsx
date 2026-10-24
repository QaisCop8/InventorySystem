"use client"

import { useEffect, useMemo, useRef } from "react"
import { KeyAction } from "@grapecity/wijmo.grid"
import * as wjcCore from "@grapecity/wijmo"
import DataGridView from "@/components/common/DataGridView"
import Util from "@/components/common/Util"

// جدول أصناف سند الانتاج (المواد المنتجة / المواد الخام) بنفس أسلوب الإدخال في إرسالية المبيعات: DataGridView مع
// cellEditEnded وonKeyDownCapture — رقم الصنف يُبحث عنه عند انتهاء التحرير، Enter/Tab للخلية القابلة للتحرير
// التالية ثم سطر جديد، F10 بحث الأصناف (أو زر البحث)، F7 حذف السطر. سطر فارغ دائماً في النهاية للإدخال.

export type ProductionGridLine = {
  key: string; item_id: number; product_code: string; product_name: string; unit_name: string
  quantity: string; price: string; expiry_date: string; batch_no: string
  has_expiry?: boolean; has_batch?: boolean; transferred?: number; source?: string | null; edited?: boolean
}

type Props = {
  gridKey: string
  lines: ProductionGridLine[]
  locked: boolean
  produced: boolean
  showExpiry: boolean
  showBatch: boolean
  /** يحلّ رقم الصنف المكتوب في السطر row (row = lines.length سطر جديد) — true عند النجاح */
  onCode: (row: number, code: string) => Promise<boolean>
  onSearch: (row: number) => void
  onPatch: (key: string, patch: Partial<ProductionGridLine>) => void
  onRemove: (row: number) => void
}

const resolveFlexControl = (grid: any): any => {
  if (!grid) return null
  if ("control" in grid) return grid.control && grid.control.columns ? grid.control : null
  return grid.columns ? grid : null
}
const safeFinishEditing = (grid: any) => {
  const control = resolveFlexControl(grid)
  if (!control || typeof control.finishEditing !== "function") return
  if (control.hostElement && !control.hostElement.isConnected) return
  try { control.finishEditing() } catch { /* ignore */ }
}
const NAVIGATION_KEYS = new Set([Util.keyboardKeys.Tab, Util.keyboardKeys.Enter, Util.keyboardKeys.DownArrow, Util.keyboardKeys.UpArrow, Util.keyboardKeys.LeftArrow, Util.keyboardKeys.RightArrow, Util.keyboardKeys.Esc, Util.keyboardKeys.F10, Util.keyboardKeys.F7])

export function ProductionGrid({ gridKey, lines, locked, produced, showExpiry, showBatch, onCode, onSearch, onPatch, onRemove }: Props) {
  const gridRef = useRef<any>(null)
  const linesRef = useRef(lines)
  linesRef.current = lines
  const pendingFocus = useRef<{ row: number; col: string } | null>(null)
  const handlersRef = useRef({ onCode, onSearch, onPatch, onRemove })
  handlersRef.current = { onCode, onSearch, onPatch, onRemove }

  const view = useMemo(() => {
    const v = new wjcCore.CollectionView<any>([])
    try { v.refreshOnEdit = false } catch { /* ignore */ }
    return v
  }, [gridKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ترتيب الخلايا القابلة للتحرير (تنقّل Enter/Tab)
  const editable = useMemo(() => ["product_code", "quantity", "price", ...(produced && showExpiry ? ["expiry_date"] : []), ...(produced && showBatch ? ["batch_no"] : [])], [produced, showExpiry, showBatch])

  const focusCell = (row: number, col: string) => {
    const grid = resolveFlexControl(gridRef.current)
    if (!grid?.rows || grid.rows.length <= row) return false
    try { grid.select(row, grid.columns.getColumn(col)?.index ?? 0); grid.focus() } catch { return false }
    return true
  }

  // مزامنة مصدر الشبكة مع الأسطر (+ سطر فارغ للإدخال) ثم تطبيق التركيز المعلّق
  useEffect(() => {
    const rows = lines.map((line, index) => ({
      ser: index + 1, key: line.key, product_code: line.product_code, product_name: line.product_name, unit_name: line.unit_name,
      quantity: line.quantity === "" ? null : Number(line.quantity), price: line.price === "" ? null : Number(line.price),
      total: Math.round(Number(line.quantity || 0) * Number(line.price || 0) * 1000) / 1000,
      expiry_date: line.expiry_date || "", batch_no: line.batch_no || "", transferred: line.transferred || 0,
      source_label: !produced && line.source ? (line.edited ? "مكوّن (معدّل)" : "مكوّن تصنيع") : "",
    }))
    if (!locked) rows.push({ ser: rows.length + 1, key: "", product_code: "", product_name: "", unit_name: "", quantity: null, price: null, total: 0, expiry_date: "", batch_no: "", transferred: 0, source_label: "" })
    const grid = resolveFlexControl(gridRef.current)
    if (grid?.activeEditor) return
    view.sourceCollection = rows
    const target = pendingFocus.current
    if (target) {
      pendingFocus.current = null
      setTimeout(() => focusCell(target.row, target.col), 0)
    }
  }, [lines, locked, produced, view]) // eslint-disable-line react-hooks/exhaustive-deps

  const scheme = useMemo(() => ({
    name: produced ? "ProductionProducedScheme" : "ProductionRawScheme",
    showFooter: false,
    columns: [
      { header: "#", name: "ser", width: 45, isReadOnly: true, dataType: "Number" },
      { header: "رقم الصنف", name: "product_code", width: 130, maxLength: 10, isReadOnly: locked },
      {
        header: " ", name: "btnSearchProduct", width: 50, buttonBody: "button", align: "center", iconType: "search", isReadOnly: true, visible: !locked,
        onClick: (_e: any, ctx: any) => { if (!locked) setTimeout(() => handlersRef.current.onSearch(ctx.row.index), 0) },
      },
      { header: "اسم الصنف", name: "product_name", width: "*", minWidth: 180, isReadOnly: true },
      ...(!produced ? [{ header: "المصدر", name: "source_label", width: 110, isReadOnly: true }] : []),
      { header: "الوحدة", name: "unit_name", width: 90, isReadOnly: true },
      { header: "الكمية", name: "quantity", width: 100, dataType: wjcCore.DataType.Number, isReadOnly: locked },
      { header: "سعر الشراء", name: "price", width: 110, dataType: wjcCore.DataType.Number, isReadOnly: locked },
      { header: "القيمة", name: "total", width: 110, dataType: wjcCore.DataType.Number, isReadOnly: true },
      ...(produced && showExpiry ? [{ header: "الصلاحية (yyyy-mm-dd)", name: "expiry_date", width: 140, maxLength: 10, isReadOnly: locked }] : []),
      ...(produced && showBatch ? [{ header: "الرقم التشغيلي", name: "batch_no", width: 120, maxLength: 30, isReadOnly: locked }] : []),
      ...(produced && locked ? [{ header: "المنقول", name: "transferred", width: 90, dataType: wjcCore.DataType.Number, isReadOnly: true }] : []),
      {
        header: " ", name: "btnDelete", width: 50, buttonBody: "button", align: "center", iconType: "delete", isReadOnly: true, visible: !locked, title: "حذف السطر (F7)",
        onClick: (_e: any, ctx: any) => { if (!locked && ctx.row.index < linesRef.current.length) handlersRef.current.onRemove(ctx.row.index) },
      },
    ],
  }), [produced, locked, showExpiry, showBatch])

  const handleCellEditEnded = (grid: any, e: any) => {
    if (grid?.disposed || e?.cancel) return
    gridRef.current = grid
    const row = e.row
    const colName = grid?.columns?.[e.col]?.binding
    const value = grid.getCellData(row, e.col, false)
    const line = linesRef.current[row]
    if (colName === "product_code") {
      const code = String(value ?? "").trim()
      if (!code) return
      const adjusted = Util.adjustCode(code, 10).toUpperCase()
      if (line && adjusted === String(line.product_code || "").toUpperCase()) return
      void handlersRef.current.onCode(row, adjusted).then((ok) => {
        pendingFocus.current = ok ? { row, col: "quantity" } : { row, col: "product_code" }
        if (ok) setTimeout(() => { if (pendingFocus.current && focusCell(pendingFocus.current.row, pendingFocus.current.col)) pendingFocus.current = null }, 60)
      })
      return
    }
    if (!line) return
    if (colName === "quantity" || colName === "price") {
      handlersRef.current.onPatch(line.key, { [colName]: value === null || value === undefined || value === "" ? "" : String(Math.max(0, Number(value))) })
    } else if (colName === "expiry_date") {
      const text = String(value ?? "").trim()
      handlersRef.current.onPatch(line.key, { expiry_date: /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "" })
    } else if (colName === "batch_no") {
      handlersRef.current.onPatch(line.key, { batch_no: String(value ?? "").trim().slice(0, 30) })
    }
  }

  const handleKeyDown = (grid: any, e: any) => {
    if (!grid || !e || typeof e.keyCode === "undefined") return
    let sel
    try { sel = grid.selection } catch { return }
    if (!sel || sel.row < 0 || sel.col < 0) return
    gridRef.current = grid
    const row = sel.row
    const colName = grid.columns[sel.col]?.binding
    const line = linesRef.current[row]
    if (locked) return

    // سطر بلا صنف: لا إدخال إلا في رقم الصنف
    if (!line && colName !== "product_code" && !NAVIGATION_KEYS.has(e.keyCode)) { e.preventDefault(); return }
    if (["quantity", "price"].includes(colName) && e.key && e.key.length === 1 && !/[0-9.]/.test(e.key)) { e.preventDefault(); return }

    if (e.keyCode === Util.keyboardKeys.F7) {
      e.preventDefault()
      if (line) { safeFinishEditing(grid); handlersRef.current.onRemove(row) }
      return
    }
    if (e.keyCode === Util.keyboardKeys.F10 && colName === "product_code") {
      e.preventDefault()
      safeFinishEditing(grid)
      setTimeout(() => handlersRef.current.onSearch(row), 0)
      return
    }
    if (e.keyCode === Util.keyboardKeys.Tab || e.keyCode === Util.keyboardKeys.Enter) {
      e.preventDefault()
      e.stopPropagation()
      const typingCode = colName === "product_code" && grid.activeEditor && String(grid.activeEditor.value || "").trim() && String(grid.activeEditor.value || "").trim().toUpperCase() !== String(line?.product_code || "").toUpperCase()
      safeFinishEditing(grid)
      // رقم صنف جديد مكتوب: cellEditEnded يبحث عنه وينقل التركيز للكمية عند النجاح
      if (typingCode) return
      if (!line) { focusCell(row, "product_code"); return }
      const index = editable.indexOf(colName)
      const next = index >= 0 && index < editable.length - 1 ? { row, col: editable[index + 1] } : { row: row + 1, col: "product_code" }
      pendingFocus.current = next
      setTimeout(() => { if (pendingFocus.current && focusCell(pendingFocus.current.row, pendingFocus.current.col)) pendingFocus.current = null }, 30)
    }
  }

  return (
    <div className="w-full max-w-full overflow-x-auto">
      <DataGridView
        key={`${gridKey}-${locked ? "locked" : "edit"}-${showExpiry}-${showBatch}`}
        allowSorting={false}
        innerRef={gridRef}
        style={{ height: "260px" }}
        scheme={scheme}
        dataSource={view}
        idProperty="ser"
        isReport={false}
        isReadOnly={locked}
        showContextMenu={false}
        cellEditEnded={(s: any, e: any) => handleCellEditEnded(s, e)}
        onKeyDownCapture={(s: any, e: any) => handleKeyDown(s, e)}
        keyActionEnter={KeyAction.None}
        keyActionTab={KeyAction.None}
        dontConvertToCards={true}
      />
    </div>
  )
}
