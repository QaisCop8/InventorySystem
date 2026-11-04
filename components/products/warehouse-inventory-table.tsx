"use client";

import { tr } from "@/lib/i18n"
import * as React from "react";
import { Button } from "@/components/ui/button";
import DataGrid from "@/components/common/DataGrid";
import { Plus, Trash2, Edit, Warehouse, Package } from "lucide-react";

interface WarehouseInventory {
  id?: number;
  warehouse_id: number;
  warehouse_name: string;
  floor: string;
  area: string;
  shelf: string;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  min_stock_level: number;
  max_stock_level: number;
  status: string;
}

interface WarehouseInventoryTableProps {
  productId?: number;
  onDataChange?: (data: WarehouseInventory[]) => void;
  readOnly?: boolean;
}

export function WarehouseInventoryTable({ productId, onDataChange, readOnly = false }: WarehouseInventoryTableProps) {
  const [inventoryData, setInventoryData] = React.useState<WarehouseInventory[]>([]);
  const [warehouses, setWarehouses] = React.useState<{ id: number; name: string }[]>([]);

  const statuses = ["متوفر", "تحت الحد الأدنى", "نفد المخزون", "محجوز", "تالف"];

  React.useEffect(() => {
    fetchWarehouses();
    if (productId) fetchProductInventory();
  }, [productId]);

  const fetchWarehouses = async () => {
    try {
      const res = await fetch("/api/warehouses");
      if (res.ok) setWarehouses(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchProductInventory = async () => {
    if (!productId) return;
    try {
      const res = await fetch(`/api/inventory/products/${productId}/warehouses`);
      if (res.ok) {
        const data = await res.json();
        setInventoryData(data);
        onDataChange?.(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const addNewRow = () => {
    const newRow: WarehouseInventory = {
      warehouse_id: 0,
      warehouse_name: "",
      floor: "",
      area: "",
      shelf: "",
      quantity: 0,
      reserved_quantity: 0,
      available_quantity: 0,
      min_stock_level: 0,
      max_stock_level: 0,
      status: "متوفر",
    };
    const newData = [...inventoryData, newRow];
    setInventoryData(newData);
    onDataChange?.(newData);
  };

  const updateRow = (index: number, field: keyof WarehouseInventory, value: any) => {
    const newData = [...inventoryData];
    newData[index] = { ...newData[index], [field]: value };

    // Auto-calculate available quantity
    if (field === "quantity" || field === "reserved_quantity") {
      newData[index].available_quantity = newData[index].quantity - newData[index].reserved_quantity;
    }

    if (field === "warehouse_id") {
      const warehouse = warehouses.find((w) => w.id === Number(value));
      newData[index].warehouse_name = warehouse?.name || "";
    }

    setInventoryData(newData);
    onDataChange?.(newData);
  };

  const deleteRow = (index: number) => {
    const newData = inventoryData.filter((_, i) => i !== index);
    setInventoryData(newData);
    onDataChange?.(newData);
  };

  const getStatusBadge = (status: string, quantity: number, minLevel: number) => {
    if (quantity === 0) return <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded">{tr("نفد المخزون")}</span>;
    if (quantity <= minLevel) return <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded">{tr("تحت الحد الأدنى")}</span>;
    return <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded">{tr("متوفر")}</span>;
  };
  const cellEditEnded = (s: any, e: any) => {
    const editedItem = s.rows[e.row].dataItem; // the row that changed
    setInventoryData(prev => {
      const newData = [...prev];
      newData[e.row] = { ...editedItem }; // update only this row
      return newData;
    });
  };
  const getScheme = () => ({
    name: "warehouseInventory",
    responsiveColumnIndex: 0,
    columns: [
      {
        name: "warehouse_id",
        header: tr("المستودع"),
        width: '*',
        editor: (cell: any) => (
          <select
            value={cell.row.dataItem.warehouse_id}
            onChange={(e) => updateRow(cell.row.index, "warehouse_id", e.target.value)}
            className="w-full"
          >
            <option value={0}>{tr("اختر المستودع")}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        )
      },
      { name: "floor", header: tr("الطابق"), width: 120 },
      { name: "area", header: tr("المنطقة"), width: 120 },
      { name: "shelf", header: tr("الرف"), width: 120 },
      { name: "quantity", header: tr("الكمية"), width: 120, isReadOnly: true },
      { name: "reserved_quantity", header: tr("محجوز"), width: 120, isReadOnly: true },
      { name: "available_quantity", header: tr("متاح"), width: 120, isReadOnly: true },
      { name: "min_stock_level", header: tr("حد أدنى"), width: 120 },
      { name: "max_stock_level", header: tr("حد أقصى"), width: 120 },
      {
        name: "actions",
        header: " ",
        buttonBody: "button",
        iconType: "trash",
        width: 100,
        onClick: (item: any, rowIndex: number) => deleteRow(rowIndex)
      }
    ]
  });

  return (
    <div className="grid">
      {/* Header row */}
      <div className="col-12 flex justify-between align-items-center mb-3">
        {/* Right: title */}
        <h3 className="m-0 flex items-center gap-2 text-start">
          <Warehouse className="w-5 h-5" />
          <span>{tr("تفاصيل المخزون في المستودعات")}</span>
        </h3>

        {/* Left: button */}
        <button type="button"
          className="flex items-center gap-1 bg-primary text-white px-3 py-1 rounded hover:bg-blue-600 transition"
          onClick={addNewRow}
        >
          <Plus className="h-4 w-4" />
          {tr("إضافة")}
        </button>
      </div>

      {/* Grid section */}
      <div className="col-12">
        <DataGrid
          style={{ width: "100%" }}
          dataSource={inventoryData}
          scheme={getScheme()}
          cellEditEnded={cellEditEnded}
        />
      </div>
    </div>
  );
}
