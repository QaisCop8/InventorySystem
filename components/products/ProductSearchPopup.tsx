"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReportMultiChoice, type ReportOption } from "@/components/reports/account-statement-report";

const PRODUCT_TYPE_OPTIONS: ReportOption[] = [
  { id: 1, name: "الأصناف" },
  { id: 2, name: "الخدمات" },
];
import { useTranslation } from 'react-i18next';
import { Boxes, Package, Plus, RotateCcw } from "lucide-react";
import {
  SearchDialogHeader,
  SearchFilterField,
  SearchResultsTable,
  searchInputClassName,
  useEnterAsTabFilters,
  type SearchColumn,
  type SearchResultsTableHandle,
} from "@/components/common/search-dialog-kit";
// -----------------------
// Types
// -----------------------
interface Unit {
  unit_id: string;
  unit_name: string;
  price: number;
  barcode: string;
  primary_barcode?: string;
}

interface Product {
  id: number;
  product_code: string;
  product_name: string;
  first_unit: string;
  first_price: number;
  first_barcode: string;
  barcode?: string | null;
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
  visible?: boolean;
  open?: boolean;
  onClose: () => void;
  onSelect: (products: Product[]) => void;
  priceCategoryId?: number;
  ShowSelect?: boolean;
  searchText?: string;
  productTypes?: number[];
  title?: string;
  selectBaseProduct?: boolean;
}

const productThumb = (image?: string | null, alt = "") =>
  image
    ? <img src={image} alt={alt} className="mx-auto h-7 w-7 rounded-md border object-cover" />
    : <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-300"><Package className="h-3.5 w-3.5" /></div>

const ProductSearchPopup: React.FC<ProductSearchPopupProps> = ({ visible: visibleProp, open, onClose, onSelect, priceCategoryId = 0, ShowSelect = true, searchText = "", productTypes, title, selectBaseProduct = false }) => {
  const visible = visibleProp ?? open ?? false;
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
  const filterContainerRef = useRef<HTMLDivElement>(null);

  const resultsRef = useRef<SearchResultsTableHandle | null>(null);
  // عنصر النافذة نفسها — حاوية قائمة "النوع" المنسدلة (ReportMultiChoice) كي تظهر فوق اللوحة لا خلفها
  const [dialogElement, setDialogElement] = useState<HTMLDivElement | null>(null);
  const unitsTableRef = useRef<SearchResultsTableHandle | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedAttributeKeysByProduct, setSelectedAttributeKeysByProduct] = useState<Record<string, Set<string>>>({});
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
            ? data.map((p: any) => ({
                ...p,
                attributes: (Array.isArray(p.attributes) ? p.attributes : []).filter((attribute: any) => attribute?.name && Array.isArray(attribute?.values) && attribute.values.length > 0),
                attributes_display: "",
                _variant_key: `${p.id}:default`,
                selected: false,
                selected_unit: p.selected_unit || null,
              }))
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
  const selectedAttributeRows = useMemo(() => {
    const attributes = Array.isArray(selectedProduct?.attributes) ? selectedProduct.attributes : []
    const productKey = selectedProduct?._variant_key || (selectedProduct ? String(selectedProduct.id) : "")
    const selectedAttributeKeys = selectedAttributeKeysByProduct[productKey] || new Set<string>()
    return attributes.flatMap((attribute: any) => (Array.isArray(attribute.values) ? attribute.values : []).map((value: string) => ({
      attribute_name: attribute.name,
      value_name: value,
      attribute_key: `${attribute.name}::${value}`,
      barcode: selectedProduct?.first_barcode || (selectedProduct as any)?.barcode || "",
      selected: selectedAttributeKeys.has(`${attribute.name}::${value}`),
      image_url: attribute.value_images?.[value] || selectedProduct?.product_image || selectedProduct?.image_url || null,
    })))
  }, [selectedProduct, selectedAttributeKeysByProduct])

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
        String(p.first_price ?? (p as any).price ?? "").includes(searchPrice);

      const matchBarcode =
        !searchBarcode ||
        [p.first_barcode, (p as any).barcode, ...(p.units || []).map((unit: Unit) => unit.barcode)].filter(Boolean).some((barcode) => String(barcode).toLowerCase().includes(searchBarcode.toLowerCase()));

      return matchCode && matchName && matchPrice && matchBarcode;

    });
  }, [products, searchCode, searchName, searchPrice, searchBarcode]);
  const visibleProducts = useMemo(() => filteredProducts.slice(0, 200), [filteredProducts]);

  const clearFilters = useCallback(() => {
    setSearchCode("");
    setSearchName("");
    setSearchPrice("");
    setSearchBarcode("");
    setSelectedTypes(Array.isArray(productTypes) && productTypes.length > 0 ? Array.from(new Set(productTypes)) : [1, 2]);
    searchNameRef.current?.focus();
  }, [productTypes]);

  // -----------------------
  // Select product row
  // -----------------------
  const handleSelectProduct = useCallback((product: Product) => {
    setSelectedProduct(product);
  }, []);

  const getProductSelectionKey = (product: Product) => product._variant_key || String(product.id);

  // تأشير/إلغاء تأشير قيمة متغير للصنف المحدد (خانة الاختيار أو Space في جدول المتغيرات)
  const toggleAttributeKey = useCallback((attributeKey: string) => {
    if (!selectedProduct || !attributeKey) return;
    const productKey = getProductSelectionKey(selectedProduct);
    setSelectedAttributeKeysByProduct((current) => {
      const next = new Set(current[productKey] || []);
      if (next.has(attributeKey)) next.delete(attributeKey);
      else next.add(attributeKey);
      return { ...current, [productKey]: next };
    });
  }, [selectedProduct]);

  const buildSelectedVariants = useCallback((product: Product, rows: typeof selectedAttributeRows) => {
    const baseName = product.product_name.replace(/\s*\([^)]*\)\s*$/, "");
    return rows.map((row) => ({
      ...product,
      product_name: `${baseName} (${row.attribute_name}: ${row.value_name})`,
      selected_attributes: { ...(product.selected_attributes || {}), [row.attribute_name]: row.value_name },
      attribute_summary: `${row.attribute_name}: ${row.value_name}`,
      selected: true,
    }));
  }, []);

  const finishOrConfigureProduct = useCallback((product: Product) => {
    if (selectBaseProduct) {
      const baseName = product.product_name.replace(/\s*\([^)]*\)\s*$/, "").trim();
      onSelect([{ ...product, product_name: baseName, selected_attributes: undefined, attribute_summary: undefined }]);
      onClose();
      return;
    }
    const attributes = Array.isArray(product.attributes) ? product.attributes.filter((attribute) => attribute.name && attribute.values?.length) : [];
    if (attributes.length > 0 && !product.selected_attributes) {
      setSelectedProduct(product);
      setTimeout(() => unitsTableRef.current?.focusFirstRow(), 0);
      return;
    }
    const name = product.attribute_summary ? `${product.product_name} (${product.attribute_summary})` : product.product_name
    onSelect([{ ...product, product_name: name }]);
    onClose();
  }, [onSelect, onClose, selectBaseProduct]);

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

    if (selectBaseProduct) {
      finishOrConfigureProduct(updatedProduct);
      return;
    }

    const attributes = Array.isArray(updatedProduct.attributes)
      ? updatedProduct.attributes.filter((attribute) => attribute.name && attribute.values?.length)
      : [];
    if (attributes.length > 0 && !updatedProduct.selected_attributes) {
      const firstAttribute = attributes[0];
      const firstValue = firstAttribute.values[0];
      const [firstVariant] = buildSelectedVariants(updatedProduct, [{
        attribute_name: firstAttribute.name,
        value_name: firstValue,
        attribute_key: `${firstAttribute.name}::${firstValue}`,
        selected: true,
        image_url: firstAttribute.value_images?.[firstValue] || updatedProduct.product_image || updatedProduct.image_url || null,
      }]);
      onSelect([firstVariant]);
      onClose();
      return;
    }

    finishOrConfigureProduct(updatedProduct);
  }, [finishOrConfigureProduct, priceCategoryId, buildSelectedVariants, onSelect, onClose, selectBaseProduct]);
  // -----------------------
  // Fetch units when product selected
  // -----------------------

  const handleMobileProductSelect = useCallback(async (product: Product) => {
    setSelectedProduct(product);
    if (product.units?.length) return;
    try {
      const response = await fetch(`/api/products/${product.id}/units?price_category_id=${priceCategoryId}`);
      const units: Unit[] = response.ok ? await response.json() : [];
      setSelectedProduct({ ...product, units });
    } catch {
      setSelectedProduct({ ...product, units: [] });
    }
  }, [priceCategoryId]);

  const toggleProductChecked = useCallback((event: React.SyntheticEvent, product: Product) => {
    event.stopPropagation();
    setProducts((current) => current.map((item) => item._variant_key === product._variant_key ? { ...item, selected: !item.selected } : item));
  }, []);

  // السطر النشط في جدول النتائج (نقر/أسهم) ⇐ يُعرض الصنف ووحداته باللوحة الجانبية. الجلب مؤجَّل قليلاً
  // كي لا يُطلَق طلب لكل سطر يُمَرّ عليه بالأسهم، ويُتجاهَل الرد إن انتقل المستخدم لسطر آخر.
  const unitsLoadTimerRef = useRef<number | null>(null);
  const activeProductKeyRef = useRef<string>("");
  const handleActiveProductChange = useCallback((product: Product | null) => {
    if (unitsLoadTimerRef.current) window.clearTimeout(unitsLoadTimerRef.current);
    if (!product) return;
    const key = getProductSelectionKey(product);
    activeProductKeyRef.current = key;
    setSelectedProduct((current) => (current && getProductSelectionKey(current) === key ? current : product));
    if (product.units?.length) return;
    unitsLoadTimerRef.current = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/products/${product.id}/units?price_category_id=${priceCategoryId}`);
        const units: Unit[] = response.ok ? await response.json() : [];
        if (activeProductKeyRef.current === key) setSelectedProduct({ ...product, units });
      } catch {
        if (activeProductKeyRef.current === key) setSelectedProduct({ ...product, units: [] });
      }
    }, 150);
  }, [priceCategoryId]);

  useEffect(() => () => {
    if (unitsLoadTimerRef.current) window.clearTimeout(unitsLoadTimerRef.current);
  }, []);

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

    const attributeRow = unit as Unit & { attribute_key?: string; attribute_name?: string; value_name?: string };
    if (attributeRow.attribute_key && attributeRow.attribute_name && attributeRow.value_name) {
      const [variant] = buildSelectedVariants(selectedProduct, [attributeRow as typeof selectedAttributeRows[number]]);
      onSelect([variant]);
      onClose();
      return;
    }

    // Combine product info + selected unit
    const productWithUnit = {
      ...selectedProduct,       // all product fields
      selected_unit: unit,      // attach the double-clicked unit
      unit_name: unit.unit_name,
      unit_id: unit.unit_id,
      first_barcode: unit.primary_barcode || unit.barcode,  // use one barcode for transaction persistence
      first_price: unit.price,      // override price
    };

    // Pass it to parent and close popup
    finishOrConfigureProduct(productWithUnit);
  }, [selectedProduct, buildSelectedVariants, onSelect, onClose, finishOrConfigureProduct]);

  const handleAttributeDoubleClick = useCallback((row: typeof selectedAttributeRows[number]) => {
    if (!selectedProduct || !row) return;
    const [variant] = buildSelectedVariants(selectedProduct, [row]);
    if (!variant) return;
    onSelect([variant]);
    onClose();
  }, [selectedProduct, buildSelectedVariants, onSelect, onClose]);
  // -----------------------
  // Confirm selection
  // -----------------------
  const handleConfirm = () => {
    const checkedProducts = products.filter((product) => product.selected);
    const selectedProducts = checkedProducts.length > 0 ? checkedProducts : (selectedProduct ? [selectedProduct] : []);
    const pendingAttributeProduct = !selectBaseProduct && selectedProducts.find((product) => {
      if (!product || !Array.isArray(product.attributes) || product.attributes.length === 0) return false;
      const selectedKeys = selectedAttributeKeysByProduct[getProductSelectionKey(product)] || new Set<string>();
      return !product.selected_attributes && selectedKeys.size === 0;
    });
    if (pendingAttributeProduct) {
      setSelectedProduct(pendingAttributeProduct);
      setTimeout(() => unitsTableRef.current?.focusFirstRow(), 0);
      return;
    }

    if (selectedProducts.length === 0) return;

    const selectedItems = selectBaseProduct ? selectedProducts.map((product) => ({
      ...product,
      product_name: product.product_name.replace(/\s*\([^)]*\)\s*$/, "").trim(),
      selected_attributes: undefined,
      attribute_summary: undefined,
    })) : selectedProducts.flatMap((product) => {
      const selectedKeys = selectedAttributeKeysByProduct[getProductSelectionKey(product)] || new Set<string>();
      const attributes = Array.isArray(product.attributes) ? product.attributes.filter((attribute) => attribute.name && attribute.values?.length) : [];
      if (attributes.length === 0 || product.selected_attributes) return [product];
      const rows = attributes.flatMap((attribute) => attribute.values.map((value) => ({
        attribute_name: attribute.name,
        value_name: value,
        attribute_key: `${attribute.name}::${value}`,
        selected: selectedKeys.has(`${attribute.name}::${value}`),
        image_url: attribute.value_images?.[value] || product.product_image || product.image_url || null,
      }))).filter((row) => selectedKeys.has(row.attribute_key));
      return buildSelectedVariants(product, rows);
    });

    if (selectedItems.length === 0) return;

    // Reset selection flags
    setProducts(prev => prev.map(p => ({ ...p, selected: false })));

    onSelect(selectedItems);
    onClose();
  };

  // آخر فلتر (Enter) أو السهم للأسفل من أي فلتر ⇐ أول سطر في جدول النتائج
  const focusFirstGridRow = useCallback(() => {
    resultsRef.current?.focusFirstRow();
  }, []);

  useEnterAsTabFilters(visible, filterContainerRef, focusFirstGridRow);

  useEffect(() => {
    if (!visible) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape داخل قائمة منسدلة مفتوحة يغلقها هي فقط
      if ((e.target as HTMLElement | null)?.closest?.(".p-dropdown-panel, .p-multiselect-panel")) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", handleEscape, true);
    return () => document.removeEventListener("keydown", handleEscape, true);
  }, [visible, onClose]);

  const resultColumns = useMemo<SearchColumn<Product>[]>(() => [
    ...(ShowSelect ? [{
      key: "selected",
      header: "",
      width: "40px",
      align: "center" as const,
      render: (product: Product) => (
        <input
          type="checkbox"
          checked={!!product.selected}
          aria-label={`اختيار ${product.product_name}`}
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onChange={(event) => toggleProductChecked(event, product)}
          className="h-4 w-4 cursor-pointer accent-emerald-600"
        />
      ),
    }] : []),
    { key: "image", header: "", width: "44px", align: "center", render: (product) => productThumb(product.display_image || product.product_image || product.image_url, product.product_name) },
    { key: "product_code", header: "رقم الصنف", width: "120px", className: "font-mono text-xs text-slate-600" },
    { key: "product_name", header: "اسم الصنف", className: "max-w-[340px] truncate font-semibold text-slate-800" },
    { key: "first_unit", header: "الوحدة", width: "80px", className: "text-slate-600" },
    { key: "first_price", header: "السعر", width: "90px", align: "end", className: "tabular-nums font-semibold", render: (product) => Number(product.first_price ?? 0).toLocaleString() },
    { key: "first_barcode", header: "الباركود", width: "140px", className: "font-mono text-xs text-slate-500" },
  ], [ShowSelect, toggleProductChecked]);

  type AttributeRow = (typeof selectedAttributeRows)[number];

  const attributeColumns = useMemo<SearchColumn<AttributeRow>[]>(() => [
    ...(ShowSelect ? [{
      key: "selected",
      header: "",
      width: "36px",
      align: "center" as const,
      render: (row: AttributeRow) => (
        <input
          type="checkbox"
          checked={row.selected}
          aria-label="اختيار القيمة"
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onChange={() => toggleAttributeKey(row.attribute_key)}
          className="h-4 w-4 cursor-pointer accent-emerald-600"
        />
      ),
    }] : []),
    { key: "attribute_name", header: "المتغير", className: "font-semibold text-slate-700" },
    { key: "value_name", header: "القيمة" },
    { key: "image_url", header: "", width: "40px", align: "center", render: (row) => productThumb(row.image_url) },
  ], [ShowSelect, toggleAttributeKey]);

  const unitColumns = useMemo<SearchColumn<Unit>[]>(() => [
    { key: "unit_name", header: "الوحدة", className: "font-semibold text-slate-700" },
    { key: "price", header: "السعر", width: "80px", align: "end", className: "tabular-nums", render: (unit) => Number(unit.price ?? 0).toLocaleString() },
    { key: "barcode", header: "الباركود", className: "font-mono text-xs text-slate-500", render: (unit) => unit.barcode || "—" },
  ], []);

  if (!visible) return null;

  const checkedCount = products.reduce((count, product) => count + (product.selected ? 1 : 0), 0);
  const showingAttributes = selectedAttributeRows.length > 0;

  return createPortal(
    <div
      // pointer-events-auto صريح ضروري: اللوحة تُركَّب عبر createPortal إلى document.body خارج طبقات
      // Radix — أي Dialog مفتوح من Radix يضبط pointerEvents="none" على body فتُصبح اللوحة غير قابلة للنقر.
      className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:p-4"
    >
      <div
        ref={setDialogElement}
        className="flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-50 shadow-2xl sm:h-[min(84dvh,780px)] sm:max-w-[1320px] sm:rounded-2xl sm:ring-1 sm:ring-slate-900/10"
        dir="rtl"
      >
        <SearchDialogHeader
          icon={<Boxes className="h-4 w-4" />}
          title={title || "بحث الأصناف"}
          subtitle="Enter للتنقل بين الفلاتر ثم للنتائج • ↑↓ للتنقل • Enter للاختيار"
          count={filteredProducts.length}
          onClose={onClose}
          actions={
            <Button
              type="button"
              tabIndex={-1}
              onClick={() => window.open("/?section=products&new=1", "_blank", "noopener,noreferrer")}
              className="h-8 gap-1.5 rounded-lg bg-white px-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">إضافة صنف</span>
            </Button>
          }
        />

        {/* الفلاتر */}
        <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
            <div ref={filterContainerRef} className="grid min-w-0 flex-1 grid-cols-2 items-end gap-2 sm:grid-cols-3 lg:grid-cols-[1fr_1.8fr_0.8fr_1.1fr_1.3fr]">
              <SearchFilterField label="رقم الصنف">
                <Input ref={searchCodeRef} className={searchInputClassName} placeholder="رقم الصنف" value={searchCode} onChange={(e) => setSearchCode(e.target.value)} />
              </SearchFilterField>
              <SearchFilterField label="اسم الصنف" className="col-span-2 sm:col-span-1">
                <Input ref={searchNameRef} className={searchInputClassName} placeholder="يمكن كتابة أكثر من كلمة" value={searchName} onChange={(e) => setSearchName(e.target.value)} />
              </SearchFilterField>
              <SearchFilterField label="السعر">
                <Input ref={searchPriceRef} className={searchInputClassName} placeholder="السعر" value={searchPrice} onChange={(e) => setSearchPrice(e.target.value)} />
              </SearchFilterField>
              <SearchFilterField label="الباركود">
                <Input ref={searchBarcodeRef} className={searchInputClassName} placeholder="الباركود" value={searchBarcode} onChange={(e) => setSearchBarcode(e.target.value)} />
              </SearchFilterField>
              {Array.isArray(productTypes) && productTypes.length === 1 ? (
                <SearchFilterField label="النوع">
                  {/* نوع ثابت مفروض من الشاشة المستدعية — لا منتقي قابل للتعديل كي لا تُخلَط الأصناف بالخدمات. */}
                  <div className="flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600">
                    {productTypes[0] === 2 ? "الخدمات" : "الأصناف"}
                  </div>
                </SearchFilterField>
              ) : (
                // نفس مكوّن الاختيار المتعدد المستخدم في التقارير؛ القائمة تُفتح داخل النافذة (portalContainer)
                // وإلا تظهر خلف هذه اللوحة (z-[100]) لأن Popover يُركَّب افتراضياً على document.body.
                <ReportMultiChoice
                  label="النوع"
                  options={PRODUCT_TYPE_OPTIONS}
                  selected={selectedTypes}
                  placeholder="اختر النوع"
                  portalContainer={dialogElement}
                  onChange={(ids) => setSelectedTypes(ids.length > 0 ? ids.map(Number) : [1, 2])}
                />
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={clearFilters}
              className="h-9 shrink-0 rounded-lg border-slate-200 px-3 text-xs text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
            >
              <RotateCcw className="ml-1.5 h-3.5 w-3.5" />
              مسح الفلاتر
            </Button>
          </div>
        </div>

        {/* النتائج + لوحة الوحدات/المتغيرات */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 lg:flex-row">
          <div className="flex min-h-[200px] min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center justify-between px-1 text-[11px] font-bold text-slate-500">
              <span>نتائج البحث</span>
              <span>
                {filteredProducts.length > 200 ? `عرض أول 200 من ${filteredProducts.length.toLocaleString()}` : `${filteredProducts.length.toLocaleString()} صنف`}
                {checkedCount > 0 && <span className="mr-2 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">مؤشَّر {checkedCount}</span>}
              </span>
            </div>
            <SearchResultsTable<Product>
              ref={resultsRef}
              rows={visibleProducts}
              columns={resultColumns}
              getRowKey={(product) => product._variant_key || product.id}
              onPick={(product) => void handleProductDoubleClick(product)}
              onActiveChange={(product) => handleActiveProductChange(product)}
              onToggle={ShowSelect ? (product) => setProducts((current) => current.map((item) => item._variant_key === product._variant_key ? { ...item, selected: !item.selected } : item)) : undefined}
              isRowMarked={(product) => !!product.selected}
              emptyText="لا توجد أصناف مطابقة"
            />
          </div>

          <div className="flex min-h-[160px] min-w-0 flex-col gap-1.5 lg:w-[300px] lg:shrink-0">
            <div className="flex items-center justify-between gap-2 px-1 text-[11px] font-bold text-slate-500">
              <span>{showingAttributes ? "المتغيرات والخصائص" : "وحدات الصنف"}</span>
              <span className="truncate text-slate-700">{selectedProduct?.product_name || ""}</span>
            </div>
            {!selectedProduct ? (
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-4 text-center text-xs text-slate-400">
                اختر صنفاً من النتائج لعرض وحداته
              </div>
            ) : showingAttributes ? (
              <SearchResultsTable<AttributeRow>
                ref={unitsTableRef}
                rows={selectedAttributeRows}
                columns={attributeColumns}
                getRowKey={(row) => row.attribute_key}
                onPick={(row) => handleAttributeDoubleClick(row)}
                onToggle={ShowSelect ? (row) => toggleAttributeKey(row.attribute_key) : undefined}
                isRowMarked={(row) => row.selected}
                rowHeightClassName="h-9"
              />
            ) : (
              <SearchResultsTable<Unit>
                ref={unitsTableRef}
                rows={selectedProduct.units || []}
                columns={unitColumns}
                getRowKey={(unit) => unit.unit_id}
                onPick={(unit) => handleUnitRowDoubleClick(unit)}
                onActiveChange={(unit) => { if (unit) handleSelectUnit(unit) }}
                isRowMarked={(unit) => selectedProduct.selected_unit?.unit_id === unit.unit_id}
                emptyText="لا توجد وحدات"
                rowHeightClassName="h-9"
              />
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-2.5">
          <span className="hidden text-[11px] text-slate-400 sm:block">
            {ShowSelect ? "Space لتأشير أكثر من صنف ثم موافق" : "نقر مزدوج أو Enter للاختيار"}
          </span>
          <div className="flex flex-1 gap-2 sm:flex-none">
            <Button onClick={handleConfirm} className="h-9 flex-1 rounded-lg bg-emerald-600 px-6 font-bold text-white hover:bg-emerald-700 sm:flex-none">
              موافق
            </Button>
            <Button variant="outline" onClick={onClose} className="h-9 flex-1 rounded-lg border-slate-200 px-6 text-slate-600 sm:flex-none">
              إغلاق
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ProductSearchPopup;
