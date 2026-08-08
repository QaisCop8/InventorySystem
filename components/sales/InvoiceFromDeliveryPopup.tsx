"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import AccountSearchDialog, { type AccountItem } from "@/components/customer/account-search-dialog"
import DataGridView from "@/components/common/DataGridView"
import type { SalesVoucherItemRow } from "@/components/sales/unified-sales-delivery"

interface DeliveryHeader {
  id: number
  vch_type: number
  vch_code: string
  vch_date: string
  amount: number
  status: number
  currency_id?: number | null
  currency_code?: string
  rate?: number
  discount_type?: "percentage" | "amount"
  discount_value?: number
}

interface InvoiceFromDeliveryPopupProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  voucherType: number
  onSelect: (delivery: DeliveryHeader, customer: AccountItem, items: SalesVoucherItemRow[], selectedDeliveries: DeliveryHeader[]) => void
  onCancel?: () => void
}

const SALES_INVOICE_TYPE = 12
const SALES_DELIVERY_TYPES = [13, 14]
const PURCHASE_DELIVERY_TYPES = [18]

export default function InvoiceFromDeliveryPopup({
  open,
  onOpenChange,
  voucherType,
  onSelect,
  onCancel,
}: InvoiceFromDeliveryPopupProps) {
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<AccountItem | null>(null)
  const [deliveries, setDeliveries] = useState<DeliveryHeader[]>([])
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<number | null>(null)
  const [deliveryItems, setDeliveryItems] = useState<SalesVoucherItemRow[]>([])
  const [selectedDeliveryItems, setSelectedDeliveryItems] = useState<SalesVoucherItemRow[]>([])
  const [selectedDeliveryHeaders, setSelectedDeliveryHeaders] = useState<DeliveryHeader[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [itemsError, setItemsError] = useState<string | null>(null)
  const confirmedRef = useRef(false)

  const isSalesInvoice = voucherType === SALES_INVOICE_TYPE
  const allowedAccountTypes = isSalesInvoice ? [2, 5] : [3, 5]
  const sourceDeliveryTypes = isSalesInvoice ? SALES_DELIVERY_TYPES : PURCHASE_DELIVERY_TYPES
  const title = isSalesInvoice ? "تحميل عناصر من إرسالية مبيعات" : "تحميل عناصر من إرسالية مشتريات"
  const deliveryLabel = isSalesInvoice ? "إرسالية مبيعات" : "إرسالية مشتريات"

  const selectedDelivery = useMemo(
    () => deliveries.find((delivery) => delivery.id === selectedDeliveryId) || null,
    [deliveries, selectedDeliveryId],
  )

  const selectedDeliveryIds = useMemo(
    () => new Set(selectedDeliveryItems.map((item) => item.source_voucher_id || -1)),
    [selectedDeliveryItems],
  )

  const selectedDeliveryForHeader = useMemo(() => {
    const firstItemDeliveryId = selectedDeliveryItems[0]?.source_voucher_id ?? null
    return deliveries.find((delivery) => delivery.id === firstItemDeliveryId) || selectedDelivery
  }, [deliveries, selectedDelivery, selectedDeliveryItems])

  const handleAddDeliveryItems = async (delivery: DeliveryHeader) => {
    if (selectedDeliveryItems.some((item) => item.source_voucher_id === delivery.id)) return

    setSelectedDeliveryId(delivery.id)
    const items = await loadDeliveryItems(delivery.id)
    if (items.length === 0) return

    const newItems = items.map((item) => ({
      ...item,
      source_voucher_id: delivery.id,
      source_voucher_type: delivery.vch_type,
      source_voucher_code: delivery.vch_code,
      source_currency_id: delivery.currency_id ?? null,
      source_currency_code: delivery.currency_code ?? "",
      source_rate: delivery.rate ?? 1,
    }))

    setSelectedDeliveryItems((prev) => {
      const next = [...prev, ...newItems]
      return next.filter((entry, index, all) => all.findIndex((candidate) => candidate.source_voucher_id === entry.source_voucher_id && candidate.product_id === entry.product_id && candidate.unit === entry.unit && index === all.findIndex((other) => other.source_voucher_id === entry.source_voucher_id && other.product_id === entry.product_id && other.unit === entry.unit)) === index)
    })
    setSelectedDeliveryHeaders((prev) => (prev.some((entry) => entry.id === delivery.id) ? prev : [...prev, delivery]))
  }

  const handleRemoveDeliveryItems = (deliveryId: number) => {
    setSelectedDeliveryItems((prev) => prev.filter((item) => item.source_voucher_id !== deliveryId))
    setSelectedDeliveryHeaders((prev) => prev.filter((entry) => entry.id !== deliveryId))
  }

  const deliveriesScheme = useMemo(
    () => ({
      name: "DeliveriesScheme",
      columns: [
        {
          header: "#",
          name: "index",
          width: 50,
          isReadOnly: true,
          body: (cell: any) => <span className="block text-center text-sm">{cell.row.index + 1}</span>,
        },
        { header: "رقم الإرسالية", name: "vch_code", width: 130, isReadOnly: true },
        { header: "التاريخ", name: "vch_date", width: 110, isReadOnly: true },
        { header: "العملة", name: "currency_code", width: 110, isReadOnly: true },
        { header: "سعر الصرف", name: "rate", width: 110, isReadOnly: true },
        { header: "المبلغ", name: "amount", width: 100, isReadOnly: true },
        {
          header: "الإجراء",
          name: "actions",
          width: "*",
          isReadOnly: true,
          body: (cell: any) => {
            const row = cell.row.dataItem as DeliveryHeader
            const added = selectedDeliveryIds.has(row.id)
            return (
              <div className="flex items-center justify-center gap-1">
                <button
                  type="button"
                  className={`rounded-md border px-2 py-1 text-sm font-semibold transition ${
                    added ? "border-slate-300 bg-slate-100 text-slate-500" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                  onClick={async (e) => {
                    e.stopPropagation()
                    if (!added) {
                      await handleAddDeliveryItems(row)
                    }
                  }}
                  disabled={added}
                  title={added ? "تمت الإضافة بالفعل" : "أضف عناصر هذه الإرسالية"}
                >←</button>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveDeliveryItems(row.id)
                  }}
                  title="إزالة عناصر هذه الإرسالية"
                >→</button>
              </div>
            )
          },
        },
      ],
    }),
    [selectedDeliveryIds, selectedDeliveryItems],
  )

  const selectedItemsScheme = useMemo(
    () => ({
      name: "SelectedItemsScheme",
      columns: [
        { header: "الصنف", name: "product_name", width: "*", isReadOnly: true },
        { header: "الكمية", name: "quantity", width: 90, isReadOnly: true },
        { header: "الوحدة", name: "unit", width: 90, isReadOnly: true },
        {
          header: "السعر",
          name: "unit_price",
          width: 110,
          isReadOnly: true,
          body: (cell: any) => <span>{Number(cell.row.dataItem.unit_price || 0).toFixed(2)}</span>,
        },
        { header: "الإرسالية", name: "source_voucher_code", width: 120, isReadOnly: true },
      ],
    }),
    [],
  )

  useEffect(() => {
    if (!open) return
    confirmedRef.current = false
    setSelectedCustomer(null)
    setDeliveries([])
    setSelectedDeliveryId(null)
    setDeliveryItems([])
    setSelectedDeliveryItems([])
    setSelectedDeliveryHeaders([])
    setError(null)
    setItemsError(null)
    setCustomerSearchOpen(true)
  }, [open])

  const loadDeliveries = async (customerId: number) => {
    setLoading(true)
    setError(null)
    setDeliveries([])
    setSelectedDeliveryId(null)
    setDeliveryItems([])
    try {
      const query = new URLSearchParams({
        customer_id: String(customerId),
        delivery_types: sourceDeliveryTypes.join(","),
      })
      const response = await fetch(`/api/sales-vouchers/delivery-list?${query.toString()}`)
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || "فشل في جلب الإرساليات")
      }
      setDeliveries(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error("InvoiceFromDeliveryPopup loadDeliveries error:", err)
      setError((err as Error).message || "حدث خطأ عند جلب الإرساليات")
    } finally {
      setLoading(false)
    }
  }

  const loadDeliveryItems = async (deliveryId: number): Promise<SalesVoucherItemRow[]> => {
    setItemsLoading(true)
    setItemsError(null)
    setDeliveryItems([])
    try {
      const response = await fetch(`/api/sales-vouchers/${deliveryId}`)
      const data = await response.json()
      if (!response.ok || data?.error) {
        throw new Error(data?.error || "فشل في جلب عناصر الإرسالية")
      }
      if (Number(data.status) !== 2) {
        throw new Error("يجب اختيار إرسالية مرحلة")
      }
      const items = Array.isArray(data.items) ? data.items.map((item: any) => ({
        product_id: Number(item.product_id || null),
        product_code: String(item.product_code || item.current_product_code || ""),
        product_name: String(item.product_name || item.current_product_name || ""),
        barcode: String(item.barcode || ""),
        warehouse_id: item.warehouse_id != null ? Number(item.warehouse_id) : null,
        warehouse_name: String(item.warehouse_name || ""),
        unit: String(item.unit || ""),
        quantity: Number(item.quantity || 0),
        bonus_quantity: Number(item.bonus_quantity || 0),
        unit_price: Number(item.unit_price || 0),
        discount_percent: Number(item.discount_percent || 0),
        total_price: Number(item.total_price || 0),
        batch_number: String(item.batch_number || ""),
        expiry_date: String(item.expiry_date || ""),
        serial_numbers: Array.isArray(item.serial_numbers) ? item.serial_numbers : [],
        source_voucher_id: Number(item.source_voucher_id || null),
        source_voucher_type: Number(item.source_voucher_type || null),
        source_currency_id: item.source_currency_id != null ? Number(item.source_currency_id) : null,
        source_currency_code: String(item.source_currency_code ?? ""),
        source_rate: item.source_rate != null ? Number(item.source_rate) : null,
        note: String(item.note || ""),
        length: item.length != null ? Number(item.length) : null,
        width: item.width != null ? Number(item.width) : null,
        height: item.height != null ? Number(item.height) : null,
        count: item.count != null ? Number(item.count) : null,
        account_id: item.account_id != null ? Number(item.account_id) : null,
        account_code: String(item.account_code || ""),
        account_name: String(item.account_name || ""),
        account_cost_centers: Array.isArray(item.account_cost_centers) ? item.account_cost_centers : [],
      })) : []
      setDeliveryItems(items)
      return items
    } catch (err) {
      console.error("InvoiceFromDeliveryPopup loadDeliveryItems error:", err)
      setItemsError((err as Error).message || "حدث خطأ عند جلب عناصر الإرسالية")
      return []
    } finally {
      setItemsLoading(false)
    }
  }

  const handleCustomerSelect = (account: AccountItem) => {
    setSelectedCustomer(account)
    setCustomerSearchOpen(false)
    loadDeliveries(account.id)
  }

  const handleConfirm = () => {
    if (!selectedCustomer || selectedDeliveryItems.length === 0) return
    const selectedDeliveryHeader = selectedDeliveryForHeader
    if (!selectedDeliveryHeader) return
    confirmedRef.current = true
    onSelect(selectedDeliveryHeader, selectedCustomer, selectedDeliveryItems, selectedDeliveryHeaders)
    onOpenChange(false)
  }

  const handleClose = () => {
    if (!confirmedRef.current) {
      onCancel?.()
    }
    setCustomerSearchOpen(false)
    onOpenChange(false)
  }

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      handleClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="max-w-[60vw] max-h-[90vh] p-0 border border-slate-300 shadow-2xl"
        onInteractOutside={(event) => {
          event.preventDefault()
        }}
      >
        <div className="flex h-full min-h-[520px] flex-col bg-white" dir="rtl">
          <div className="border-b border-slate-300 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-lg font-semibold text-slate-900">{title}</p>
                <p className="text-sm text-slate-500">
                  اختر العميل أولاً ثم حدد إرسالية مرحلة، ثم استخدم الأسهم لإضافة أو إزالة العناصر من القائمة.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <Label className="mb-2 block text-sm font-medium">العميل</Label>
                {selectedCustomer ? (
                  <div className="space-y-2">
                    <div className="rounded-2xl bg-white p-3 shadow-sm">
                      <div className="text-sm font-semibold">{selectedCustomer.name}</div>
                      <div className="text-sm text-slate-600">رقم الحساب: {selectedCustomer.code}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setCustomerSearchOpen(true)}>
                      تغيير العميل
                    </Button>
                  </div>
                ) : (
                  <div>
                    <p className="mb-3 text-sm text-slate-600">لم يتم اختيار عميل بعد.</p>
                    <Button size="sm" onClick={() => setCustomerSearchOpen(true)}>
                      اختر العميل
                    </Button>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <Label className="mb-2 block text-sm font-medium">{deliveryLabel}</Label>
                <p className="text-sm text-slate-600">اختر إرسالية مرحلة لتحميل سطور البضاعة إلى الفاتورة.</p>
                <div className="mt-3 text-sm text-slate-500">
                  {selectedDelivery ? `الإرسالية المحددة: ${selectedDelivery.vch_code}` : "لم يتم اختيار إرسالية بعد."}
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-700">قائمة الإرساليات</span>
                </div>
                {loading ? (
                  <div className="py-12 text-center text-sm text-slate-500">جارٍ تحميل الإرساليات...</div>
                ) : error ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
                ) : deliveries.length === 0 ? (
                  <div className="py-12 text-center text-sm text-slate-500">لا توجد إرساليات تم العثور عليها للعميل المحدد.</div>
                ) : (
                  <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                    <DataGridView
                      scheme={deliveriesScheme}
                      dataSource={deliveries.map((delivery, index) => ({
                        ...delivery,
                        index: index + 1,
                      }))}
                      allowDragging="Rows"
                      headersVisibility="Column"
                      isReport={false}
                      defaultRowHeight={38}
                      containerStyle={{ height: 260 }}
                    />
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-700">عناصر الفاتورة المختارة</span>
                </div>
                {itemsLoading ? (
                  <div className="py-12 text-center text-sm text-slate-500">جارٍ تحميل العناصر...</div>
                ) : itemsError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{itemsError}</div>
                ) : selectedDeliveryItems.length === 0 ? (
                  <div className="py-12 text-center text-sm text-slate-500">لم يتم إضافة أي عناصر بعد. اضغط على السهم الأيسر لإضافة عناصر إرسالية.</div>
                ) : (
                  <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                    <DataGridView
                      scheme={selectedItemsScheme}
                      dataSource={selectedDeliveryItems}
                      allowDragging="Rows"
                      headersVisibility="Column"
                      isReport={false}
                      defaultRowHeight={38}
                      containerStyle={{ height: 260 }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 p-4 bg-white">
            <Button variant="outline" onClick={handleClose}>إغلاق</Button>
            <Button disabled={selectedDeliveryItems.length === 0 || itemsLoading} onClick={handleConfirm}>
              موافق
            </Button>
          </div>
        </div>
      </DialogContent>

      <AccountSearchDialog
        open={customerSearchOpen}
        onOpenChange={(openState) => {
          setCustomerSearchOpen(openState)
          if (!openState && !selectedCustomer) {
            // إذا أُغلِقت نافذة البحث دون اختيار، أعد وضع الفوكس إلى النافذة الرئيسية.
            // لا حاجة لشيء إضافي هنا.
          }
        }}
        accounts={[]}
        allowedTypeValues={allowedAccountTypes}
        showDeliveryOnlyFilter={true}
        deliveryVchTypes={sourceDeliveryTypes}
        onSelect={handleCustomerSelect}
      />
    </Dialog>
  )
}
