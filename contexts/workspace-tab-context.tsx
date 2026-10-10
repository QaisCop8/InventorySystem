"use client"

import { createContext, useContext, useRef, type ReactNode } from "react"

// كل تبويبات مساحة العمل تبقى مُركَّبة (مخفية فقط)، فمستمعات لوحة المفاتيح العامة (F3 حفظ، F5 جديد...)
// في التبويبات المخفية تستقبل نفس الضغطة. هذا السياق يُخبر كل شاشة إن كان تبويبها هو الظاهر حالياً
// لتتجاهل الاختصارات وهي مخفية. خارج مساحة العمل (نوافذ منبثقة مستقلة) القيمة دائماً true.
const WorkspaceTabActiveContext = createContext<{ readonly current: boolean }>({ current: true })

export function WorkspaceTabActiveProvider({ active, children }: { active: boolean; children: ReactNode }) {
  const ref = useRef(active)
  ref.current = active
  return <WorkspaceTabActiveContext.Provider value={ref}>{children}</WorkspaceTabActiveContext.Provider>
}

/** مرجع ثابت؛ اقرأ .current داخل مستمع الحدث (لا عند التصيير) ليعكس حالة التبويب لحظة الضغط. */
export function useWorkspaceTabActive() {
  return useContext(WorkspaceTabActiveContext)
}

// رقم التبويب الحالي بمساحة العمل — حارس المغادرة (lib/navigation-guard.ts) يربط كل شاشة بتبويبها
// ليُسأل فقط حارس التبويب الذي سيُستبدل أو يُغلق. خارج مساحة العمل: null.
const WorkspaceTabIdContext = createContext<string | null>(null)

export function WorkspaceTabIdProvider({ tabId, children }: { tabId: string; children: ReactNode }) {
  return <WorkspaceTabIdContext.Provider value={tabId}>{children}</WorkspaceTabIdContext.Provider>
}

export function useWorkspaceTabId() {
  return useContext(WorkspaceTabIdContext)
}
