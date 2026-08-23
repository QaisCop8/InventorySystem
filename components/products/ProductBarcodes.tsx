"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import DataGrid from "@/components/common/DataGrid";
import * as wjGrid from "@grapecity/wijmo.grid";
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
        console.log("flexRef.current ", flexRef.current)
        setTimeout(() => {
            const flex = flexRef.current;
            console.log("flex ", flex)
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

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
            <div className="w-[600px] max-w-full space-y-5 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl max-h-[80vh]">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">باركود الوحدة</p>
                        <h2 className="mt-1 text-xl font-bold text-slate-900">{unitName || "الوحدة"}</h2>
                    </div>
                    <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>اغلاق</Button>
                </div>

                <Button className="mb-2 bg-emerald-600 shadow-sm hover:bg-emerald-700" type="button" onClick={handleAdd}>+ اضافة باركود</Button>

                <DataGrid
                    ref={flexRef}
                    dataSource={dialogData}
                    scheme={getScheme()}
                    cellEditEnded={(s: any, e: any) => cellEditEnded(s, e)}
                />
            </div>
        </div>
    );
}
