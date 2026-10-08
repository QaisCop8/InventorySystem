"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, Hash, ListPlus, Loader2, Search, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { WorkspaceDialogProvider } from "@/contexts/workspace-dialog-context"

export type SerialDirection = "in" | "out" | "transfer"

// نفس جدول الاتجاهات في lib/item-serials.ts (الخادم هو المرجع النهائي)
const DIRECTIONS: Record<number, SerialDirection> = { 8: "in", 15: "in", 16: "in", 17: "in", 18: "in", 9: "out", 11: "out", 12: "out", 13: "out", 14: "out", 19: "out", 10: "transfer" }
export const serialDirectionFor = (vchType: number): SerialDirection | null => DIRECTIONS[Number(vchType)] ?? null

/** العدد المطلوب للسطر = الكمية + البونص (كما في الخادم). */
export const requiredSerials = (row: any) => Math.round(Number(row?.quantity ?? row?.qnty ?? 0) + Number(row?.bonus_quantity ?? row?.bonus ?? 0))

/** نص مختصر للعمود: "2/3 — SN-1، SN-2…" */
export function serialsSummary(row: any) {
  if (!row?.has_serial) return ""
  const serials: string[] = Array.isArray(row?.serials) ? row.serials : []
  const head = serials.slice(0, 3).join("، ")
  return `${serials.length}/${requiredSerials(row)}${head ? ` — ${head}${serials.length > 3 ? "…" : ""}` : ""}`
}

/**
 * أسطر وصلت بلا has_serial (نسخ/لصق، استيراد، سند مصدر...) — يُسأل الخادم عن أصنافها ويعيد الأسطر
 * بعد تعبئة has_serial وserials_text، أو null إن لم يكن هناك ما يُحدَّث.
 */
export async function resolveSerialFlags<T extends Record<string, any>>(rows: T[]): Promise<T[] | null> {
  const unknown = [...new Set(rows.filter((row) => row?.product_id && row.has_serial === undefined).map((row) => Number(row.product_id)))]
  if (!unknown.length) return null
  const response = await fetch(`/api/item-serials?tracked_ids=${unknown.join(",")}`).catch(() => null)
  const tracked = new Set<number>(response?.ok ? await response.json().catch(() => []) : [])
  if (!response?.ok) return null
  return rows.map((row) => {
    if (!row?.product_id || row.has_serial !== undefined || !unknown.includes(Number(row.product_id))) return row
    const next: any = { ...row, has_serial: tracked.has(Number(row.product_id)), serials: Array.isArray(row.serials) ? row.serials : [] }
    next.serials_text = serialsSummary(next)
    return next
  })
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  vchType: number
  voucherId?: number | null
  productId: number
  productName: string
  storeId?: number | null
  storeName?: string
  required: number
  value: string[]
  readOnly?: boolean
  onSave: (serials: string[]) => void
}

type Available = { id: number; serial: string; store_name?: string; vch_code?: string }

const splitSerials = (text: string) => text.split(/[\r\n,;\t]+/).map((value) => value.trim()).filter(Boolean)

export function ItemSerialsDialog({ open, onOpenChange, vchType, voucherId, productId, productName, storeId, storeName, required, value, readOnly, onSave }: Props) {
  const direction = serialDirectionFor(vchType) || "in"
  const isOut = direction !== "in"
  const [serials, setSerials] = useState<string[]>([])
  const [input, setInput] = useState("")
  const [notice, setNotice] = useState("")
  const [issues, setIssues] = useState<Map<string, string>>(new Map())
  const [checking, setChecking] = useState(false)
  const [available, setAvailable] = useState<Available[]>([])
  const [availableSearch, setAvailableSearch] = useState("")
  const [loadingAvailable, setLoadingAvailable] = useState(false)
  const [range, setRange] = useState({ prefix: "", from: "", to: "", pad: "" })
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setSerials([...(value || [])]); setInput(""); setNotice(""); setIssues(new Map()); setAvailableSearch("")
    setRange({ prefix: "", from: "", to: "", pad: "" })
    window.setTimeout(() => inputRef.current?.focus(), 80)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // الأرقام المتاحة في المستودع (سندات الخروج/النقل)
  useEffect(() => {
    if (!open || !isOut || !productId) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoadingAvailable(true)
      try {
        const params = new URLSearchParams({ item_id: String(productId) })
        if (storeId) params.set("store_id", String(storeId))
        if (voucherId) params.set("voucher_id", String(voucherId))
        if (availableSearch.trim()) params.set("search", availableSearch.trim())
        const response = await fetch(`/api/item-serials?${params}`, { signal: controller.signal })
        const data = await response.json().catch(() => [])
        setAvailable(Array.isArray(data) ? data : [])
      } catch { /* aborted */ } finally { setLoadingAvailable(false) }
    }, 250)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [open, isOut, productId, storeId, voucherId, availableSearch])

  // فحص مباشر لكل رقم (موجود/مُخرَج/مستودع آخر/مكرر...) بنفس قواعد الحفظ
  useEffect(() => {
    if (!open || readOnly) return
    if (!serials.length) { setIssues(new Map()); return }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setChecking(true)
      try {
        const response = await fetch("/api/item-serials", {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
          body: JSON.stringify({ vch_type: vchType, voucher_id: voucherId || null, enforce_count: false, items: [{ product_id: productId, product_name: productName, quantity: required, store_id: storeId || null, serials }] }),
        })
        const data = await response.json().catch(() => ({}))
        const map = new Map<string, string>()
        for (const issue of data.issues || []) if (issue.serial && !map.has(issue.serial)) map.set(issue.serial, issue.message)
        setIssues(map)
      } catch { /* aborted */ } finally { setChecking(false) }
    }, 300)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [open, readOnly, serials, vchType, voucherId, productId, productName, required, storeId])

  const add = (values: string[]) => {
    if (readOnly || !values.length) return
    const existing = new Set(serials.map((serial) => serial.toLowerCase()))
    const fresh: string[] = []
    let duplicates = 0
    for (const serial of values) {
      const key = serial.toLowerCase()
      if (existing.has(key)) { duplicates += 1; continue }
      existing.add(key); fresh.push(serial)
    }
    setSerials((current) => [...current, ...fresh])
    setNotice(duplicates ? `تم تجاهل ${duplicates} رقم مكرر` : fresh.length > 1 ? `تمت إضافة ${fresh.length} رقماً` : "")
  }

  const addFromInput = () => { add(splitSerials(input)); setInput(""); inputRef.current?.focus() }

  const addRange = () => {
    const from = Number(range.from), to = Number(range.to)
    if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) { setNotice("أدخل بداية ونهاية صحيحتين (النهاية ≥ البداية)"); return }
    if (to - from + 1 > 5000) { setNotice("الحد الأقصى 5000 رقم في المرة الواحدة"); return }
    const pad = Number(range.pad) || Math.max(range.from.length, range.to.length)
    add(Array.from({ length: to - from + 1 }, (_, index) => `${range.prefix}${String(from + index).padStart(pad, "0")}`))
  }

  const selected = useMemo(() => new Set(serials.map((serial) => serial.toLowerCase())), [serials])
  const toggleAvailable = (serial: string) => {
    if (readOnly) return
    if (selected.has(serial.toLowerCase())) setSerials((current) => current.filter((item) => item.toLowerCase() !== serial.toLowerCase()))
    else add([serial])
  }
  const fillFromAvailable = () => {
    const missing = Math.max(0, required - serials.length)
    add(available.filter((item) => !selected.has(item.serial.toLowerCase())).slice(0, missing).map((item) => item.serial))
  }

  const count = serials.length
  const countOk = count === required
  const errorCount = serials.filter((serial) => issues.has(serial)).length

  return (
    <WorkspaceDialogProvider container={null} confined={false}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="z-[3001] flex max-h-[90vh] w-[min(980px,calc(100vw-1rem))] max-w-none flex-col gap-0 overflow-hidden rounded-2xl p-0" dir="rtl" onPointerDownOutside={(event) => event.preventDefault()}>
          <div className="shrink-0 bg-gradient-to-l from-indigo-700 to-sky-600 px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15"><Hash className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1 text-right">
                <DialogTitle className="truncate text-base font-bold">الأرقام التسلسلية — {productName}</DialogTitle>
                <DialogDescription className="text-xs text-sky-50">
                  {direction === "in" ? "سند دخول: أدخل أرقام القطع المستلمة" : direction === "transfer" ? "ارسالية داخلية: اختر الأرقام المنقولة" : "سند خروج: اختر الأرقام الموجودة في المستودع"}
                  {storeName ? ` — المستودع: ${storeName}` : ""}
                </DialogDescription>
              </div>
              <div className={`ml-12 rounded-xl px-3 py-1.5 text-center ${countOk ? "bg-emerald-500/90" : "bg-amber-500/90"}`}>
                <div className="text-lg font-black leading-none">{count} / {required}</div>
                <div className="text-[10px]">المُدخل / المطلوب</div>
              </div>
            </div>
          </div>

          <div className={`grid min-h-0 flex-1 gap-0 overflow-hidden ${isOut ? "md:grid-cols-2" : ""}`}>
            {/* الأرقام المُدخلة */}
            <div className="flex min-h-0 flex-col gap-3 overflow-hidden p-4">
              {!readOnly && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      ref={inputRef}
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addFromInput() } }}
                      onPaste={(event) => {
                        const text = event.clipboardData.getData("text")
                        if (/[\r\n,;\t]/.test(text)) { event.preventDefault(); add(splitSerials(text)) }
                      }}
                      placeholder="امسح أو اكتب الرقم ثم Enter — يمكن لصق عدة أرقام"
                      className="h-10"
                    />
                    <Button type="button" onClick={addFromInput} disabled={!input.trim()} className="h-10 bg-indigo-600 hover:bg-indigo-700"><ListPlus className="ml-1 h-4 w-4" />إضافة</Button>
                  </div>
                  {direction === "in" && (
                    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed bg-slate-50 p-2 text-xs">
                      <span className="font-semibold text-slate-600">توليد متسلسل:</span>
                      <Input value={range.prefix} onChange={(event) => setRange({ ...range, prefix: event.target.value })} placeholder="بادئة" className="h-8 w-20" />
                      <Input value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value.replace(/\D/g, "") })} placeholder="من" className="h-8 w-20" />
                      <Input value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value.replace(/\D/g, "") })} placeholder="إلى" className="h-8 w-20" />
                      <Input value={range.pad} onChange={(event) => setRange({ ...range, pad: event.target.value.replace(/\D/g, "") })} placeholder="خانات" className="h-8 w-16" />
                      <Button type="button" size="sm" variant="outline" onClick={addRange} className="h-8">توليد</Button>
                    </div>
                  )}
                  {notice && <div className="text-xs text-slate-500">{notice}</div>}
                </div>
              )}

              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">الأرقام المُدخلة ({count})</span>
                <span className="flex items-center gap-2">
                  {checking && <span className="flex items-center gap-1 text-slate-500"><Loader2 className="h-3 w-3 animate-spin" />جارٍ الفحص</span>}
                  {errorCount > 0 && <span className="font-semibold text-rose-600">{errorCount} بها مشكلة</span>}
                  {!readOnly && count > 0 && <button type="button" onClick={() => setSerials([])} className="text-rose-600 hover:underline">حذف الكل</button>}
                </span>
              </div>
              <div className="min-h-[180px] flex-1 overflow-auto rounded-xl border">
                {count === 0 ? (
                  <div className="flex h-full min-h-[180px] items-center justify-center p-4 text-center text-sm text-slate-400">لا توجد أرقام بعد</div>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {serials.map((serial, index) => {
                        const issue = issues.get(serial)
                        return (
                          <tr key={serial} className={`border-b last:border-0 ${issue ? "bg-rose-50" : ""}`}>
                            <td className="w-10 px-2 py-1.5 text-center text-xs text-slate-400">{index + 1}</td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1.5 font-mono font-semibold">{issue ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}{serial}</div>
                              {issue && <div className="mt-0.5 text-[11px] leading-snug text-rose-700">{issue}</div>}
                            </td>
                            <td className="w-10 px-1 text-center">{!readOnly && <button type="button" title="حذف" onClick={() => setSerials((current) => current.filter((item) => item !== serial))} className="rounded p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* المتاح في المستودع (خروج/نقل) */}
            {isOut && (
              <div className="flex min-h-0 flex-col gap-3 overflow-hidden border-t bg-slate-50/60 p-4 md:border-r md:border-t-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">المتاح في {storeName || "المستودع"} ({available.length})</span>
                  {!readOnly && count < required && available.length > 0 && <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={fillFromAvailable}>اختيار تلقائي ({Math.min(required - count, available.filter((item) => !selected.has(item.serial.toLowerCase())).length)})</Button>}
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input value={availableSearch} onChange={(event) => setAvailableSearch(event.target.value)} placeholder="بحث في الأرقام المتاحة" className="h-9 pr-8" />
                </div>
                <div className="min-h-[180px] flex-1 overflow-auto rounded-xl border bg-white">
                  {loadingAvailable ? (
                    <div className="flex h-full min-h-[180px] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
                  ) : available.length === 0 ? (
                    <div className="flex h-full min-h-[180px] items-center justify-center p-4 text-center text-sm text-slate-400">لا توجد أرقام متاحة لهذا الصنف في هذا المستودع</div>
                  ) : (
                    <ul className="divide-y text-sm">
                      {available.map((item) => {
                        const checked = selected.has(item.serial.toLowerCase())
                        return (
                          <li key={item.id}>
                            <label className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-sky-50 ${checked ? "bg-sky-50" : ""}`}>
                              <input type="checkbox" disabled={readOnly} checked={checked} onChange={() => toggleAvailable(item.serial)} className="h-4 w-4 accent-indigo-600" />
                              <span className="font-mono font-semibold">{item.serial}</span>
                              {item.vch_code && <span className="mr-auto text-[11px] text-slate-400">{item.vch_code}</span>}
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-slate-50 px-4 py-3">
            <div className={`text-xs font-semibold ${countOk ? "text-emerald-700" : "text-amber-700"}`}>
              {countOk ? "عدد الأرقام مطابق للكمية + البونص" : `عدد الأرقام يجب أن يساوي الكمية + البونص (${required}) — لن يُحفظ السند قبل ذلك`}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}><X className="ml-1 h-4 w-4" />{readOnly ? "إغلاق" : "إلغاء"}</Button>
              {!readOnly && <Button type="button" onClick={() => { onSave(serials); onOpenChange(false) }} className="bg-indigo-600 hover:bg-indigo-700">حفظ الأرقام</Button>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </WorkspaceDialogProvider>
  )
}
