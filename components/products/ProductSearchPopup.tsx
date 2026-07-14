"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DataGridView from "../common/DataGridView";
import MultiSelect from "../common/MultiSelect";
import * as wjGrid from "@grapecity/wijmo.grid";
import { useTranslation } from 'react-i18next';
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
        let url = `/api/inventory/products?priceCategoryId=${priceCategoryId}`;
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
    setTimeout(() => searchNameRef.current?.focus(), 100);
    ws.current = new WebSocket("ws://localhost:33333/ws");
    ws.current.onopen = () => {
      ws.current?.send(JSON.stringify({ type: "changeLang", language: "1" }));
    };
    return () => {
      cancelled = true;
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
      { header: "اسم الصنف", name: "product_name", width: "*", isReadOnly: true },
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

  const handleProductDoubleClick = useCallback((product: Product) => {
    if (!product) return;
    console.log("product ", product)
    // Automatically select first unit if available
    const selectedUnit = product.units?.[0];
    const updatedProduct: Product = { ...product, selected_unit: selectedUnit, selected: true };

    setProducts(prev =>
      prev.map(p => p.id === product.id ? updatedProduct : p)
    );

    onSelect([updatedProduct]);
    onClose();
  }, [onSelect, onClose]);
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
      const response = await fetch(`/api/products/${item.id}/units`);
      const units: Unit[] = await response.json();
      setSelectedProduct({ ...item, units });
    } catch (err) {
      console.error("Error fetching units:", err);
      setSelectedProduct({ ...item, units: [] });
    }
  }, []);

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

  window.addEventListener("keydown", handleKeyDown, true);

  return () => {
    window.removeEventListener("keydown", handleKeyDown, true);
  };
}, [visible, onClose]);


  const onKeyDownGrid = async (grid: any, e: KeyboardEvent) => {
    // Make sure grid and selection exist
    if (!grid || !grid.selection) return;
    const sel = grid.selection;
    const row = sel.row;

    if (e.keyCode === 13) {
      const rowIndex = grid.selection?.row ?? -1;
      if (rowIndex < 0) return;

      const item = grid.rows[rowIndex]?.dataItem as Product;
      console.log("item ", item)
      try {
        const response = await fetch(`/api/products/${item.id}/units`);
        const units: Unit[] = await response.json();
        setSelectedProduct({ ...item, units });
        const selectedItem = item
        handleProductDoubleClick(selectedItem)
      } catch (err) {
        console.error("Error fetching units:", err);
      }
      e.preventDefault();

      return;
    }
  }
  if (!visible) return null;

  const gridStyleUnits = {
    maxHeight: '16vh',
    minHeight: '16vh',
  };

  const gridStyleItems = {
    maxHeight: '24vh',
    minHeight: '24vh',
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 p-5 flex flex-col w-full max-w-6xl max-h-[84vh] overflow-hidden" dir="rtl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-xl font-semibold text-slate-900">{title || "بحث الأصناف"}</h3>
        </div>

        <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-4 text-right">
            <p className="text-sm font-semibold text-slate-900">الفلاتر</p>
            <p className="text-sm text-slate-500">استعمل هذه الفلاتر لتضييق نتائج البحث</p>
          </div>

          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,_1fr)]">
            <div className="rounded-2xl bg-white p-3 shadow-sm space-y-1">
              <label htmlFor="productTypeFilter" className="block text-xs font-semibold text-slate-700 text-right">
                نوع الصنف
              </label>
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
                showFilter={false}
                showCheck={true}
                showMultiSelect={true}
                className="w-full"
                appendTo="self"
                onChange={(e: any) => {
                  const values = Array.isArray(e.value) ? e.value.map(Number) : [];
                  setSelectedTypes(values.length > 0 ? values : [1, 2]);
                }}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
            </div>
          </div>
        </div>


        <div className="flex-1 flex flex-col gap-4 overflow-hidden mt-2">
          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-3">
            <h4 className="text-sm font-semibold mb-3 text-slate-700 text-right">نتائج البحث</h4>
            <DataGridView
              style={gridStyleItems}
              ref={gridProductsRef}
              dataSource={filteredProducts}
              scheme={productScheme}
              onRowDoubleClick={handleProductDoubleClick}
              selectionChanged={selectionChanged}
              onKeyDown={(s: any, e: any) => onKeyDownGrid(s, e)}
              keyActionEnter="None"
            />
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-3">
            <h4 className="text-sm font-semibold mb-3 text-slate-700 text-right">وحدات الصنف</h4>
            <div className="text-sm text-slate-500 mb-3 text-right">{selectedProduct?.product_name || "لا يوجد صنف محدد"}</div>
            <DataGridView
              innerRef={gridUnitsRef}
              dataSource={selectedProduct?.units || []}
              scheme={unitScheme}
              onRowDoubleClick={handleUnitRowDoubleClick}
            />
          </div>
        </div>

        <div className="flex justify-center gap-3 mt-5">
          <Button className="erp-btn-primary search-button min-w-[120px]" onClick={handleConfirm}>
            موافق
          </Button>
          <Button variant="outline" onClick={onClose} className="search-button min-w-[120px]">
            إغلاق
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProductSearchPopup;
