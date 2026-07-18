"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DataGrid from "../common/DataGrid";
import * as wjGrid from "@grapecity/wijmo.grid";
import DataGridView from "../common/DataGridView";

interface Customer {
    id: number;
    customer_code: string;
    name: string;
    mobile1: string;
    general_notes: string;
    pricecategory: number;
    vch_book: string
}

interface CustomerSearchPopupProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (customer: Customer) => void;
    type: number;
    vch_type: number
}

const CustomerSearchPopup: React.FC<CustomerSearchPopupProps> = ({ visible, onClose, onSelect, type, vch_type }) => {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const gridRef = useRef<wjGrid.FlexGrid | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const ws = useRef<WebSocket | null>(null);
    const entityType = Number(type ?? 1);
    const isSalesmanType = entityType === 3;
    const isSupplierType = entityType === 2;
    const isSubscriberType = entityType === 4;
    const isCustomerType = entityType === 1 || entityType === -1;
    const searchTitle = isSalesmanType ? "بحث المندوبين" : isSupplierType ? "بحث الموردين" : isSubscriberType ? "بحث المشتركين" : "بحث العملاء";
    const searchPlaceholder = isSalesmanType ? "ابحث عن مندوب..." : isSupplierType ? "ابحث عن مورد..." : isSubscriberType ? "ابحث عن مشترك..." : "ابحث عن عميل...";
    const codeLabel = isSalesmanType ? "رقم المندوب" : isSupplierType ? "رقم المورد" : isSubscriberType ? "رقم المشترك" : "رقم العميل";
    const nameLabel = isSalesmanType ? "اسم المندوب" : isSupplierType ? "اسم المورد" : isSubscriberType ? "اسم المشترك" : "اسم العميل";
    // Load customers
    useEffect(() => {
        if (!visible) return;
        let cancelled = false;

        const fetchCustomers = async () => {
            let cancelled = false;

            try {
                const query = type === -1 ? "" : `?type=${encodeURIComponent(type)}`;
                const response = await fetch(`/api/customers${query}`);
                const data = await response.json();

                if (!cancelled) {
                    // Ensure we have an array
                    const allRecords = Array.isArray(data) ? data : data.customers || [];

                    // Filter by type: 1 = customer, 2 = supplier, 3 = salesman
                    const filtered = type === -1
                        ? allRecords
                        : allRecords.filter((c: any) => Number(c.type) === Number(type));

                    // Order by customer_code
                    filtered.sort((a: any, b: any) =>
                        a.customer_code.localeCompare(b.customer_code)
                    );
                    // Map to match grid column names
                    const voucherTypeId = Number(vch_type ?? 1)
                    const mapped = filtered.map((c: any, index: number) => {
                        const matchingVoucher = (c.voucherType || []).find(
                            (v: any) => Number(v.type_id) === voucherTypeId
                        );

                        return {
                            ser: index + 1,
                            id: c.id,
                            customer_code: c.customer_code,
                            name: c.name,
                            mobile1: c.mobile1,
                            general_notes: c.general_notes || "",
                            pricecategory: c.pricecategory || 1,
                            vch_book: matchingVoucher ? matchingVoucher.book_name.trim() : "0", // only matching type
                        };
                    });



                    setCustomers(mapped);
                }
            } catch (err) {
                console.error("Failed to fetch customers:", err);
                if (!cancelled) setCustomers([]);
            }
        };

        setSearchTerm("")
        fetchCustomers();
        return () => {
            cancelled = true;
        };
    }, [visible]);

    // Focus search input
    useEffect(() => {
        if (visible) {
            setTimeout(() => searchInputRef.current?.focus(), 0);

            ws.current = new WebSocket("ws://localhost:33333/ws");
            ws.current.onopen = () => {
                ws.current?.send(JSON.stringify({ type: "changeLang",language : "2"  }));
            }
        };
    }, [visible]);


    const focusFirstGridRow = () => {
        const grid = gridRef.current;
        console.log("grid ", grid)
        if (!grid) return;

        grid?.focus();
        grid.select(0, 0);
    };

    useEffect(() => {
        if (!visible) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const active = document.activeElement;
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            }
            if ((e.key === "ArrowDown" /*|| e.key === "Enter"*/) && document.activeElement === searchInputRef.current) {
                gridRef.current?.focus();
                gridRef.current?.select(0, 0);
                e.preventDefault();
            }
        };

        window.addEventListener("keydown", handleKeyDown, true);

        return () => {
            window.removeEventListener("keydown", handleKeyDown, true);
        };
    }, [visible, onClose]);

    // Search filter
    const searchWordsMatch = (text: string, query: string) => {
        const words = query.trim().toLowerCase().split(/\s+/);
        const normalizedText = (text || "").toLowerCase();
        return words.every((word) => normalizedText.includes(word));
    };

    const filteredCustomers = useMemo(() => {
        if (!searchTerm.trim()) return customers;
        return customers.filter(
            (c) =>
                searchWordsMatch(c.name, searchTerm) ||
                searchWordsMatch(c.customer_code, searchTerm) ||
                searchWordsMatch(c.mobile1, searchTerm)
        );
    }, [customers, searchTerm]);

    // DataGrid scheme
    const customerScheme = useMemo(() => ({
        name: "CustomersScheme",
        filter: false,
        showFooter: true,
        sortable: true,
        allowGrouping: false,
        isReport: true,
        columns: [
            { header: "##", name: "ser", width: 70 },
            { header: codeLabel, name: "customer_code", width: 120 },
            { header: nameLabel, name: "name", width: "*" },
            { header: "الجوال", name: "mobile1", width: 120 },
            { header: "ملاحظات", name: "general_notes", width: 180 },
        ],
    }), [codeLabel, nameLabel]);

    // Row click / double click
    const handleRowClick = useCallback((customer: Customer) => setSelectedCustomer(customer), []);
    const handleRowDoubleClick = useCallback((customer: Customer) => { onSelect(customer); onClose(); }, [onSelect, onClose]);
    const handleAccept = useCallback(() => { if (selectedCustomer) { onSelect(selectedCustomer); onClose(); } }, [selectedCustomer, onSelect, onClose]);
    const selectionChanged = useCallback((grid: wjGrid.FlexGrid) => {
        const rowIndex = grid?.selection?.row ?? -1;
        if (rowIndex < 0) return;
        const item = grid.rows[rowIndex]?.dataItem as Customer | undefined;
        if (!item) return;

        setSelectedCustomer(prev =>
            prev?.id === item.id ? prev : { ...item }
        );
    }, []);

    /*useEffect(() => {
        if (!visible) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            }
            if (e.key === "Enter") {
                e.preventDefault();
                if (selectedCustomer) {
                    handleRowDoubleClick(selectedCustomer); // Accept selected order
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown, true);

        return () => {
            window.removeEventListener("keydown", handleKeyDown, true);
        };
    }, [visible, onClose, handleRowDoubleClick, selectedCustomer]);*/

    const onKeyDownGrid = async (grid: any, e: KeyboardEvent) => {
        // Make sure grid and selection exist
        if (!grid || !grid.selection) return;
        const sel = grid.selection;
        const row = sel.row;

        if (e.keyCode === 13) {
            const rowIndex = grid.selection?.row ?? -1;
            if (rowIndex < 0) return;

            const item = grid.rows[rowIndex]?.dataItem as Customer;
            try {
                setSelectedCustomer(prev =>
                    prev?.id === item.id ? prev : { ...item }
                );
                const selectedItem = item
                handleRowDoubleClick(selectedItem)
            } catch (err) {
            }
            e.preventDefault();

            return;
        }
    }
    if (!visible) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div
                className="bg-white rounded-lg shadow-2xl border p-6 flex flex-col w-full max-w-4xl"
                dir="rtl"
                style={{ height: "600px" }}
            >
                <h3 className="text-lg font-semibold mb-4 text-right">
                    {searchTitle}
                </h3>

                <Input
                    type="text"
                    placeholder={searchPlaceholder}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="mb-4 p-2 border border-gray-300 rounded w-full text-right"
                    ref={searchInputRef}
                />

                <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                    <div className="flex-1 overflow-hidden border rounded shadow-sm p-2">
                        <div className="min-w-max overflow-x-auto">
                            <DataGridView
                                ref={(g: any) => (gridRef.current = g?.control ?? g ?? null)}
                                dataSource={filteredCustomers}
                                scheme={{
                                    isReport: false,
                                    columns: [
                                        { header: "##", name: "ser", width: 70 },
                                        { header: codeLabel, name: "customer_code", width: 120 },
                                        { header: nameLabel, name: "name", width: "*" },
                                        { header: "الجوال", name: "mobile1", width: 120 },
                                        { header: "ملاحظات", name: "general_notes", width: 180 },
                                    ],
                                }}
                                onRowClick={handleRowClick}
                                onRowDoubleClick={handleRowDoubleClick}
                                selectionChanged={selectionChanged}
                                style={{ maxHeight: '400px' }}
                                onKeyDown={(s: any, e: any) => onKeyDownGrid(s, e)}

                            />
                        </div>
                    </div>
                </div>

                <div className="flex justify-center gap-2 mt-4">
                    <Button className="erp-btn-primary search-button" onClick={() => selectedCustomer && handleRowDoubleClick(selectedCustomer)} >
                        موافق
                    </Button>
                    <Button variant="outline" onClick={onClose} className="search-button">إغلاق</Button>
                </div>
            </div>
        </div>
    );
};

export default CustomerSearchPopup;



