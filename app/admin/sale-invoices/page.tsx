"use client"

import { SaleInvoices } from "@/components/orders/sale-invoices"

export const dynamic = "force-dynamic"

export default function AdminSaleInvoicesPage() {
  return (
    <div className="container mx-auto p-6">
      <SaleInvoices />
    </div>
  )
}
