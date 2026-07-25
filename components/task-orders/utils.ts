export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export function elapsedSecondsSince(isoDate: string | null | undefined): number {
  if (!isoDate) return 0
  const started = new Date(isoDate).getTime()
  if (Number.isNaN(started)) return 0
  return Math.max(0, Math.floor((Date.now() - started) / 1000))
}

export const PRIORITY_BADGE_CLASS: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 border-slate-200",
  normal: "bg-blue-50 text-blue-700 border-blue-200",
  high: "bg-amber-50 text-amber-700 border-amber-200",
  urgent: "bg-red-50 text-red-700 border-red-200",
}

// شريط لون جانبي سميك (حافة البطاقة الرائدة بواجهة RTL) + خلفية مصبوغة بوضوح بحسب الأولوية —
// تلوين البطاقة كاملةً لا شارة الأولوية الصغيرة وحدها، لتمييز الأولوية من نظرة عابرة على اللوحة.
export const PRIORITY_CARD_ACCENT: Record<string, string> = {
  low: "border-r-slate-400 bg-slate-100",
  normal: "border-r-blue-500 bg-blue-50",
  high: "border-r-amber-500 bg-amber-50",
  urgent: "border-r-red-500 bg-red-50",
}

// لون مختلف لكل عمود (خطوة) بدورانٍ على مجموعة ألوان — يُميّز أعمدة اللوحة عن بعضها بصرياً حتى
// بمعزل عن اسم الخطوة، خصوصاً بسير عمل طويل بعدة مراحل متتالية.
export const COLUMN_PALETTE = [
  { bg: "bg-sky-50", border: "border-sky-200", header: "bg-sky-100/70", text: "text-sky-800", badge: "bg-sky-600 text-white" },
  { bg: "bg-violet-50", border: "border-violet-200", header: "bg-violet-100/70", text: "text-violet-800", badge: "bg-violet-600 text-white" },
  { bg: "bg-emerald-50", border: "border-emerald-200", header: "bg-emerald-100/70", text: "text-emerald-800", badge: "bg-emerald-600 text-white" },
  { bg: "bg-amber-50", border: "border-amber-200", header: "bg-amber-100/70", text: "text-amber-800", badge: "bg-amber-600 text-white" },
  { bg: "bg-rose-50", border: "border-rose-200", header: "bg-rose-100/70", text: "text-rose-800", badge: "bg-rose-600 text-white" },
  { bg: "bg-cyan-50", border: "border-cyan-200", header: "bg-cyan-100/70", text: "text-cyan-800", badge: "bg-cyan-600 text-white" },
  { bg: "bg-indigo-50", border: "border-indigo-200", header: "bg-indigo-100/70", text: "text-indigo-800", badge: "bg-indigo-600 text-white" },
  { bg: "bg-teal-50", border: "border-teal-200", header: "bg-teal-100/70", text: "text-teal-800", badge: "bg-teal-600 text-white" },
]
export function columnColor(index: number) {
  return COLUMN_PALETTE[index % COLUMN_PALETTE.length]
}

export const STATUS_BADGE_CLASS: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700 border-slate-200",
  in_progress: "bg-emerald-50 text-emerald-700 border-emerald-200",
  paused: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-blue-50 text-blue-700 border-blue-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-slate-100 text-slate-400 border-slate-200",
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2)
  return (parts[0][0] || "") + (parts[1][0] || "")
}
