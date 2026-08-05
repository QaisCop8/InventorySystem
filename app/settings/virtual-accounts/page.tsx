"use client"
import dynamic from "next/dynamic"

const VirtualAccounts = dynamic(() => import("@/components/settings/virtual-accounts"), {
  ssr: false,
})

export default function SettingsVirtualAccountsPage() {
  return (
    <div className="min-h-screen h-screen w-full max-w-full p-0">
      <VirtualAccounts />
    </div>
  )
}
