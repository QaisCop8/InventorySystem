"use client"

import BankAccounts from "@/components/admin/bank-accounts"

export const dynamic = "force-dynamic"

export default function AdminBankAccountsPage() {
  return (
    <div className="container mx-auto p-6">
      <BankAccounts />
    </div>
  )
}
