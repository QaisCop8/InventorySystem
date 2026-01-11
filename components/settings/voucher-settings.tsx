"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const VOUCHER_TYPES = [
    { id: "1", name: "طلبية مبيعات" },
    { id: "2", name: "طلبية مشتريات" },
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
];

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
            const screenRows =
                screenData?.columns?.[voucherType] ??
                COLUMNS.reduce((acc, col) => ({ ...acc, [col.id]: true }), {});

            const printRows =
                printData?.columns?.[voucherType] ??
                COLUMNS.reduce((acc, col) => ({ ...acc, [col.id]: true }), {});

            setScreenColumns(
                screenRows ??
                COLUMNS.reduce((acc, col) => {
                    acc[col.id] = true;
                    return acc;
                }, {} as Record<string, boolean>)
            );

            setPrintColumns(
                printRows ??
                COLUMNS.reduce((acc, col) => {
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
            {COLUMNS.map((col) => (
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
        <Card className="rounded-2xl shadow-sm w-full mx-auto mt-6">
            <CardContent className="p-4 space-y-4">
                {/* Voucher Type Selector */}
                <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">نوع السند</span>
                    <Select value={String(voucherType)} onValueChange={setVoucherType}>
                        <SelectTrigger className="w-48">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {VOUCHER_TYPES.map((v) => (
                                <SelectItem key={v.id} value={v.id}>
                                    {v.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex justify-end mt-4">
                    <Button onClick={handleSave} disabled={loading}>
                        حفظ
                    </Button>
                </div>
                {/* Tabs */}
                <Tabs defaultValue="screen" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="screen">الأعمدة التي تظهر في السند</TabsTrigger>
                        <TabsTrigger value="print">الأعمدة التي تظهر في الطباعة</TabsTrigger>
                    </TabsList>

                    <TabsContent value="screen">{renderCheckboxes(screenColumns, "screen")}</TabsContent>
                    <TabsContent value="print">{renderCheckboxes(printColumns, "print")}</TabsContent>
                </Tabs>


            </CardContent>
        </Card>
    );
}
