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
    // 1 = الرقم الأصلي، 2 = رقم المصنع (يطابق عمود product_numbers.type في app/api/inventory/
    // products/route.ts) — يُستخدَم لفحص التكرار مع أصناف أخرى عبر check-number.
    numberType: 1 | 2;
    excludeProductId: number;
    currentProductName: string;
    onDuplicateError: (message: string) => void;
}

// نافذة إضافة متعددة لأرقام الصنف (الرقم الأصلي/رقم المصنع) — بنفس أسلوب ProductBarcodes تماماً،
// إذ يحتاج كل صنف لأكثر من رقم أصلي/تصنيعي أحياناً (موردون متعددون لنفس القطعة مثلاً).
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
    const [dialogData, setDialogData] = React.useState<{ ser: number; number: string }[]>([]);

    React.useEffect(() => {
        setDialogData(numbers.map((n, i) => ({ ser: i + 1, number: n })));
    }, [numbers]);

    // يتحقق من عدم تكرار الرقم مع سطر آخر لنفس الصنف (rows أخرى بهذه النافذة) أو مع صنف آخر
    // (عبر /api/inventory/products/check-number) — يُستدعى بعد كل تعديل خانة، ويُفرغ الخانة
    // المكرَّرة فوراً إن وُجد تكرار بدل تركها كما هي.
    const validateNumber = async (rowIndex: number, value: string, rows: { ser: number; number: string }[]) => {
        const trimmed = value.trim()
        if (!trimmed) return true

        const duplicateInSameProduct = rows.some(
            (row, i) => i !== rowIndex && row.number.trim().toLowerCase() === trimmed.toLowerCase(),
        )
        if (duplicateInSameProduct) {
            onDuplicateError(`${title} مكرر مع صنف - ${currentProductName || "هذا الصنف"}`)
            return false
        }

        try {
            const response = await fetch(
                `/api/inventory/products/check-number?type=${numberType}&number=${encodeURIComponent(trimmed)}&exclude_id=${excludeProductId || 0}`,
            )
            if (response.ok) {
                const data = await response.json()
                if (data?.duplicate) {
                    onDuplicateError(`${title} مكرر مع صنف - ${data.product_name}`)
                    return false
                }
            }
        } catch (error) {
            console.error("Failed to check product number duplicate", error)
        }
        return true
    }

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
        const rowIndex = e.row;

        setDialogData(prev => {
            const newData = [...prev];
            newData[rowIndex] = { ...editedItem };
            onUpdateNumbers(newData.map(d => d.number));

            void validateNumber(rowIndex, editedItem.number, newData).then((isValid) => {
                if (isValid) return
                // يُفرَّغ السطر المكرَّر بدل ترك القيمة غير الصالحة معروضة أو محفوظة لاحقاً.
                setDialogData((current) => {
                    if (!current[rowIndex]) return current
                    const reverted = [...current]
                    reverted[rowIndex] = { ...reverted[rowIndex], number: "" }
                    onUpdateNumbers(reverted.map(d => d.number))
                    return reverted
                })
            })

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
