"use client"

import { cn } from "@/lib/utils"

/** Square NoonERP artwork for compact app and sidebar placements. */
export function NoonMark({ className, title = "noonERP" }: { className?: string; title?: string }) {
  return (
    <img
      src="/brand/noonerp-app-icon.png"
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
  const width = { sm: "w-[100px]", md: "w-[140px]", lg: "w-[165px]" }[size]
  return (
    <img
      src="/brand/noonerp-logo.png"
      className={cn("h-auto max-w-full object-contain", width, className)}
      alt="noon ERP — نون لإدارة موارد الشركات"
    />
  )
}
