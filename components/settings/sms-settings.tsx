"use client"

import { confirmYesNo } from "@/components/ui/confirm-host"
import { useCallback, useEffect, useRef, useState } from "react"
import { CheckCircle2, Link2, ListChecks, Loader2, MessageSquareText, Plus, RefreshCw, Save, ScrollText, Send, Settings2, Trash2, Wallet, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"

// إعدادات الرسائل SMS (بنمط الشامل): الاتصال بالمزوّد، القوالب، ربط القوالب بالحركات (مع الإرسال التلقائي)، وسجل الإرسال.

type Settings = { enabled: boolean; send_link: string; balance_link: string; username: string; password?: string; has_password?: boolean; sender: string; success_codes: string; country_code: string }
type Template = { id: number; name: string; message_text: string }
type Config = { doc_key: string; template_id: number | null; auto_send: boolean }
type LogRow = { id: number; doc_key: string | null; document_code: string | null; party_name: string | null; mobile: string; message: string; sent: boolean; auto: boolean; error: string | null; created_at: string }
type Data = { settings: Settings; templates: Template[]; configs: Config[]; doc_types: { key: string; label: string }[]; placeholders: { key: string; label: string }[] }

const TABS = [
  { key: "settings", label: "الاتصال بالمزوّد", icon: Settings2 },
  { key: "templates", label: "القوالب", icon: MessageSquareText },
  { key: "config", label: "ربط القوالب بالحركات", icon: Link2 },
  { key: "log", label: "سجل الرسائل", icon: ScrollText },
] as const

async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`)
  return data as T
}
const post = (body: unknown) => api("/api/sms", { method: "POST", body: JSON.stringify(body) })

export default function SmsSettings() {
  const { toast } = useToast()
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("settings")
  const [data, setData] = useState<Data | null>(null)
  const [form, setForm] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const result = await api<Data>("/api/sms?scope=settings")
      setData(result); setForm({ ...result.settings, password: "" })
    } catch (error) { toast({ title: "خطأ", description: error instanceof Error ? error.message : "", variant: "destructive" }) }
  }, [toast])
  useEffect(() => { void load() }, [load])

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true)
    try { await action(); toast({ title: success }); await load() }
    catch (error) { toast({ title: "تعذر التنفيذ", description: error instanceof Error ? error.message : "", variant: "destructive" }) }
    finally { setBusy(false) }
  }

  if (!data || !form) return <div className="p-10 text-center text-muted-foreground">جاري تحميل البيانات...</div>

  return (
    <div dir="rtl" className="space-y-5 p-3 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><MessageSquareText className="h-6 w-6 text-sky-600" />إعدادات الرسائل SMS</h1>
          <p className="mt-1 text-sm text-muted-foreground">ربط مزوّد الرسائل، قوالب الرسائل، وإرسالها للعملاء من الفواتير والإرساليات والطلبيات وسندات القبض — يدوياً أو تلقائياً عند الإضافة.</p>
        </div>
        <span className={`self-start rounded-full px-3 py-1 text-xs font-bold ${data.settings.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{data.settings.enabled ? "الخدمة مفعّلة" : "الخدمة غير مفعّلة"}</span>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-2xl border bg-sky-50/60 p-1.5">
        {TABS.map(item => (
          <button key={item.key} type="button" onClick={() => setTab(item.key)}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${tab === item.key ? "bg-white text-sky-700 shadow-sm ring-1 ring-sky-100" : "text-slate-500 hover:text-slate-800"}`}>
            <item.icon className="h-4 w-4" />{item.label}
          </button>
        ))}
      </div>

      {tab === "settings" && <ProviderTab form={form} setForm={setForm} busy={busy} onSave={() => run(() => post({ action: "save_settings", settings: form }), "تم حفظ إعدادات الرسائل")} />}
      {tab === "templates" && <TemplatesTab templates={data.templates} placeholders={data.placeholders} busy={busy}
        onSave={(template) => run(() => post({ action: "save_template", ...template }), "تم حفظ القالب")}
        onDelete={async (template) => { if (await confirmYesNo(`حذف القالب "${template.name}"؟`)) void run(() => post({ action: "delete_template", id: template.id }), "تم حذف القالب") }} />}
      {tab === "config" && <ConfigTab data={data} busy={busy} onSave={(config) => run(() => post({ action: "save_config", ...config }), "تم الحفظ")} />}
      {tab === "log" && <LogTab />}
    </div>
  )
}

function ProviderTab({ form, setForm, busy, onSave }: { form: Settings; setForm: (value: Settings) => void; busy: boolean; onSave: () => void }) {
  const [testMobile, setTestMobile] = useState("")
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const set = (patch: Partial<Settings>) => setForm({ ...form, ...patch })
  const test = async () => {
    setTesting(true); setStatus(null)
    try { await post({ action: "test", mobile: testMobile }); setStatus({ ok: true, text: "تم إرسال الرسالة التجريبية بنجاح" }) }
    catch (error) { setStatus({ ok: false, text: error instanceof Error ? error.message : "فشل الإرسال" }) }
    finally { setTesting(false) }
  }
  const balance = async () => {
    setStatus(null)
    try {
      const result = await api<{ ok: boolean; balance?: string; error?: string }>("/api/sms?scope=balance")
      setStatus(result.ok ? { ok: true, text: `رصيد الرسائل: ${result.balance}` } : { ok: false, text: result.error || "تعذر جلب الرصيد" })
    } catch (error) { setStatus({ ok: false, text: error instanceof Error ? error.message : "تعذر جلب الرصيد" }) }
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card>
        <CardContent className="space-y-4 pt-5">
          <label className="flex items-center justify-between gap-3 rounded-xl border bg-slate-50 px-4 py-3">
            <span><b>تفعيل خدمة الرسائل</b><span className="block text-xs text-muted-foreground">بدونها لا تُرسل أي رسالة يدوية أو تلقائية</span></span>
            <Switch checked={form.enabled} onCheckedChange={value => set({ enabled: value })} />
          </label>
          <div className="space-y-1.5">
            <Label>رابط الإرسال</Label>
            <Textarea dir="ltr" rows={3} value={form.send_link} onChange={event => set({ send_link: event.target.value })} />
            <p className="text-xs text-muted-foreground">المتغيرات: <code dir="ltr">[UserName] [Password] [Sender] [Mobile] [Message]</code> — تُستبدل وتُرمَّز تلقائياً.</p>
          </div>
          <div className="space-y-1.5"><Label>رابط رصيد الرسائل (اختياري)</Label><Input dir="ltr" value={form.balance_link} onChange={event => set({ balance_link: event.target.value })} placeholder="http://…?username=[UserName]&password=[Password]" /></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label>اسم المستخدم</Label><Input dir="ltr" value={form.username} onChange={event => set({ username: event.target.value })} /></div>
            <div className="space-y-1.5"><Label>كلمة المرور</Label><Input dir="ltr" type="password" value={form.password || ""} onChange={event => set({ password: event.target.value })} placeholder={form.has_password ? "•••••• (محفوظة — اتركها فارغة للإبقاء)" : ""} /></div>
            <div className="space-y-1.5"><Label>اسم المرسل</Label><Input dir="ltr" value={form.sender} onChange={event => set({ sender: event.target.value })} /></div>
            <div className="space-y-1.5"><Label>رمز نجاح الإرسال</Label><Input dir="ltr" value={form.success_codes} onChange={event => set({ success_codes: event.target.value })} placeholder="1001" /></div>
            <div className="space-y-1.5"><Label>مفتاح الدولة</Label><Input dir="ltr" value={form.country_code} onChange={event => set({ country_code: event.target.value })} placeholder="970" /><small className="text-xs text-muted-foreground">05xxxxxxxx ⇐ 9705xxxxxxxx</small></div>
          </div>
          <div className="flex justify-end"><Button onClick={onSave} disabled={busy}><Save className="ml-2 h-4 w-4" />حفظ الإعدادات</Button></div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 pt-5">
          <h3 className="font-bold">اختبار الاتصال</h3>
          <p className="text-xs text-muted-foreground">احفظ الإعدادات أولاً ثم أرسل رسالة تجريبية أو اعرض الرصيد.</p>
          <div className="space-y-1.5"><Label>رقم جوال للتجربة</Label><Input dir="ltr" value={testMobile} onChange={event => setTestMobile(event.target.value)} placeholder="05xxxxxxxx" /></div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void test()} disabled={testing || !testMobile.trim()}>{testing ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Send className="ml-2 h-4 w-4" />}رسالة تجريبية</Button>
            <Button variant="outline" onClick={() => void balance()}><Wallet className="ml-2 h-4 w-4" />رصيد الرسائل</Button>
          </div>
          {status && <p className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${status.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{status.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}{status.text}</p>}
        </CardContent>
      </Card>
    </div>
  )
}

function TemplatesTab({ templates, placeholders, busy, onSave, onDelete }: { templates: Template[]; placeholders: { key: string; label: string }[]; busy: boolean; onSave: (template: Partial<Template>) => void; onDelete: (template: Template) => void }) {
  const [editing, setEditing] = useState<Partial<Template>>({ name: "", message_text: "" })
  const textRef = useRef<HTMLTextAreaElement>(null)
  const insert = (key: string) => {
    const element = textRef.current
    const text = editing.message_text || ""
    const start = element?.selectionStart ?? text.length, end = element?.selectionEnd ?? text.length
    setEditing({ ...editing, message_text: text.slice(0, start) + key + text.slice(end) })
    requestAnimationFrame(() => { element?.focus(); element?.setSelectionRange(start + key.length, start + key.length) })
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <h3 className="font-bold">{editing.id ? "تعديل قالب" : "قالب جديد"}</h3>
          <div className="space-y-1.5"><Label>اسم القالب</Label><Input value={editing.name || ""} onChange={event => setEditing({ ...editing, name: event.target.value })} placeholder="مثلاً: إشعار فاتورة" /></div>
          <div className="space-y-1.5">
            <Label>نص الرسالة</Label>
            <Textarea ref={textRef} rows={6} value={editing.message_text || ""} onChange={event => setEditing({ ...editing, message_text: event.target.value })} placeholder="عزيزي [CustomerName]، تم إصدار [TransactionType] رقم [Code] بقيمة [TransactionValue] [TransactionCurrency]. رصيدكم: [CustomerBalance]" />
            <small className="text-xs text-muted-foreground">{(editing.message_text || "").length} حرفاً (الرسالة العربية الواحدة 70 حرفاً)</small>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {placeholders.map(item => <button key={item.key} type="button" onClick={() => insert(item.key)} className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100">{item.label}</button>)}
          </div>
          <div className="flex justify-end gap-2">
            {editing.id ? <Button variant="outline" onClick={() => setEditing({ name: "", message_text: "" })}>قالب جديد</Button> : null}
            <Button disabled={busy || !editing.name?.trim() || !editing.message_text?.trim()} onClick={() => { onSave(editing); setEditing({ name: "", message_text: "" }) }}><Save className="ml-2 h-4 w-4" />حفظ القالب</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <div className="border-b px-4 py-2.5 font-bold">القوالب ({templates.length})</div>
          {templates.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">لا توجد قوالب بعد</div> : (
            <div className="divide-y">
              {templates.map(template => (
                <div key={template.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1"><b className="text-sm">{template.name}</b><p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-600">{template.message_text}</p></div>
                  <Button size="sm" variant="outline" onClick={() => setEditing(template)}>تعديل</Button>
                  <Button size="sm" variant="outline" className="text-rose-600" onClick={() => onDelete(template)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ConfigTab({ data, busy, onSave }: { data: Data; busy: boolean; onSave: (config: Config) => void }) {
  const configOf = (key: string) => data.configs.find(config => config.doc_key === key) || { doc_key: key, template_id: null, auto_send: false }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center gap-2 border-b px-4 py-2.5 font-bold"><ListChecks className="h-4 w-4" />لكل نوع حركة: القالب الافتراضي، والإرسال التلقائي للعميل عند إضافة الحركة</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3 text-right">الحركة</th><th className="p-3 text-right">القالب</th><th className="p-3 text-center">إرسال تلقائي عند الإضافة</th></tr></thead>
            <tbody>
              {data.doc_types.map(type => {
                const config = configOf(type.key)
                return (
                  <tr key={type.key} className="border-t">
                    <td className="p-3 font-semibold">{type.label}</td>
                    <td className="p-3">
                      <select className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-2 text-sm" disabled={busy} value={config.template_id ?? ""}
                        onChange={event => onSave({ ...config, template_id: Number(event.target.value) || null, auto_send: Number(event.target.value) ? config.auto_send : false })}>
                        <option value="">— بدون قالب —</option>
                        {data.templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
                      </select>
                    </td>
                    <td className="p-3 text-center"><Switch checked={config.auto_send} disabled={busy || !config.template_id} onCheckedChange={value => onSave({ ...config, auto_send: value })} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">الإرسال التلقائي يتم عند إضافة الحركة لأول مرة لرقم جوال العميل في بطاقته (الجوال الأول ثم الثاني). زر "SMS" في شريط أدوات الحركة يرسل يدوياً في أي وقت.</p>
      </CardContent>
    </Card>
  )
}

function LogTab() {
  const [rows, setRows] = useState<LogRow[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const load = useCallback(async (text = "") => {
    setLoading(true)
    try { setRows((await api<{ rows: LogRow[] }>(`/api/sms?scope=log&search=${encodeURIComponent(text)}`)).rows || []) } catch { setRows([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  return (
    <Card>
      <CardContent className="p-0">
        <form className="flex gap-2 border-b p-3" onSubmit={event => { event.preventDefault(); void load(search) }}>
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="بحث بالجوال أو العميل أو رقم الحركة" />
          <Button type="submit" variant="outline" data-report-apply><RefreshCw className={`ml-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />بحث</Button>
        </form>
        {rows.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">{loading ? "جاري تحميل البيانات..." : "لا توجد رسائل"}</div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3 text-right">التاريخ</th><th className="p-3 text-right">الحركة</th><th className="p-3 text-right">العميل</th><th className="p-3 text-right">الجوال</th><th className="p-3 text-right">الرسالة</th><th className="p-3 text-center">الحالة</th></tr></thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-t align-top">
                    <td className="p-3 font-mono text-xs">{new Date(row.created_at).toLocaleString("en-GB", { hour12: false })}</td>
                    <td className="p-3 font-mono text-xs">{row.document_code || "—"}{row.auto && <span className="mr-1 rounded bg-sky-100 px-1.5 text-[10px] font-bold text-sky-700">تلقائي</span>}</td>
                    <td className="p-3">{row.party_name || "—"}</td>
                    <td className="p-3 font-mono" dir="ltr">{row.mobile}</td>
                    <td className="max-w-md p-3 text-xs text-slate-600">{row.message}</td>
                    <td className="p-3 text-center">{row.sent
                      ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">أُرسلت</span>
                      : <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700" title={row.error || ""}>فشلت</span>}
                      {!row.sent && row.error && <p className="mt-1 text-[11px] text-rose-600">{row.error}</p>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
