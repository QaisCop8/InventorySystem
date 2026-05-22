"use client";

import { useState, useRef, useCallback,useEffect } from "react";
import DataGridView from "../common/DataGridView";
import Button from "../common/Button";
import * as wjGrid from "@grapecity/wijmo.grid";

interface Store {
    id: number;
    warehouse_name: string;
    code: string;
}

interface StoresSearchPopupProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (store: Store) => void;
    stores: Store[];
}

const StoresSearchPopup: React.FC<StoresSearchPopupProps> = ({
    visible,
    onClose,
    onSelect,
    stores,
}) => {
    const [selectedStore, setSelectedStore] = useState<Store | null>(null);
    const selectedStoreRef = useRef<Store | null>(null);
    const gridRef = useRef<any>(null);
    const popupRef = useRef<HTMLDivElement | null>(null);

    const getGridInstance = useCallback((): wjGrid.FlexGrid | null => {
        return (gridRef.current?.flex ?? gridRef.current ?? null) as wjGrid.FlexGrid | null;
    }, []);

    const confirmSelection = useCallback(() => {
        const grid = getGridInstance();
        const rowIndex = grid?.selection?.row ?? -1;
        const currentRowStore = rowIndex >= 0 ? (grid?.rows?.[rowIndex]?.dataItem as Store | undefined) : undefined;
        const storeToSelect = selectedStoreRef.current || currentRowStore || stores?.[0] || null;

        if (!storeToSelect) return;
        onSelect(storeToSelect);
        onClose();
    }, [getGridInstance, stores, onSelect, onClose]);


    const handleRowDoubleClick = useCallback(
        (store: Store) => {
            onSelect(store);
            onClose();
        },
        [onSelect, onClose]
    );

    const handleSelectionChange = useCallback((grid: wjGrid.FlexGrid) => {
        if (!grid) return;
        const rowIndex = grid.selection?.row ?? -1;
        if (rowIndex < 0) return;
        const item = grid.rows[rowIndex]?.dataItem as Store | undefined;
        if (!item) return;
        setSelectedStore(item);
        selectedStoreRef.current = item;
    }, []);
    useEffect(() => {
        if (!visible) return;

        setSelectedStore(stores?.[0] ?? null);
        selectedStoreRef.current = stores?.[0] ?? null;

        setTimeout(() => {
            const grid = getGridInstance();
            if (!grid) return;

            grid.focus();
            if (grid.rows.length > 0) {
                grid.select(new wjGrid.CellRange(0, 0));
            }
        }, 50);

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
                return;
            }

            if (e.key === "Enter") {
                const active = document.activeElement as HTMLElement | null;
                if (active && popupRef.current?.contains(active)) {
                    e.preventDefault();
                    e.stopPropagation();
                    confirmSelection();
                }
            }

        };

        window.addEventListener("keydown", handleKeyDown, true);

        return () => {
            window.removeEventListener("keydown", handleKeyDown, true);
        };
    }, [visible, onClose, getGridInstance]);
    if (!visible) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div
                ref={popupRef}
                className="bg-white rounded-lg shadow-2xl border p-6 w-full max-w-4xl"
                dir="rtl"
                style={{ height: "650px" }}
            >
                <h3 className="text-lg font-semibold mb-4 text-right">
                    اختيار المستودع
                </h3>

                <DataGridView
                    ref={gridRef}
                    dataSource={stores}
                    scheme={{
                        isReport: true,
                        columns: [
                            { header: "رقم المستودع", name: "id", width: 120, isReadOnly: true },
                            { header: "اسم المستودع", name: "name", width: "*", isReadOnly: true },
                        ],
                    }}
                    selectionChanged={handleSelectionChange}
                    onRowDoubleClick={handleRowDoubleClick}
                />

                <div className="flex justify-center gap-3 mt-4">
                    <Button
                        className="erp-btn-primary"
                        disabled={!selectedStore}
                        onClick={confirmSelection}
                    >
                        موافق
                    </Button>
                    <Button className="erp-btn-primary" variant="outline" onClick={onClose}>
                        إغلاق
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default StoresSearchPopup;
