"use client"

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react"
import { useAuth } from "./auth-context"
import { fileFamilyForSection, hasFilePermissionEntries, type FileAccessEntry, type FileAction, type FileFamily } from "@/lib/file-permission-definitions"

const FilePermissionContext = createContext<{ family: FileFamily; can: (action: FileAction) => boolean } | null>(null)
const unrestricted = () => true

export function useCurrentFileAccess() {
  return useContext(FilePermissionContext)?.can || unrestricted
}

/** An explicit null is an unrelated file; an omitted family inherits the open screen. */
function useFilePermissionCheck() {
  const { user, activeBranchId, permissionVersion } = useAuth()
  const entries = useMemo<FileAccessEntry[] | null>(() => {
    if (!user || typeof window === "undefined") return null
    const branchId = activeBranchId || user.branchId || "default"
    try {
      const raw = localStorage.getItem(`user_Access_List:${user.id}:${branchId}`)
      const value = raw ? JSON.parse(raw) : null
      return Array.isArray(value) ? value : null
    } catch { return null }
  }, [user, activeBranchId, permissionVersion])
  return useCallback((family: FileFamily | null | undefined, action: FileAction) => !family || hasFilePermissionEntries(entries, family, action), [entries])
}

export function useFileAccess(family?: FileFamily | null) {
  const inherited = useContext(FilePermissionContext)
  const resolved = family === undefined ? inherited?.family : family
  const check = useFilePermissionCheck()
  return useCallback((action: FileAction) => check(resolved, action), [check, resolved])
}

export function useFileSectionAccess() {
  const check = useFilePermissionCheck()
  return useCallback((section: string | null | undefined) => check(fileFamilyForSection(section), "access"), [check])
}

export function FilePermissionProvider({ family, children }: { family: FileFamily; children: ReactNode }) {
  const can = useFileAccess(family)
  const value = useMemo(() => ({ family, can }), [family, can])
  return <FilePermissionContext.Provider value={value}>{children}</FilePermissionContext.Provider>
}
