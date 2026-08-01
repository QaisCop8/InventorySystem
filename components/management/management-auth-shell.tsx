"use client"

import type { ReactNode } from "react"
import { Boxes, ShieldCheck, Sparkles } from "lucide-react"

interface ManagementAuthShellProps {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
  compact?: boolean
}

export function ManagementAuthShell({ eyebrow, title, description, children, compact = false }: ManagementAuthShellProps) {
  return (
    <main dir="rtl" className="relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-[#f6f7fb] px-4 py-8 text-slate-950 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(99,102,241,0.11),transparent_30%),radial-gradient(circle_at_88%_92%,rgba(168,85,247,0.10),transparent_32%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.28] [background-image:linear-gradient(rgba(99,102,241,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.045)_1px,transparent_1px)] [background-size:36px_36px] [mask-image:radial-gradient(circle_at_center,black,transparent_74%)]" />

      <div className={`relative z-10 w-full ${compact ? "max-w-[470px]" : "max-w-[500px]"}`}>
        <header className="mb-5 flex items-center justify-center gap-3">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-[14px] bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-600/20">
            <Boxes className="h-5 w-5" />
            <span className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-violet-100 bg-white text-violet-600 shadow-sm"><Sparkles className="h-3 w-3" /></span>
          </div>
          <div><div className="text-base font-black tracking-tight">نظام أساس</div><div className="text-[9px] font-bold tracking-[0.22em] text-slate-400">ASAS MANAGEMENT CLOUD</div></div>
        </header>

        <section className="relative overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_28px_75px_-38px_rgba(15,23,42,0.32)]">
          <div className="h-1 w-full bg-gradient-to-l from-indigo-500 via-violet-500 to-fuchsia-500" />
          <div className={compact ? "p-6 sm:p-8" : "p-6 sm:p-9"}>
            <div className="mb-7 text-center">
              <span className="inline-flex rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-[10px] font-extrabold text-violet-700">{eyebrow}</span>
              <h1 className="mt-4 text-[28px] font-black tracking-tight text-slate-950">{title}</h1>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">{description}</p>
            </div>
            {children}
          </div>
        </section>

        <footer className="mt-5 flex items-center justify-center gap-1.5 text-[10px] text-slate-400"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />اتصال مشفّر وآمن — بيانات شركاتك محمية</footer>
      </div>
    </main>
  )
}
