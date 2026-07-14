"use client"

import { SalesOrders } from "@/components/orders/sales-orders"

export const dynamic = "force-dynamic"

export default function AdminPurchaseOrdersPage() {
  return (
    <div className="container mx-auto p-6">
      <SalesOrders isPurchase={true} />
    </div>
  )
}
