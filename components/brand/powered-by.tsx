import { cn } from "@/lib/utils"

// "Powered by Sabbah Soft" — توقيع الشركة المطوِّرة (شركة الصبّاح للبرمجة) أسفل شاشات الدخول والإدارة والقائمة الجانبية.
// tone: light على خلفية فاتحة، dark على خلفية داكنة. compact: الشعار فقط (قائمة جانبية مطوية).
export function PoweredBy({ tone = "light", compact = false, className }: { tone?: "light" | "dark"; compact?: boolean; className?: string }) {
  const dark = tone === "dark"
  return (
    <span
      dir="ltr"
      title="Powered by Sabbah Soft — شركة الصبّاح للبرمجة"
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[10.5px]", dark ? "text-slate-400" : "text-slate-500 dark:text-slate-400", className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/sabbah-soft-mark.svg" alt="Sabbah Soft" className="h-4 w-4 shrink-0 rounded-[4px]" />
      {!compact && (
        <span>
          Powered by <b className={cn("font-extrabold", dark ? "text-emerald-300" : "text-emerald-700 dark:text-emerald-300")}>Sabbah Soft</b>
        </span>
      )}
    </span>
  )
}
