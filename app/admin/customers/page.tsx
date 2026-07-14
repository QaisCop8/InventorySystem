"use client"

import Customers from "@/components/products/customers"

export const dynamic = "force-dynamic"

export default function AdminCustomersPage() {
  return (
    <div className="container mx-auto p-6">
      <Customers />
    </div>
  )
}
