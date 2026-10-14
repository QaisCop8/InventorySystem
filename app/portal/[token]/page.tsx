import type { Metadata } from "next"
import CustomerPortalView from "@/components/customer-portal/portal-view"

export const metadata: Metadata = {
  title: "كشف الحساب",
  robots: { index: false, follow: false },
}

export default async function CustomerPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <CustomerPortalView token={token} />
}
