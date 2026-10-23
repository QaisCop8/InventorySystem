"use client"

import { useId } from "react"
import { cn } from "@/lib/utils"

// هوية noonERP (public/brand/noonerp-logo.*): شارة زمردية→فيروزية، حرف النون أبيض يحتضن أعمدة نمو، ونقطة ذهبية.
// ألوان العلامة: emerald-400 #34d399 → emerald-600 #059669 → cyan-700 #0e7490، والذهبي #fef08a → #f59e0b.

/** شارة الشعار وحدها — SVG مضمّن يبقى حاداً بأي حجم */
export function NoonMark({ className, title = "noonERP" }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, "")
  return (
    <svg viewBox="0 0 420 420" className={cn("h-11 w-11 shrink-0", className)} role="img" aria-label={title}>
      <defs>
        <linearGradient id={`${id}-badge`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34d399" /><stop offset=".5" stopColor="#059669" /><stop offset="1" stopColor="#0e7490" />
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fef08a" /><stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id={`${id}-bars`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#a7f3d0" />
        </linearGradient>
        <clipPath id={`${id}-sq`}><rect width="420" height="420" rx="112" /></clipPath>
      </defs>
      <rect width="420" height="420" rx="112" fill={`url(#${id}-badge)`} />
      <g clipPath={`url(#${id}-sq)`}>
        <ellipse cx="130" cy="60" rx="230" ry="110" fill="#ffffff" opacity=".16" />
      </g>
      <path d="M 104 178 L 104 228 A 106 106 0 0 0 316 228 L 316 140" fill="none" stroke="#ffffff" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round" />
      <g fill={`url(#${id}-bars)`}>
        <rect x="158" y="244" width="26" height="40" rx="9" />
        <rect x="197" y="222" width="26" height="62" rx="9" />
        <rect x="236" y="198" width="26" height="86" rx="9" />
      </g>
      <circle cx="210" cy="150" r="30" fill={`url(#${id}-gold)`} />
      <circle cx="200" cy="140" r="9" fill="#ffffff" opacity=".55" />
      <rect width="420" height="420" rx="112" fill="none" stroke="#ffffff" strokeOpacity=".18" strokeWidth="6" />
    </svg>
  )
}

/** الشارة + "noon ERP" + سطر وصف اختياري. tone="dark" للخلفيات الداكنة */
export function NoonLogo({
  className, markClassName, tone = "light", size = "md", tagline,
}: { className?: string; markClassName?: string; tone?: "light" | "dark"; size?: "sm" | "md" | "lg"; tagline?: string | null }) {
  const text = { sm: "text-lg", md: "text-2xl", lg: "text-3xl" }[size]
  const mark = { sm: "h-9 w-9", md: "h-11 w-11", lg: "h-14 w-14" }[size]
  return (
    <div className={cn("flex items-center gap-3", className)} dir="ltr">
      <NoonMark className={cn(mark, "drop-shadow-[0_10px_18px_rgba(5,150,105,.35)]", markClassName)} />
      <span className="leading-none">
        <span className={cn("block font-extrabold tracking-tight", text, tone === "dark" ? "text-white" : "text-slate-900")}>
          noon<span className="bg-gradient-to-r from-emerald-500 to-cyan-500 bg-clip-text font-light text-transparent">ERP</span>
        </span>
        {tagline !== null && (
          <span className={cn("mt-1 block text-[11px] font-semibold", tone === "dark" ? "text-emerald-200/80" : "text-slate-500")} dir="rtl">
            {tagline ?? "نظام إدارة موارد المؤسسات"}
          </span>
        )}
      </span>
    </div>
  )
}
