import { useState, useRef, useCallback,useEffect } from "react";
import DataGridView from "../common/DataGridView";
import Button from "../common/Button";
import * as wjGrid from "@grapecity/wijmo.grid";
import { Check, Package, X } from "lucide-react";
interface Unit {
  unit_id: number;
  unit_name: string;
  price: number;
  barcode: string;
  to_main_qnty: number;
}

interface Product {
  name: string;
  id?: number | null;
}

interface UnitsSearchPopupProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (selection: { product: Product; selected_unit: Unit }) => void;
  units?: Unit[];
  product: Product;
  priceCategoryId?: number;
}

const UnitsSearchPopup: React.FC<UnitsSearchPopupProps> = ({
  visible,
  onClose,
  onSelect,
  units,
  product,
  priceCategoryId = 0,
}) => {
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [resolvedUnits, setResolvedUnits] = useState<Unit[]>([]);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const gridRef = useRef<wjGrid.FlexGrid | null>(null);

  useEffect(() => {
    if (!visible) return;

    const sourceUnits = Array.isArray(units) && units.length > 0 ? units : [];
    if (sourceUnits.length > 0 && refreshVersion === 0) {
      setResolvedUnits(sourceUnits);
      setSelectedUnit(sourceUnits[0] ?? null);
      return;
    }
    if (!product?.id) {
      setResolvedUnits([]);
      setSelectedUnit(null);
      return;
    }

    let isActive = true;
    const loadUnits = async () => {
      try {
        const categoryId = Number.isFinite(priceCategoryId) ? Number(priceCategoryId) : 0;
        const response = await fetch(`/api/products/${product.id}/units?price_category_id=${categoryId}`);
        console.log("response ", response)
        if (!response.ok) {
          throw new Error("Failed to load units");
        }
        const data = await response.json();
        if (!isActive) return;
        const nextUnits = Array.isArray(data)
          ? data.map((u: any) => ({
              unit_id: Number(u.unit_id ?? u.id ?? 0),
              unit_name: String(u.unit_name ?? ""),
              price: Number(u.price ?? 0),
              barcode: String(u.barcode ?? ""),
              to_main_qnty: Number(u.to_main_qnty ?? 1),
            }))
          : [];

        setResolvedUnits(nextUnits);
        setSelectedUnit(nextUnits[0] ?? null);
      } catch (error) {
        if (!isActive) return;
        setResolvedUnits([]);
        setSelectedUnit(null);
      }
    };

    void loadUnits();

    return () => {
      isActive = false;
    };
  }, [visible, product?.id, units, priceCategoryId, refreshVersion]);

  useEffect(() => {
    if (!visible) return;
    const refreshAfterReturn = () => setRefreshVersion((value) => value + 1);
    window.addEventListener("focus", refreshAfterReturn);
    return () => window.removeEventListener("focus", refreshAfterReturn);
  }, [visible]);

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

  const gridUnits = resolvedUnits.length > 0 ? resolvedUnits : (Array.isArray(units) ? units : []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6">
      <div
        className="flex h-[min(90dvh,760px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        dir="rtl"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 bg-gradient-to-l from-emerald-800 via-emerald-700 to-teal-700 px-4 py-4 text-white sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20"><Package className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold sm:text-lg">وحدات الصنف</h3>
              <p className="mt-0.5 truncate text-xs text-emerald-100 sm:text-sm">{product.name}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button className="!m-0 !min-h-10 !rounded-xl !border !border-white/25 !bg-white/10 !px-3 !text-white hover:!bg-white/20 sm:!px-4" onClick={() => window.open("/admin/definitions?section=units&new=1", "_blank", "noopener,noreferrer")}>إضافة وحدة</Button>
            <button type="button" aria-label="إغلاق" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white/80 transition hover:bg-white/15 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
        </header>

        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/70 px-4 py-2.5 text-xs text-slate-600 sm:px-6 sm:text-sm">
          <span>اختر وحدة الصنف ثم اضغط موافق أو انقر عليها مرتين</span>
          <span className="shrink-0 rounded-full bg-white px-3 py-1 font-semibold text-emerald-800 ring-1 ring-emerald-100">{gridUnits.length} وحدة</span>
        </div>

        <main className="min-h-0 flex-1 p-3 sm:p-5">
          <div className="h-full min-h-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="h-full overflow-y-auto p-2 md:hidden">
              {gridUnits.length === 0 ? (
                <div className="flex h-full min-h-40 items-center justify-center rounded-lg border border-dashed border-slate-300 px-5 text-center text-sm text-slate-500">
                  لا توجد وحدات لهذا الصنف
                </div>
              ) : (
                <div className="space-y-2">
                  {gridUnits.map((unit) => {
                    const isSelected = selectedUnit?.unit_id === unit.unit_id
                    return (
                      <button
                        key={unit.unit_id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedUnit(unit)}
                        onDoubleClick={() => handleRowDoubleClick(unit)}
                        className={`w-full rounded-xl border p-3 text-right transition ${isSelected ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-slate-50"}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate font-bold text-slate-900">{unit.unit_name}</span>
                          <span className={`h-5 w-5 shrink-0 rounded-full border ${isSelected ? "border-emerald-600 bg-emerald-600" : "border-slate-300 bg-white"}`}>
                            {isSelected && <Check className="h-full w-full p-0.5 text-white" />}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-200/80 pt-2 text-xs">
                          <span className="text-slate-500">السعر</span><span className="text-left font-semibold tabular-nums" dir="ltr">{Number(unit.price || 0).toLocaleString("en-US")}</span>
                          <span className="text-slate-500">باركود</span><span className="truncate text-left font-mono" dir="ltr">{unit.barcode || "—"}</span>
                          <span className="text-slate-500">العلاقة بالرئيسية</span><span className="text-left font-semibold tabular-nums" dir="ltr">{Number(unit.to_main_qnty || 0).toLocaleString("en-US")}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="hidden h-full md:block">
              <DataGridView
                ref={gridRef}
                dataSource={gridUnits}
                containerStyle={{ height: "100%" }}
                scheme={{
                  isReport: true,
                  columns: [
                    { header: "الوحدة", name: "unit_name", width: "*", isReadOnly: true },
                    { header: "السعر", name: "price", width: 120, isReadOnly: true },
                    { header: "باركود", name: "barcode", width: 180, isReadOnly: true },
                    { header: "العلاقة بالرئيسية", name: "to_main_qnty", width: 120, isReadOnly: true },
                  ],
                }}
                selectionChanged={handleSelectionChange}
                onRowDoubleClick={(unit: Unit) => handleRowDoubleClick(unit)}
              />
            </div>
          </div>
        </main>

        <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-w-0 text-xs text-slate-500 sm:text-sm">
            {selectedUnit ? <span className="block truncate"><span className="font-semibold text-slate-700">الوحدة المحددة:</span> {selectedUnit.unit_name}</span> : <span>لم يتم تحديد وحدة</span>}
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              className="!m-0 !min-h-10 !flex-1 !rounded-xl !border-0 !bg-emerald-700 !px-6 !font-bold !text-white hover:!bg-emerald-800 disabled:!opacity-50 sm:!flex-none"
              disabled={!selectedUnit}
              onClick={() => {
                if (!selectedUnit) return;
                onSelect({ product, selected_unit: selectedUnit });
                onClose();
              }}
            >
              <Check className="ml-2 h-4 w-4" /> موافق
            </Button>

            <Button variant="outline" className="!m-0 !min-h-10 !flex-1 !rounded-xl !border-slate-300 !bg-white !px-6 !font-semibold !text-slate-700 hover:!bg-slate-100 sm:!flex-none" onClick={onClose}>إغلاق</Button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default UnitsSearchPopup;
