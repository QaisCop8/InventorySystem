"use client"

import { useEffect, useState } from "react"
import { voucherHref } from "@/lib/voucher-links"

export function VoucherLink({ id, type, code }: { id: number; type: number; code: string }) {
  const [company, setCompany] = useState<string | null>(null)
  useEffect(() => { setCompany(sessionStorage.getItem("active_company_id")) }, [])
  return <a href={voucherHref(id, type, company)} target="_blank" rel="noopener noreferrer" className="rounded-sm text-teal-700 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 dark:text-teal-300" title="فتح السند في تبويب جديد">{code}</a>
}
