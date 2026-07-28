"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import DataGrid from "@/components/common/DataGrid";
import * as wjGrid from "@grapecity/wijmo.grid";

interface ProductNumbersProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    numbers: string[];
    onUpdateNumbers: (newNumbers: string[]) => void;
}

// نافذة إضافة متعددة لأرقام الصنف (الرقم الأصلي/رقم المصنع) — بنفس أسلوب ProductBarcodes تماماً،
// إذ يحتاج كل صنف لأكثر من رقم أصلي/تصنيعي أحياناً (موردون متعددون لنفس القطعة مثلاً).
export default function ProductNumbers({
    open,
    onOpenChange,
    title,
    numbers,
    onUpdateNumbers,
}: ProductNumbersProps) {
    const [dialogData, setDialogData] = React.useState<{ ser: number; number: string }[]>([]);

    React.useEffect(() => {
        setDialogData(numbers.map((n, i) => ({ ser: i + 1, number: n })));
    }, [numbers]);

    const handleDelete = (index: number) => {
        const newData = dialogData.filter((_, i) => i !== index)
            .map((d, i) => ({ ...d, ser: i + 1 }));
        setDialogData(newData);
        onUpdateNumbers(newData.map(d => d.number));
    };

    const flexRef = React.useRef<wjGrid.FlexGrid>(null);
    const handleAdd = () => {
        const newData = [...dialogData, { ser: dialogData.length + 1, number: "" }];
        setDialogData(newData);
        onUpdateNumbers(newData.map(d => d.number));

        setTimeout(() => {
            const flex = flexRef.current;
            if (flex) {
                const lastRow = newData.length - 1;
                const numberCol = flex.columns.getColumn("number");
                if (numberCol) {
                    flex.select(new wjGrid.CellRange(lastRow, numberCol.index));
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
            onUpdateNumbers(newData.map(d => d.number));
            return newData;
        });
    };

    const getScheme = () => ({
        name: 'productNumbersScheme_Table',
        filter: false,
        showFooter: false,
        sortable: false,
        allowGrouping: false,
        responsiveColumnIndex: 1,
        columns: [
            { header: "##", name: "ser", width: 50 },
            { header: title, name: "number", width: "*" },
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white w-[600px] max-w-full rounded shadow-lg p-4 space-y-4 max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-bold">{title}</h2>
                    <Button type="button" onClick={() => onOpenChange(false)}>اغلاق</Button>
                </div>

                <Button className="mb-2" type="button" onClick={handleAdd}>+ اضافة {title}</Button>

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
