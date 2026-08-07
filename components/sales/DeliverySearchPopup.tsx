"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Search } from "lucide-react"

interface DeliveryItem {
  id: number
  vch_code: string
  vch_date: string
  customer_name: string
  amount: number
  currency_code?: string
}

interface DeliverySearchPopupProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  deliveryType: number
  onSelect: (delivery: DeliveryItem) => void
}

export default function DeliverySearchPopup({
  open,
  onOpenChange,
  deliveryType,
  onSelect,
}: DeliverySearchPopupProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [items, setItems] = useState<DeliveryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const title = deliveryType === 18 ? "بحث إرسالية مشتريات" : "بحث إرسالية مبيعات"
  const searchPlaceholder = deliveryType === 18 ? "ابحث عن ارسالية مشتريات..." : "ابحث عن ارسالية مبيعات..."

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) || null,
    [items, selectedId],
  )

  useEffect(() => {
    if (!open) return
    setError(null)
    setSelectedId(null)
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ type: String(deliveryType) })
      if (searchTerm.trim()) query.set("search", searchTerm.trim())
      setLoading(true)
      fetch(`/api/vouchers/sales?${query.toString()}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error("فشل تحميل الإرساليات"))))
        .then((data) => {
          const rawItems = Array.isArray(data) ? data : []
          setItems(
            rawItems.map((item: any) => ({
              id: Number(item.id ?? 0),
              vch_code: String(item.voucher_code ?? item.order_number ?? ""),
              vch_date: String(item.voucher_date ?? "").slice(0, 10),
              customer_name: String(item.customer_name ?? ""),
              amount: Number(item.total_amount ?? 0),
              currency_code: String(item.currency_code ?? ""),
            })),
          )
        })
        .catch((err) => {
          if (err.name === "AbortError") return
          console.error("DeliverySearchPopup fetch error:", err)
          setError((err as Error).message || "حدث خطأ أثناء التحميل")
          setItems([])
        })
        .finally(() => setLoading(false))
    }, 250)

    const focusTimer = window.setTimeout(() => searchInputRef.current?.focus(), 50)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
      window.clearTimeout(focusTimer)
    }
  }, [open, searchTerm, deliveryType])

  const handleConfirm = () => {
    if (!selectedItem) return
    onSelect(selectedItem)
    onOpenChange(false)
  }

  const handleRowClick = (item: DeliveryItem) => {
    setSelectedId(item.id)
  }

  const handleRowDoubleClick = (item: DeliveryItem) => {
    onSelect(item)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[92vw] max-h-[92vh] p-0">
        <div className="flex h-full min-h-[480px] flex-col bg-white" dir="rtl">
          <div className="border-b border-slate-200 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-lg font-semibold">{title}</p>
                <p className="text-sm text-slate-500">ابحث برقم الإرسالية أو باسم العميل.</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-end">
            <div className="flex-1 min-w-0">
              <Label className="mb-2 block text-sm font-medium">بحث</Label>
              <Input
                ref={searchInputRef}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={searchPlaceholder}
                className="w-full"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSearchTerm("")}>مسح</Button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">جارٍ تحميل البيانات...</div>
            ) : error ? (
              <div className="flex h-full items-center justify-center text-sm text-red-600">{error}</div>
            ) : items.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">لا توجد نتائج</div>
            ) : (
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
                <table className="min-w-full divide-y divide-slate-200 text-sm text-right">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="px-3 py-3 text-right">#</th>
                      <th className="px-3 py-3 text-right">رقم الإرسالية</th>
                      <th className="px-3 py-3 text-right">التاريخ</th>
                      <th className="px-3 py-3 text-right">اسم العميل</th>
                      <th className="px-3 py-3 text-right">المبلغ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {items.map((item, index) => {
                      const active = item.id === selectedId
                      return (
                        <tr
                          key={item.id}
                          className={`cursor-pointer transition hover:bg-slate-100 ${active ? "bg-slate-200" : ""}`}
                          onClick={() => handleRowClick(item)}
                          onDoubleClick={() => handleRowDoubleClick(item)}
                        >
                          <td className="px-3 py-3 align-top">{index + 1}</td>
                          <td className="px-3 py-3 align-top">{item.vch_code}</td>
                          <td className="px-3 py-3 align-top">{item.vch_date}</td>
                          <td className="px-3 py-3 align-top">{item.customer_name}</td>
                          <td className="px-3 py-3 align-top">{item.amount.toFixed(2)} {item.currency_code}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 p-4 bg-white">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="search-button">إغلاق</Button>
            <Button disabled={!selectedItem} onClick={handleConfirm}>اختيار</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
