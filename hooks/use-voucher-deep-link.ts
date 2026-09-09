"use client"

import { useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { voucherSection } from "@/lib/voucher-links"

/** Open a report's voucher once, after its destination screen is ready. */
export function useVoucherDeepLink(onOpen: (id: number) => void | Promise<void>, ready = true, type = 0) {
  const params = useSearchParams()
  const id = Number(params.get("voucher_id"))
  const section = params.get("section")
  const company = params.get("company")
  const opened = useRef<number | null>(null)
  const callback = useRef(onOpen)
  useEffect(() => { callback.current = onOpen }, [onOpen])
  useEffect(() => {
    if (!ready || !Number.isSafeInteger(id) || id <= 0 || opened.current === id) return
    if (section !== voucherSection(type)) return
    if (company && sessionStorage.getItem("active_company_id") !== company) return
    opened.current = id
    void callback.current(id)
  }, [id, ready, type, section, company])
}
