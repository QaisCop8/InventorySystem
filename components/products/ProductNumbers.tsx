"use client";

import * as React from "react";
import { Hash, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ProductNumbersProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    numbers: string[];
    onUpdateNumbers: (newNumbers: string[]) => void;
    // 1 = الرقم الأصلي، 2 = رقم المصنع (يطابق عمود product_numbers.type في app/api/inventory/
    // products/route.ts) — يُستخدَم لفحص التكرار مع أصناف أخرى عبر check-number.
    numberType: 1 | 2;
    excludeProductId: number;
    currentProductName: string;
    onDuplicateError: (message: string) => void;
}

// نافذة أرقام الصنف (الرقم الأصلي/رقم المصنع): سطر إضافة سريع بالأعلى (Enter) + قائمة أرقام قابلة للتعديل والحذف.
// كل رقم يُفحص للتكرار داخل الصنف ومع الأصناف الأخرى (/api/inventory/products/check-number) قبل قبوله.
export default function ProductNumbers({
    open,
    onOpenChange,
    title,
    numbers,
    onUpdateNumbers,
    numberType,
    excludeProductId,
    currentProductName,
    onDuplicateError,
}: ProductNumbersProps) {
    const [rows, setRows] = React.useState<string[]>([]);
    const [draft, setDraft] = React.useState("");
    const [checking, setChecking] = React.useState(false);
    const [error, setError] = React.useState("");
    const draftRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => { setRows(numbers.filter((value) => value !== undefined)); }, [numbers]);
    React.useEffect(() => {
        if (!open) return;
        setDraft(""); setError("");
        requestAnimationFrame(() => draftRef.current?.focus());
        const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onOpenChange(false); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, onOpenChange]);

    const commit = (next: string[]) => { setRows(next); onUpdateNumbers(next); };

    // يتحقق من عدم تكرار الرقم مع سطر آخر لنفس الصنف أو مع صنف آخر — يعيد رسالة الخطأ أو "" إن كان صالحاً
    const duplicateMessage = async (value: string, ignoreIndex: number, list: string[]) => {
        const trimmed = value.trim();
        if (!trimmed) return "";
        if (list.some((row, index) => index !== ignoreIndex && row.trim().toLowerCase() === trimmed.toLowerCase())) {
            return `${title} مكرر مع صنف - ${currentProductName || "هذا الصنف"}`;
        }
        try {
            const response = await fetch(`/api/inventory/products/check-number?type=${numberType}&number=${encodeURIComponent(trimmed)}&exclude_id=${excludeProductId || 0}`);
            if (response.ok) {
                const data = await response.json();
                if (data?.duplicate) return `${title} مكرر مع صنف - ${data.product_name}`;
            }
        } catch (reason) {
            console.error("Failed to check product number duplicate", reason);
        }
        return "";
    };

    const add = async () => {
        const value = draft.trim();
        if (!value || checking) return;
        setChecking(true); setError("");
        const message = await duplicateMessage(value, -1, rows);
        setChecking(false);
        if (message) { setError(message); onDuplicateError(message); return; }
        commit([...rows, value]);
        setDraft("");
        requestAnimationFrame(() => draftRef.current?.focus());
    };

    const editRow = (index: number, value: string) => setRows((current) => current.map((row, i) => (i === index ? value : row)));
    const validateRow = async (index: number) => {
        const message = await duplicateMessage(rows[index] || "", index, rows);
        if (message) {
            setError(message); onDuplicateError(message);
            // يُفرَّغ الرقم المكرر بدل حفظ قيمة غير صالحة
            commit(rows.map((row, i) => (i === index ? "" : row)));
            return;
        }
        setError("");
        commit(rows);
    };
    const remove = (index: number) => commit(rows.filter((_, i) => i !== index));

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[3001] flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-[2px]" dir="rtl" onMouseDown={(event) => { if (event.target === event.currentTarget) onOpenChange(false); }}>
            <div role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[85dvh] w-[min(560px,100%)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-center justify-between gap-3 bg-gradient-to-l from-emerald-700 to-teal-600 px-5 py-3 text-white">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15"><Hash className="h-5 w-5" /></span>
                        <div>
                            <h2 className="text-base font-bold">{title}</h2>
                            <p className="text-xs text-emerald-50">{currentProductName || "صنف جديد"} · يمكن إضافة أكثر من رقم</p>
                        </div>
                    </div>
                    <button type="button" aria-label="إغلاق" onClick={() => onOpenChange(false)} className="grid h-9 w-9 place-items-center rounded-full bg-white/15 hover:bg-white/25"><X className="h-4 w-4" /></button>
                </div>

                <div className="space-y-2 border-b bg-slate-50 p-4">
                    <div className="flex gap-2">
                        <Input
                            ref={draftRef}
                            dir="ltr"
                            value={draft}
                            onChange={(event) => { setDraft(event.target.value); if (error) setError(""); }}
                            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void add(); } }}
                            placeholder={`أدخل ${title} ثم Enter`}
                            className="h-10 rounded-xl bg-white text-right"
                        />
                        <Button type="button" onClick={() => void add()} disabled={!draft.trim() || checking} className="h-10 shrink-0 rounded-xl bg-emerald-600 px-4 hover:bg-emerald-700">
                            {checking ? <Loader2 className="ml-1.5 h-4 w-4 animate-spin" /> : <Plus className="ml-1.5 h-4 w-4" />}إضافة
                        </Button>
                    </div>
                    {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">{error}</p>}
                </div>

                <div className="min-h-[160px] flex-1 overflow-y-auto p-4">
                    {rows.length === 0 ? (
                        <div className="flex h-full min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 text-sm text-slate-400">
                            <Hash className="h-8 w-8 text-slate-300" />لا توجد أرقام بعد — أضف الرقم من الحقل أعلاه
                        </div>
                    ) : (
                        <ul className="space-y-2">
                            {rows.map((value, index) => (
                                <li key={index} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5 pe-2 shadow-sm">
                                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-xs font-bold text-emerald-700">{index + 1}</span>
                                    <Input
                                        dir="ltr"
                                        value={value}
                                        onChange={(event) => editRow(index, event.target.value)}
                                        onBlur={() => void validateRow(index)}
                                        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); (event.target as HTMLInputElement).blur(); } }}
                                        className="h-9 flex-1 rounded-lg border-transparent bg-transparent text-right font-mono shadow-none focus-visible:border-emerald-300 focus-visible:bg-white"
                                    />
                                    <button type="button" aria-label={`حذف ${value}`} onClick={() => remove(index)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="flex items-center justify-between gap-3 border-t bg-slate-50 px-5 py-3">
                    <span className="text-xs text-slate-500">{rows.filter((row) => row.trim()).length} رقم · تُحفظ مع الصنف عند حفظه</span>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">إغلاق</Button>
                </div>
            </div>
        </div>
    );
}
