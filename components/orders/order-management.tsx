import React, { useState, useMemo, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ProgressSpinner from "../ProgressSpinner/ProgressSpinner"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Eye, Edit, MoreHorizontal, Search, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import ReceivedByPopup from "./ReceivedByPopup";

interface SalesOrder {
  id: number;
  order_number: string;
  order_date: string;
  customer_name: string;
  customer_id: number;
  order_status: number;
  total_amount: number;
  currency_code: string;
  reference_number: string;
  received_by: string;
  customer_order_no: string;
  ser: number;
  order_status2?: string;
  order_date_iso: string;
}

export const OrderManagement: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [receivedByPopupVisible, setReceivedByPopupVisible] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<SalesOrder | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set());
  const [batchDeliveryMode, setBatchDeliveryMode] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [state, setState] = useState<{
    salesOrders: SalesOrder[];
    filters: {
      search: string;
      status: string;
      order_status2: string;
      dateFrom: string;
      dateTo: string;
    };
    sortBy: string;
    sortOrder: "asc" | "desc";
    loading?: boolean;
    error?: string | null;
  }>({
    salesOrders: [],
    filters: {
      search: "",
      status: "1",
      order_status2: "1",
      dateFrom: "",
      dateTo: "",
    },
    sortBy: "order_date",
    sortOrder: "desc",
  });

  // ======== BADGES ========
  const getStatusBadge = (status: string) => {
    const statusConfig = {
      notCompleted: {
        label: "غير جاهزة",
        variant: "secondary",
        className: "bg-amber-100 text-amber-800 border-amber-200",
      },
      Completed: {
        label: "جاهزة",
        variant: "secondary",
        className: "bg-emerald-100 text-emerald-800 border-emerald-200",
      },
      cancelled: {
        label: "ملغاة",
        variant: "secondary",
        className: "bg-red-100 text-red-800 border-red-200",
      },
      sentPartially: {
        label: "مرسلة جزئيا",
        variant: "secondary",
        className: "bg-blue-100 text-blue-800 border-blue-200",
      },
      sent: {
        label: "مرسلة كليا",
        variant: "secondary",
        className: "bg-blue-100 text-blue-800 border-blue-200",
      },
    };
    let status_name = "";
    if (status === "1") status_name = "notCompleted";
    else if (status === "2") status_name = "Completed";
    else if (status === "3") status_name = "sentPartially";
    else if (status === "4") status_name = "sent";
    else if (status === "5") status_name = "cancelled";

    const config =
      statusConfig[status_name as keyof typeof statusConfig] || {
        label: status_name,
        variant: "secondary",
        className: "",
      };

    return (
      <Badge variant={config.variant as any} className={config.className}>
        {config.label}
      </Badge>
    );
  };

  const getOrderDecisionBadge = (decision: string) => {
    const decisionConfig: Record<
      "1" | "2" | "3",
      { label: string; className: string }
    > = {
      "1": { label: "غير مسلم", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
      "2": { label: "مسلم", className: "bg-red-100 text-red-800 border-red-200" },
      "3": { label: "ملغي", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
    };
    const config =
      decisionConfig[decision as keyof typeof decisionConfig] || {
        label: "غير معروف",
        className: "bg-slate-100 text-slate-800 border-slate-200",
      };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const formatDateToReadable = (iso: string | undefined) => {
    if (!iso) return "";
    const date = new Date(iso);
    return `${date.getDate().toString().padStart(2, "0")}-${(
      date.getMonth() + 1
    )
      .toString()
      .padStart(2, "0")}-${date.getFullYear()}`;
  };

  // ======== FETCH ORDERS ========
  const fetchSalesOrders = async () => {
    setLoading(true)
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch("/api/orders/sales?type=-1");
      const data: SalesOrder[] = await res.json();
      console.log("Fetched Sales Orders:", data);
      const numberedData = Array.isArray(data)
        ? data.map((order, i) => ({
          ...order,
          ser: i + 1,
          order_date: formatDateToReadable(order.order_date),
          order_date_iso: order.order_date,
        }))
        : [];
      setState(prev => ({
        ...prev,
        salesOrders: numberedData,

      }));
      console.log("Numbered Sales Orders:", numberedData);
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : "حدث خطأ غير متوقع",
        salesOrders: [],
      }));
    } finally {
      setState(prev => ({ ...prev, loading: false }));
      setLoading(false)
    }
  };

  useEffect(() => {
    const init = async () => {
      await fetchSalesOrders();

      // After first fetch, set default filters
      setState(prev => {
        if (prev.salesOrders.length === 0) return prev;

        const sortedData = [...prev.salesOrders].sort(
          (a, b) => new Date(a.order_date_iso).getTime() - new Date(b.order_date_iso).getTime()
        );

        const firstOrderDate = new Date(sortedData[0].order_date_iso).toISOString().split("T")[0];

        const today = new Date().toISOString().split("T")[0];

        return {
          ...prev,
          filters: {
            ...prev.filters,
            dateFrom: today,
            dateTo: today,
          },
        };
      });
    };

    init();
  }, []);

  // ======== FILTER & SORT ========
  const filteredOrders = useMemo(() => {
    const s = (state.filters.search || "").toLowerCase().trim();

    return state.salesOrders
      .filter(o => {
        // Safely normalize all fields to strings
        const orderNumber = (o.order_number || "").toLowerCase().trim();
        const customerName = (o.customer_name || "").toLowerCase().trim();
        const referenceNumber = (o.reference_number || "").toLowerCase().trim();
        const customerOrderNo = (o.customer_order_no || "").toLowerCase().trim();
        const receivedBy = (o.received_by || "").toLowerCase().trim();

        const matchesSearch =
          orderNumber.includes(s) ||
          customerName.includes(s) ||
          referenceNumber.includes(s) ||
          customerOrderNo.includes(s) ||
          receivedBy.includes(s);

        const matchesStatus =
          state.filters.status === "0" ||
          String(o.order_status) === state.filters.status;

        const matchesDecision =
          state.filters.order_status2 === "0" ||
          String(o.order_status2) === state.filters.order_status2;

        const fromDate = state.filters.dateFrom
          ? new Date(state.filters.dateFrom)
          : null;
        const toDate = state.filters.dateTo
          ? new Date(state.filters.dateTo)
          : null;

        if (toDate) toDate.setHours(23, 59, 59, 999);

        const matchesDateFrom = !fromDate || new Date(o.order_date_iso) >= fromDate;
        const matchesDateTo = !toDate || new Date(o.order_date_iso) <= toDate;

        return matchesSearch && matchesStatus && matchesDecision && matchesDateFrom && matchesDateTo;
      })
      .sort((a, b) => {
        const valA = (a as any)[state.sortBy];
        const valB = (b as any)[state.sortBy];

        if (valA == null) return 1;
        if (valB == null) return -1;

        return state.sortOrder === "asc" ? (valA > valB ? 1 : -1) : valA < valB ? 1 : -1;
      })
      .map((o, i) => ({ ...o, ser: i + 1 }));
  }, [state.salesOrders, state.filters, state.sortBy, state.sortOrder]);

  const resetFilters = () => {
    const sortedData = state.salesOrders.sort(
      (a, b) => new Date(a.order_date_iso).getTime() - new Date(b.order_date_iso).getTime()
    );
    const firstOrderDate = new Date(sortedData[0].order_date_iso).toISOString().split("T")[0];
    const today = new Date().toISOString().split("T")[0];
    setState(prev => ({
      ...prev,
      filters: { search: "", status: "1", order_status2: "1", dateFrom: firstOrderDate, dateTo: today },
    }));
  };

  const handleUpdateAllStatus = async (
    status: number
  ) => {
    setLoading(true);
    filteredOrders.forEach(async (order) => {
      await handleUpdateStatus(order, status);
    });
    setLoading(false)

    status === 1 ? window.confirm("تم تجهيز الطلبيات") : window.confirm("تم تسليم الطلبيات");
  }
  const handleUpdateStatus = async (
    order: SalesOrder,
    status: number,
    receivedBy?: string
  ) => {
    const savedUser =
      localStorage.getItem("erp_user") || sessionStorage.getItem("erp_user");
    if (!savedUser) return;

    const user = JSON.parse(savedUser);
    if (!user?.id) return;

    const res = await fetch(`/api/orders/update-order/${order.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": String(user.id),
      },
      body: JSON.stringify({
        statusOrDecision: status,
        ...(receivedBy && { received_by: receivedBy }),
      }),
    });

    if (!res.ok) {
      const err = await res.json();

    }
    setState(prev => ({
      ...prev,
      salesOrders: prev.salesOrders.map(o => {
        if (o.id !== order.id) return o;

        return status === 1
          ? {
            ...o,
            order_status: 2,
          }
          : {
            ...o,
            order_status2: "2",
            ...(receivedBy && { received_by: receivedBy }),
          };
      }),
    }));

  };




  return (
    <div className="space-y-6">
      <ProgressSpinner loading={loading} />

      {/* Error Message */}
      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex justify-between items-center">
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="ml-4 font-bold text-red-900 hover:text-red-700"
          >
            ✕
          </button>
        </div>
      )}
      <ReceivedByPopup
        visible={receivedByPopupVisible}
        onClose={() => {
          setReceivedByPopupVisible(false);
          setPendingOrder(null);
          setBatchDeliveryMode(false);
          setErrorMessage(null);
        }}
        onConfirm={(orderValues) => {
          if (batchDeliveryMode) {
            // Batch mode: update multiple selected orders
            console.log("orderValues ", orderValues)
            const ordersToUpdate = filteredOrders.filter((o) => selectedOrders.has(o.id));
            ordersToUpdate.forEach((order) => {
              handleUpdateStatus(order, 2, orderValues[order.id] || "");
            });
          } else if (pendingOrder) {
            // Single mode: update one order
            const singleValue = Object.values(orderValues)[0] || "";
            handleUpdateStatus(pendingOrder, 2, singleValue);
          }
          setReceivedByPopupVisible(false);
          setPendingOrder(null);
          setBatchDeliveryMode(false);
          setErrorMessage(null);
        }}
        orders={batchDeliveryMode ? filteredOrders.filter((o) => selectedOrders.has(o.id)) : pendingOrder ? [{ id: pendingOrder.id, order_number: pendingOrder.order_number, received_by: pendingOrder.received_by }] : []}
        defaultValue={batchDeliveryMode ? undefined : pendingOrder?.received_by}
      />
      {/* FILTERS */}
      <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-800">
            <Filter className="h-5 w-5" /> البحث والتصفية المتقدمة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-12 gap-4 items-end">
            {/* Search */}
            <div className="lg:col-span-3">
              <Label className="text-slate-700 font-medium">البحث الذكي</Label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="رقم الطلبية، اسم الزبون..."
                  value={state.filters.search}
                  onChange={e =>
                    setState(prev => ({ ...prev, filters: { ...prev.filters, search: e.target.value } }))
                  }
                  className="pr-10 bg-white border-slate-200"
                />
              </div>
            </div>

            {/* Status */}
            <div className="lg:col-span-2">
              <Label className="text-slate-700 font-medium">حالة الطلبية</Label>
              <Select
                value={state.filters.status}
                onValueChange={v =>
                  setState(prev => ({ ...prev, filters: { ...prev.filters, status: v } }))
                }
              >
                <SelectTrigger className="bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">جميع الحالات</SelectItem>
                  <SelectItem value="1">غير جاهزة</SelectItem>
                  <SelectItem value="2">جاهزة</SelectItem>
                  <SelectItem value="3">مرسلة جزئيا</SelectItem>
                  <SelectItem value="4">مرسلة كليا</SelectItem>
                  <SelectItem value="5">ملغاة</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Order Decision */}
            <div className="lg:col-span-2">
              <Label className="text-slate-700 font-medium">حالة التسليم</Label>
              <Select
                value={state.filters.order_status2}
                onValueChange={v =>
                  setState(prev => ({ ...prev, filters: { ...prev.filters, order_status2: v } }))
                }
              >
                <SelectTrigger className="bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">جميع الحالات</SelectItem>
                  <SelectItem value="1">غير مسلم</SelectItem>
                  <SelectItem value="2">مسلم</SelectItem>
                  <SelectItem value="3">ملغي</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* From Date */}
            <div>
              <Label className="text-slate-700 font-medium">من تاريخ</Label>
              <Input
                type="date"
                value={state.filters.dateFrom}
                onChange={e =>
                  setState(prev => ({ ...prev, filters: { ...prev.filters, dateFrom: e.target.value } }))
                }
                className="bg-white border-slate-200"
              />
            </div>

            {/* To Date */}
            <div>
              <Label className="text-slate-700 font-medium">إلى تاريخ</Label>
              <Input
                type="date"
                value={state.filters.dateTo}
                onChange={e =>
                  setState(prev => ({ ...prev, filters: { ...prev.filters, dateTo: e.target.value } }))
                }
                className="bg-white border-slate-200"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-2 lg:col-span-2">
              <Button
                className="bg-blue-500 text-white"
                onClick={fetchSalesOrders}
              >
                بحث
              </Button>
              <Button className="bg-blue-500 text-white" onClick={() => {
                if (window.confirm("هل أنت متأكد من تجهيز كل الطلبيات؟")) {
                  handleUpdateAllStatus(1);
                }
              }}>
                تجهيز الكل
              </Button>
              <Button className="bg-blue-500 text-white" onClick={() => {
                if (selectedOrders.size === 0) {
                  setErrorMessage("يجب تحديد طلبية واحدة على الاقل");
                  return;
                }
                setBatchDeliveryMode(true);
                setReceivedByPopupVisible(true);
              }}>
                تسليم المحدد
              </Button>
              <Button variant="outline" onClick={resetFilters}>
                إعادة تعيين
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ORDERS TABLE */}
      <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-slate-800">قائمة الطلبيات</CardTitle>
          <CardDescription className="text-slate-600">
            عرض {filteredOrders.length} من أصل {state.salesOrders.length} طلبية
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="p-4 text-right font-semibold text-slate-700">##</th>
                  <th className="p-4 text-center font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedOrders.size > 0 && selectedOrders.size === filteredOrders.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedOrders(new Set(filteredOrders.map(o => o.id)));
                        } else {
                          setSelectedOrders(new Set());
                        }
                      }}
                      className="w-4 h-4 cursor-pointer"
                      title="تحديد/إلغاء الكل"
                    />
                  </th>
                  <th className="p-4 text-right font-semibold text-slate-700">رقم الطلبية</th>
                  <th className="p-4 text-right font-semibold text-slate-700">التاريخ</th>
                  <th className="p-4 text-right font-semibold text-slate-700">تجهيز الطلبية</th>
                  <th className="p-4 text-right font-semibold text-slate-700">تسليم الطلبية</th>
                  <th className="p-4 text-right font-semibold text-slate-700">الزبون</th>
                  <th className="p-4 text-right font-semibold text-slate-700">الحالة</th>
                  <th className="p-4 text-right font-semibold text-slate-700"> حالة التسليم</th>
                  <th className="p-4 text-right font-semibold text-slate-700">السند اليدوي</th>
                  <th className="p-4 text-right font-semibold text-slate-700">رقم طلبية الزبون</th>
                  <th className="p-4 text-right font-semibold text-slate-700">المبلغ</th>
                  <th className="p-4 text-right font-semibold text-slate-700">استلمت بواسطة</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="text-center p-8 text-slate-600">
                      لا توجد طلبات مطابقة للبحث
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map(order => (
                    <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-4 font-medium text-right">{order.ser}</td>
                      <td className="p-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedOrders.has(order.id)}
                          onChange={(e) => {
                            const newSelected = new Set(selectedOrders);
                            if (e.target.checked) {
                              newSelected.add(order.id);
                            } else {
                              newSelected.delete(order.id);
                            }
                            setSelectedOrders(newSelected);
                          }}
                          className="w-4 h-4 cursor-pointer"
                        />
                      </td>
                      <td className="p-4 font-medium text-right">{order.order_number}</td>
                      <td className="p-4 text-right">{order.order_date}</td>
                      <td className="p-4 font-medium text-right">
                        <Button title={"تغيير حالة الطلبية الى جاهز"} variant="outline" size="sm"
                          className="border-green-600 text-green-600 hover:bg-green-50 hover:text-green-700"
                          onClick={() => {
                            if (window.confirm("هل أنت متأكد من تجهيز الطلبية؟")) {
                              handleUpdateStatus(order, 1);
                            }
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>

                      </td>
                      <td className="p-4 font-medium text-right">
                        <Button
                          title={"تغيير حالة الطلبية الى مسلم"}
                          variant="outline"
                          size="sm"
                          className="border-blue-600 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                          onClick={() => {
                            setPendingOrder(order);
                            setReceivedByPopupVisible(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>

                      </td>
                      <td className="p-4 text-right">{order.customer_name}</td>
                      <td className="p-4 text-right">{getStatusBadge(String(order.order_status))}</td>
                      <td className="p-4 text-right">{getOrderDecisionBadge(String(order.order_status2))}</td>
                      <td className="p-4 text-right">{order.reference_number}</td>
                      <td className="p-4 text-right">{order.customer_order_no}</td>
                      <td className="p-4 text-right font-bold">
                        {order.total_amount?.toLocaleString()} {order.currency_code}
                      </td>
                      <td className="p-4 text-right">{order.received_by}</td>

                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
