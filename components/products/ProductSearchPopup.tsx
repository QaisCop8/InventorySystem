"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DataGridView from "../common/DataGridView";
import MultiSelect from "../common/MultiSelect";
import * as wjGrid from "@grapecity/wijmo.grid";
import { useTranslation } from 'react-i18next';
import { Plus, X } from "lucide-react";
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
  product_image?: string | null;
  image_url?: string | null;
  display_image?: string | null;
  attributes?: Array<{ name: string; values: string[]; value_images?: Record<string, string | null> }>;
  selected_attributes?: Record<string, string>;
  attribute_summary?: string;
  attributes_display?: string;
  _variant_key?: string;
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

const productImageCellTemplate = (cell: any) => {
  const product = cell?.row?.dataItem as Product
  const image = product?.display_image || product?.product_image || product?.image_url
  return image
    ? <img src={image} alt={product?.product_name || ""} className="mx-auto h-10 w-10 rounded-lg border object-cover" />
    : <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border bg-slate-50 text-[10px] text-slate-400">لا صورة</div>
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
  const [attributeError, setAttributeError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
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
        if (!cancelled) {
          // reset any previous selection state when opening so stale selections do not
          // persist across open/close cycles (causes confusing UI and race conditions)
          const normalized = Array.isArray(data)
            ? data.flatMap((p: any) => {
                const attributes = (Array.isArray(p.attributes) ? p.attributes : []).filter((attribute: any) => attribute?.name && Array.isArray(attribute?.values) && attribute.values.length > 0)
                if (attributes.length === 0) return [{ ...p, attributes: [], attributes_display: "", _variant_key: `${p.id}:default`, selected: false, selected_unit: p.selected_unit || null }]
                const combinations = attributes.reduce<Record<string, string>[]>((items: Record<string, string>[], attribute: any) => items.flatMap((item) => attribute.values.map((value: string) => ({ ...item, [attribute.name]: value }))), [{}])
                return combinations.map((selection: Record<string, string>, index: number) => {
                  const summary = attributes.map((attribute: any) => `${attribute.name}: ${selection[attribute.name]}`).join("، ")
                  const variantImage = attributes.map((attribute: any) => attribute.value_images?.[selection[attribute.name]]).find(Boolean)
                  return { ...p, attributes, selected_attributes: selection, attribute_summary: summary, attributes_display: summary, display_image: variantImage || p.product_image || p.image_url || null, _variant_key: `${p.id}:${index}:${summary}`, selected: false, selected_unit: p.selected_unit || null }
                })
              })
            : [];
          setProducts(normalized);
          setSelectedProduct(null);
        }
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
    let focusAttemptCancelled = false
    const tryFocus = () => {
      if (focusAttemptCancelled) return
      if (window.matchMedia("(max-width: 639px)").matches) return
      const targetRef = (searchText || !searchNameRef.current) ? searchNameRef : searchNameRef
      if (targetRef.current) {
        try {
          targetRef.current.focus()
        } catch {
          // ignore
        }
        return
      }
      // retry a few times in case focus is blocked by other modal setup
      window.setTimeout(tryFocus, 80)
    }
    tryFocus()
    // WebSocket is useful in development (local i18n change server), but in production
    // creating a socket to localhost can fail and produce unhandled exceptions in the
    // client. Guard it: only attempt when running on localhost and wrap in try/catch.
    try {
      if (typeof window !== "undefined" && window.location?.hostname === "localhost") {
        try {
          ws.current = new WebSocket("ws://localhost:33333/ws");
          ws.current.onopen = () => {
            try {
              ws.current?.send(JSON.stringify({ type: "changeLang", language: "1" }));
            } catch (err) {
              console.warn("ws send failed", err);
            }
          };
          ws.current.onerror = (ev) => {
            console.warn("ProductSearchPopup websocket error:", ev);
          };
        } catch (err) {
          console.warn("Failed to initialize websocket in ProductSearchPopup:", err);
          ws.current = null;
        }
      }
    } catch (err) {
      console.warn("WS guard failed:", err);
    }
    return () => {
      cancelled = true;
      focusAttemptCancelled = true
      if (ws.current) ws.current.close();
    };
  }, [visible, priceCategoryId, selectedTypes, searchText, refreshVersion]);

  useEffect(() => {
    if (!visible) return;
    const refreshAfterReturn = () => setRefreshVersion((value) => value + 1);
    window.addEventListener("focus", refreshAfterReturn);
    return () => window.removeEventListener("focus", refreshAfterReturn);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const nextTypes = Array.isArray(productTypes) && productTypes.length > 0
      ? Array.from(new Set(productTypes))
      : [1, 2]
    setSelectedTypes((current) => current.length === nextTypes.length && current.every((value, index) => value === nextTypes[index]) ? current : nextTypes);
  }, [visible, productTypes]);

  // -----------------------
  // Products grid scheme
  // -----------------------
  const productScheme = useMemo(() => ({
    name: "ProductsScheme",
    columns: [
      { header: "✅", name: "selected", width: 50, isReadOnly: false, visible: ShowSelect },
      { header: "صورة الصنف", name: "display_image", width: 90, minWidth: 76, isReadOnly: true, align: "center", body: productImageCellTemplate },
      { header: "رقم الصنف", name: "product_code", width: 120, isReadOnly: true },
      { header: "اسم الصنف", name: "product_name", width: "*", isReadOnly: true,minWidth: 200 },
      { header: "الخصائص", name: "attributes_display", width: 280, minWidth: 180, isReadOnly: true },
      { header: "الوحدة", name: "first_unit", width: 80, isReadOnly: true },
      { header: "السعر", name: "first_price", width: 80, isReadOnly: true },
      { header: "باركود", name: "first_barcode", width: 150, isReadOnly: true },
    ]
  }), [ShowSelect]);

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

  const finishOrConfigureProduct = useCallback((product: Product) => {
    const attributes = Array.isArray(product.attributes) ? product.attributes.filter((attribute) => attribute.name && attribute.values?.length) : [];
    if (attributes.length > 0 && !product.selected_attributes) {
      setAttributeError("اختر صف تركيبة من عمود الخصائص")
      return;
    }
    const name = product.attribute_summary ? `${product.product_name} (${product.attribute_summary})` : product.product_name
    onSelect([{ ...product, product_name: name }]);
    onClose();
  }, [onSelect, onClose]);

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
      prev.map(p => p._variant_key === product._variant_key ? updatedProduct : p)
    );

    finishOrConfigureProduct(updatedProduct);
  }, [finishOrConfigureProduct, priceCategoryId]);
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
      prev.map(p => p._variant_key === selectedProduct._variant_key ? { ...p, selected_unit: unit, selected: true } : p)
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
    finishOrConfigureProduct(productWithUnit);
  }, [selectedProduct, finishOrConfigureProduct]);
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

    onSelect(selectedItems.map((product) => ({ ...product, product_name: product.attribute_summary ? `${product.product_name} (${product.attribute_summary})` : product.product_name })));
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
      <div className="relative flex h-[100dvh] max-h-[100dvh] w-full max-w-[1400px] flex-col overflow-y-auto rounded-none border-0 border-slate-200 bg-white p-3 shadow-2xl overscroll-contain sm:h-auto sm:max-h-[92dvh] sm:overflow-hidden sm:rounded-3xl sm:border sm:p-5" dir="rtl">
        {attributeError && <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm font-semibold text-red-700">{attributeError}</div>}
        <div className="flex shrink-0 items-center justify-between gap-3">
          <h3 className="text-xl font-semibold text-slate-900">{title || "بحث الأصناف"}</h3>
          <div className="flex items-center gap-2">
          <Button type="button" onClick={() => window.open("/products?new=1", "_blank", "noopener,noreferrer")} className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"><Plus className="h-4 w-4"/>إضافة صنف</Button>
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
