import { useState, useRef, useCallback,useEffect } from "react";
import DataGridView from "../common/DataGridView";
import Button from "../common/Button";
import * as wjGrid from "@grapecity/wijmo.grid";
interface Unit {
  unit_id: number;
  unit_name: string;
  price: number;
  barcode: string;
  to_main_qnty: number;
}

interface Product {
  name: string;
}

interface UnitsSearchPopupProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (selection: { product: Product; selected_unit: Unit }) => void;
  units: Unit[];
  product: Product;
}

const UnitsSearchPopup: React.FC<UnitsSearchPopupProps> = ({
  visible,
  onClose,
  onSelect,
  units,
  product,
}) => {
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const gridRef = useRef<wjGrid.FlexGrid | null>(null);

  const handleRowDoubleClick = (unit: Unit) => {
    onSelect({ product, selected_unit: unit });
    onClose();
  };
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [visible, onClose]);
  const handleSelectionChange = useCallback((grid: wjGrid.FlexGrid) => {
    if (!grid || !grid.collectionView) return;
    const item = grid.collectionView.currentItem as Unit | undefined;
    if (!item) return;
    setSelectedUnit(item);
  }, []);
  if (!visible) return null;
  console.log("units ", units)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-white rounded-lg shadow-2xl border p-6 w-full max-w-4xl"
        dir="rtl"
        style={{ height: "650px" }}
      >
        <h3 className="text-lg font-semibold mb-4 text-right">
          وحدات الصنف: {product.name}
        </h3>

        <DataGridView
          ref={gridRef}
          dataSource={units}
          scheme={{
            isReport: true,
            columns: [
              { header: "الوحدة", name: "unit_name", width: "*", isReadOnly: true },
              { header: "السعر", name: "price", width: 80, isReadOnly: true },
              { header: "باركود", name: "barcode", width: 120, isReadOnly: true },
              { header: "العلاقة بالرئيسية", name: "to_main_qnty", width: 120, isReadOnly: true },
            ],
          }}
          selectionChanged={handleSelectionChange}
          onRowDoubleClick={(unit: Unit) => handleRowDoubleClick(unit)}
        />

        <div className="flex justify-center gap-2 mt-4">
          <Button
            className="erp-btn-primary search-button"
            disabled={!selectedUnit}
            onClick={() => {
              console.log("selectedUnit ", selectedUnit)
              if (!selectedUnit) return;
              onSelect({ product, selected_unit: selectedUnit });
              onClose();
            }}
          >
            موافق
          </Button>

          <Button variant="outline" className="erp-btn-primary search-button" onClick={onClose}>إغلاق</Button>
        </div>
      </div>
    </div>
  );
};

export default UnitsSearchPopup;
