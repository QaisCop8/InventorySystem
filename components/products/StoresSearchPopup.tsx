"use client";

import { useState, useRef, useCallback,useEffect } from "react";
import DataGridView from "../common/DataGridView";
import Button from "../common/Button";
import * as wjGrid from "@grapecity/wijmo.grid";
import { Check, Plus, Warehouse as WarehouseIcon, X } from "lucide-react";

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
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-2 backdrop-blur-sm sm:p-5">
            <div
                ref={popupRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="warehouse-picker-title"
                className="flex h-[min(90dvh,650px)] max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
                dir="rtl"
            >
                <header className="flex shrink-0 items-center justify-between gap-3 bg-gradient-to-l from-emerald-800 via-emerald-700 to-teal-700 px-4 py-3 text-white sm:px-6 sm:py-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 sm:h-11 sm:w-11">
                            <WarehouseIcon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                            <h3 id="warehouse-picker-title" className="truncate text-base font-bold sm:text-lg">اختيار المستودع</h3>
                            <p className="mt-0.5 text-xs text-emerald-100 sm:text-sm">حدد المستودع ثم اضغط موافق أو انقر مرتين</p>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <Button
                            className="!m-0 !min-h-10 !rounded-xl !border !border-white/25 !bg-white/10 !px-3 !font-semibold !text-white hover:!bg-white/20 sm:!px-4"
                            onClick={() => window.open("/admin/definitions?section=warehouses&new=1", "_blank", "noopener,noreferrer")}
                        >
                            <Plus className="ml-1 h-4 w-4" />
                            <span className="hidden sm:inline">إضافة مستودع</span>
                            <span className="sm:hidden">إضافة</span>
                        </Button>
                        <button type="button" aria-label="إغلاق" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white/80 transition hover:bg-white/15 hover:text-white">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </header>

                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/70 px-4 py-2.5 text-xs text-slate-600 sm:px-6 sm:text-sm">
                    <span>المستودعات المتاحة</span>
                    <span className="shrink-0 rounded-full bg-white px-3 py-1 font-semibold text-emerald-800 ring-1 ring-emerald-100">{availableStores.length} مستودع</span>
                </div>

                <main className="min-h-0 flex-1 p-3 sm:p-5">
                    <div className="h-full min-h-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <div className="h-full overflow-y-auto p-2 md:hidden">
                            {availableStores.length === 0 ? (
                                <div className="flex h-full min-h-40 items-center justify-center rounded-lg border border-dashed border-slate-300 px-5 text-center text-sm text-slate-500">
                                    لا توجد مستودعات متاحة
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {availableStores.map((store) => {
                                        const isSelected = selectedStore?.id === store.id;
                                        return (
                                            <button
                                                key={store.id}
                                                type="button"
                                                aria-pressed={isSelected}
                                                onClick={() => {
                                                    setSelectedStore(store);
                                                    selectedStoreRef.current = store;
                                                }}
                                                className={`w-full rounded-xl border p-3 text-right transition ${isSelected ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-slate-50"}`}
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <span className="truncate font-bold text-slate-900">{store.warehouse_name}</span>
                                                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${isSelected ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-transparent"}`}>
                                                        <Check className="h-4 w-4" />
                                                    </span>
                                                </div>
                                                <div className="mt-2 flex items-center justify-between border-t border-slate-200/80 pt-2 text-xs">
                                                    <span className="text-slate-500">رقم المستودع</span>
                                                    <span className="font-semibold tabular-nums text-slate-700" dir="ltr">{store.id}</span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="hidden h-full md:block">
                            <DataGridView
                                ref={gridRef}
                                dataSource={availableStores}
                                containerStyle={{ height: "100%", minHeight: 0, width: "100%" }}
                                style={{ height: "100%", minHeight: 0, width: "100%" }}
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
                        </div>
                    </div>
                </main>

                <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div className="min-w-0 text-xs text-slate-500 sm:text-sm">
                        {selectedStore ? (
                            <span className="block truncate"><span className="font-semibold text-slate-700">المستودع المحدد:</span> {selectedStore.warehouse_name}</span>
                        ) : "لم يتم تحديد مستودع"}
                    </div>
                    <div className="flex w-full gap-2 sm:w-auto">
                        <Button
                            className="!m-0 !min-h-10 !flex-1 !rounded-xl !border-0 !bg-emerald-700 !px-6 !font-bold !text-white hover:!bg-emerald-800 disabled:!opacity-50 sm:!flex-none"
                            disabled={!selectedStore}
                            onClick={confirmSelection}
                        >
                            <Check className="ml-2 h-4 w-4" /> موافق
                        </Button>
                        <Button className="!m-0 !min-h-10 !flex-1 !rounded-xl !border-slate-300 !bg-white !px-6 !font-semibold !text-slate-700 hover:!bg-slate-100 sm:!flex-none" variant="outline" onClick={onClose}>
                            إغلاق
                        </Button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default StoresSearchPopup;
