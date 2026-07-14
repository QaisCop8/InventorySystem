"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DataGrid from "../common/DataGrid";
import * as wjGrid from "@grapecity/wijmo.grid";
import DataGridView from "../common/DataGridView";

interface Order {
    id: number;
    customer_name: string;
    order_number: string;
    order_date: Date;
    amount: string;
    reference_number: string;
    customer_order_no: string;
}

interface OrderSearchPopupProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (order: Order) => void;
    type: number;
}

const OrderSearchPopup: React.FC<OrderSearchPopupProps> = ({ visible, onClose, onSelect, type }) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const gridRef = useRef<wjGrid.FlexGrid | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Load customers
    useEffect(() => {
        if (!visible) return;
        let cancelled = false;

        const fetchOrders = async () => {
            let cancelled = false;

            try {
                const endpoint = type >= 3 ? `/api/vouchers/sales?type=${type}` : `/api/orders/sales?type=${type}`;
                const response = await fetch(endpoint);
                const data = await response.json();
                console.log("Fetched orders data:", data);
                if (!cancelled) {
                    // Ensure we have an array
                    const allRecords = Array.isArray(data) ? data : data || [];
                    console.log("All orders records:", allRecords);
                    // Filter by type: 1 = customer, 2 = supplier
                    const filtered = type === -1 || type >= 3
                        ? allRecords
                        : allRecords.filter((c: any) => Number(c.order_type) === type);

                    // Order by customer_code
                    //filtered.sort((a: any, b: any) => a.id - b.id);

                    console.log("Filtered orders data:", filtered);
                    console.log("Number of filtered orders:", type);
                    // Map to match grid column names
                    const mapped = filtered.map((c: any, index: number) => ({
                        ser: index + 1,
                        id: c.id,
                        order_number: c.order_number,
                        order_date: new Date(c.order_date),
                        customer_name: c.customer_name,
                        amount: c.total_amount,
                        reference_number: c.reference_number,
                        customer_order_no: c.customer_order_no
                    }));
                    console.log("Mapped orders data:", mapped);
                    setOrders(mapped);
                }
            } catch (err) {
                console.error("Failed to fetch customers:", err);
                if (!cancelled) setOrders([]);
            }
        };

        setSearchTerm("")
        fetchOrders();
        return () => {
            cancelled = true;
        };
    }, [visible, type]);

    // Focus search input
    useEffect(() => {
        if (visible) setTimeout(() => searchInputRef.current?.focus(), 0);
    }, [visible]);



    // Search filter
    const searchWordsMatch = (text: string, query: string) => {
        const words = query.trim().toLowerCase().split(/\s+/);
        const normalizedText = (text || "").toLowerCase();
        return words.every((word) => normalizedText.includes(word));
    };

    const filteredOrders = useMemo(() => {
        if (!searchTerm.trim()) return orders;
        return orders.filter(
            (c) =>
                searchWordsMatch(c.customer_name, searchTerm) ||
                searchWordsMatch(c.order_number, searchTerm) ||
                searchWordsMatch(c.amount, searchTerm) ||
                searchWordsMatch(c.reference_number, searchTerm) ||
                searchWordsMatch(c.customer_order_no, searchTerm)

        );
    }, [orders, searchTerm]);

    // DataGrid scheme
    const OrdersScheme = useMemo(() => ({
        name: "OrdersScheme",

        isReport: true,
        columns: [
            { header: "##", name: "ser", width: 50 },
            { header: type === 3 ? "رقم الفاتورة" : "رقم الطلبية", name: "order_number", width: 120 },
            { header: type === 3 ? "تاريخ الفاتورة" : "تاريخ الطلبية", name: "order_date", width: 130 },
            { header: "اسم العميل", name: "customer_name", width: "*" },
            { header: "السند اليدوي", name: "reference_number", width: 130 },
            { header: "رقم طلبية العميل", name: "customer_order_no", width: 130 },
            { header: "المبلغ", name: "amount", width: 110 },
        ],
    }), [type]);

    // Row click / double click
    const handleRowClick = useCallback((order: Order) => setSelectedOrder(order), []);
    const handleRowDoubleClick = useCallback((order: Order) => { onSelect(order); onClose(); }, [onSelect, onClose]);
    const handleAccept = useCallback(() => { if (selectedOrder) { onSelect(selectedOrder); onClose(); } }, [selectedOrder, onSelect, onClose]);

    useEffect(() => {
        if (!visible) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            }
            if (e.key === "Enter") {
                e.preventDefault();
                if (selectedOrder) {
                    handleRowDoubleClick(selectedOrder); // Accept selected order
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown, true);

        return () => {
            window.removeEventListener("keydown", handleKeyDown, true);
        };
    }, [visible, onClose, handleRowDoubleClick, selectedOrder]);

    if (!visible) return null;


    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div
                className="bg-white rounded-lg shadow-2xl border p-6 flex flex-col w-full max-w-4xl"
                dir="rtl"
                style={{ height: "700px" }}
            >
                <h3 className="text-lg font-semibold mb-4 text-right">
                    {type === 3 ? "بحث الفواتير" : type === 1 ? "بحث طلبيات المبيعات" : "بحث طلبيات المشتريات"}
                </h3>

                <Input
                    type="text"
                    placeholder={type === 3 ? "ابحث عن فاتورة..." : "ابحث عن طلبية..."}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="mb-4 p-2 border border-gray-300 rounded w-full text-right"
                    ref={searchInputRef}
                />

                <div className="flex-1 flex flex-col gap-4">
                    <div className="flex-1 border rounded shadow-sm p-2">
                        <div className="min-w-max">
                            <DataGridView
                                ref={(g: any) => (gridRef.current = g?.control ?? g ?? null)}
                                
                                dataSource={filteredOrders}
                                scheme={{
                                    isReport: false,

                                    columns: [
                                        { header: "##", name: "ser", width: 50,isReadOnly:true },
                                        { header: type === 3 ? "رقم الفاتورة" : "رقم الطلبية", name: "order_number", width: 120,isReadOnly:true },
                                        { header: type === 3 ? "تاريخ الفاتورة" : "تاريخ الطلبية", name: "order_date", width: 130 ,isReadOnly:true},
                                        { header: "اسم العميل", name: "customer_name", width: "*" ,isReadOnly:true},
                                        { header: "السند اليدوي", name: "reference_number", width: 130,isReadOnly:true },
                                        { header: "رقم طلبية العميل", name: "customer_order_no", width: 130,isReadOnly:true },
                                        { header: "المبلغ", name: "amount", width: 110 },
                                    ],
                                }}
                                onRowClick={handleRowClick}
                                onRowDoubleClick={handleRowDoubleClick}
                            />
                        </div>
                    </div>
                </div>

                <div className="flex justify-center gap-2 mt-4">
                    <Button className="erp-btn-primary search-button" onClick={() => selectedOrder && handleRowDoubleClick(selectedOrder)} >
                        موافق
                    </Button>
                    <Button variant="outline" onClick={onClose} className="search-button">إغلاق</Button>
                </div>
            </div>
        </div>
    );
};

export default OrderSearchPopup;
