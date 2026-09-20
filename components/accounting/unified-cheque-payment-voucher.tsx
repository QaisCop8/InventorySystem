"use client"

import "@/components/accounting/cheque-theme.css"
import { useEffect, useMemo, useRef, useState } from "react"
import { CheckCheck, ChevronDown, FileCheck2, Loader2, Plus, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import DataGridView from "@/components/common/DataGridView"
import FocusDropdown from "@/components/common/FocusDropdown"
import AccountSearchDialog, { type AccountItem } from "@/components/customer/account-search-dialog"
import { useVoucherDeepLink } from "@/hooks/use-voucher-deep-link"
import { useAuth } from "@/components/auth/auth-context"
import { useWorkspace } from "@/contexts/workspace-context"

type Cheque = { id: number; cheque_id?: number; cheq_num: string; amount: number; due_date?: string; currency_id?: number; currency_code?: string; bank_name?: string; branch_name?: string; customer_name?: string; customer_code?: string }
type Voucher = { id: number; vch_code: string; vch_date: string; vch_book_id: number | null; amount: number; status: number; account_id: number | null; account_code?: string; account_name?: string; currency_id: number | null; branch_id: number | null; note?: string; cheques: Cheque[] }
type Meta = { accounts: AccountItem[]; currencies: Array<{ id: number; currency_code: string; currency_name: string }>; branches: Array<{ id: number; branch_code: string; branch_name: string }> }
type VoucherBook = { id: number; name: string }

const today = () => new Date().toISOString().slice(0, 10)
const money = (value: unknown) => Number(value || 0).toLocaleString("ar", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const idOf = (row: Cheque) => Number(row.cheque_id || row.id)
const dueStatus = (date?: string) => date && String(date).slice(0, 10) <= today() ? "مستحق" : "غير مستحق"
const emptyMeta: Meta = { accounts: [], currencies: [], branches: [] }
const emptyForm: Voucher = { id: 0, vch_code: "", vch_date: today(), vch_book_id: null, amount: 0, status: 1, account_id: null, currency_id: null, branch_id: null, cheques: [] }
const gridScheme = {
    name: "ChequePaymentGrid", columns: [
        { header: "#", name: "number", width: 55, isReadOnly: true },
        { header: "رقم الشيك", name: "cheq_num", width: 150, isReadOnly: true },
        { header: "العميل", name: "customer_name", width: '*', isReadOnly: true },
        { header: "المبلغ", name: "amount_text", width: 100, isReadOnly: true },
        { header: "العملة", name: "currency_code", width: 90, isReadOnly: true },
        { header: "الاستحقاق", name: "due_date_text", width: 130, isReadOnly: true },
        { header: "الحالة", name: "due_status", width: 110, isReadOnly: true },
    ]
}

function ChequeSearch({ open, onOpenChange, currencyId, excluded, onSelect }: { open: boolean; onOpenChange: (open: boolean) => void; currencyId: number | null; excluded: number[]; onSelect: (rows: Cheque[]) => void }) {
    const [query, setQuery] = useState("")
    const [rows, setRows] = useState<Cheque[]>([])
    const [selected, setSelected] = useState<Set<number>>(new Set())
    const [loading, setLoading] = useState(false)
    const load = async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams({ eligible: "1" })
            if (query.trim()) params.set("q", query.trim())
            if (currencyId) params.set("currency_id", String(currencyId))
            if (excluded.length) params.set("exclude", excluded.join(","))
            const response = await fetch(`/api/cheque-payment-vouchers?${params}`)
            const data = await response.json()
            setRows(response.ok ? data.rows || [] : [])
            setSelected(new Set())
        } finally { setLoading(false) }
    }
    useEffect(() => { if (open) void load() }, [open, currencyId, excluded.join(",")])
    const allSelected = rows.length > 0 && rows.every(row => selected.has(idOf(row)))
    const toggle = (row: Cheque) => setSelected(current => { const next = new Set(current); const id = idOf(row); if (next.has(id)) next.delete(id); else next.add(id); return next })
    return <Dialog open={open} onOpenChange={onOpenChange} modal>
        <DialogContent dir="rtl" onPointerDownOutside={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()} className="flex max-h-[88vh] max-w-5xl flex-col overflow-hidden p-0">
            <DialogHeader className="cheque-page-header bg-gradient-to-l from-emerald-700 to-teal-600 p-5 text-white"><DialogTitle>بحث الشيكات الواردة</DialogTitle><DialogDescription className="text-emerald-50">اختر شيكًا واحدًا أو عدة شيكات من نفس العملة.</DialogDescription></DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
                <div className="flex gap-2"><Input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => event.key === "Enter" && void load()} placeholder="رقم الشيك، العميل أو البنك..." autoFocus /><Button size="icon" onClick={() => void load()} aria-label="بحث"><Search className="h-4 w-4" /></Button></div>
                <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setSelected(new Set(rows.map(idOf)))} disabled={!rows.length || loading}><CheckCheck className="ml-1 h-4 w-4" />اختيار الكل</Button><Button size="sm" variant="outline" onClick={() => setSelected(new Set())} disabled={!selected.size}><X className="ml-1 h-4 w-4" />إلغاء اختيار الكل</Button><span className="self-center text-xs text-slate-500">تم اختيار {selected.size} شيكات</span></div>
                <div className="min-h-0 flex-1 overflow-auto rounded-xl border"><table className="w-full min-w-[900px] text-sm"><thead className="sticky top-0 bg-emerald-50"><tr><th className="p-3"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map(idOf)))} aria-label="اختيار الكل" /></th>{["رقم الشيك", "العميل", "المبلغ", "العملة", "الاستحقاق", "البنك والفرع", "الحالة"].map(label => <th key={label} className="p-3 text-right text-xs">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={idOf(row)} onClick={() => toggle(row)} className={`cursor-pointer border-b ${selected.has(idOf(row)) ? "bg-emerald-50" : ""}`}><td className="p-3"><input type="checkbox" checked={selected.has(idOf(row))} onChange={() => toggle(row)} onClick={event => event.stopPropagation()} aria-label={row.cheq_num} /></td><td className="p-3 font-mono font-bold">{row.cheq_num}</td><td className="p-3">{row.customer_name || "—"}<small className="block text-slate-400">{row.customer_code || ""}</small></td><td className="p-3 font-bold text-emerald-700">{money(row.amount)}</td><td className="p-3">{row.currency_code || "—"}</td><td className="p-3">{String(row.due_date || "").slice(0, 10) || "—"}</td><td className="p-3">{row.bank_name || "—"}<small className="block text-slate-400">{row.branch_name || ""}</small></td><td className="p-3"><span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold">{dueStatus(row.due_date)}</span></td></tr>)}</tbody></table>{loading && <p className="p-8 text-center">جاري التحميل...</p>}</div>
                <div className="flex justify-end gap-2 border-t pt-3"><Button onClick={() => onSelect(rows.filter(row => selected.has(idOf(row))))} disabled={!selected.size}>اختيار المحدد</Button><Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button></div>
            </div>
        </DialogContent>
    </Dialog>
}

export default function UnifiedChequePaymentVoucher() {
    const { user } = useAuth()
    const { fullscreenEnabled } = useWorkspace()
    const [rows, setRows] = useState<Voucher[]>([]), [meta, setMeta] = useState<Meta>(emptyMeta), [voucherBooks, setVoucherBooks] = useState<VoucherBook[]>([]), [defaultBookId, setDefaultBookId] = useState<number | null>(null), [form, setForm] = useState<Voucher>(emptyForm), [dialogOpen, setDialogOpen] = useState(false), [searchOpen, setSearchOpen] = useState(false), [accountOpen, setAccountOpen] = useState(false), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(""), [deleteConfirm, setDeleteConfirm] = useState(false), [currentIndex, setCurrentIndex] = useState(0)
    const load = async () => { setLoading(true); try { const response = await fetch("/api/cheque-payment-vouchers", { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setRows(data.rows || []); setMeta(data.meta || emptyMeta) } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر التحميل") } finally { setLoading(false) } }
    const loadBooks = async () => { try { const query = user?.id ? `?vch_type=21&user_id=${encodeURIComponent(user.id)}` : "?vch_type=21"; const response = await fetch(`/api/receipts/voucher-books${query}`); const data = await response.json(); if (!response.ok) throw new Error(data.error || "تعذر تحميل دفاتر السندات"); const books = Array.isArray(data.books) ? data.books : []; setVoucherBooks(books); setDefaultBookId(data.default_book_id || books[0]?.id || null); if (!books.length) setError("لا يوجد دفتر سندات مصرح به لسند صرف الشيكات") } catch (reason) { setVoucherBooks([]); setDefaultBookId(null); setError(reason instanceof Error ? reason.message : "تعذر تحميل دفاتر السندات") } }
    useEffect(() => { void load(); void loadBooks() }, [user?.id])
    useEffect(() => { if (!dialogOpen) return; const handler = (event: KeyboardEvent) => { if (event.key === "F3") { event.preventDefault(); void save() } if ((event.key === "F9" || event.key === "Delete") && form.id) { event.preventDefault(); remove() } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler) }, [dialogOpen, form.id, saving])
    useEffect(() => {
        if (!fullscreenEnabled || !dialogOpen) return
        const applyFullscreen = () => {
            const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'))
            const voucherDialog = dialogs.find(dialog => dialog.textContent?.includes("سند صرف شيكات") && !dialog.textContent?.includes("بحث الشيكات الواردة"))
            if (voucherDialog) {
                voucherDialog.classList.add("cheque-payment-fullscreen")
                voucherDialog.style.position = "absolute"
                voucherDialog.style.inset = "0"
                voucherDialog.style.width = "100%"
                voucherDialog.style.maxWidth = "none"
                voucherDialog.style.height = "100%"
                voucherDialog.style.maxHeight = "none"
                voucherDialog.style.transform = "none"
            }
            return voucherDialog
        }
        const timer = window.setTimeout(applyFullscreen, 0)
        const observer = new MutationObserver(applyFullscreen)
        observer.observe(document.body, { childList: true, subtree: true })
        return () => {
            window.clearTimeout(timer)
            observer.disconnect()
            document.querySelectorAll<HTMLElement>(".cheque-payment-fullscreen").forEach(dialog => {
                dialog.classList.remove("cheque-payment-fullscreen")
                dialog.style.position = ""
                dialog.style.inset = ""
                dialog.style.width = ""
                dialog.style.maxWidth = ""
                dialog.style.height = ""
                dialog.style.maxHeight = ""
                dialog.style.transform = ""
            })
        }
    }, [fullscreenEnabled, dialogOpen])
    const openRecord = async (id: number) => { setLoading(true); try { const response = await fetch(`/api/cheque-payment-vouchers/${id}`); const data = await response.json(); if (!response.ok) throw new Error(data.error); setForm({ ...data, cheques: data.cheques || [] }); setCurrentIndex(Math.max(0, rows.findIndex(row => Number(row.id) === id))); setDialogOpen(true) } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر عرض السند") } finally { setLoading(false) } }
    const generateCode = async (bookId: number) => { try { const response = await fetch(`/api/cheque-payment-vouchers/generate-number?vch_book_id=${bookId}`); const data = await response.json(); if (!response.ok || !data.code) { setError(data.error || "تعذر توليد رقم السند"); return } setForm(current => ({ ...current, vch_book_id: bookId, vch_code: data.code })) } catch { setError("تعذر توليد رقم السند") } }
    const handleBookChange = (value: number | null) => { setForm(current => ({ ...current, vch_book_id: value, vch_code: "" })); if (value && !form.id) void generateCode(value) }
    const newRecord = async () => { const bookId = defaultBookId || voucherBooks[0]?.id || null; setForm({ ...emptyForm, vch_book_id: bookId, branch_id: meta.branches[0]?.id || null }); setCurrentIndex(rows.length); setDialogOpen(true); if (!bookId) { setError("لا يوجد دفتر سندات مصرح به لسند صرف الشيكات"); return } await generateCode(bookId) }
    useVoucherDeepLink(openRecord, true, 21)
    const navigationPending = useRef(false)
    const navigate = async (direction: "first" | "previous" | "next" | "last") => {
        if (navigationPending.current || loading || saving) return
        navigationPending.current = true
        setLoading(true)
        setError("")
        try {
            const query = new URLSearchParams({ direction, currentId: String(form.id || 0), vch_type: "21" })
            const response = await fetch("/api/transaction-navigation?" + query, { cache: "no-store" })
            const record = await response.json()
            if (!response.ok) throw new Error(record?.error || "تعذر التنقل بين السندات")
            if (record?.id) await openRecord(Number(record.id))
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "تعذر التنقل بين السندات")
        } finally {
            navigationPending.current = false
            setLoading(false)
        }
    }
    const handleCodeBlur = async () => { const raw = form.vch_code.trim().toUpperCase(); if (!raw) return; try { const query = new URLSearchParams({ raw }); if (form.vch_book_id) query.set("vch_book_id", String(form.vch_book_id)); const response = await fetch(`/api/cheque-payment-vouchers/resolve-code?${query}`); const data = await response.json(); if (!response.ok) { setError(data.error || "رقم السند غير صحيح"); return } setForm(current => ({ ...current, vch_code: data.code || raw })); if (data.exists && Number(data.id) !== Number(form.id)) void openRecord(Number(data.id)) } catch { setError("تعذر تحديد رقم السند") } }
    const selectedIds = (form.cheques || []).map(idOf)
    const chooseCheques = (selected: Cheque[]) => { const currencies = new Set(selected.map(row => Number(row.currency_id))); if (currencies.size > 1) { setError("يجب اختيار شيكات من نفس العملة"); return } setForm(current => ({ ...current, currency_id: current.currency_id || Number(selected[0]?.currency_id) || null, cheques: [...current.cheques, ...selected.filter(row => !selectedIds.includes(idOf(row)))] })); setSearchOpen(false) }
    const save = async () => { if (!form.vch_book_id || !form.account_id || !form.branch_id || !form.cheques.length) { setError("اختر دفتر السندات والحساب والفرع وشيكًا واحدًا على الأقل"); return } setSaving(true); try { const response = await fetch("/api/cheque-payment-vouchers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, cheque_ids: form.cheques.map(idOf) }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setForm({ ...data, cheques: data.cheques || [] }); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر حفظ السند") } finally { setSaving(false) } }
    const remove = () => { if (form.id) setDeleteConfirm(true) }
    const confirmDelete = async () => { setDeleteConfirm(false); setSaving(true); try { const response = await fetch(`/api/cheque-payment-vouchers/${form.id}`, { method: "DELETE" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setDialogOpen(false); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر حذف السند") } finally { setSaving(false) } }
    const gridRows = form.cheques.map((row, index) => ({ ...row, number: index + 1, amount_text: money(row.amount), due_date_text: String(row.due_date || "").slice(0, 10), due_status: dueStatus(row.due_date) }))
    return <main dir="rtl" className="min-h-full space-y-5 bg-slate-50/70 p-3 sm:p-5"><header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-emerald-950 p-6 text-white"><div className="flex items-center gap-3"><FileCheck2 /><div><h1 className="text-2xl font-black">سند صرف شيكات</h1></div></div><Button onClick={newRecord} className="gap-2 bg-white text-emerald-900"><Plus className="h-4 w-4" />سند جديد</Button></header><section className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border bg-white p-4"><p className="text-xs text-slate-500">عدد السندات</p><strong className="text-2xl">{rows.length}</strong></div><div className="rounded-2xl border bg-white p-4"><p className="text-xs text-slate-500">إجمالي المبالغ</p><strong className="text-2xl text-emerald-700">{money(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0))}</strong></div><div className="rounded-2xl border bg-white p-4"><p className="text-xs text-slate-500">الحالة</p><strong className="text-2xl">{loading ? "..." : "محدث"}</strong></div></section><section className="rounded-2xl border bg-white p-4"><div className="overflow-auto"><table className="w-full min-w-[780px] text-sm"><thead className="bg-emerald-50"><tr>{["رقم السند", "التاريخ", "الحساب", "الإجمالي", "عرض"].map(label => <th key={label} className="p-3 text-right text-xs">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b"><td className="p-3 font-mono font-bold">{row.vch_code}</td><td className="p-3">{String(row.vch_date).slice(0, 10)}</td><td className="p-3">{row.account_name || "—"}</td><td className="p-3 font-bold">{money(row.amount)}</td><td className="p-3"><Button size="sm" variant="outline" onClick={() => void openRecord(Number(row.id))}>عرض</Button></td></tr>)}</tbody></table></div></section><Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent modal={false} onPointerDownOutside={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()} dir="rtl" className="flex max-h-[94vh] w-[98vw] max-w-7xl flex-col overflow-hidden p-0"><UniversalToolbar currentRecord={currentIndex + 1} totalRecords={rows.length} onNew={newRecord} onSave={save} onDelete={form.id ? remove : undefined} onFirst={() => navigate("first")} onPrevious={() => navigate("previous")} onNext={() => navigate("next")} onLast={() => navigate("last")} isLoading={loading} isSaving={saving} canSave={!form.id} canDelete={!!form.id} isNewRecord={!form.id} labels={{ new: "جديد", save: "حفظ", previous: "السابق", next: "التالي", first: "الأول", last: "الأخير", delete: "حذف", report: "استعلام", exportExcel: "تصدير إكسل", print: "طباعة", clone: "نسخ" }} /><DialogHeader className="border-b bg-emerald-50 px-5 py-3 text-right"><DialogTitle>سند صرف شيكات {form.vch_code && <span className="font-mono text-sm">{form.vch_code}</span>}</DialogTitle><DialogDescription>F3 حفظ، F9 حذف، والتنقل بين السندات من الشريط العلوي.</DialogDescription></DialogHeader>{error && <p className="mx-5 mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5"><div className="grid gap-3 md:grid-cols-3"><div><Label>رقم السند</Label><Input value={form.vch_code} onChange={event => setForm({ ...form, vch_code: event.target.value.toUpperCase() })} onBlur={handleCodeBlur} /></div><div><Label>تاريخ السند</Label><Input type="date" value={String(form.vch_date).slice(0, 10)} disabled={!!form.id} onChange={event => setForm({ ...form, vch_date: event.target.value })} /></div><div><Label>الفرع</Label><Select value={form.branch_id ? String(form.branch_id) : "none"} disabled={!!form.id} onValueChange={value => setForm({ ...form, branch_id: Number(value) })}><SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger><SelectContent>{meta.branches.map(branch => <SelectItem key={branch.id} value={String(branch.id)}>{branch.branch_code} - {branch.branch_name}</SelectItem>)}</SelectContent></Select></div><div><Label>دفتر السندات *</Label><FocusDropdown value={form.vch_book_id} options={voucherBooks} optionLabel="name" optionValue="id" filter disabled={!!form.id} className="invoice-currency-dropdown w-full" panelClassName="invoice-currency-dropdown-panel" appendTo="self" onChange={(event) => handleBookChange(event.value ?? null)} /></div><div className="md:col-span-2"><Label>حساب المستفيد</Label><div className="flex gap-2"><Input readOnly value={form.account_id ? `${form.account_code || ""} - ${form.account_name || ""}` : ""} placeholder="اختر الحساب" /><Button type="button" variant="outline" onClick={() => setAccountOpen(true)} disabled={!!form.id}><ChevronDown className="h-4 w-4" /></Button></div></div><div><Label>الملاحظة</Label><Input value={form.note || ""} disabled={!!form.id} onChange={event => setForm({ ...form, note: event.target.value })} /></div></div><section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-black">الشيكات</h3><p className="text-xs text-slate-500">يُسمح بإضافة عدة شيكات من نفس العملة.</p></div>{!form.id && <Button onClick={() => setSearchOpen(true)}><Search className="ml-1 h-4 w-4" />بحث وإضافة شيكات</Button>}</div><div className="h-[360px] overflow-hidden rounded-xl border"><DataGridView dataSource={gridRows} scheme={gridScheme} defaultRowHeight={42} containerStyle={{ height: "100%" }} style={{ height: "100%" }} /></div><div className="text-left text-lg font-black">الإجمالي: {money(form.cheques.reduce((sum, row) => sum + Number(row.amount || 0), 0))}</div></section></div></DialogContent></Dialog><ChequeSearch open={searchOpen} onOpenChange={setSearchOpen} currencyId={form.currency_id} excluded={selectedIds} onSelect={chooseCheques} /><AccountSearchDialog open={accountOpen} onOpenChange={setAccountOpen} accounts={meta.accounts} onSelect={account => { setForm({ ...form, account_id: account.id, account_code: account.code, account_name: account.name }); setAccountOpen(false) }} showTypeFilter /><ConfirmDialogYesNo visible={deleteConfirm} message="هل أنت متأكد من حذف سند صرف الشيكات؟" onConfirm={() => void confirmDelete()} onCancel={() => setDeleteConfirm(false)} /></main>
}
