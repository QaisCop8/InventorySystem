"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import DataGrid from "@/components/common/DataGrid";
import * as wjGrid from "@grapecity/wijmo.grid";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Barcode, Check, Plus, X } from "lucide-react";
interface ProductBarcodesProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    unitName: string;
    barcodes: string[];
    onUpdateBarcodes: (newBarcodes: string[]) => void;
}

export default function ProductBarcodes({
    open,
    onOpenChange,
    unitName,
    barcodes,
    onUpdateBarcodes
}: ProductBarcodesProps) {
    const [dialogData, setDialogData] = React.useState<{ ser: number; barcode: string }[]>([]);

    React.useEffect(() => {
        setDialogData(barcodes.map((b, i) => ({ ser: i + 1, barcode: b })));
    }, [barcodes]);

    const handleDelete = (index: number) => {
        const newData = dialogData.filter((_, i) => i !== index)
            .map((d, i) => ({ ...d, ser: i + 1 }));
        setDialogData(newData);
        onUpdateBarcodes(newData.map(d => d.barcode));
    };
    const flexRef = React.useRef<wjGrid.FlexGrid>(null);
    const handleAdd = () => {
        const newData = [...dialogData, { ser: dialogData.length + 1, barcode: "" }];
        setDialogData(newData);
        onUpdateBarcodes(newData.map(d => d.barcode));

        // Focus the new row after it renders
        setTimeout(() => {
            const flex = flexRef.current;
            if (flex) {
                const lastRow = newData.length - 1;
                // getColumn by binding
                const barcodeCol = flex.columns.getColumn("barcode");
                if (barcodeCol) {
                    flex.select(new wjGrid.CellRange(lastRow, barcodeCol.index));
                    flex.startEditing(true);
                }
            }
        }, 50);
    };
    const cellEditEnded = (s: any, e: any) => {
        const editedItem = s.rows[e.row].dataItem;

        setDialogData(prev => {
            const newData = [...prev];
            newData[e.row] = { ...editedItem };

            // ✅ Call onUpdateBarcodes *inside* the same callback
            // so it uses the updated array, not the stale one
            onUpdateBarcodes(newData.map(d => d.barcode));

            return newData;
        });
    };

    const getScheme = () => ({
        name: 'barcodeScheme_Table',
        filter: false,
        showFooter: false,
        sortable: false,
        allowGrouping: false,
        responsiveColumnIndex: 1,
        columns: [
            { header: "##", name: "ser", width: 50 },
            { header: "الباركود", name: "barcode", width: "*" },
            {
                header: " ",
                name: "delete",
                width: 80,
                buttonBody: "button",
                iconType: "trash",
                onClick: (item: { ser: number }) => handleDelete(item.ser - 1)
            }
        ]
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent dir="rtl" className="flex max-h-[86dvh] w-[min(94vw,680px)] max-w-none flex-col gap-0 overflow-hidden rounded-3xl border-0 bg-white p-0 shadow-2xl">
                <DialogHeader className="shrink-0 bg-gradient-to-l from-emerald-700 via-teal-700 to-sky-700 px-6 py-5 text-right text-white">
                    <div className="flex items-center gap-3"><span className="flex size-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25"><Barcode className="size-5" /></span><div><DialogTitle className="text-lg font-bold text-white">باركود الوحدة</DialogTitle><DialogDescription className="mt-1 text-emerald-50">{unitName || "الوحدة"} · أضف باركوداً أو أكثر لهذه الوحدة</DialogDescription></div></div>
                </DialogHeader>
                <div className="flex min-h-0 flex-1 flex-col gap-4 bg-slate-50 p-4 sm:p-6">
                    <div className="flex items-center justify-between rounded-2xl border bg-white p-3 shadow-sm"><div><b className="text-sm">الباركودات المعرفة</b><p className="text-xs text-slate-500">اضغط Enter للانتقال إلى الخلية التالية</p></div><span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">{dialogData.length}</span></div>
                    <Button className="w-fit rounded-xl bg-emerald-600 shadow-sm hover:bg-emerald-700" type="button" onClick={handleAdd}><Plus className="ml-2 size-4" />إضافة باركود</Button>
                    <div className="min-h-64 flex-1 overflow-hidden rounded-2xl border bg-white p-2 shadow-sm"><DataGrid ref={flexRef} dataSource={dialogData} scheme={getScheme()} keyActionEnter="MoveAcross" cellEditEnded={(s: any, e: any) => cellEditEnded(s, e)} /></div>
                </div>
                <DialogFooter className="shrink-0 flex-row justify-start gap-2 border-t bg-white px-5 py-4"><Button type="button" className="rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={() => onOpenChange(false)}><Check className="ml-2 size-4" />موافق</Button><Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}><X className="ml-2 size-4" />إغلاق</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
