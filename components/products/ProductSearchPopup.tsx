"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DataGridView from "../common/DataGridView";
import MultiSelect from "../common/MultiSelect";
import * as wjGrid from "@grapecity/wijmo.grid";
import { useTranslation } from 'react-i18next';
import { X } from "lucide-react";
// -----------------------
// Types
// -----------------------
interface Unit {
  unit_id: string;
  unit_name: string;
  price: number;
  barcode: string;
}

interface Product {
  id: number;
  product_code: string;
  product_name: string;
  first_unit: string;
  first_price: number;
  first_barcode: string;
  units?: Unit[];
  selected?: boolean;
  selected_unit?: Unit;
}

interface ProductSearchPopupProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (products: Product[]) => void;
  priceCategoryId: number;
  ShowSelect: boolean;
  searchText: string;
  productTypes?: number[];
  title?: string;
}

const ProductSearchPopup: React.FC<ProductSearchPopupProps> = ({ visible, onClose, onSelect, priceCategoryId, ShowSelect, searchText, productTypes, title }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchCode, setSearchCode] = useState("");
  const [searchName, setSearchName] = useState("");
  const [searchPrice, setSearchPrice] = useState("");
  const [searchBarcode, setSearchBarcode] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<number[]>(() =>
    Array.isArray(productTypes) && productTypes.length > 0
      ? Array.from(new Set(productTypes))
      : [1, 2]
  );
  // نوع ثابت مفروض (productTypes بعنصر واحد) يجب أن يبقى متزامناً حتى لو تغيّر بين فتحة وأخرى لنفس
  // مثيل هذه النافذة (مثال: مكوّن واحد يُستدعى مرة لصنف ومرة لخدمة) — بلا هذا التزامن يبقى النوع
  // القديم محفوظاً في الحالة (state) فيعرض نتائج من النوع الخطأ.
  useEffect(() => {
    if (Array.isArray(productTypes) && productTypes.length > 0) {
      setSelectedTypes(Array.from(new Set(productTypes)));
    }
  }, [productTypes]);
  const searchCodeRef = useRef<HTMLInputElement>(null);
  const searchNameRef = useRef<HTMLInputElement>(null);
  const searchPriceRef = useRef<HTMLInputElement>(null);
  const searchBarcodeRef = useRef<HTMLInputElement>(null);

  const gridProductsRef = useRef<wjGrid.FlexGrid | null>(null);
  const gridUnitsRef = useRef<wjGrid.FlexGrid | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const searchTextRef = useRef<HTMLInputElement>(null);
  const ws = useRef<WebSocket | null>(null);
  const { t, i18n } = useTranslation();
  // -----------------------
  // Fetch products when popup opens
  // -----------------------
  useEffect(() => {
    if (!visible) return;

    let cancelled = false;

    const fetchProducts = async () => {
      try {
        let url = `/api/inventory/products?priceCategoryId=${priceCategoryId}&activeOnly=true`;
        if (selectedTypes.length === 1) {
          url += selectedTypes[0] === 2 ? `&type=services` : `&type=products`;
        }
        const res = await fetch(url);
        const data = await res.json();
        if (!cancelled) setProducts(data || []);
      } catch (err) {
        console.error("Failed to fetch products:", err);
        if (!cancelled) setProducts([]);
      }
    };

    fetchProducts();
    setSearchCode("");
    setSearchName(searchText || "");
    setSearchBarcode("");
    setSearchPrice("");
    const focusTimer = window.setTimeout(() => {
      if (!window.matchMedia("(max-width: 639px)").matches) searchNameRef.current?.focus();
    }, 100);
    ws.current = new WebSocket("ws://localhost:33333/ws");
    ws.current.onopen = () => {
      ws.current?.send(JSON.stringify({ type: "changeLang", language: "1" }));
    };
    return () => {
      cancelled = true;
      window.clearTimeout(focusTimer);
      if (ws.current) ws.current.close();
    };
  }, [visible, priceCategoryId, selectedTypes, searchText]);

  useEffect(() => {
    if (!visible) return;
    setSelectedTypes(
      Array.isArray(productTypes) && productTypes.length > 0
        ? Array.from(new Set(productTypes))
        : [1, 2]
    );
  }, [visible, productTypes]);

  // -----------------------
  // Products grid scheme
  // -----------------------
  const productScheme = useMemo(() => ({
    name: "ProductsScheme",
    columns: [
      { header: "✅", name: "selected", width: 50, isReadOnly: false, visible: ShowSelect },
      { header: "رقم الصنف", name: "product_code", width: 120, isReadOnly: true },
      { header: "اسم الصنف", name: "product_name", width: "*", isReadOnly: true,minWidth: 200 },
      { header: "الوحدة", name: "first_unit", width: 80, isReadOnly: true },
      { header: "السعر", name: "first_price", width: 80, isReadOnly: true },
      { header: "باركود", name: "first_barcode", width: 150, isReadOnly: true },
    ]
  }), []);

  // -----------------------
  // Units grid scheme
  // -----------------------
  const unitScheme = useMemo(() => ({
    columns: [
      { header: "الوحدة", name: "unit_name", width: "*", isReadOnly: true },
      { header: "سعر الوحدة", name: "price", width: 90, isReadOnly: true },
      { header: "باركود", name: "barcode", width: 150, isReadOnly: true },
    ]
  }), []);

  // -----------------------
  // Filtered products
  // -----------------------
  const searchWordsMatch = (text: string, searchQuery: string) => {
    const words = searchQuery
      .trim()
      .toLowerCase()
      .split(/\s+/);

    const normalizedText = text.toLowerCase();
    return words.every(word => normalizedText.includes(word));
  };



  const filteredProducts = useMemo(() => {
    return products.filter(p => {

      const matchCode =
        !searchCode ||
        p.product_code?.toLowerCase().includes(searchCode.toLowerCase());

      const matchName =
        !searchName ||
        searchWordsMatch(p.product_name || "", searchName);

      const matchPrice =
        !searchPrice ||
        String(p.first_price).includes(searchPrice);

      const matchBarcode =
        !searchBarcode ||
        p.first_barcode?.toLowerCase().includes(searchBarcode.toLowerCase());

      return matchCode && matchName && matchPrice && matchBarcode;

    });
  }, [products, searchCode, searchName, searchPrice, searchBarcode]);

  // -----------------------
  // Select product row
  // -----------------------
  const handleSelectProduct = useCallback((product: Product) => {
    setSelectedProduct(product);
  }, []);

  const handleProductDoubleClick = useCallback(async (product: Product) => {
    if (!product) return;
    // النقر المزدوج/Enter على صنف بلا مرور بشبكة الوحدات (selectionChanged) لا يحمل units أصلاً —
    // فتُجلَب هنا صراحة قبل onSelect، وإلا يصل المستدعي (unified-stock-voucher.tsx وغيره) بمصفوفة
    // وحدات فارغة فيظهر بعدها "لا توجد وحدات" عند فتح نافذة بحث الوحدة بالسطر.
    let units = product.units;
    if (!units || units.length === 0) {
      try {
        const response = await fetch(`/api/products/${product.id}/units?price_category_id=${priceCategoryId}`);
        units = response.ok ? await response.json() : [];
      } catch (err) {
        console.error("Error fetching units:", err);
        units = [];
      }
    }
    const selectedUnit = units?.[0];
    const updatedProduct: Product = { ...product, units, selected_unit: selectedUnit, selected: true };

    setProducts(prev =>
      prev.map(p => p.id === product.id ? updatedProduct : p)
    );

    onSelect([updatedProduct]);
    onClose();
  }, [onSelect, onClose, priceCategoryId]);
  // -----------------------
  // Fetch units when product selected
  // -----------------------
  const selectionChanged = useCallback(async (grid: wjGrid.FlexGrid) => {
    if (!grid) return;
    const rowIndex = grid.selection?.row ?? -1;
    if (rowIndex < 0) return;

    const item = grid.rows[rowIndex]?.dataItem as Product;
    if (!item) return;

    try {
      const response = await fetch(`/api/products/${item.id}/units?price_category_id=${priceCategoryId}`);
      const units: Unit[] = await response.json();
      setSelectedProduct({ ...item, units });
    } catch (err) {
      console.error("Error fetching units:", err);
      setSelectedProduct({ ...item, units: [] });
    }
  }, [priceCategoryId]);

  // -----------------------
  // Select unit for product
  // -----------------------
  const handleSelectUnit = useCallback((unit: Unit) => {
    if (!selectedProduct) return;

    setProducts(prev =>
      prev.map(p => p.id === selectedProduct.id ? { ...p, selected_unit: unit, selected: true } : p)
    );
    setSelectedProduct(prev => prev ? { ...prev, selected_unit: unit } : null);
  }, [selectedProduct]);

  const handleUnitRowDoubleClick = useCallback((unit: Unit) => {
    if (!selectedProduct || !unit) return;

    // Combine product info + selected unit
    const productWithUnit = {
      ...selectedProduct,       // all product fields
      selected_unit: unit,      // attach the double-clicked unit
      unit_name: unit.unit_name,
      unit_id: unit.unit_id,
      first_barcode: unit.barcode,  // override barcode
      first_price: unit.price,      // override price
    };

    // Pass it to parent and close popup
    onSelect([productWithUnit]);
    onClose();
  }, [selectedProduct, onSelect, onClose]);
  // -----------------------
  // Confirm selection
  // -----------------------
  const handleConfirm = () => {
    let selectedItems = products.filter(p => p.selected);

    // If no products are selected, pick the currently focused row in the grid
    if (selectedItems.length === 0 && selectedProduct) {
      selectedItems.push(selectedProduct);

    }

    if (selectedItems.length === 0) return; // nothing to select

    // Reset selection flags
    setProducts(prev => prev.map(p => ({ ...p, selected: false })));

    // Pass selected items to parent and close popup
    onSelect(selectedItems);
    onClose();
  };

  const focusFirstGridRow = () => {
    const grid = gridProductsRef.current;
    if (!grid) return;

    grid?.focus();
    grid.select(0, 0); // first row, first column
  };

  useEffect(() => {
  if (!visible) return;

  const handleKeyDown = (e: KeyboardEvent) => {
    const active = document.activeElement;

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();

      if (active === searchCodeRef.current) {
        searchNameRef.current?.focus();
      } else if (active === searchNameRef.current) {
        searchPriceRef.current?.focus();
      } else if (active === searchPriceRef.current) {
        searchBarcodeRef.current?.focus();
      } else if (active === searchBarcodeRef.current) {
        focusFirstGridRow(); // Focus first row of products grid
      }
    }

    if (e.key === "ArrowDown") {
      if (active === searchCodeRef.current ||
          active === searchNameRef.current ||
          active === searchPriceRef.current ||
          active === searchBarcodeRef.current) {
        focusFirstGridRow();
        e.preventDefault();
      }
    }
  };

  document.addEventListener("keydown", handleKeyDown, true);

  return () => {
    document.removeEventListener("keydown", handleKeyDown, true);
  };
}, [visible, onClose]);


  const onKeyDownGrid = async (grid: any, e: KeyboardEvent) => {
    // Make sure grid and selection exist
    // يُستدعى مرتين لكل ضغطة مفتاح فعلياً (onKeyDown ليس حدثاً مُوثَّقاً بـFlexGridInputs) — الاستدعاء
    // الثاني بمعطيات غير مكتملة، فيُطلِق قراءة e.keyCode على undefined استثناءً غير مُلتقَط بلا هذا الحارس.
    if (!grid || !grid.selection || !e || typeof e.keyCode === "undefined") return;
    const sel = grid.selection;
    const row = sel.row;

    if (e.keyCode === 13) {
      const rowIndex = grid.selection?.row ?? -1;
      if (rowIndex < 0) return;

      const item = grid.rows[rowIndex]?.dataItem as Product;
      // handleProductDoubleClick يجلب units بنفسه الآن إن لم تكن محمَّلة أصلاً — لا حاجة لجلبها هنا
      // بمعزل ثم تجاهل النتيجة (كان الخلل السابق: الجلب هنا لا يصل إطلاقاً لِـonSelect).
      await handleProductDoubleClick(item);
      e.preventDefault();

      return;
    }
  }
  if (!visible) return null;

  const responsiveGridStyle = { height: '100%', minHeight: 0, maxHeight: '100%' };
  return createPortal(
    <div
      // pointer-events-auto صريح ضروري هنا: هذه اللوحة تُركَّب عبر createPortal مباشرة إلى
      // document.body، خارج أي عنصر تتتبّعه Radix كـ"طبقة" (DismissableLayer). أي Dialog من Radix
      // مفتوح بنفس اللحظة (وهو الحال الافتراضي modal=true) يضبط pointerEvents="none" على body نفسه
      // ويُعيد تفعيلها فقط على عقدة الطبقة الخاصة به — لا على عناصر أخرى ملحقة بـbody كهذه، فتُصبح
      // كل عناصر هذه اللوحة غير قابلة للنقر بالكامل (فقط لوحة المفاتيح، كـEscape، تبقى تعمل) ما لم
      // تُفرَض pointer-events: auto صراحة هنا بمعزل عن أي وراثة من body.
      className="pointer-events-auto fixed inset-0 z-[100] flex items-stretch justify-center bg-black/40 p-0 sm:items-center sm:px-4 sm:py-6"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex h-[100dvh] max-h-[100dvh] w-full max-w-[1400px] flex-col overflow-y-auto rounded-none border-0 border-slate-200 bg-white p-3 shadow-2xl overscroll-contain sm:h-auto sm:max-h-[92dvh] sm:overflow-hidden sm:rounded-3xl sm:border sm:p-5" dir="rtl">
        <div className="flex shrink-0 items-center justify-between gap-3">
          <h3 className="text-xl font-semibold text-slate-900">{title || "بحث الأصناف"}</h3>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-10 w-10 shrink-0 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="mt-3 shrink-0 rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm sm:mt-4 sm:rounded-3xl sm:p-4">
          <div className="mb-3 text-right sm:mb-4">
            <p className="text-sm font-semibold text-slate-900">الفلاتر</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-[0.8fr_2fr_0.8fr_0.8fr_1fr]">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700 text-right">رقم الصنف</label>
              <Input
                ref={searchCodeRef}
                className="w-full"
                placeholder="رقم الصنف"
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700 text-right">اسم الصنف</label>
              <Input
                ref={searchNameRef}
                className="w-full"
                placeholder="اسم الصنف"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700 text-right">السعر</label>
              <Input
                ref={searchPriceRef}
                className="w-full"
                placeholder="السعر"
                value={searchPrice}
                onChange={(e) => setSearchPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700 text-right">الباركود</label>
              <Input
                ref={searchBarcodeRef}
                className="w-full"
                placeholder="الباركود"
                value={searchBarcode}
                onChange={(e) => setSearchBarcode(e.target.value)}
              />
            </div>
            <div className="space-y-1 invoice-currency-dropdown-wrap">
              <label className="block text-xs font-semibold text-slate-700 text-right">النوع</label>
              {Array.isArray(productTypes) && productTypes.length === 1 ? (
                // نوع ثابت مفروض من الشاشة المستدعية (مثال: نموذج الصنف يفتح البحث عن أصناف فقط، أو
                // نموذج الخدمة يفتح البحث عن خدمات فقط) — لا يُعرض منتقي قابل للتعديل هنا كي لا يتمكن
                // المستخدم من تحويل النتائج لتشمل النوع الآخر (صنف يختار خدمة، أو العكس) عن طريق الخطأ.
                <div className="w-full h-10 flex items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-600">
                  {productTypes[0] === 2 ? "الخدمات" : "الأصناف"}
                </div>
              ) : (
                <MultiSelect
                  inputId="productTypeFilter"
                  value={selectedTypes}
                  options={[
                    { label: "الأصناف", value: 1 },
                    { label: "الخدمات", value: 2 },
                  ]}
                  optionLabel="label"
                  optionValue="value"
                  placeholder="اختر النوع"
                  showFilter={true}
                  showCheck={true}
                  showMultiSelect={true}
                  className="w-full"
                  panelClassName="invoice-currency-dropdown-panel invoice-currency-dropdown-panel-left"
                  appendTo="self"
                  // virtualScroll مفروض افتراضياً بمكوّن MultiSelect المشترك (لا يمكن تعطيله إلا
                  // بتمريره كـprop يتغلّب على القيمة الافتراضية عبر انتشار this.props) — لا فائدة منه
                  // لقائمتين ثابتتين فقط، وتفاعله مع panelHeaderTemplate المخصّص (خانة "تحديد الكل")
                  // هو المرشّح الأقرب لاستثناء JS غير مُلتقَط عند فتح هذه القائمة تحديداً هنا (لوحة
                  // بحث الأصناف هي المكان الوحيد بالمشروع الذي يعرض هذا الفلتر التفاعلي بدل تثبيت نوع
                  // واحد عبر productTypes).
                  virtualScroll={false}
                  onChange={(e: any) => {
                    const values = Array.isArray(e.value) ? e.value.map(Number) : [];
                    setSelectedTypes(values.length > 0 ? values : [1, 2]);
                  }}
                />
              )}
            </div>
          </div>
        </div>


        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-3 sm:gap-4 sm:overflow-hidden">
          <div className="shrink-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-3xl">
            <h4 className="text-sm font-semibold mb-3 text-slate-700 text-right">نتائج البحث</h4>
            <div className="h-[32dvh] min-h-[220px] w-full overflow-hidden sm:h-[24vh] sm:min-h-[180px]">
              <DataGridView
                style={responsiveGridStyle}
                containerStyle={responsiveGridStyle}
                ref={gridProductsRef}
                dataSource={filteredProducts}
                scheme={productScheme}
                onRowDoubleClick={handleProductDoubleClick}
                selectionChanged={selectionChanged}
                onKeyDown={(s: any, e: any) => onKeyDownGrid(s, e)}
                keyActionEnter="None"
                dontConvertToCards={true}
                showContextMenu={false}
              />
            </div>
          </div>

          <div className="shrink-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-3xl">
            <h4 className="text-sm font-semibold mb-3 text-slate-700 text-right">وحدات الصنف</h4>
            <div className="text-sm text-slate-500 mb-3 text-right">{selectedProduct?.product_name || "لا يوجد صنف محدد"}</div>
            <div className="h-[24dvh] min-h-[180px] w-full overflow-hidden sm:h-[12vh] sm:min-h-[100px]">
              <DataGridView
                innerRef={gridUnitsRef}
                style={responsiveGridStyle}
                containerStyle={responsiveGridStyle}
                dataSource={selectedProduct?.units || []}
                scheme={unitScheme}
                onRowDoubleClick={handleUnitRowDoubleClick}
              />
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 z-10 mt-3 flex shrink-0 gap-3 border-t border-slate-200 bg-white/95 py-3 backdrop-blur sm:static sm:mt-5 sm:justify-center sm:border-0 sm:bg-transparent sm:py-0">
          <Button className="erp-btn-primary search-button min-w-0 flex-1 sm:min-w-[120px] sm:flex-none" onClick={handleConfirm}>
            موافق
          </Button>
          <Button variant="outline" onClick={onClose} className="search-button min-w-0 flex-1 sm:min-w-[120px] sm:flex-none">
            إغلاق
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ProductSearchPopup;
