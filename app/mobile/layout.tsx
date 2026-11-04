import { tr } from "@/lib/i18n"
import type React from "react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: tr("إدخال الطلبيات - تطبيق الموبايل"),
  description: tr("تطبيق موبايل لإدخال طلبيات البيع"),
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="mobile-app bg-gray-50 min-h-screen overflow-x-hidden">{children}</div>
}
