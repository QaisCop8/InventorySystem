"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import AccountSearchDialog, { type AccountItem } from "@/components/customer/account-search-dialog"
import DataGridView from "@/components/common/DataGridView"
import { ArrowLeft, ArrowRight, PackageCheck, Truck, UserRound } from "lucide-react"
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
  branchId?: number | null
  onSelect: (delivery: DeliveryHeader, customer: AccountItem, items: SalesVoucherItemRow[], selectedDeliveries: DeliveryHeader[]) => void
  onCancel?: () => void
}

const standardGridShell = "invoice-source-grid min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white"

const SALES_INVOICE_TYPE = 12
const SALES_DELIVERY_TYPES = [13, 14]
const PURCHASE_DELIVERY_TYPES = [18]

const deliveryItemKey = (item: SalesVoucherItemRow) =>
  `${item.source_voucher_id ?? "delivery"}:${item.order_item_id ?? item.delivery_item_id ?? `${item.product_id ?? "item"}:${item.unit ?? ""}`}`

export default function InvoiceFromDeliveryPopup({
  open,
  onOpenChange,
  voucherType,
  branchId,
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
      order_item_id: item.order_item_id ?? null,
      delivery_item_id: item.delivery_item_id ?? null,
    }))

    setDeliveryItems((prev) => {
      const existing = new Set(prev.map(deliveryItemKey))
      return [...prev, ...newItems.filter((item) => !existing.has(deliveryItemKey(item)))]
    })
    setSelectedDeliveryItems((prev) => {
      const existing = new Set(prev.map(deliveryItemKey))
      return [...prev, ...newItems.filter((item) => !existing.has(deliveryItemKey(item)))]
    })
    setSelectedDeliveryHeaders((prev) => (prev.some((entry) => entry.id === delivery.id) ? prev : [...prev, delivery]))
  }

  const toggleSelectedDeliveryItem = (row: SalesVoucherItemRow) => {
    const key = deliveryItemKey(row)
    setSelectedDeliveryItems((prev) => {
      const exists = prev.some((item) => deliveryItemKey(item) === key)
      return exists ? prev.filter((item) => deliveryItemKey(item) !== key) : [...prev, row]
    })
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
        { header: "التاريخ", name: "vch_date", width: '*', isReadOnly: true },
        { header: "العملة", name: "currency_code", width: 110, isReadOnly: true },
        { header: "سعر الصرف", name: "rate", width: 110, isReadOnly: true },
        { header: "المبلغ", name: "amount", width: 100, isReadOnly: true },
        {
          header: "الإجراء",
          name: "actions",
          width: 110,
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
        { header: "الصنف", name: "product_name", width: "*", minWidth: 180, isReadOnly: true },
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
    [selectedDeliveryItems],
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
      if (Number(branchId) > 0) query.set("branch_id", String(branchId))
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
        order_item_id: item.order_item_id != null ? Number(item.order_item_id) : null,
        // ensure delivery_item_id contains the voucher_items id for the delivery row
        delivery_item_id: item.delivery_item_id != null ? Number(item.delivery_item_id) : item.id != null ? Number(item.id) : null,
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
        hideCloseButton
        className="flex h-[calc(100dvh-0.5rem)] max-h-[calc(100dvh-0.5rem)] w-[calc(100vw-0.5rem)] max-w-[1400px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-0 shadow-2xl sm:h-auto sm:max-h-[92vh] sm:w-[96vw] sm:rounded-2xl"
        onInteractOutside={(event) => {
          event.preventDefault()
        }}
      >
        <div className="flex h-full min-h-0 min-w-0 flex-col bg-slate-50" dir="rtl">
          <div className="shrink-0 bg-gradient-to-l from-emerald-700 via-emerald-600 to-teal-600 px-4 py-3 text-white shadow-md sm:px-5 sm:py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-lg font-extrabold sm:text-xl"><span className="rounded-xl bg-white/15 p-2 ring-1 ring-white/20"><Truck className="h-4 w-4 sm:h-5 sm:w-5" /></span>{title}</p>
                <p className="mt-1 hidden text-xs text-emerald-50 sm:block sm:text-sm">
                  اختر {isSalesInvoice ? "العميل" : "المورد"} أولاً ثم حدد إرسالية مرحَلة، ثم استخدم الأسهم لإضافة أو إزالة العناصر من القائمة.
                </p>
              </div>
            </div>
          </div>

          <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-3 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-emerald-100 bg-white p-3 shadow-sm sm:p-4">
                <Label className="mb-1.5 flex items-center gap-2 text-sm font-bold text-emerald-900"><UserRound className="h-4 w-4 text-emerald-600" />{isSalesInvoice ? "العميل" : "المورد"}</Label>
                {selectedCustomer ? (
                  <div className="space-y-2">
                    <div className="rounded-xl bg-emerald-50/70 px-3 py-2">
                      <div className="text-sm font-semibold">{selectedCustomer.name}</div>
                      <div className="text-sm text-slate-600">رقم الحساب: {selectedCustomer.code}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setCustomerSearchOpen(true)}>
                      تغيير {isSalesInvoice ? "العميل" : "المورد"}
                    </Button>
                  </div>
                ) : (
                  <div>
                    <p className="mb-3 text-sm text-slate-600">لم يتم اختيار {isSalesInvoice ? "عميل" : "مورد"} بعد.</p>
                    <Button size="sm" onClick={() => setCustomerSearchOpen(true)}>
                      اختر {isSalesInvoice ? "العميل" : "المورد"}
                    </Button>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-teal-100 bg-white p-3 shadow-sm sm:p-4">
                <Label className="mb-1.5 flex items-center gap-2 text-sm font-bold text-emerald-900"><PackageCheck className="h-4 w-4 text-emerald-600" />{deliveryLabel}</Label>
                <p className="text-sm text-slate-600">اختر إرسالية لتنزيل سطور البضاعة إلى الفاتورة.</p>
                <div className="mt-2 rounded-xl bg-teal-50/70 px-3 py-2 text-sm text-slate-600">
                  {selectedDelivery ? `${deliveryLabel} المحددة: ${selectedDelivery.vch_code}` : `لم يتم اختيار ${deliveryLabel} بعد.`}
                </div>
              </div>
            </div>

            <div className="grid min-w-0 gap-4">
              <div className="min-w-0 rounded-2xl border border-emerald-100 bg-white p-3 shadow-sm sm:p-4">
                <div className="mb-3 flex items-center justify-between gap-2"><span className="text-sm font-bold text-slate-800">الإرساليات الجاهزة</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{deliveries.length}</span></div>
                <div className={standardGridShell}>
                  {loading ? (
                    <div className="text-sm text-slate-500">جاري تحميل الإرساليات...</div>
                  ) : error ? (
                    <div className="text-sm text-red-600">{error}</div>
                  ) : deliveries.length === 0 ? (
                    <div className="text-sm text-slate-500">لا توجد إرساليات متاحة.</div>
                  ) : (
                    <DataGridView
                      dataSource={deliveries.map((delivery, index) => ({ ...delivery, index }))}
                      scheme={deliveriesScheme}
                      idProperty="id"
                      isReadOnly={true}
                      showContextMenu={false}
                      dontConvertToCards={true}
                      allowDragging="Rows"
                      headersVisibility="Column"
                      isReport={false}
                      defaultRowHeight={38}
                      containerStyle={{ height: 240, width: "100%", minWidth: 0 }}
                      onRowDoubleClick={(row: DeliveryHeader) => {
                        if (!row) return
                        if (selectedDeliveryIds.has(row.id)) {
                          handleRemoveDeliveryItems(row.id)
                        } else {
                          void handleAddDeliveryItems(row)
                        }
                      }}
                    />
                  )}
                </div>
              </div>

              <div className="min-w-0 rounded-2xl border border-teal-100 bg-white p-3 shadow-sm sm:p-4">
                <div className="mb-3 flex items-center justify-between gap-2"><span className="text-sm font-bold text-slate-800">العناصر المحددة</span><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">{selectedDeliveryItems.length}</span></div>
                <div className={standardGridShell}>
                  {itemsLoading ? (
                    <div className="text-sm text-slate-500">جاري تحميل عناصر الإرسالية...</div>
                  ) : itemsError ? (
                    <div className="text-sm text-red-600">{itemsError}</div>
                  ) : selectedDeliveryItems.length === 0 ? (
                    <div className="text-sm text-slate-500">لم يتم إضافة عناصر بعد.</div>
                  ) : (
                    <DataGridView
                      dataSource={selectedDeliveryItems}
                      scheme={selectedItemsScheme}
                      idProperty="delivery_item_id"
                      isReadOnly={true}
                      showContextMenu={false}
                      dontConvertToCards={true}
                      allowDragging="Rows"
                      headersVisibility="Column"
                      isReport={false}
                      defaultRowHeight={38}
                      containerStyle={{ height: 260, width: "100%", minWidth: 0 }}
                      onRowDoubleClick={(row: SalesVoucherItemRow) => {
                        if (!row) return
                        toggleSelectedDeliveryItem(row)
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-auto shrink-0 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => handleClose()}>إلغاء</Button>
              <Button className="bg-emerald-600 px-6 hover:bg-emerald-700" disabled={!selectedCustomer || selectedDeliveryItems.length === 0 || itemsLoading} onClick={handleConfirm}>
                تأكيد العناصر
              </Button>
            </div>
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
        branchId={branchId}
        onSelect={handleCustomerSelect}
      />
    </Dialog>
  )
}
