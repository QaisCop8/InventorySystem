"use client";

import { tr, appDir } from "@/lib/i18n"
import { VoucherListHero } from "@/components/common/voucher-list-shell"
import { Printer } from "lucide-react"
import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import PrimeDropdown from "@/components/common/FocusDropdown";

// معرّفات voucher_types_tbl الحالية (بعد إعادة الترقيم 2026-07-30) — نفس الثوابت التي تقرأ بها شاشات السندات
// إعداداتها (STOCK_*_VCH_TYPE 8-11 في stock-vouchers/_lib.ts، و12-19 في sales-vouchers/_lib.ts). كانت القائمة
// بالأرقام القديمة (12-23) فيُحفظ إعداد "فاتورة مبيعات" على 16 = مرتجع مبيعات حالياً، وهكذا لباقي السندات.
const VOUCHER_TYPES = [
    { id: "1", name: "طلبية مبيعات" },
    { id: "2", name: "طلبية مشتريات" },
    { id: "8", name: "سند ادخال بضاعة" },
    { id: "9", name: "سند اخراج بضاعة" },
    { id: "10", name: "ارسالية داخلية" },
    { id: "11", name: "سند استعمال" },
    { id: "12", name: "فاتورة مبيعات" },
    { id: "13", name: "إرسالية مبيعات" },
    { id: "14", name: "إرسالية برسم البيع" },
    { id: "15", name: "مرتجع إرسالية برسم البيع" },
    { id: "16", name: "مرتجع مبيعات" },
    { id: "17", name: "فاتورة مشتريات" },
    { id: "18", name: "إرسالية مشتريات" },
    { id: "19", name: "مرتجع مشتريات" },
];

// عمود "الباركود" في السند: بلا (مخفي) أو نوع الرقم الذي يُعرض فيه ويُبحث به عن الصنف
// (الباركود من باركودات الوحدات، رقم المصنع/الرقم الأصلي من أرقام الصنف product_numbers نوع 2/1)
const BARCODE_MODES = [
    { id: "none", name: "بلا" },
    { id: "barcode", name: "الباركود" },
    { id: "factory", name: "رقم المصنع" },
    { id: "original", name: "الرقم الاصلي" },
];

const COLUMNS = [
    { id: "ser", label: "##" },
    { id: "barcode", label: tr("الباركود") },
    { id: "code", label: tr("رقم الصنف") },
    { id: "store", label: tr("المستودع") },
    { id: "batch", label: tr("الرقم التشغيلي") },
    { id: "price", label: tr("السعر") },
    { id: "price_excl_tax", label: tr("السعر شامل") },
    { id: "unit", label: tr("الوحدة") },
    { id: "bonus", label: tr("البونص") },
    { id: "discount", label: tr("الخصم") },
    { id: "tax", label: tr("الضريبة") },
    { id: "expiry_date", label: tr("تاريخ الانتهاء") },
    { id: "serial", label: tr("الرقم التسلسلي") },
    { id: "length", label: tr("الطول") },
    { id: "width", label: tr("العرض") },
    { id: "height", label: tr("الارتفاع") },
    { id: "count", label: tr("العدد") },
];

// سندات الحركات (ادخال/اخراج بضاعة، ارسالية داخلية، سند استعمال) لا تملك بونص/خصم/ضريبة/تسلسلي،
// وتملك تاريخ انتهاء وأعمدة الطول/العرض/الارتفاع/العدد بدلاً منها.
const STOCK_VOUCHER_TYPE_IDS = ["8", "9", "10", "11"];
// سندات المبيعات/المشتريات الثمانية (فاتورة/إرسالية مبيعات، برسم البيع ومرتجعاتها، فاتورة/إرسالية
// مشتريات ومرتجعها) تملك بونص/تتبع دفعة-صلاحية/تسلسلي، وأعمدة الأبعاد أيضاً (كسندات الحركة، نفس
// شبكة unified-stock-voucher.tsx/unified-sales-delivery.tsx)، والخصم بمستوى السطر أيضاً (نسبة
// مئوية لكل صنف) — لكن لا الضريبة، إذ تبقى بمستوى السند كاملاً فقط (بطاقة "الخصومات والضرائب").
const SALES_VOUCHER_TYPE_IDS = ["12", "13", "14", "15", "16", "17", "18", "19"];
// الطول/العرض/الارتفاع/العدد: أُخرِجت من "الأعمدة التي تظهر في السند" — لم تعد أعمدة قابلة للتحرير
// بالشبكة أصلاً (أُلغيت تماماً من unified-stock-voucher.tsx/unified-sales-delivery.tsx)، إذ صار
// إدخالها حصراً عبر نافذة "بيانات القياس" المنبثقة عند الكمية لصنف نوع قياسه غير عادي. تبقى فقط
// ضمن "الأعمدة التي تظهر في الطباعة" (تصريحاً بإظهارها بالتقرير المطبوع دون إمكانية تحريرها هناك).
const DIMENSION_COLUMN_IDS = ["length", "width", "height", "count"];
const getColumnsForType = (voucherType: string, target: "screen" | "print" = "screen") => {
    const isStockVoucher = STOCK_VOUCHER_TYPE_IDS.includes(voucherType);
    const isSalesVoucher = SALES_VOUCHER_TYPE_IDS.includes(voucherType);
    const base = isSalesVoucher
        ? COLUMNS.filter((col) => col.id !== "tax")
        : // السعر شامل (الضريبة) يُدعم الآن أيضاً في شاشات طلبية المبيعات/المشتريات.
          // نُبقيه محظوراً فقط في سندات الحركة التي لا تملك ضريبة على مستوى السطر.
          COLUMNS.filter((col) =>
            isStockVoucher
                ? col.id !== "bonus" && col.id !== "discount" && col.id !== "tax" && col.id !== "serial" && col.id !== "price_excl_tax"
                : col.id !== "expiry_date" &&
                  col.id !== "serial" &&
                  col.id !== "length" &&
                  col.id !== "width" &&
                  col.id !== "height" &&
                  col.id !== "count",
          );
    if (target === "screen") {
        return base.filter((col) => !DIMENSION_COLUMN_IDS.includes(col.id));
    }
    return base;
};

export default function VoucherSettings() {
    const [voucherType, setVoucherType] = useState("1");
    const [screenColumns, setScreenColumns] = useState<Record<string, boolean>>({});
    const [printColumns, setPrintColumns] = useState<Record<string, boolean>>({});
    const [screenOptions, setScreenOptions] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();
    const buildColumnsFromRows = (rows: any[]) => {
        if (!rows || rows.length === 0) return null;

        const cols: Record<string, boolean> = {};
        rows.forEach(r => {
            cols[r.column_key] = r.is_visible;
        });
        return cols;
    };

    const handleSave = async () => {
        try {
            setLoading(true);
            // Save screen columns
            await fetch("/api/voucher-settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    voucher_type: voucherType,
                    target: "screen",
                    columns: screenColumns,
                    options: screenOptions,
                }),
            });
            // Save print columns
            await fetch("/api/voucher-settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    voucher_type: voucherType,
                    target: "print",
                    columns: printColumns,
                }),
            });

            toast({
                title: tr("تم الحفظ"),
                description: tr("تم حفظ إعدادات الأعمدة بنجاح"),
                variant: "default",
            });
        } catch (err) {
            console.error(err);
            toast({
                title: tr("خطأ"),
                description: tr("فشل حفظ الإعدادات"),
                variant: "destructive",
            });
        } finally {
            setLoading(false);
            fetchSettings();
        }
    };
    const fetchSettings = async () => {
        try {
            setLoading(true);
            const screenRes = await fetch(
                `/api/voucher-settings?target=screen`
            );
            const printRes = await fetch(
                `/api/voucher-settings?&target=print`
            );

            const screenData = await screenRes.json();
            const printData = await printRes.json();
            const applicableScreenColumns = getColumnsForType(voucherType, "screen");
            const applicablePrintColumns = getColumnsForType(voucherType, "print");
            const screenRows =
                screenData?.columns?.[voucherType] ??
                applicableScreenColumns.reduce((acc, col) => ({ ...acc, [col.id]: true }), {});

            const printRows =
                printData?.columns?.[voucherType] ??
                applicablePrintColumns.reduce((acc, col) => ({ ...acc, [col.id]: true }), {});

            setScreenOptions(screenData?.options?.[voucherType] ?? {});

            setScreenColumns(
                screenRows ??
                applicableScreenColumns.reduce((acc, col) => {
                    acc[col.id] = true;
                    return acc;
                }, {} as Record<string, boolean>)
            );

            setPrintColumns(
                printRows ??
                applicablePrintColumns.reduce((acc, col) => {
                    acc[col.id] = true;
                    return acc;
                }, {} as Record<string, boolean>)
            );


            localStorage.setItem('screenData', JSON.stringify(screenData))
            localStorage.setItem('printData', JSON.stringify(printData))
        } catch (err) {
            console.error(err);
            toast({
                title: tr("خطأ"),
                description: tr("فشل تحميل الإعدادات"),
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    // Fetch settings from API
    useEffect(() => {

        fetchSettings();
    }, [voucherType]);

    const toggleColumn = (columnId: string, target: "screen" | "print") => {
        const setter = target === "screen" ? setScreenColumns : setPrintColumns;
        setter((prev) => ({
            ...prev,
            [columnId]: !prev[columnId],
        }));
    };

    const renderCheckboxes = (state: Record<string, boolean>, target: "screen" | "print") => (
        <div className="grid grid-cols-3 gap-3 mt-3">
            {getColumnsForType(voucherType, target).map((col) => target === "screen" && col.id === "barcode" ? (
                <div key={col.id} className="flex items-center gap-3">
                    <span className="shrink-0">{tr("عمود الرقم")}</span>
                    <div className="w-44 invoice-currency-dropdown-wrap">
                        <PrimeDropdown
                            value={state.barcode === false ? "none" : (screenOptions.barcode || "barcode")}
                            options={BARCODE_MODES}
                            optionLabel="name"
                            optionValue="id"
                            className="invoice-currency-dropdown w-full"
                            panelClassName="invoice-currency-dropdown-panel"
                            appendTo="self"
                            panelStyle={{ zIndex: 10000 }}
                            onChange={(e: any) => {
                                const mode = String(e.value || "barcode");
                                setScreenColumns((prev) => ({ ...prev, barcode: mode !== "none" }));
                                setScreenOptions((prev) => ({ ...prev, barcode: mode === "none" ? (prev.barcode || "barcode") : mode }));
                            }}
                        />
                    </div>
                </div>
            ) : (
                <label key={col.id} className="flex items-center gap-4 cursor-pointer">
                    <Checkbox
                        checked={!!state[col.id]}
                        onCheckedChange={() => toggleColumn(col.id, target)}
                    />
                    <span>{col.label}</span>
                </label>
            ))}
        </div>
    );



    return (
        <div className="p-6 space-y-6" dir={appDir()}>
<VoucherListHero title={tr("إعدادات السندات وطباعتها")} icon={Printer} category={tr("الإعدادات")} actions={<><Button onClick={handleSave} disabled={loading}>
                    {tr("حفظ")}
                </Button></>} />

            <Card className="rounded-2xl shadow-sm w-full min-h-[70vh]">
                <CardContent className="p-6 space-y-6">
                    {/* Voucher Type Selector */}
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">{tr("نوع السند")}</span>
                        <div className="w-56 invoice-currency-dropdown-wrap">
                            <PrimeDropdown
                                value={voucherType}
                                options={VOUCHER_TYPES}
                                optionLabel="name"
                                optionValue="id"
                                filter
                                className="invoice-currency-dropdown w-full"
                                panelClassName="invoice-currency-dropdown-panel"
                                appendTo="self"
                                panelStyle={{ zIndex: 10000 }}
                                onChange={(e: any) => setVoucherType(e.value)}
                            />
                        </div>
                    </div>

                    {/* Tabs */}
                    <Tabs defaultValue="screen" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="screen">{tr("الأعمدة التي تظهر في السند")}</TabsTrigger>
                            <TabsTrigger value="print">{tr("الأعمدة التي تظهر في الطباعة")}</TabsTrigger>
                        </TabsList>

                        <TabsContent value="screen" className="pt-4">{renderCheckboxes(screenColumns, "screen")}</TabsContent>
                        <TabsContent value="print" className="pt-4">{renderCheckboxes(printColumns, "print")}</TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}
