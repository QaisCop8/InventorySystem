"use client"

import { useEffect, useRef, useState } from "react"
import { useAuth } from "./auth-context"

// Changes only when the user switches from one branch to another — not when the saved branch is
// first restored at startup (null → id), which would otherwise remount every page twice on load.
export function useBranchReloadKey() {
  const { activeBranchId } = useAuth()
  const [key, setKey] = useState(0)
  const previous = useRef<number | null>(activeBranchId)
  useEffect(() => {
    if (previous.current != null && activeBranchId != null && previous.current !== activeBranchId) setKey(current => current + 1)
    if (activeBranchId != null) previous.current = activeBranchId
  }, [activeBranchId])
  return key
}
