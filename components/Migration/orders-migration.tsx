"use client"

import React, { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import DataGridView from "../common/DataGridView"
import { is } from "date-fns/locale"
import { Upload } from "lucide-react"
import ProgressSpinner from "../ProgressSpinner/ProgressSpinner"
import Util from "../common/Util"
interface OrderMigrateRow {
    id: any
    ser: number
    selected: boolean
    order_number: string
    order_date: string
    order_decision: string
    customer_code: string
    customer_name: string
    total_amount: number
    order_type: string
}

export function OrderMigrate() {
    type ViewType = "all" | "sales" | "purchase";
    type Filters = {
        order_number: string
        from_date: string
        to_date: string
        order_type: ViewType
        currentView: ViewType
    }

    const savedView = localStorage.getItem("currentType") as ViewType | null;
    const [data, setData] = useState<OrderMigrateRow[]>([])
    const [loading, setLoading] = useState(false)
    const showErrors = React.useRef(false);
    const [filters, setFilters] = useState<Filters>({
        order_number: "",
        from_date: "",
        to_date: "",
        order_type: savedView ?? "sales", // all | sales | purchase
        currentView: savedView ?? "sales",
    })

    useEffect(() => {
        fetchOrders()
    }, [])

    const orderDecisionMap: Record<string | number, string> = {
        1: "غير مسلم",
        2: "مسلم",
        3: "ملغي",

    }
    const fetchOrders = async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (filters.order_number) params.append("order_number", filters.order_number)
            if (filters.from_date) params.append("from_date", filters.from_date)
            if (filters.to_date) params.append("to_date", filters.to_date)
            if (filters.order_type && filters.order_type !== "all")
                params.append("order_type", filters.order_type)

            const res = await fetch(`/api/migration/orders?${params.toString()}`)
            const result = await res.json()

            const mappedData = (result || []).map((r: any, i: number) => ({
                ser: i + 1,
                selected: false,
                ...r,
                order_status2: orderDecisionMap[r.order_status2] || "غير محدد",
            }))
            setData(mappedData)
        } catch (err) {
            console.error("Failed to fetch orders:", err)
            setData([])

        } finally {
            setLoading(false)
        }
    }

    /* ================= Selection Actions ================= */

    const selectAll = () => {
        setData(prev => prev.map(r => ({ ...r, selected: true })))
    }

    const unselectAll = () => {
        setData(prev => prev.map(r => ({ ...r, selected: false })))
    }

    const invertSelection = () => {
        setData(prev => prev.map(r => ({ ...r, selected: !r.selected })))
    }

    /* ================= Grid Scheme ================= */


    const handleMigrate = async () => {
        showErrors.current = false;

        const selectedOrders = data.filter(d => d.selected);
        if (selectedOrders.length === 0) return alert("اختر طلبية واحدة على الأقل");
        setLoading(true)
        try {
            const res = await fetch("/api/migration/post-orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orders: selectedOrders }),
            });

            const result = await res.json();

            if (res.ok) {
                // result.results contains success / failed / skipped orders
                const failedOrders = result.results.filter((r: { status: string }) => r.status !== "success");
                const successOrders = result.results.filter((r: { status: string }) => r.status === "success");
                // Add error messages to your grid data
                const updatedData = data
                    .map(d => {
                        const fail = failedOrders.find((f: { order_id: any }) => f.order_id === d.id);
                        if (fail) return { ...d, error: fail.reason };
                        return d;
                    })
                    // Remove successfully migrated orders
                    .filter(d => !result.results.some((r: { status: string; order_id: any }) => r.status === "success" && r.order_id === d.id));

                setData(updatedData); // Update grid state

                if (failedOrders.length > 0) {
                    if (successOrders.length > 0)
                        alert(`تم ترحيل بعض الطلبيات بنجاح، والبعض فشل. تحقق من عمود الخطأ.`);
                    else
                        alert(`فشل ترحيل جميع الطلبيات. تحقق من عمود الخطأ.`);
                    showErrors.current = true;
                } else {
                    alert(`تم ترحيل جميع الطلبيات بنجاح`);
                }
            } else {
                alert(result.error || "فشل الترحيل");
            }
        } catch (err) {
            console.error(err);
            alert("حدث خطأ أثناء الترحيل");
        }
        finally {
            setLoading(false)
        }
    };


    const handleViewChange = (view: "all" | "sales" | "purchase") => {
        localStorage.setItem("currentType", view);
    };
    const getScheme = () => ({
        name: "OrderMigrateTable",
        filter: false,
        showFooter: false,
        sortable: true,
        allowGrouping: false,
        isReport: false,
        columns: [
            { header: "#", name: "ser", width: 50, visible: true, isReadOnly: true },
            { header: "✔", name: "selected", width: 60, isCheckbox: true },
            { header: "رقم الطلبية", name: "order_number", width: 150, isReadOnly: true },
            { header: "تاريخ الطلبية", name: "order_date", width: 150, isReadOnly: true },
            { header: "نوع الطلبية", name: "order_type", width: 140, isReadOnly: true },
            { header: "المبلغ", name: "total_amount", width: 120, isReadOnly: true },
            { header: "حالة التسليم", name: "order_status2", width: 140, isReadOnly: true },
            { header: "رقم الزبون", name: "customer_code", width: 120, isReadOnly: true },
            { header: "اسم الزبون", name: "customer_name", width: "*", isReadOnly: true },
            { header: "الخطأ", name: "error", width: 250, isReadOnly: true, visible: showErrors.current },

        ],
    })
    if (!Util.checkUserAccess(14)) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <h2 className="text-2xl font-semibold mb-2 text-red-600">لا يوجد صلاحية</h2>
                    <p className="text-muted-foreground">ليس لديك صلاحية للوصول إلى هذه الصفحة</p>
                </div>
            </div>
        )
    }
    return (

        <div className="space-y-6">
            <ProgressSpinner loading={loading} />
            <Card>
                <CardHeader>
                    <CardTitle>ترحيل الطلبيات</CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                    {/* Filters */}
                    <div className="flex flex-wrap gap-4 items-end">
                        {/* رقم الطلبية */}
                        <div className="flex flex-col min-w-[200px]">
                            <label className="text-sm mb-1">رقم الطلبية</label>
                            <Input
                                value={filters.order_number}
                                onChange={(e) =>
                                    setFilters(prev => ({ ...prev, order_number: e.target.value }))
                                }
                            />
                        </div>

                        {/* من تاريخ */}
                        <div className="flex flex-col min-w-[160px]">
                            <label className="text-sm mb-1">من تاريخ</label>
                            <Input
                                type="date"
                                value={filters.from_date}
                                onChange={(e) =>
                                    setFilters(prev => ({ ...prev, from_date: e.target.value }))
                                }
                            />
                        </div>

                        {/* إلى تاريخ */}
                        <div className="flex flex-col min-w-[160px]">
                            <label className="text-sm mb-1">إلى تاريخ</label>
                            <Input
                                type="date"
                                value={filters.to_date}
                                onChange={(e) =>
                                    setFilters(prev => ({ ...prev, to_date: e.target.value }))
                                }
                            />
                        </div>

                        {/* نوع الطلبية */}
                        <div className="flex flex-col min-w-[160px]">
                            <label className="text-sm mb-1">نوع الطلبية</label>
                            <select
                                value={filters.order_type}
                                onChange={(e) => {
                                    const view = e.target.value as ViewType;
                                    setFilters(prev => ({ ...prev, order_type: view, currentView: view }))
                                    handleViewChange(view)
                                }}
                                className="h-11 border rounded px-2"
                            >
                                <option value="all">الكل</option>
                                <option value="sales">طلبية مبيعات</option>
                                <option value="purchase">طلبية مشتريات</option>
                            </select>
                        </div>

                        <Button onClick={fetchOrders} className="h-11">
                            بحث
                        </Button>
                    </div>

                    {/* Selection Buttons */}
                    <div className="flex items-center justify-between mb-4">

                        <div className="flex gap-2">
                            <Button className="px-4 py-1 bg-green-500 text-white rounded" variant="secondary" onClick={selectAll}>
                                تحديد الكل
                            </Button>
                            <Button className="px-4 py-1 bg-red-500 text-white rounded" variant="secondary" onClick={unselectAll}>
                                إلغاء تحديد الكل
                            </Button>
                            <Button className="px-4 py-1 bg-blue-500 text-white rounded" variant="secondary" onClick={invertSelection}>
                                عكس التحديد
                            </Button>
                        </div>

                        <div>
                            <Button
                                type="button"
                                onClick={handleMigrate}
                                className="flex items-center gap-4 px-114 py-1 bg-green-700 text-white rounded"
                            >
                                <Upload className="w-4 h-4" /> {/* الأيقونة */}
                                ترحيل
                            </Button>
                        </div>
                    </div>
                    {/* Grid */}
                    <DataGridView
                        style={{ maxHeight: "70vh", minHeight: "50vh" }}
                        idProperty="ser"
                        scheme={getScheme()}
                        dataSource={data}
                        isReport={false}
                        hideSearch={true}
                        allowSorting={true}
                    />
                </CardContent>
            </Card>
        </div>
    )
}
