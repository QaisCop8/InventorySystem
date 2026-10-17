"use client"

import { useEffect, useMemo, useState } from "react"
import { Keyboard, Loader2, Pencil, RotateCcw, Search, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useShortcutPages, usePageShortcuts } from "@/components/page-shortcuts-listener"
import { PAGE_SHORTCUTS_CHANGED, comboFromEvent, comboKeys, comboProblem, type PageShortcuts } from "@/lib/page-shortcuts"

type Message = { tone: "success" | "error" | "info"; text: string } | null

const normalize = (value: string) => value.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").trim()

function Combo({ combo }: { combo: string }) {
  return (
    <span className="inline-flex items-center gap-1" dir="ltr">
      {comboKeys(combo).map((key, index) => (
        <kbd key={index} className="min-w-7 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-center font-mono text-xs font-bold text-slate-700 shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">{key}</kbd>
      ))}
    </span>
  )
}

/** شاشة "اختصارات الصفحات": يربط المستخدم أي صفحة من القائمة بمفتاح اختصار لفتحها مباشرة. */
export default function PageShortcutsSettings() {
  const pages = useShortcutPages()
  const { shortcuts, setShortcuts, loaded } = usePageShortcuts()
  const [query, setQuery] = useState("")
  const [onlyAssigned, setOnlyAssigned] = useState(false)
  const [recording, setRecording] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<Message>(null)

  const titleOf = (section: string) => pages.find((page) => page.section === section)?.title || section

  const save = async (next: PageShortcuts, successText: string) => {
    const previous = shortcuts
    setShortcuts(next)
    setSaving(true)
    try {
      const response = await fetch("/api/settings/page-shortcuts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shortcuts: next }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "تعذر حفظ الاختصارات")
      setShortcuts(data.shortcuts)
      window.dispatchEvent(new CustomEvent(PAGE_SHORTCUTS_CHANGED, { detail: data.shortcuts }))
      setMessage({ tone: "success", text: successText })
    } catch (error) {
      setShortcuts(previous)
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "تعذر حفظ الاختصارات" })
    } finally {
      setSaving(false)
    }
  }

  // وضع التسجيل: الضغطة التالية تصبح اختصار الصفحة (Esc إلغاء، Backspace/Delete مسح). يُلتقط قبل أي مستمع آخر.
  useEffect(() => {
    if (!recording) return
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.repeat) return
      if (event.key === "Escape") { setRecording(null); return }
      if (event.key === "Backspace" || event.key === "Delete") {
        const { [recording]: _removed, ...rest } = shortcuts
        setRecording(null)
        void save(rest, `أُزيل اختصار «${titleOf(recording)}»`)
        return
      }
      const combo = comboFromEvent(event)
      if (!combo) return // مفتاح تعديل وحده (Ctrl/Alt/Shift) ⇐ انتظار بقية الاختصار
      const problem = comboProblem(combo)
      if (problem) { setMessage({ tone: "error", text: problem }); return }
      const owner = Object.entries(shortcuts).find(([section, value]) => value === combo && section !== recording)?.[0]
      const next: PageShortcuts = { ...shortcuts, [recording]: combo }
      if (owner) delete next[owner]
      setRecording(null)
      void save(next, owner ? `${combo} نُقل من «${titleOf(owner)}» إلى «${titleOf(recording)}»` : `${combo} ⇐ «${titleOf(recording)}»`)
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, shortcuts])

  const groups = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean)
    const map = new Map<string, typeof pages>()
    for (const page of pages) {
      if (onlyAssigned && !shortcuts[page.section]) continue
      const haystack = normalize([page.title, ...page.path, shortcuts[page.section] || ""].join(" "))
      if (terms.length && !terms.every((term) => haystack.includes(term))) continue
      const group = page.path[0] || "عام"
      map.set(group, [...(map.get(group) || []), page])
    }
    return Array.from(map.entries())
  }, [pages, query, onlyAssigned, shortcuts])

  const assignedCount = pages.filter((page) => shortcuts[page.section]).length

  return (
    <div className="w-full max-w-full space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold"><Keyboard className="h-7 w-7 text-emerald-600" />اختصارات الصفحات</h1>
          <p className="mt-1 text-sm text-muted-foreground">اربط أي صفحة باختصار من لوحة المفاتيح لفتحها مباشرة من أي مكان في النظام. الاختصارات خاصة بك.</p>
        </div>
        {assignedCount > 0 && (
          <Button variant="outline" disabled={saving} onClick={() => { if (window.confirm("حذف جميع اختصاراتك؟")) void save({}, "حُذفت جميع الاختصارات") }}>
            <RotateCcw className="ml-2 h-4 w-4" />حذف الكل
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="space-y-3 p-4 text-sm text-slate-600 dark:text-slate-300">
          <p>اضغط «تعيين» ثم اضغط الاختصار المطلوب. يجب أن يبدأ بـ <Combo combo="Ctrl" /> أو <Combo combo="Alt" /> مع حرف أو رقم (مثل <Combo combo="Ctrl+Alt+S" /> أو <Combo combo="Alt+1" />)، أو مفتاح F غير مستخدم (مثل <Combo combo="F7" />).</p>
          <p className="text-xs text-muted-foreground">Esc يلغي التعيين، Backspace يحذف الاختصار. اختصارات الحفظ والطباعة والمتصفح محجوزة. إن كان الاختصار مستخدماً لصفحة أخرى يُنقل للصفحة الجديدة.</p>
        </CardContent>
      </Card>

      {message && (
        <div role="status" className={`rounded-xl border px-4 py-3 text-sm font-semibold ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : message.tone === "info" ? "border-sky-200 bg-sky-50 text-sky-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-3">
            <span>الصفحات ({assignedCount} اختصار)</span>
            {saving && <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />جارٍ الحفظ...</span>}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم الصفحة أو القسم أو الاختصار..." className="pr-9" />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyAssigned} onChange={(event) => setOnlyAssigned(event.target.checked)} className="h-4 w-4 accent-emerald-600" />
              المعيَّنة فقط
            </label>
          </div>
        </CardHeader>
        <CardContent>
          {!loaded ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />جاري تحميل البيانات...</div>
          ) : !groups.length ? (
            <p className="py-12 text-center text-sm text-muted-foreground">لا توجد صفحات مطابقة</p>
          ) : (
            <div className="space-y-6">
              {groups.map(([group, items]) => (
                <section key={group}>
                  <h3 className="mb-2 text-sm font-bold text-slate-500 dark:text-slate-400">{group}</h3>
                  <div className="divide-y overflow-hidden rounded-xl border dark:divide-slate-700 dark:border-slate-700">
                    {items.map((page) => {
                      const combo = shortcuts[page.section]
                      const isRecording = recording === page.section
                      return (
                        <div key={page.section} className={`flex flex-wrap items-center gap-3 px-3 py-2.5 ${isRecording ? "bg-amber-50 dark:bg-amber-400/10" : "bg-white dark:bg-slate-900"}`}>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold">{page.title}</div>
                            {page.path.length > 1 && <div className="truncate text-xs text-muted-foreground">{page.path.slice(1).join(" / ")}</div>}
                          </div>
                          <div className="flex min-w-[140px] justify-end">
                            {isRecording
                              ? <span className="animate-pulse text-sm font-bold text-amber-700 dark:text-amber-300">اضغط الاختصار... (Esc للإلغاء)</span>
                              : combo ? <Combo combo={combo} /> : <span className="text-xs text-muted-foreground">بلا اختصار</span>}
                          </div>
                          <div className="flex gap-1.5">
                            <Button type="button" size="sm" variant={isRecording ? "default" : "outline"} disabled={saving} onClick={() => { setMessage(null); setRecording(isRecording ? null : page.section) }}>
                              <Pencil className="ml-1 h-3.5 w-3.5" />{isRecording ? "إلغاء" : combo ? "تغيير" : "تعيين"}
                            </Button>
                            {combo && !isRecording && (
                              <Button type="button" size="sm" variant="ghost" title="حذف الاختصار" disabled={saving} onClick={() => { const { [page.section]: _removed, ...rest } = shortcuts; void save(rest, `أُزيل اختصار «${page.title}»`) }} className="text-slate-500 hover:bg-red-50 hover:text-red-600">
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
