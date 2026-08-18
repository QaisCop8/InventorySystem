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
    const [availableStores, setAvailableStores] = useState<Store[]>(stores || []);
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
        const storeToSelect = selectedStoreRef.current || currentRowStore || availableStores?.[0] || null;

        if (!storeToSelect) return;
        onSelect(storeToSelect);
        onClose();
    }, [getGridInstance, availableStores, onSelect, onClose]);

    useEffect(() => { setAvailableStores(stores || []); }, [stores]);

    useEffect(() => {
        if (!visible) return;
        const refreshAfterReturn = async () => {
            try {
                const response = await fetch("/api/warehouses", { cache: "no-store" });
                if (!response.ok) return;
                const data = await response.json();
                const nextStores = Array.isArray(data) ? data : (data?.warehouses || []);
                if (nextStores.length) setAvailableStores(nextStores);
            } catch { /* keep the caller-provided list */ }
        };
        window.addEventListener("focus", refreshAfterReturn);
        return () => window.removeEventListener("focus", refreshAfterReturn);
    }, [visible]);


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

        setSelectedStore(availableStores?.[0] ?? null);
        selectedStoreRef.current = availableStores?.[0] ?? null;

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
    }, [visible, onClose, getGridInstance, availableStores]);
    if (!visible) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div
                ref={popupRef}
                className="bg-white rounded-lg shadow-2xl border p-6 w-full max-w-4xl"
                dir="rtl"
                style={{ height: "650px" }}
            >
                <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-lg font-semibold text-right">اختيار المستودع</h3><Button className="erp-btn-primary search-button" onClick={() => window.open("/admin/definitions?section=warehouses&new=1", "_blank", "noopener,noreferrer")}>إضافة مستودع</Button></div>

                <DataGridView
                    ref={gridRef}
                    dataSource={availableStores}
                    scheme={{
                        isReport: true,
                        columns: [
                            { header: "رقم المستودع", name: "id", width: 120, isReadOnly: true },
                            { header: "اسم المستودع", name: "warehouse_name", width: "*", isReadOnly: true },
                        ],
                    }}
                    selectionChanged={handleSelectionChange}
                    onRowDoubleClick={handleRowDoubleClick}
                />

                <div className="flex justify-center gap-3 mt-4">
                    <Button
                        className="erp-btn-primary search-button"
                        disabled={!selectedStore}
                        onClick={confirmSelection}
                    >
                        موافق
                    </Button>
                    <Button className="erp-btn-primary search-button" variant="outline" onClick={onClose}>
                        إغلاق
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default StoresSearchPopup;
