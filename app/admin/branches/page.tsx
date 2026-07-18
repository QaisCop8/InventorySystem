"use client"

import Branches from "@/components/admin/branches"

export const dynamic = "force-dynamic"

export default function AdminBranchesPage() {
  return (
    <div className="container mx-auto p-6">
      <Branches />
    </div>
  )
}
