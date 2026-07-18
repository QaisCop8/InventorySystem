"use client"

import Banks from "@/components/admin/banks"

export const dynamic = "force-dynamic"

export default function AdminBanksPage() {
  return (
    <div className="container mx-auto p-6">
      <Banks />
    </div>
  )
}
