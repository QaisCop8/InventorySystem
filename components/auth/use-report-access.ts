"use client"

import { useCallback, useEffect, useState } from "react"
import { reportPermissionNameFor } from "@/lib/report-permission-definitions"

type AccessEntry = { access_name?: string; is_granted?: unknown }

function readAccessList(): AccessEntry[] | null {
  try {
    const savedUser = JSON.parse(sessionStorage.getItem("erp_user") || localStorage.getItem("erp_user") || "null")
    const savedBranch = JSON.parse(sessionStorage.getItem("erp_active_branch") || localStorage.getItem("erp_active_branch") || "null")
    const userId = savedUser?.id ?? savedUser?.user_id
    const branchId = savedBranch?.id ?? savedUser?.branchId ?? savedUser?.branch_id ?? "default"
    const raw = (userId ? localStorage.getItem(`user_Access_List:${userId}:${branchId || "default"}`) : null) || localStorage.getItem("user_Access_List")
    const list = raw ? JSON.parse(raw) : null
    return Array.isArray(list) ? list : null
  } catch {
    return null
  }
}

/**
 * صلاحيات التقارير للمستخدم في الفرع النشط (من قائمة الصلاحيات المخزّنة، تُحدَّث مع تغيير الفرع).
 * تقرير بلا صلاحية معرّفة بعد (قبل أول مزامنة) يبقى متاحاً.
 */
export function useReportAccess() {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const refresh = () => setVersion((current) => current + 1)
    window.addEventListener("user-permissions-updated", refresh)
    window.addEventListener("storage", refresh)
    return () => { window.removeEventListener("user-permissions-updated", refresh); window.removeEventListener("storage", refresh) }
  }, [])
  return useCallback((section: string | null | undefined) => {
    if (!section) return true
    const name = reportPermissionNameFor(section)
    if (!name) return true
    const list = readAccessList()
    if (!list) return true
    const entry = list.find((item) => item.access_name === name)
    if (!entry) return true
    return entry.is_granted === true || entry.is_granted === 1 || entry.is_granted === "true"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])
}
