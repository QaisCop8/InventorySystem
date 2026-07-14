"use client"

import { OrderMigrate } from "@/components/Migration/orders-migration"

export const dynamic = "force-dynamic"

export default function AdminOrdersMigrationPage() {
  return (
    <div className="container mx-auto p-6">
      <OrderMigrate />
    </div>
  )
}
