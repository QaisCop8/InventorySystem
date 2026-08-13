"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import AccountSearchDialog, { type AccountItem } from "@/components/customer/account-search-dialog"
import DataGridView from "@/components/common/DataGridView"
import type { SalesVoucherItemRow } from "@/components/sales/unified-sales-delivery"

interface OrderHeader {
  id: number
  order_number: string
  order_date: string
  amount: number
  status: number
  currency_id?: number | null
  currency_code?: string
  exchange_rate?: number
  discount_type?: string
  discount_amount?: number
  vat_percent?: number
}

interface InvoiceFromOrderPopupProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  voucherType: number
  onSelect: (order: OrderHeader, customer: AccountItem, items: SalesVoucherItemRow[], selectedOrders: OrderHeader[]) => void
  onCancel?: () => void
}

const SALES_INVOICE_TYPE = 12
const PURCHASE_INVOICE_TYPE = 17
const ORDER_SOURCE_VOUCHER_TYPE = 3

export default function InvoiceFromOrderPopup({
  open,
  onOpenChange,
  voucherType,
  onSelect,
  onCancel,
}: InvoiceFromOrderPopupProps) {
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<AccountItem | null>(null)
  const [orders, setOrders] = useState<OrderHeader[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null)
  const [orderItems, setOrderItems] = useState<SalesVoucherItemRow[]>([])
  const [selectedOrderItems, setSelectedOrderItems] = useState<SalesVoucherItemRow[]>([])
  const [selectedOrderHeaders, setSelectedOrderHeaders] = useState<OrderHeader[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [itemsError, setItemsError] = useState<string | null>(null)
  const confirmedRef = useRef(false)

  const isSalesInvoice = voucherType === SALES_INVOICE_TYPE
  const orderType = isSalesInvoice ? 1 : 2
  const allowedAccountTypes = isSalesInvoice ? [2, 5] : [3, 5]
  const title = isSalesInvoice ? "تحميل عناصر من طلبية مبيعات" : "تحميل عناصر من طلبية مشتريات"
  const orderLabel = isSalesInvoice ? "طلبية مبيعات" : "طلبية مشتريات"

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId],
  )

  const selectedOrderIds = useMemo(
    () => new Set(selectedOrderItems.map((item) => item.source_voucher_id || -1)),
    [selectedOrderItems],
  )

  const selectedOrderForHeader = useMemo(() => {
    const firstItemOrderId = selectedOrderItems[0]?.source_voucher_id ?? null
    return orders.find((order) => order.id === firstItemOrderId) || selectedOrder
  }, [orders, selectedOrder, selectedOrderItems])

  const handleAddOrderItems = async (order: OrderHeader) => {
    if (selectedOrderItems.some((item) => item.source_voucher_id === order.id)) return

    setSelectedOrderId(order.id)
    const items = await loadOrderItems(order.id)
    if (items.length === 0) return

    const newItems = items.map((item) => ({
      ...item,
      source_voucher_id: order.id,
      source_voucher_type: ORDER_SOURCE_VOUCHER_TYPE,
      source_voucher_code: order.order_number,
      source_currency_id: order.currency_id ?? null,
      source_currency_code: order.currency_code ?? "",
      source_rate: order.exchange_rate ?? 1,
    }))

    setSelectedOrderItems((prev) => {
      const next = [...prev, ...newItems]
      return next.filter((entry, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.source_voucher_id === entry.source_voucher_id &&
            candidate.order_item_id === entry.order_item_id,
        ) === index,
      )
    })
    setSelectedOrderHeaders((prev) => (prev.some((entry) => entry.id === order.id) ? prev : [...prev, order]))
  }

  const handleRemoveOrderItems = (orderId: number) => {
    setSelectedOrderItems((prev) => prev.filter((item) => item.source_voucher_id !== orderId))
    setSelectedOrderHeaders((prev) => prev.filter((entry) => entry.id !== orderId))
  }

  const ordersScheme = useMemo(
    () => ({
      name: "OrdersScheme",
      columns: [
        {
          header: "#",
          name: "index",
          width: 50,
          isReadOnly: true,
          body: (cell: any) => <span className="block text-center text-sm">{cell.row.index + 1}</span>,
        },
        { header: "رقم الطلبية", name: "order_number", width: 150, isReadOnly: true },
        {
          header: "التاريخ",
          name: "order_date",
          width: 120,
          isReadOnly: true,
          body: (cell: any) => <span>{String(cell.row.dataItem.order_date || "").slice(0, 10)}</span>,
        },
        { header: "العملة", name: "currency_code", width: 100, isReadOnly: true },
        { header: "سعر الصرف", name: "exchange_rate", width: 110, isReadOnly: true },
        { header: "المبلغ", name: "amount", width: 100, isReadOnly: true },
        {
          header: "الإجراء",
          name: "actions",
          width: "*",
          isReadOnly: true,
          body: (cell: any) => {
            const row = cell.row.dataItem as OrderHeader
            const added = selectedOrderIds.has(row.id)
            return (
              <div className="flex items-center justify-center gap-1">
                <button
                  type="button"
                  className={`rounded-md border px-2 py-1 text-sm font-semibold transition ${
                    added
                      ? "border-slate-300 bg-slate-100 text-slate-500"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                  onClick={async (e) => {
                    e.stopPropagation()
                    if (!added) {
                      await handleAddOrderItems(row)
                    }
                  }}
                  disabled={added}
                  title={added ? "تمت الإضافة بالفعل" : "أضف عناصر هذه الطلبية"}
                >←</button>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveOrderItems(row.id)
                  }}
                  title="إزالة عناصر هذه الطلبية"
                >→</button>
              </div>
            )
          },
        },
      ],
    }),
    [selectedOrderIds],
  )

  const selectedItemsScheme = useMemo(
    () => ({
      name: "SelectedItemsScheme",
      columns: [
        {
          header: "الصنف",
          name: "item_name",
          width: "*",
          isReadOnly: true,
          body: (cell: any) => (
            <span>{String(cell.row.dataItem.item_name || cell.row.dataItem.product_name || "")}</span>
          ),
        },
        { header: "الكمية", name: "quantity", width: 90, isReadOnly: true },
        { header: "البونص", name: "bonus_quantity", width: 90, isReadOnly: true },
        { header: "الكمية المرسلة", name: "sent_quantity", width: 110, isReadOnly: true },
        { header: "البونص المرسل", name: "sent_bonus", width: 110, isReadOnly: true },
        { header: "الوحدة", name: "unit", width: 90, isReadOnly: true },
        {
          header: "السعر",
          name: "unit_price",
          width: 110,
          isReadOnly: true,
          body: (cell: any) => <span>{Number(cell.row.dataItem.unit_price || 0).toFixed(2)}</span>,
        },
        { header: orderLabel, name: "source_voucher_code", width: 120, isReadOnly: true },
      ],
    }),
    [orderLabel],
  )

  useEffect(() => {
    if (!open) return
    confirmedRef.current = false
    setSelectedCustomer(null)
    setOrders([])
    setSelectedOrderId(null)
    setOrderItems([])
    setSelectedOrderItems([])
    setSelectedOrderHeaders([])
    setError(null)
    setItemsError(null)
    setCustomerSearchOpen(true)
  }, [open])

  const loadOrders = async (accountId: number) => {
    setLoading(true)
    setError(null)
    setOrders([])
    setSelectedOrderId(null)
    setOrderItems([])
    try {
      const query = new URLSearchParams({
        order_type: String(orderType),
        ...(orderType === 1 ? { customer_id: String(accountId) } : { supplier_id: String(accountId) }),
      })
      const response = await fetch(`/api/sales-vouchers/order-list?${query.toString()}`)
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || "فشل في جلب الطلبات")
      }
      setOrders(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error("InvoiceFromOrderPopup loadOrders error:", err)
      setError((err as Error).message || "حدث خطأ عند جلب الطلبات")
    } finally {
      setLoading(false)
    }
  }

  const loadOrderItems = async (orderId: number): Promise<SalesVoucherItemRow[]> => {
    setItemsLoading(true)
    setItemsError(null)
    setOrderItems([])
    try {
      const query = new URLSearchParams({ order_id: String(orderId), order_type: String(orderType) })
      const response = await fetch(`/api/sales-vouchers/order-items?${query.toString()}`)
      const data = await response.json()
      if (!response.ok || data?.error) {
        throw new Error(data?.error || "فشل في جلب عناصر الطلب")
      }
      const items = Array.isArray(data.items)
        ? data.items.map((item: any) => ({
            product_id: Number(item.product_id || null),
            product_code: String(item.product_code || item.current_product_code || ""),
            product_name: String(item.product_name || item.current_product_name || ""),
            item_name: String(item.item_name || item.product_name || item.current_product_name || ""),
            barcode: String(item.barcode || ""),
            warehouse_id: item.warehouse_id != null ? Number(item.warehouse_id) : null,
            warehouse_name: String(item.warehouse_name || item.store_name || item.warehouse || ""),
            unit: String(item.unit || ""),
            quantity: Number(item.quantity || 0),
            bonus_quantity: Number(item.bonus_quantity || 0),
            unit_price: Number(item.unit_price || 0),
            discount_percent: Number(item.discount_percent || item.discount_percentage || 0),
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
            delivery_item_id: item.delivery_item_id != null ? Number(item.delivery_item_id) : null,
            sent_quantity: Number(item.sent_quantity || 0),
            sent_bonus: Number(item.sent_bonus || 0),
            remaining_quantity: Number(item.remaining_quantity || 0),
            remaining_bonus: Number(item.remaining_bonus || 0),
            note: String(item.note || ""),
            length: item.length != null ? Number(item.length) : null,
            width: item.width != null ? Number(item.width) : null,
            height: item.height != null ? Number(item.height) : null,
            count: item.count != null ? Number(item.count) : null,
            account_id: item.account_id != null ? Number(item.account_id) : null,
            account_code: String(item.account_code || ""),
            account_name: String(item.account_name || ""),
            account_cost_centers: Array.isArray(item.account_cost_centers) ? item.account_cost_centers : [],
          }))
        : []
      setOrderItems(items)
      return items
    } catch (err) {
      console.error("InvoiceFromOrderPopup loadOrderItems error:", err)
      setItemsError((err as Error).message || "حدث خطأ عند جلب عناصر الطلب")
      return []
    } finally {
      setItemsLoading(false)
    }
  }

  const handleCustomerSelect = (account: AccountItem) => {
    setSelectedCustomer(account)
    setCustomerSearchOpen(false)
    loadOrders(account.id)
  }

  const handleConfirm = () => {
    if (!selectedCustomer || selectedOrderItems.length === 0) return
    const selectedOrderHeader = selectedOrderForHeader
    if (!selectedOrderHeader) return
    confirmedRef.current = true
    onSelect(selectedOrderHeader, selectedCustomer, selectedOrderItems, selectedOrderHeaders)
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
                  اختر {isSalesInvoice ? "العميل" : "المورد"} أولاً ثم حدد طلبية مرحَلة، ثم استخدم الأسهم لإضافة أو إزالة العناصر من القائمة.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <Label className="mb-2 block text-sm font-medium">{isSalesInvoice ? "العميل" : "المورد"}</Label>
                {selectedCustomer ? (
                  <div className="space-y-2">
                    <div className="rounded-2xl bg-white p-3 shadow-sm">
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

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <Label className="mb-2 block text-sm font-medium">{orderLabel}</Label>
                <p className="text-sm text-slate-600">اختر طلبية لتنزيل سطور البضاعة إلى الفاتورة.</p>
                <div className="mt-3 text-sm text-slate-500">
                  {selectedOrder ? `${orderLabel} المحددة: ${selectedOrder.order_number}` : `لم يتم اختيار ${orderLabel} بعد.`}
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-3 text-sm font-semibold text-slate-700">الطلبيات الجاهزة</div>
                <div className="min-h-[220px] overflow-auto border border-slate-200 p-2">
                  {loading ? (
                    <div className="text-sm text-slate-500">جاري تحميل الطلبات...</div>
                  ) : error ? (
                    <div className="text-sm text-red-600">{error}</div>
                  ) : orders.length === 0 ? (
                    <div className="text-sm text-slate-500">لا توجد طلبات متاحة.</div>
                  ) : (
                    <DataGridView
                      dataSource={orders}
                      scheme={ordersScheme}
                      idProperty="id"
                      isReadOnly={true}
                      showContextMenu={false}
                      dontConvertToCards={true}
                    />
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-3 text-sm font-semibold text-slate-700">العناصر المحددة</div>
                <div className="min-h-[220px] overflow-auto border border-slate-200 p-2">
                  {itemsLoading ? (
                    <div className="text-sm text-slate-500">جاري تحميل عناصر الطلب...</div>
                  ) : itemsError ? (
                    <div className="text-sm text-red-600">{itemsError}</div>
                  ) : selectedOrderItems.length === 0 ? (
                    <div className="text-sm text-slate-500">لم يتم إضافة عناصر بعد.</div>
                  ) : (
                    <DataGridView
                      dataSource={selectedOrderItems}
                      scheme={selectedItemsScheme}
                      idProperty="product_id"
                      isReadOnly={true}
                      showContextMenu={false}
                      dontConvertToCards={true}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-auto border-t border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-2">
              <Button variant="outline" onClick={() => handleClose()}>
                إلغاء
              </Button>
              <Button disabled={!selectedCustomer || selectedOrderItems.length === 0} onClick={handleConfirm}>
                تأكيد
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>

      <AccountSearchDialog
        open={customerSearchOpen}
        onOpenChange={(open) => {
          setCustomerSearchOpen(open)
          if (!open) {
            setError(null)
          }
        }}
        accounts={[]}
        allowedTypeValues={allowedAccountTypes}
        showOrderOnlyFilter={true}
        orderType={orderType}
        onSelect={handleCustomerSelect}
      />
    </Dialog>
  )
}
