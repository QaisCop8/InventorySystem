"use client"

import { cn } from "@/lib/utils"

/** Square NoonERP artwork for compact app and sidebar placements. */
export function NoonMark({ className, title = "noonERP" }: { className?: string; title?: string }) {
  return (
    <img
      src="/brand/noonerp-app-icon.png?v=6"
      className={cn("h-11 w-11 shrink-0 object-contain", className)}
      alt={title}
    />
  )
}

/** Full supplied NoonERP artwork, including its Arabic company tagline. */
export function NoonLogo({
  className,
  size = "md",
}: {
  className?: string
  markClassName?: string
  tone?: "light" | "dark"
  size?: "sm" | "md" | "lg"
  tagline?: string | null
}) {
  const width = { sm: 110, md: 160, lg: 190 }[size]
  // شعار 2026-11-20 بألوان الصباح مع "| ERP" (أعرض من السابق، لذا عُرِّضت المقاسات) (خلفية شفافة): نسخة فاتحة، ونسخة داكنة بنص أبيض تظهر في الوضع الداكن
  const style = { width, height: "auto", maxWidth: "100%" } as const
  return (
    <>
      <img src="/brand/noonerp-logo.png?v=6" style={style} className={cn("object-contain dark:hidden", className)} alt="noon ERP — نون لإدارة موارد الشركات" />
      <img src="/brand/noonerp-logo-dark.png?v=6" style={style} className={cn("hidden object-contain dark:block", className)} alt="noon ERP — نون لإدارة موارد الشركات" />
    </>
  )
}
