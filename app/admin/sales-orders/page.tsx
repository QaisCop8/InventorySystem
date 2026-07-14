"use client"

import { SalesOrders } from "@/components/orders/sales-orders"

export const dynamic = "force-dynamic"

export default function AdminSalesOrdersPage() {
  return (
    <div className="container mx-auto p-6">
      <SalesOrders />
    </div>
  )
}
