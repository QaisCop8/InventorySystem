"use client"

import { CustomerLayout } from "@/components/customer/customer-layout"
import UnifiedAccounts from "@/components/customer/unified-accounts"

export default function CustomerAccountsPage() {
  return (
    <CustomerLayout>
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-4 sm:p-6">
        <div className="mx-auto w-full max-w-[1400px] rounded-3xl border border-slate-200 bg-white shadow-sm">
          <UnifiedAccounts />
        </div>
      </div>
    </CustomerLayout>
  )
}
