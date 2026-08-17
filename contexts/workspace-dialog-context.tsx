"use client"

import { createContext, useContext, type ReactNode } from "react"

interface WorkspaceDialogContextValue {
  container: HTMLElement | null
  confined: boolean
}

const WorkspaceDialogContext = createContext<WorkspaceDialogContextValue>({ container: null, confined: false })

export function WorkspaceDialogProvider({
  children,
  container,
  confined,
}: WorkspaceDialogContextValue & { children: ReactNode }) {
  return <WorkspaceDialogContext.Provider value={{ container, confined }}>{children}</WorkspaceDialogContext.Provider>
}

export function useWorkspaceDialog() {
  return useContext(WorkspaceDialogContext)
}
