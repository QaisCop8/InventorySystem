"use client"

import React, { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Search } from "lucide-react"
import { formatDateToBritish } from "@/lib/utils"
import ProductSearchPopup from "../products/ProductSearchPopup"
import DataGridView from "../common/DataGridView"
import { min } from "date-fns"
interface BatchLog {
  ser: number
  product_name: string
  product_code: string
  batch_number: string
  user_name: string
  log_date: string
  status: string
  product_id: string,
}

export function BatchLogReport() {
  const [logs, setLogs] = useState<BatchLog[]>([])
  const [loading, setLoading] = useState(true)
  const [showItemSearch, setItemSearch] = useState(false)
  // Filters
  const [filters, setFilters] = useState({
    product_code: "",
    product_Name: "",
    product_id: "",
    from_date: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split("T")[0],
    to_date: (() => {
      const today = new Date();
      today.setHours(23, 59, 59, 0);
      const iso = today.toISOString(); // e.g. "2026-01-15T23:59:59.000Z"
      return iso.substring(0, 16);     // "2026-01-15T23:59"
    })(),
    batch_number: "",
  })

  useEffect(() => {
    fetchLogs()

  }, [])
  const formatDateISO = (date: string | Date) => {
    const d = new Date(date);
    return d.toISOString().split("T")[0];
  };

  useEffect(() => {
    if (logs.length > 0) {
      const sortedLogs = [...logs].sort(
        (a, b) =>
          new Date(a.log_date).getTime() -
          new Date(b.log_date).getTime()
      );

      setFilters((prev) => ({
        ...prev,
        from_date: formatDateISO(sortedLogs[0].log_date),
      }));
    }
  }, [logs]);
  const getScheme = () => {
    return {
      name: 'BatchLogReportTable',
      filter: false,
      showFooter: false,
      sortable: true,
      allowGrouping: false,
      columns: [
        { header: "##", name: "ser", width: 50, visible: true },
        { header: "رقم الصنف", name: "product_code", width: 120, visible: true },
        { header: "اسم الصنف", name: "product_name", width: '*', minWidth: 120, visible: true },
        { header: "الرقم التشغيلي", name: "batch_number", width: 250, visible: true },
        { header: "اسم المستخدم", name: "user_name", width: 150, visible: true },
        { header: "التاريخ", name: "log_date", width: 250, visible: true },
        { header: "الحالة", name: "batch_status", width: 170, visible: true },
      ]
    }
  }

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.product_id) params.append("product_id", filters.product_id)
      if (filters.from_date) params.append("from_date", filters.from_date)
      if (filters.to_date) params.append("to_date", filters.to_date)
      if (filters.batch_number) params.append("batch_number", filters.batch_number)
      const res = await fetch(`/api/inventory/batch-log?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data || [])

      } else {
        setLogs([])
      }
    } catch (err) {
      console.error("Failed to fetch batch log:", err)
      setLogs([])
    } finally {
      setLoading(false)

    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <ProductSearchPopup
          visible={showItemSearch}
          onClose={() => setItemSearch(false)}
          onSelect={(selectedItems) => {
            if (!selectedItems || selectedItems.length === 0) return;

            const selected = selectedItems[0];
            setFilters((prev) => ({
              ...prev,
              product_id: String(selected.id), // convert number to string
              product_Name: `${selected.product_name}`,

            }));

            setItemSearch(false);
          }}
          priceCategoryId={1}
          ShowSelect={false}
        />
        <CardHeader>
          <CardTitle>تقرير ارشفة حركات الرقم التشغيلي</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4 items-end">
            {/* رقم الصنف */}
            <div className="flex flex-col flex-1 min-w-[280px]">
              <label className="text-sm mb-1">رقم الصنف</label>
              <div className="flex gap-2 items-center">

                <Input
                  value={filters.product_Name ?? ""}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, product_id: e.target.value }))
                  }
                  className="text-right font-medium h-11 flex-1"
                  dir="rtl"
                  maxLength={8}
                />
                <Button
                  type="button"
                  onClick={() => setItemSearch(true)}
                  className="h-10 w-10 flex-shrink-0"
                >
                  🔍
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    setFilters((prev) => ({ ...prev, product_id: "", product_Name: "" }))
                  }
                  className="h-10 w-10 flex-shrink-0"
                >
                  🗑️
                </Button>

              </div>
            </div>

            {/* الرقم التشغيلي */}
            <div className="flex flex-col flex-1 min-w-[240px]">
              <label className="text-sm mb-1">الرقم التشغيلي</label>
              <Input
                value={filters.batch_number}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, batch_number: e.target.value }))
                }
                placeholder="ابحث عن رقم تشغيلي..."
                maxLength={30}
                className="h-11 w-full"
              />
            </div>

            {/* من تاريخ */}
            <div className="flex flex-col flex-1 min-w-[140px]">
              <label className="text-sm mb-1">من تاريخ</label>
              <Input
                type="date"
                value={filters.from_date}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, from_date: e.target.value }))
                }
                className="h-11 w-full"
              />
            </div>

            {/* إلى تاريخ */}
            <div className="flex flex-col flex-1 min-w-[140px]">
              <label className="text-sm mb-1">إلى تاريخ</label>
              <Input
                type="date"
                value={filters.to_date}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, to_date: e.target.value }))
                }
                className="h-11 w-full"
              />
            </div>

            {/* زر البحث */}
            <div className="flex items-end flex-shrink-0">
              <Button
                onClick={fetchLogs}
                className="h-11 w-full sm:w-auto flex items-center justify-center"
              >
                <Search className="ml-2 h-4 w-4" /> بحث
              </Button>
            </div>
          </div>

          <CardContent>
            <DataGridView
              style={{ maxHeight: '100vh', minHeight: '50vh' }}
              //ref={gridRef}
              idProperty="ser"
              scheme={getScheme()}
              dataSource={logs || []}
              showContextMenu={false}
              copyItemStoreDown={true}
              dontConvertToCards={true}
              isReport={true}
              hideSearch={true}
              allowSorting={true}
            />

          </CardContent>

        </CardContent>
      </Card>
    </div>
  )
}
