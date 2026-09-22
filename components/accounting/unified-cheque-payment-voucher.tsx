"use client"

import "@/components/accounting/cheque-theme.css"
import { useEffect, useRef, useState } from "react"
import { BookOpen, CheckCheck, FileCheck2, Plus, Search, Wallet, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import PostVoucherDialog, { type PostVoucherAction } from "@/components/common/post-voucher-dialog"
import VoucherPrintLayout, { type VoucherPrintData } from "@/components/common/voucher-print-layout"
import DataGridView from "@/components/common/DataGridView"
import FocusDropdown from "@/components/common/FocusDropdown"
import type { AccountItem } from "@/components/customer/account-search-dialog"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import { useVoucherDeepLink } from "@/hooks/use-voucher-deep-link"
import { useAuth } from "@/components/auth/auth-context"
import { useWorkspace } from "@/contexts/workspace-context"

type Cheque = { status_id?: number; status_name?: string; id: number; cheque_id?: number; cheq_num: string; amount: number; due_date?: string; currency_id?: number; currency_code?: string; bank_name?: string; branch_name?: string; customer_name?: string; customer_code?: string }
type Voucher = { id: number; vch_code: string; vch_date: string; vch_book_id: number | null; amount: number; status: number; account_id: number | null; account_code?: string; account_name?: string; currency_id: number | null; branch_id: number | null; note?: string; cheques: Cheque[] }
type Meta = { accounts: AccountItem[]; currencies: Array<{ id: number; currency_code: string; currency_name: string }>; branches: Array<{ id: number; branch_code: string; branch_name: string }> }
type VoucherBook = { id: number; name: string }

const today = () => new Date().toISOString().slice(0, 10)
const money = (value: unknown) => Number(value || 0).toLocaleString("ar", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const idOf = (row: Cheque) => Number(row.cheque_id || row.id)
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
    const [error, setError] = useState("")
    const requestRef = useRef<AbortController | null>(null)
    const load = async () => {
        requestRef.current?.abort()
        const controller = new AbortController()
        requestRef.current = controller
        setLoading(true)
        setError("")
        setRows([])
        setSelected(new Set())
        try {
            const params = new URLSearchParams({ picker: "cheque_payment" })
            if (query.trim()) params.set("q", query.trim())
            if (currencyId) params.set("currency_id", String(currencyId))
            if (excluded.length) params.set("exclude", excluded.join(","))
            const response = await fetch(`/api/cheques?${params}`, { cache: "no-store", signal: controller.signal })
            const data = await response.json()
            if (controller.signal.aborted) return
            if (!response.ok) throw new Error(data.error || "تعذر تحميل الشيكات")
            setRows(data.rows || [])
        } catch (reason) {
            if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "تعذر تحميل الشيكات")
        } finally {
            if (!controller.signal.aborted) setLoading(false)
        }
    }
    useEffect(() => { if (open) void load(); return () => requestRef.current?.abort() }, [open, currencyId, excluded.join(",")])
    const allSelected = rows.length > 0 && rows.every(row => selected.has(idOf(row)))
    const toggle = (row: Cheque) => setSelected(current => { const next = new Set(current); const id = idOf(row); if (next.has(id)) next.delete(id); else next.add(id); return next })
    return <Dialog open={open} onOpenChange={onOpenChange} modal>
        <DialogContent dir="rtl" onPointerDownOutside={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()} className="flex max-h-[88vh] max-w-5xl flex-col overflow-hidden p-0">
            <DialogHeader className="cheque-page-header bg-gradient-to-l from-emerald-700 to-teal-600 p-5 text-white"><DialogTitle>بحث الشيكات الواردة</DialogTitle><DialogDescription className="text-emerald-50">اختر شيكًا واحدًا أو عدة شيكات من نفس العملة.</DialogDescription></DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
                {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
                <div className="flex gap-2"><Input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => event.key === "Enter" && void load()} placeholder="رقم الشيك، العميل أو البنك..." autoFocus /><Button size="icon" onClick={() => void load()} aria-label="بحث"><Search className="h-4 w-4" /></Button></div>
                <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setSelected(new Set(rows.map(idOf)))} disabled={!rows.length || loading}><CheckCheck className="ml-1 h-4 w-4" />اختيار الكل</Button><Button size="sm" variant="outline" onClick={() => setSelected(new Set())} disabled={!selected.size}><X className="ml-1 h-4 w-4" />إلغاء اختيار الكل</Button><span className="self-center text-xs text-slate-500">تم اختيار {selected.size} شيكات</span></div>
                <div className="min-h-0 flex-1 overflow-auto rounded-xl border"><table className="w-full min-w-[900px] text-sm"><thead className="sticky top-0 bg-emerald-50"><tr><th className="p-3"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map(idOf)))} aria-label="اختيار الكل" /></th>{["رقم الشيك", "العميل", "المبلغ", "العملة", "الاستحقاق", "البنك والفرع", "الحالة"].map(label => <th key={label} className="p-3 text-right text-xs">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={idOf(row)} onClick={() => toggle(row)} className={`cursor-pointer border-b ${selected.has(idOf(row)) ? "bg-emerald-50" : ""}`}><td className="p-3"><input type="checkbox" checked={selected.has(idOf(row))} onChange={() => toggle(row)} onClick={event => event.stopPropagation()} aria-label={row.cheq_num} /></td><td className="p-3 font-mono font-bold">{row.cheq_num}</td><td className="p-3">{row.customer_name || "—"}<small className="block text-slate-400">{row.customer_code || ""}</small></td><td className="p-3 font-bold text-emerald-700">{money(row.amount)}</td><td className="p-3">{row.currency_code || "—"}</td><td className="p-3">{String(row.due_date || "").slice(0, 10) || "—"}</td><td className="p-3">{row.bank_name || "—"}<small className="block text-slate-400">{row.branch_name || ""}</small></td><td className="p-3"><span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold">{row.status_name || "—"}</span></td></tr>)}</tbody></table>{loading && <p className="p-8 text-center">جاري التحميل...</p>}</div>
                <div className="flex justify-end gap-2 border-t pt-3"><Button onClick={() => onSelect(rows.filter(row => selected.has(idOf(row))))} disabled={!selected.size}>اختيار المحدد</Button><Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button></div>
            </div>
        </DialogContent>
    </Dialog>
}

export default function UnifiedChequePaymentVoucher() {
    const [postDialogOpen, setPostDialogOpen] = useState(false)
    const [printData, setPrintData] = useState<VoucherPrintData | null>(null)
    const savingRef = useRef(false)
    useEffect(() => { if (!printData) return; const timer = window.setTimeout(() => window.print(), 150); return () => window.clearTimeout(timer) }, [printData])
    const { user } = useAuth()
    const { fullscreenEnabled } = useWorkspace()
    const [rows, setRows] = useState<Voucher[]>([]), [meta, setMeta] = useState<Meta>(emptyMeta), [voucherBooks, setVoucherBooks] = useState<VoucherBook[]>([]), [defaultBookId, setDefaultBookId] = useState<number | null>(null), [form, setForm] = useState<Voucher>(emptyForm), [dialogOpen, setDialogOpen] = useState(false), [searchOpen, setSearchOpen] = useState(false), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(""), [deleteConfirm, setDeleteConfirm] = useState(false), [currentIndex, setCurrentIndex] = useState(0)
    const load = async () => { setLoading(true); try { const response = await fetch("/api/cheque-payment-vouchers", { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setRows(data.rows || []); setMeta(data.meta || emptyMeta) } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر التحميل") } finally { setLoading(false) } }
    const loadBooks = async () => { try { const query = user?.id ? `?vch_type=21&user_id=${encodeURIComponent(user.id)}` : "?vch_type=21"; const response = await fetch(`/api/receipts/voucher-books${query}`); const data = await response.json(); if (!response.ok) throw new Error(data.error || "تعذر تحميل دفاتر السندات"); const books = Array.isArray(data.books) ? data.books : []; setVoucherBooks(books); setDefaultBookId(data.default_book_id || books[0]?.id || null); if (!books.length) setError("لا يوجد دفتر سندات مصرح به لسند صرف الشيكات") } catch (reason) { setVoucherBooks([]); setDefaultBookId(null); setError(reason instanceof Error ? reason.message : "تعذر تحميل دفاتر السندات") } }
    useEffect(() => { void load(); void loadBooks() }, [user?.id])
    useEffect(() => {
        if (!dialogOpen || searchOpen || postDialogOpen || deleteConfirm || saving) return
        const handler = (event: KeyboardEvent) => {
            const activeDialog = (event.target as HTMLElement | null)?.closest?.('[role="dialog"]')
            if (activeDialog && !activeDialog.classList.contains("cheque-payment-editor")) return
            if (event.key === "F3" && form.status === 1) { event.preventDefault(); setPostDialogOpen(true) }
            if ((event.key === "F9" || event.key === "Delete") && form.id) { event.preventDefault(); remove() }
        }
        window.addEventListener("keydown", handler)
        return () => window.removeEventListener("keydown", handler)
    }, [dialogOpen, searchOpen, form, saving, postDialogOpen, deleteConfirm])
    const openRecord = async (id: number) => { setLoading(true); try { const response = await fetch(`/api/cheque-payment-vouchers/${id}`); const data = await response.json(); if (!response.ok) throw new Error(data.error); setForm({ ...data, cheques: data.cheques || [] }); setCurrentIndex(Math.max(0, rows.findIndex(row => Number(row.id) === id))); setDialogOpen(true) } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر عرض السند") } finally { setLoading(false) } }
    const generateCode = async (bookId: number) => { try { const response = await fetch(`/api/cheque-payment-vouchers/generate-number?vch_book_id=${bookId}`); const data = await response.json(); if (!response.ok || !data.code) { setError(data.error || "تعذر توليد رقم السند"); return } setForm(current => ({ ...current, vch_book_id: bookId, vch_code: data.code })) } catch { setError("تعذر توليد رقم السند") } }
    const handleBookChange = (value: number | null) => { setForm(current => ({ ...current, vch_book_id: value, vch_code: "" })); if (value && !form.id) void generateCode(value) }
    const newRecord = async () => { setError(""); const bookId = defaultBookId || voucherBooks[0]?.id || null; setForm({ ...emptyForm, vch_date: today(), vch_book_id: bookId, branch_id: meta.branches[0]?.id || null }); setCurrentIndex(rows.length); setDialogOpen(true); if (!bookId) { setError("لا يوجد دفتر سندات مصرح به لسند صرف الشيكات"); return } await generateCode(bookId) }
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
    const save = async (action: PostVoucherAction) => { if (savingRef.current || form.status !== 1) return; setPostDialogOpen(false); if (!form.vch_book_id || !form.account_id || !form.branch_id || !form.cheques.length) { setError("اختر دفتر السندات والحساب والفرع وشيكًا واحدًا على الأقل"); return } savingRef.current = true; setSaving(true); setError(""); try { const response = await fetch(form.id ? `/api/cheque-payment-vouchers/${form.id}` : "/api/cheque-payment-vouchers", { method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, action, cheque_ids: form.cheques.map(idOf) }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); if (action === "save_print" || action === "post_print") setPrintData({title:"سند صرف شيكات",copyLabel:action === "post_print" ? "نسخة اصلية" : "نسخة للتدقيق",vch_code:data.vch_code,vch_date:data.vch_date,currency_name:data.currency_name,amount:Number(data.amount),note:data.note,rows:[{account_code:data.account_code,account_name:data.account_name,debit:Number(data.amount)},...(data.cheques || []).map((row:any)=>({account_name:row.customer_name,credit:Number(row.amount),note:row.cheq_num}))]}); setPostDialogOpen(false); await load(); await newRecord() } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر حفظ السند") } finally { savingRef.current = false; setSaving(false) } }
    const remove = () => { if (form.id) setDeleteConfirm(true) }
    const confirmDelete = async () => { if (savingRef.current) return; savingRef.current = true; setDeleteConfirm(false); setSaving(true); try { const response = await fetch(`/api/cheque-payment-vouchers/${form.id}`, { method: "DELETE" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setDialogOpen(false); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر حذف السند") } finally { savingRef.current = false; setSaving(false) } }
    const gridRows = form.cheques.map((row, index) => ({ ...row, number: index + 1, amount_text: money(row.amount), due_date_text: String(row.due_date || "").slice(0, 10), due_status: row.status_name || "—" }))
    const total = form.cheques.reduce((sum, row) => sum + Number(row.amount || 0), 0)
    const currency = meta.currencies.find(row => Number(row.id) === Number(form.currency_id))
    const statusLabel = !form.id ? "سند جديد" : Number(form.status) === 2 ? "مرحل" : Number(form.status) === 3 ? "ملغي" : "محفوظ"
    const chequeScheme = {
        ...gridScheme,
        columns: [...gridScheme.columns, ...(!form.id ? [{
            header: "حذف", name: "delete", width: 75, isReadOnly: true,
            buttonBody: "button", buttonLabel: "حذف", className: "danger",
            onClick: (_event: any, context: any) => setForm(current => ({
                ...current,
                cheques: current.cheques.filter(row => idOf(row) !== idOf(context.item ?? context.row.dataItem)),
            })),
        }] : [])],
    }

    return (
        <main dir="rtl" className="min-h-full space-y-5 bg-slate-50 p-3 sm:p-6">
            <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700"><FileCheck2 className="h-6 w-6" /></span>
                    <div><p className="mb-1 text-xs font-semibold text-emerald-700">الحسابات · الشيكات</p><h1 className="text-xl font-black text-slate-900 sm:text-2xl">سند صرف شيكات</h1></div>
                </div>
                <Button onClick={() => void newRecord()} disabled={loading || saving} className="h-11 gap-2 rounded-xl bg-emerald-700 px-5 hover:bg-emerald-800"><Plus className="h-4 w-4" />سند جديد</Button>
            </header>
            {!dialogOpen && error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b px-5 py-4"><h2 className="font-bold text-slate-800">سندات صرف الشيكات</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{loading ? "جاري التحميل..." : `${rows.length} سند`}</span></div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] text-sm">
                        <thead className="bg-slate-50 text-slate-500"><tr>{["رقم السند", "التاريخ", "حساب المستفيد", "الإجمالي", ""].map((label, index) => <th key={index} className="px-5 py-3 text-right text-xs font-semibold">{label}</th>)}</tr></thead>
                        <tbody>{rows.map(row => <tr key={row.id} className="border-t border-slate-100 transition-colors hover:bg-emerald-50/40">
                            <td className="px-5 py-4 font-mono font-bold text-emerald-800">{row.vch_code}</td><td className="px-5 py-4">{String(row.vch_date).slice(0, 10)}</td><td className="px-5 py-4">{row.account_name || "—"}</td><td className="px-5 py-4 font-semibold tabular-nums">{money(row.amount)}</td><td className="px-5 py-4 text-left"><Button size="sm" variant="outline" className="rounded-lg" disabled={loading || saving} onClick={() => void openRecord(Number(row.id))}>عرض السند</Button></td>
                        </tr>)}{!loading && !rows.length && <tr><td colSpan={5} className="px-5 py-14 text-center text-slate-500">لا توجد سندات صرف شيكات لعرضها</td></tr>}</tbody>
                    </table>
                </div>
            </section>

            <Dialog open={dialogOpen} onOpenChange={open => { if (!saving) setDialogOpen(open) }}>
                <DialogContent
                    hideCloseButton
                    onPointerDownOutside={event => event.preventDefault()}
                    onInteractOutside={event => event.preventDefault()}
                    dir="rtl"
                    className={`cheque-payment-editor flex h-[94dvh] max-h-[calc(100%-1rem)] w-[calc(100%-1rem)] max-w-[1360px] flex-col gap-0 overflow-hidden rounded-2xl border-slate-200 bg-slate-50 p-0 ${fullscreenEnabled ? "cheque-payment-fullscreen" : ""}`}
                >
                    <div className="flex shrink-0 items-center justify-between gap-4 border-b border-emerald-100 bg-white px-4 py-4 sm:px-6">
                        <DialogHeader className="min-w-0 text-right"><DialogTitle className="flex flex-wrap items-center gap-2 text-lg font-black text-slate-900"><FileCheck2 className="h-5 w-5 text-emerald-700" />سند صرف شيكات<span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{statusLabel}</span></DialogTitle><DialogDescription className="mt-1 text-xs">بيانات السند والمستفيد والشيكات المختارة</DialogDescription></DialogHeader>
                        <Button type="button" size="icon" variant="ghost" disabled={saving} onClick={() => setDialogOpen(false)} aria-label="إغلاق سند صرف الشيكات" className="shrink-0 rounded-full text-slate-500"><X className="h-5 w-5" /></Button>
                    </div>
                    <div className="shrink-0 border-b bg-white px-2">
                        <UniversalToolbar currentRecord={currentIndex + 1} totalRecords={rows.length} onNew={newRecord} onSave={() => setPostDialogOpen(true)} onDelete={form.id ? remove : undefined} onFirst={() => navigate("first")} onPrevious={() => navigate("previous")} onNext={() => navigate("next")} onLast={() => navigate("last")} isLoading={loading} isSaving={saving} canSave={form.status === 1} canDelete={!!form.id} isNewRecord={!form.id} labels={{ new: "جديد", save: "حفظ", previous: "السابق", next: "التالي", first: "الأول", last: "الأخير", delete: "حذف", report: "استعلام", exportExcel: "تصدير إكسل", print: "طباعة", clone: "نسخ" }} />
                    </div>
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-5">
                        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-800"><BookOpen className="h-4 w-4 text-emerald-600" />بيانات السند</h3>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                <div className="min-w-0 space-y-2"><Label htmlFor="cheque-payment-book">دفتر السندات *</Label><FocusDropdown inputId="cheque-payment-book" value={form.vch_book_id} options={voucherBooks} optionLabel="name" optionValue="id" filter disabled={!!form.id || saving} placeholder="اختر دفتر السندات" className="invoice-currency-dropdown w-full" panelClassName="invoice-currency-dropdown-panel" appendTo="self" onChange={event => handleBookChange(event.value ?? null)} /></div>
                                <div className="min-w-0 space-y-2"><Label htmlFor="cheque-payment-code">رقم السند</Label><Input id="cheque-payment-code" dir="ltr" className="h-11 rounded-xl text-right font-mono" value={form.vch_code} disabled={saving} onChange={event => setForm({ ...form, vch_code: event.target.value.toUpperCase() })} onBlur={handleCodeBlur} /></div>
                                <div className="min-w-0 space-y-2"><Label htmlFor="cheque-payment-date">تاريخ السند</Label><Input id="cheque-payment-date" className="h-11 rounded-xl" type="date" value={String(form.vch_date).slice(0, 10)} disabled={!!form.id || saving} onChange={event => setForm({ ...form, vch_date: event.target.value })} /></div>
                                <div className="min-w-0 space-y-2"><Label htmlFor="cheque-payment-branch">الفرع</Label><Select value={form.branch_id ? String(form.branch_id) : "none"} disabled={!!form.id || saving} onValueChange={value => setForm({ ...form, branch_id: Number(value) })}><SelectTrigger id="cheque-payment-branch" className="h-11 rounded-xl"><SelectValue placeholder="اختر الفرع" /></SelectTrigger><SelectContent>{meta.branches.map(branch => <SelectItem key={branch.id} value={String(branch.id)}>{branch.branch_code} - {branch.branch_name}</SelectItem>)}</SelectContent></Select></div>
                            </div>
                            <div className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-100 pt-5 lg:grid-cols-2">
                                <AutoCompleteAccount
                                    label="حساب المستفيد *"
                                    value={form.account_code || ""}
                                    onValueChange={value => setForm(current => current.account_code === value ? current : ({ ...current, account_code: value, account_id: null, account_name: "" }))}
                                    onAccountSelect={account => setForm(current => account ? ({ ...current, account_id: account.id, account_code: account.code, account_name: account.name }) : ({ ...current, account_id: null, account_name: "" }))}
                                    placeholder="أدخل كود الحساب أو افتح البحث"
                                    showCostCenterButton={false}
                                    showCostCenterDialog={false}
                                    disabled={!!form.id || saving}
                                    inputClassName="h-11 rounded-xl"
                                />
                                <div className="min-w-0 space-y-2"><Label htmlFor="cheque-payment-note">الملاحظة</Label><Input id="cheque-payment-note" className="h-11 rounded-xl" placeholder="ملاحظة على السند (اختياري)" value={form.note || ""} disabled={!!form.id || saving} onChange={event => setForm({ ...form, note: event.target.value })} /></div>
                            </div>
                        </section>
                        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
                                <div><div className="flex items-center gap-2"><h3 className="font-bold text-slate-800">الشيكات</h3><span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">{form.cheques.length}</span></div><p className="mt-1 text-xs text-slate-500">اختر شيكًا أو عدة شيكات من نفس العملة.</p></div>
                                {!form.id && <Button disabled={saving || loading} onClick={() => setSearchOpen(true)} className="gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800"><Search className="h-4 w-4" />بحث وإضافة شيكات</Button>}
                            </div>
                            <div className="h-[320px] min-w-0 overflow-hidden sm:h-[360px]"><DataGridView dataSource={gridRows} scheme={chequeScheme} defaultRowHeight={44} containerStyle={{ height: "100%" }} style={{ height: "100%" }} /></div>
                        </section>
                    </div>
                    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-emerald-100 bg-white px-4 py-3 sm:px-6">
                        <div className="flex items-center gap-2 text-sm text-slate-500"><Wallet className="h-5 w-5 text-emerald-600" /><span>{form.cheques.length} شيك{currency ? ` · ${currency.currency_name}` : ""}</span></div>
                        <div className="flex items-baseline gap-3"><span className="text-sm text-slate-500">الإجمالي</span><strong className="text-2xl font-black tabular-nums text-emerald-800">{money(total)}</strong>{currency && <span className="text-sm font-semibold text-emerald-700">{currency.currency_code}</span>}</div>
                    </footer>
                </DialogContent>
            </Dialog>
            <ChequeSearch open={searchOpen} onOpenChange={setSearchOpen} currencyId={form.currency_id} excluded={selectedIds} onSelect={chooseCheques} />
            <PostVoucherDialog visible={postDialogOpen} isSaving={saving} onSelect={action => void save(action)} onCancel={() => setPostDialogOpen(false)} />
            <VoucherPrintLayout data={printData} />
            <ConfirmDialogYesNo useAppDialog busy={saving} title="حذف سند صرف شيكات" visible={deleteConfirm} message="هل أنت متأكد من حذف سند صرف الشيكات؟" onConfirm={() => void confirmDelete()} onCancel={() => setDeleteConfirm(false)} />
        </main>
    )
}
