"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Dropdown as PrimeDropdown } from "primereact/dropdown";

const VOUCHER_TYPES = [
    { id: "1", name: "طلبية مبيعات" },
    { id: "2", name: "طلبية مشتريات" },
    { id: "12", name: "سند ادخال بضاعة" },
    { id: "13", name: "سند اخراج بضاعة" },
    { id: "14", name: "ارسالية داخلية" },
    { id: "15", name: "سند استعمال" },
];

const COLUMNS = [
    { id: "ser", label: "##" },
    { id: "barcode", label: "الباركود" },
    { id: "code", label: "رقم الصنف" },
    { id: "store", label: "المستودع" },
    { id: "batch", label: "الرقم التشغيلي" },
    { id: "price", label: "السعر" },
    { id: "unit", label: "الوحدة" },
    { id: "bonus", label: "البونص" },
    { id: "discount", label: "الخصم" },
    { id: "expiry_date", label: "تاريخ الانتهاء" },
];

// سندات الحركات (ادخال/اخراج بضاعة، ارسالية داخلية، سند استعمال) لا تملك بونص/خصم، وتملك
// تاريخ انتهاء بدلاً منها — بخلاف طلبيات المبيعات/المشتريات.
const STOCK_VOUCHER_TYPE_IDS = ["12", "13", "14", "15"];
const getColumnsForType = (voucherType: string) => {
    const isStockVoucher = STOCK_VOUCHER_TYPE_IDS.includes(voucherType);
    return COLUMNS.filter((col) =>
        isStockVoucher ? col.id !== "bonus" && col.id !== "discount" : col.id !== "expiry_date",
    );
};

export default function VoucherSettings() {
    const [voucherType, setVoucherType] = useState("1");
    const [screenColumns, setScreenColumns] = useState<Record<string, boolean>>({});
    const [printColumns, setPrintColumns] = useState<Record<string, boolean>>({});
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
                title: "تم الحفظ",
                description: "تم حفظ إعدادات الأعمدة بنجاح",
                variant: "default",
            });
        } catch (err) {
            console.error(err);
            toast({
                title: "خطأ",
                description: "فشل حفظ الإعدادات",
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
            const applicableColumns = getColumnsForType(voucherType);
            const screenRows =
                screenData?.columns?.[voucherType] ??
                applicableColumns.reduce((acc, col) => ({ ...acc, [col.id]: true }), {});

            const printRows =
                printData?.columns?.[voucherType] ??
                applicableColumns.reduce((acc, col) => ({ ...acc, [col.id]: true }), {});

            setScreenColumns(
                screenRows ??
                applicableColumns.reduce((acc, col) => {
                    acc[col.id] = true;
                    return acc;
                }, {} as Record<string, boolean>)
            );

            setPrintColumns(
                printRows ??
                applicableColumns.reduce((acc, col) => {
                    acc[col.id] = true;
                    return acc;
                }, {} as Record<string, boolean>)
            );


            localStorage.setItem('screenData', JSON.stringify(screenData))
            localStorage.setItem('printData', JSON.stringify(printData))
        } catch (err) {
            console.error(err);
            toast({
                title: "خطأ",
                description: "فشل تحميل الإعدادات",
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
            {getColumnsForType(voucherType).map((col) => (
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
        <div className="p-6 space-y-6" dir="rtl">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">إعدادات السندات وطباعتها</h1>
                <Button onClick={handleSave} disabled={loading}>
                    حفظ
                </Button>
            </div>

            <Card className="rounded-2xl shadow-sm w-full min-h-[70vh]">
                <CardContent className="p-6 space-y-6">
                    {/* Voucher Type Selector */}
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">نوع السند</span>
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
                            <TabsTrigger value="screen">الأعمدة التي تظهر في السند</TabsTrigger>
                            <TabsTrigger value="print">الأعمدة التي تظهر في الطباعة</TabsTrigger>
                        </TabsList>

                        <TabsContent value="screen" className="pt-4">{renderCheckboxes(screenColumns, "screen")}</TabsContent>
                        <TabsContent value="print" className="pt-4">{renderCheckboxes(printColumns, "print")}</TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}
