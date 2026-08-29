"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  Loader2,
  Paperclip,
  Plus,
  Save,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/auth/auth-context";
import ProductSearchPopup from "@/components/products/ProductSearchPopup";
import Messages from "@/components/common/Messages";
import { attachEnterAsTab } from "@/components/common/enterAsTab";
import { expandProductWithRelatedItems } from "@/lib/product-related-items-client";

type Item = {
  product_id: number;
  product_name: string;
  product_image?: string | null;
  unit_name?: string;
  quantity: number;
  price: number;
  discount: number;
  minimum_order_quantity: number;
  unit_id: number | null;
  store_id: number | null;
  store_name?: string;
  barcode?: string | null;
  specifications?: {
    reviewed?: boolean;
    product?: Record<string, string>;
    components?: Record<string, Record<string, string>>;
  };
};
export function DraftOrderForm({
  onSaved,
  initialDraft,
  readOnly = false,
}: { onSaved?: () => void; initialDraft?: any; readOnly?: boolean } = {}) {
  const { user, activeBranchId } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]),
    [products, setProducts] = useState<any[]>([]),
    [templates, setTemplates] = useState<any[]>([]),
    [warehouses, setWarehouses] = useState<any[]>([]),
    [branches, setBranches] = useState<any[]>([]),
    [defaultItemWarehouseId, setDefaultItemWarehouseId] = useState<
      number | null
    >(null);
  const [items, setItems] = useState<Item[]>([]),
    [files, setFiles] = useState<any[]>([]),
    [message, setMessage] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerMenuOpen, setCustomerMenuOpen] = useState(false);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    mobile1: "",
    city: "",
    address: "",
  });
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const showCustomerForm = false;
  const setShowCustomerForm = (open: boolean) => {
    if (open) void createCustomer();
  };
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const saveActionRef = useRef<() => void>(() => {});
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeSearching, setBarcodeSearching] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [specification, setSpecification] = useState<{
    index: number;
    data: any;
    values: {
      product: Record<string, string>;
      components: Record<string, Record<string, string>>;
    };
    loading: boolean;
    error: string;
  } | null>(null);
  const messagesRef = useRef<any>(null);
  const enterAsTabEnabledRef = useRef(true);
  const [form, setForm] = useState({
    account_id: "",
    branch_id: String(activeBranchId || ""),
    order_date: new Date().toISOString().slice(0, 10),
    requested_delivery_date: "",
    deposit_amount: 0,
    notes: "",
    delivery_address: "",
    contact_phone: "",
    priority: "normal",
    checklist_template_id: "",
  });
  enterAsTabEnabledRef.current = !showProductSearch && !specification;
  const loadCustomers = async () => {
    try {
      const response = await fetch("/api/accounts?type=2", {
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(`Account request failed: ${response.status}`);
      const data = await response.json();
      const nextCustomers = Array.isArray(data) ? data : [];
      setCustomers(nextCustomers);
      return nextCustomers;
    } catch (error) {
      console.error("Failed to load draft customer accounts:", error);
      return [];
    }
  };
  useEffect(() => {
    void Promise.all([
      loadCustomers(),
      fetch("/api/inventory/products")
        .then((r) => r.json())
        .then((p) => setProducts(Array.isArray(p) ? p : p.products || [])),
      fetch("/api/order-checklists")
        .then((r) => r.json())
        .then((t) => setTemplates(Array.isArray(t) ? t : [])),
      fetch("/api/warehouses")
        .then((r) => r.json())
        .then((w) => setWarehouses(Array.isArray(w) ? w : [])),
      fetch("/api/branches")
        .then((r) => r.json())
        .then((b) =>
          setBranches(
            Array.isArray(b)
              ? b.filter((branch) => Number(branch.status ?? 1) !== 0)
              : [],
          ),
        ),
      user?.id
        ? fetch(
            `/api/settings/user-warehouse-defaults?user_id=${encodeURIComponent(user.id)}`,
          )
            .then((r) => (r.ok ? r.json() : null))
            .then((d) =>
              setDefaultItemWarehouseId(
                Number(d?.default_item_warehouse_id) || null,
              ),
            )
        : Promise.resolve(null),
    ]);
    const refresh = () => {
      void loadCustomers();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [user?.id]);
  useEffect(() => {
    if (!initialDraft) return;
    setCustomerSearch(String(initialDraft.customer_name || ""));
    setForm({
      account_id: String(initialDraft.account_id || ""),
      branch_id: String(initialDraft.branch_id || activeBranchId || ""),
      order_date: String(initialDraft.order_date || "").slice(0, 10),
      requested_delivery_date: String(
        initialDraft.requested_delivery_date || "",
      ).slice(0, 10),
      deposit_amount: Number(initialDraft.deposit_amount || 0),
      notes: initialDraft.notes || "",
      delivery_address: initialDraft.delivery_address || "",
      contact_phone: initialDraft.contact_phone || "",
      priority: initialDraft.priority || "normal",
      checklist_template_id: initialDraft.checklist_template_id
        ? String(initialDraft.checklist_template_id)
        : "",
    });
    setFiles(
      Array.isArray(initialDraft.attachments) ? initialDraft.attachments : [],
    );
    setItems(
      (initialDraft.items || []).map((item: any) => ({
        product_id: Number(item.product_id),
        product_name: item.product_name,
        quantity: Number(item.quantity),
        price: Number(item.price),
        discount: Number(item.discount || 0),
        minimum_order_quantity: Number(item.minimum_order_quantity || 0),
        unit_id: item.unit_id ? Number(item.unit_id) : null,
        store_id: item.store_id ? Number(item.store_id) : null,
        store_name: item.store_name || "",
        barcode: item.barcode || null,
        specifications: item.specifications || {},
      })),
    );
  }, [initialDraft, activeBranchId]);
  useEffect(() => {
    if (!products.length) return;
    setItems((current) =>
      current.map((item) => {
        const product = products.find(
          (product) => Number(product.id) === item.product_id,
        );
        const unit =
          product?.selected_unit ||
          product?.units?.[0] ||
          (product?.unit_id
            ? {
                unit_id: product.unit_id,
                unit_name: product.unit_name,
                barcode: product.first_barcode || product.barcode,
              }
            : null);
        return {
          ...item,
          product_image:
            item.product_image ||
            product?.product_image ||
            product?.display_image ||
            null,
          unit_name:
            item.unit_name || unit?.unit_name || product?.first_unit || "",
          minimum_order_quantity: Number(product?.minimum_order_quantity || 0),
          unit_id:
            item.unit_id || (unit?.unit_id ? Number(unit.unit_id) : null),
          barcode: item.barcode || unit?.barcode || null,
        };
      }),
    );
  }, [products]);
  useEffect(() => {
    if (!warehouses.length) return;
    setItems((current) =>
      current.map((item) => {
        if (item.store_id) return item;
        const product = products.find(
          (product) => Number(product.id) === item.product_id,
        );
        const warehouse = resolveWarehouse(product || {});
        return { ...item, ...warehouse };
      }),
    );
  }, [warehouses, defaultItemWarehouseId, products]);
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".draft-order-form");
    if (!root) return;
    return attachEnterAsTab(root, enterAsTabEnabledRef);
  }, []);
  useEffect(() => {
    const rows = Array.from(
      document.querySelectorAll("[role=dialog] div.grid"),
    ).filter((row: any) =>
      row.querySelector('input[type="number"]'),
    ) as HTMLDivElement[];
    rows.slice(-items.length).forEach((row, index) => {
      row
        .querySelectorAll(
          ".draft-warehouse-editor,.draft-specifications-button",
        )
        .forEach((editor) => editor.remove());
      const item = items[index];
      if (!item) return;
      const wrapper = document.createElement("div");
      wrapper.className = "draft-warehouse-editor min-w-0";
      const label = document.createElement("label");
      label.className = "mb-1 block text-sm font-medium";
      label.textContent = "المستودع";
      const select = document.createElement("select");
      select.className =
        "h-10 w-full rounded-md border bg-background px-2 text-sm";
      select.setAttribute("aria-label", `مستودع ${item.product_name}`);
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "اختر المستودع";
      select.appendChild(empty);
      warehouses.forEach((warehouse) => {
        const option = document.createElement("option");
        option.value = String(warehouse.id);
        option.textContent = warehouse.warehouse_name || warehouse.name;
        option.selected = Number(item.store_id) === Number(warehouse.id);
        select.appendChild(option);
      });
      select.addEventListener("change", (event) => {
        const value = Number((event.target as HTMLSelectElement).value) || null;
        setItems((current) =>
          current.map((currentItem, currentIndex) =>
            currentIndex === index
              ? {
                  ...currentItem,
                  store_id: value,
                  store_name:
                    warehouses.find(
                      (warehouse) => Number(warehouse.id) === value,
                    )?.warehouse_name || "",
                }
              : currentItem,
          ),
        );
      });
      wrapper.append(label, select);
      row.appendChild(wrapper);
      const specificationsButton = document.createElement("button");
      specificationsButton.type = "button";
      specificationsButton.className = `draft-specifications-button h-10 rounded-md border px-3 text-sm font-medium ${item.specifications?.reviewed ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "bg-background hover:bg-muted"}`;
      specificationsButton.textContent = item.specifications?.reviewed
        ? "✓ المواصفات"
        : "المواصفات";
      specificationsButton.onclick = () => void openSpecifications(index);
      row.appendChild(specificationsButton);
    });
    return () =>
      document
        .querySelectorAll(
          ".draft-warehouse-editor,.draft-specifications-button",
        )
        .forEach((editor) => editor.remove());
  }, [items, warehouses]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const rows = Array.from(
        document.querySelectorAll("[role=dialog] div.grid"),
      ).filter((row: any) =>
        row.querySelector('input[type="number"]'),
      ) as HTMLDivElement[];
      rows.slice(-items.length).forEach((row, index) => {
        const item = items[index];
        if (!item) return;
        const warehouse = row.querySelector<HTMLElement>(
          ".draft-warehouse-editor",
        );
        const quantity = row.querySelector(
          'input[type="number"]',
        )?.parentElement;
        if (warehouse && quantity) row.insertBefore(warehouse, quantity);
        const specifications = row.querySelector<HTMLElement>(
          ".draft-specifications-button",
        );
        if (specifications)
          specifications.className =
            "draft-specifications-button h-10 rounded-md border border-emerald-600 bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700";
        const itemCell = row.firstElementChild as HTMLElement | null;
        if (!itemCell || itemCell.querySelector("[data-draft-item-visual]"))
          return;
        const visual = document.createElement("div");
        visual.dataset.draftItemVisual = "true";
        visual.className = "mt-2 flex items-center gap-3";
        const image = document.createElement(
          item.product_image ? "img" : "div",
        );
        image.className =
          "flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border bg-muted/30 object-cover text-[10px] text-muted-foreground";
        if (image instanceof HTMLImageElement) {
          image.src = item.product_image || "";
          image.alt = item.product_name;
        } else image.textContent = "لا صورة";
        const text = document.createElement("div");
        text.className = "min-w-0";
        const name = document.createElement("div");
        name.className = "font-bold text-blue-600";
        name.textContent = item.product_name;
        const unit = document.createElement("div");
        unit.className = "text-sm text-red-600";
        unit.textContent = item.unit_name || "بدون وحدة";
        text.append(name, unit);
        visual.append(image, text);
        itemCell.appendChild(visual);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [items, warehouses]);
  const total = useMemo(
    () => items.reduce((s, i) => s + i.quantity * i.price - i.discount, 0),
    [items],
  );
  const visibleCustomers = useMemo(() => {
    const term = customerSearch.trim().toLocaleLowerCase();
    return customers
      .filter(
        (customer) =>
          !term ||
          String(customer.account_name || customer.name || "")
            .toLocaleLowerCase()
            .includes(term) ||
          String(customer.account_code || customer.code || "")
            .toLocaleLowerCase()
            .includes(term),
      )
      .slice(0, 50);
  }, [customerSearch, customers]);
  const resolveWarehouse = (p: any) => {
    const productId = Number(p.default_store) || 0;
    const userId = Number(defaultItemWarehouseId) || 0;
    const id = productId || userId || Number(warehouses[0]?.id) || 0;
    const warehouse = warehouses.find((item) => Number(item.id) === id);
    return {
      store_id: id || null,
      store_name: warehouse?.warehouse_name || p.default_store_name || "",
    };
  };
  const buildItem = (p: any): Item => {
    const unit =
        p.selected_unit ||
        (p.unit_id
          ? {
              unit_id: p.unit_id,
              unit_name: p.unit_name,
              price: p.first_price,
              barcode: p.first_barcode || p.barcode,
            }
          : null) ||
        p.units?.[0],
      warehouse = resolveWarehouse(p);
    return {
      product_id: Number(p.id),
      product_name: p.product_name || p.name,
      product_image: p.product_image || p.display_image || null,
      unit_name: unit?.unit_name || p.first_unit || "",
      quantity: Number(p.minimum_order_quantity || 1) || 1,
      price: Number(
        unit?.price ?? p.sale_price ?? p.selling_price ?? p.first_price ?? 0,
      ),
      discount: 0,
      minimum_order_quantity: Number(p.minimum_order_quantity || 0),
      unit_id: unit?.unit_id ? Number(unit.unit_id) : null,
      ...warehouse,
      barcode:
        unit?.primary_barcode ||
        unit?.barcode ||
        p.first_barcode ||
        p.barcode ||
        null,
    };
  };
  const expandProducts = (p: any) => expandProductWithRelatedItems(p, products);
  const addByBarcode = async () => {
    const barcode = barcodeInput.trim();
    if (!barcode || barcodeSearching) return;
    setBarcodeSearching(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/inventory/products/search?query=${encodeURIComponent(barcode)}&priceCategoryId=1`,
        { cache: "no-store" },
      );
      const data = await response.json();
      const responseProduct = response.ok && Array.isArray(data)
        ? data[0]
        : response.ok && Array.isArray(data?.products)
          ? data.products[0]
          : response.ok
            ? data
            : null;
      const found = responseProduct?.id
        ? responseProduct
        : products.find((product) => {
            const barcodes = [
              product.first_barcode,
              product.barcode,
              ...(Array.isArray(product.units)
                ? product.units.flatMap((unit: any) => [
                    unit.barcode,
                    unit.primary_barcode,
                  ])
                : []),
            ];
            return barcodes.some(
              (value) => String(value ?? "").trim() === barcode,
            );
          });
      if (!found)
        throw new Error(
          response.ok
            ? "لم يتم العثور على صنف بهذا الباركود"
            : data?.error || "تعذر البحث عن الباركود",
        );
      const expanded = await expandProducts(found);
      setItems((current) => {
        const next = [...current];
        for (const product of expanded)
          if (!next.some((item) => item.product_id === Number(product.id)))
            next.push(buildItem(product));
        return next;
      });
      setBarcodeInput("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "تعذر إضافة الصنف بواسطة الباركود",
      );
    } finally {
      setBarcodeSearching(false);
      window.setTimeout(() => barcodeInputRef.current?.focus(), 0);
    }
  };
  const add = (id: string) => {
    const p = products.find((x) => String(x.id) === id);
    if (!p) return;
    void expandProducts(p)
      .then((expanded) =>
        setItems((current) => [
          ...current,
          ...expanded
            .filter(
              (item: any) =>
                !current.some(
                  (existing) => existing.product_id === Number(item.id),
                ),
            )
            .map(buildItem),
        ]),
      )
      .catch((error) =>
        setMessage(
          error instanceof Error ? error.message : "تعذر إضافة توابع الصنف",
        ),
      );
  };
  const selectProducts = (selected: any[]) => {
    setShowProductSearch(false);
    void Promise.all((selected || []).map((product) => expandProducts(product)))
      .then((groups) =>
        setItems((current) => {
          const next = [...current];
          for (const group of groups)
            for (const product of group)
              if (!next.some((item) => item.product_id === Number(product.id)))
                next.push(buildItem(product));
          return next;
        }),
      )
      .catch((error) =>
        setMessage(
          error instanceof Error ? error.message : "تعذر إضافة توابع الصنف",
        ),
      );
  };
  const openSpecifications = async (index: number) => {
    const item = items[index];
    if (!item) return;
    setSpecification({
      index,
      data: null,
      values: {
        product: { ...(item.specifications?.product || {}) },
        components: { ...(item.specifications?.components || {}) },
      },
      loading: true,
      error: "",
    });
    try {
      const response = await fetch(
        `/api/inventory/products/${item.product_id}/draft-specifications`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "تعذر تحميل مواصفات الصنف");
      setSpecification((current) =>
        current ? { ...current, data, loading: false } : null,
      );
    } catch (error: any) {
      setSpecification((current) =>
        current
          ? {
              ...current,
              loading: false,
              error: error.message || "تعذر تحميل مواصفات الصنف",
            }
          : null,
      );
    }
  };
  const saveSpecifications = () => {
    if (!specification?.data) return;
    const required = [
      ...(specification.data.attributes || []).map(
        (attribute: any) => specification.values.product[attribute.id],
      ),
      ...(specification.data.components || []).flatMap((component: any) =>
        (component.attributes || []).map(
          (attribute: any) =>
            specification.values.components[component.id]?.[attribute.id],
        ),
      ),
    ];
    if (required.some((value) => !value)) {
      setSpecification({
        ...specification,
        error: "يجب تعبئة جميع المتغيرات والخصائص",
      });
      return;
    }
    setItems((current) =>
      current.map((item, index) =>
        index === specification.index
          ? {
              ...item,
              specifications: {
                reviewed: true,
                product: specification.values.product,
                components: specification.values.components,
              },
            }
          : item,
      ),
    );
    setSpecification(null);
  };
  const changeCustomer = (value: string) => {
    setCustomerSearch(value);
    const normalized = value.trim().toLowerCase();
    const match = customers.find(
      (customer) =>
        String(customer.id) === value ||
        String(customer.account_code || customer.code || "").toLowerCase() ===
          normalized ||
        String(customer.account_name || customer.name || "").toLowerCase() ===
          normalized,
    );
    setForm((current) => ({
      ...current,
      account_id: match ? String(match.id) : "",
    }));
  };
  const selectCustomer = (customer: any) => {
    setCustomerSearch(String(customer.account_name || customer.name || ""));
    setForm((current) => ({ ...current, account_id: String(customer.id) }));
    setCustomerMenuOpen(false);
  };
  const createCustomer = async () => {
    const name = customerSearch.trim();
    if (!name) {
      setMessage("اكتب اسم العميل أولاً");
      return;
    }
    setIsCreatingCustomer(true);
    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name,
          customer_name: name,
          type: 1,
          status: "نشط",
          priceCategory: 1,
          registration_date: new Date().toISOString().slice(0, 10),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر إنشاء العميل");
      const created = Array.isArray(data) ? data : data.customer || data;
      const accountId = String(created.account_id || created.id);
      const refreshedCustomers = await loadCustomers();
      const createdAccount = refreshedCustomers.find(
        (customer) => String(customer.id) === accountId,
      );
      setCustomerSearch(
        String(
          createdAccount?.account_name ||
            createdAccount?.name ||
            created.name ||
            name,
        ),
      );
      setForm((current) => ({ ...current, account_id: accountId }));
      setCustomerMenuOpen(false);
      setMessage("تم إنشاء العميل وتحديده في الطلبية");
    } catch (error: any) {
      setMessage(error.message || "تعذر إنشاء العميل");
    } finally {
      setIsCreatingCustomer(false);
    }
  };
  const attach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    for (const f of selected) {
      if (
        f.size > 5 * 1024 * 1024 ||
        !/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.type)
      ) {
        setMessage(`الملف ${f.name} غير مسموح أو أكبر من 5MB`);
        continue;
      }
      const data = await new Promise<string>((res) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.readAsDataURL(f);
      });
      setFiles((v) => [
        ...v,
        { name: f.name, type: f.type, size: f.size, data },
      ]);
    }
  };
  const findIncompleteSpecifications = async () => {
    const checks = await Promise.all(
      items.map(async (item) => {
        try {
          const response = await fetch(
            `/api/inventory/products/${item.product_id}/draft-specifications`,
            { cache: "no-store" },
          );
          if (!response.ok) return null;
          const data = await response.json();
          const required = Boolean(
            data.attributes?.length || data.components?.length,
          );
          return required && !item.specifications?.reviewed ? item : null;
        } catch {
          return null;
        }
      }),
    );
    return checks.find(Boolean) as Item | undefined;
  };
  const save = async () => {
    if (savingRef.current) return;
    if (!form.branch_id) {
      setMessage("الفرع مطلوب");
      return;
    }
    if (
      !form.account_id ||
      !form.order_date ||
      !form.requested_delivery_date ||
      !items.length
    ) {
      setMessage("العميل وتاريخ الطلب والتسليم وصنف واحد على الأقل مطلوبة");
      return;
    }
    if (form.requested_delivery_date < form.order_date) {
      setMessage("تاريخ التسليم لا يمكن أن يسبق تاريخ الطلب");
      return;
    }
    if (!Number.isFinite(form.deposit_amount) || form.deposit_amount < 0) {
      setMessage("مبلغ العربون يجب أن يكون صفراً أو أكبر");
      return;
    }
    if (form.deposit_amount > total) {
      setMessage("مبلغ العربون لا يمكن أن يتجاوز إجمالي الطلبية");
      return;
    }
    setMessage("");
    const customer = customers.find((c) => String(c.id) === form.account_id);
    if (!customer) {
      setMessage("اختر حساب عميل صالحاً من القائمة");
      return;
    }
    const invalid = items.find(
      (i) =>
        !Number.isFinite(i.quantity) ||
        i.quantity <= 0 ||
        i.quantity < i.minimum_order_quantity ||
        !Number.isFinite(i.price) ||
        i.price < 0 ||
        !Number.isFinite(i.discount) ||
        i.discount < 0 ||
        i.discount > i.quantity * i.price,
    );
    if (invalid) {
      setMessage(
        invalid.quantity < invalid.minimum_order_quantity
          ? `الحد الأدنى لطلب ${invalid.product_name} هو ${invalid.minimum_order_quantity}`
          : `تحقق من الكمية والسعر والخصم للصنف ${invalid.product_name}`,
      );
      return;
    }
    savingRef.current = true;
    setIsSaving(true);
    try {
      const r = await fetch(
        initialDraft
          ? `/api/order-drafts/${initialDraft.id}`
          : "/api/order-drafts",
        {
          method: initialDraft ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            ...form,
            account_id: Number(form.account_id),
            customer_name: customer?.account_name || customer?.name,
            checklist_template_id: form.checklist_template_id
              ? Number(form.checklist_template_id)
              : null,
            items,
            attachments: files,
            created_by: user?.id,
            branch_id: Number(form.branch_id),
          }),
        },
      );
      const contentType = r.headers.get("content-type") || "";
      const d = contentType.includes("application/json")
        ? await r.json()
        : null;
      if (!r.ok) {
        setMessage(
          d?.error ||
            (r.status === 404
              ? "مسار حفظ المسودة غير متاح على الخادم؛ أعد تشغيل خادم التطبيق لتحميل API الجديد"
              : `فشل حفظ المسودة (HTTP ${r.status})`),
        );
        return;
      }
      if (!d) {
        setMessage("أعاد الخادم استجابة غير صالحة أثناء حفظ المسودة");
        return;
      }
      setMessage(
        initialDraft
          ? "تم تحديث المسودة بنجاح"
          : `تم حفظ المسودة ${d.draft_number}${d.receipt_voucher_id ? " وسند قبض العربون" : ""}`,
      );
      setItems([]);
      setFiles([]);
      onSaved?.();
    } catch (error) {
      console.error("Failed to save order draft", error);
      setMessage(
        error instanceof Error
          ? `تعذر حفظ المسودة: ${error.message}`
          : "تعذر الاتصال بالخادم أثناء حفظ المسودة",
      );
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };
  saveActionRef.current = () => {
    void save();
  };
  useEffect(() => {
    if (!message) return;
    const success =
      message.includes("بنجاح") ||
      message.startsWith("تم حفظ") ||
      message.startsWith("تم إنشاء العميل وتحديده");
    messagesRef.current?.clear?.();
    messagesRef.current?.show?.([
      {
        severity: success ? "success" : "error",
        summary: "",
        detail: message,
        life: 5000,
      },
    ]);
  }, [message]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const root = document.querySelector<HTMLElement>(".draft-order-form");
      if (!root) return;
      const cards = Array.from(
        root.querySelectorAll<HTMLElement>('[data-slot="card"]'),
      );
      const customerCard = cards.find((card) =>
        card.textContent?.includes("بيانات العميل والتسليم"),
      );
      customerCard
        ?.querySelector<HTMLElement>('[data-slot="card-header"]')
        ?.classList.add("!py-3");
      customerCard
        ?.querySelector<HTMLElement>('[data-slot="card-content"]')
        ?.classList.add("!gap-2", "!pb-4");
      const notes =
        customerCard?.querySelector<HTMLTextAreaElement>("textarea");
      if (notes) {
        notes.rows = 2;
        notes.classList.add("min-h-16");
      }
      const itemsCard = cards.find((card) =>
        card
          .querySelector('[data-slot="card-title"]')
          ?.textContent?.includes("الأصناف"),
      );
      const itemsContent = itemsCard?.querySelector<HTMLElement>(
        '[data-slot="card-content"]',
      );
      if (itemsContent) {
        itemsContent.classList.add(
          "max-h-[520px]",
          "overflow-y-auto",
          "overscroll-contain",
          "pr-1",
        );
        itemsContent.style.scrollbarGutter = "stable";
      }
      const customerLabel = root.querySelector<HTMLLabelElement>(
        'label[for="draft-customer"]',
      );
      if (
        customerLabel &&
        !customerLabel.parentElement?.querySelector("[data-refresh-customers]")
      ) {
        const refresh = document.createElement("button");
        refresh.type = "button";
        refresh.dataset.refreshCustomers = "true";
        refresh.className =
          "float-left inline-flex h-7 w-7 items-center justify-center rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100";
        refresh.title = "تحديث حسابات العملاء";
        refresh.innerHTML =
          '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/></svg>';
        refresh.onclick = async () => {
          await loadCustomers();
          setCustomerMenuOpen(true);
          document.getElementById("draft-customer")?.focus();
        };
        customerLabel.insertAdjacentElement("afterend", refresh);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [items.length, customers.length]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F3") {
        event.preventDefault();
        event.stopPropagation();
        saveActionRef.current();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, []);
  return (
    <fieldset
      disabled={readOnly}
      dir="rtl"
      className="draft-order-form min-w-0 w-full max-w-none space-y-4 overflow-x-hidden p-3 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">
            {readOnly ? "مشاهدة مسودة طلبية" : "إنشاء مسودة طلبية"}
          </h1>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {!readOnly && (
            <>
              <span className="rounded-md border bg-muted px-3 py-1 text-xs">
                F3: حفظ المسودة
              </span>
              <Button
                size="lg"
                onClick={save}
                disabled={
                  isSaving ||
                  !form.account_id ||
                  !form.requested_delivery_date ||
                  !items.length
                }
              >
                <Save className="ml-2 h-4 w-4" />
                {isSaving ? "جاري الحفظ..." : "حفظ المسودة"}
              </Button>
            </>
          )}
        </div>
      </div>
      <Messages innerRef={messagesRef} />
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>بيانات العميل والتسليم</CardTitle>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative">
            <Label htmlFor="draft-customer">العميل *</Label>
            <Input
              id="draft-customer"
              className="mt-1"
              value={customerSearch}
              onFocus={() => {
                setCustomerMenuOpen(true);
                void loadCustomers();
              }}
              onChange={(event) => {
                changeCustomer(event.target.value);
                setCustomerMenuOpen(true);
              }}
              onBlur={() =>
                window.setTimeout(() => setCustomerMenuOpen(false), 150)
              }
              placeholder="اكتب اسم أو رقم العميل للبحث..."
              autoComplete="off"
            />
            {customerMenuOpen && (
              <div className="absolute z-[100] mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-background shadow-xl">
                {visibleCustomers.length ? (
                  visibleCustomers.map((customer) => (
                    <button
                      type="button"
                      key={customer.id}
                      className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-right hover:bg-muted"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectCustomer(customer)}
                    >
                      <span>{customer.account_name || customer.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {customer.account_code || customer.code || ""}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="space-y-2 px-3 py-3 text-center text-sm text-muted-foreground">
                    <div>لا توجد نتائج</div>
                    <Button
                      type="button"
                      size="sm"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setNewCustomer((current) => ({
                          ...current,
                          name: customerSearch.trim(),
                        }));
                        setShowCustomerForm(true);
                      }}
                    >
                      <Plus className="ml-2 h-4 w-4" />
                      تعريف زبون
                    </Button>
                  </div>
                )}
              </div>
            )}
            <Dialog open={showCustomerForm} onOpenChange={setShowCustomerForm}>
              <DialogContent dir="rtl" className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>تعريف زبون</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3">
                  <div>
                    <Label>اسم العميل *</Label>
                    <Input
                      value={newCustomer.name}
                      onChange={(event) =>
                        setNewCustomer({
                          ...newCustomer,
                          name: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>رقم الجوال</Label>
                    <Input
                      value={newCustomer.mobile1}
                      onChange={(event) =>
                        setNewCustomer({
                          ...newCustomer,
                          mobile1: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>المدينة</Label>
                    <Input
                      value={newCustomer.city}
                      onChange={(event) =>
                        setNewCustomer({
                          ...newCustomer,
                          city: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>العنوان</Label>
                    <Input
                      value={newCustomer.address}
                      onChange={(event) =>
                        setNewCustomer({
                          ...newCustomer,
                          address: event.target.value,
                        })
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    disabled={isCreatingCustomer}
                    onClick={createCustomer}
                  >
                    {isCreatingCustomer ? "جاري الحفظ..." : "حفظ وتعريف الزبون"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div>
            <Label>الفرع *</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border bg-background px-3"
              value={form.branch_id}
              onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
            >
              <option value="">اختر الفرع</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.branch_name || branch.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>تاريخ الطلب</Label>
            <Input
              type="date"
              value={form.order_date}
              onChange={(e) => setForm({ ...form, order_date: e.target.value })}
            />
          </div>
          <div>
            <Label>التاريخ المطلوب للتسليم *</Label>
            <Input
              type="date"
              min={form.order_date}
              value={form.requested_delivery_date}
              onChange={(e) =>
                setForm({ ...form, requested_delivery_date: e.target.value })
              }
            />
          </div>
          <div>
            <Label>مبلغ العربون</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.deposit_amount}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) =>
                setForm({ ...form, deposit_amount: Number(e.target.value) })
              }
            />
          </div>
          <div>
            <Label>هاتف التواصل</Label>
            <Input
              value={form.contact_phone}
              onChange={(e) =>
                setForm({ ...form, contact_phone: e.target.value })
              }
            />
          </div>
          <div>
            <Label>الأولوية</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border bg-background px-3"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              <option value="normal">عادية</option>
              <option value="high">عالية</option>
              <option value="urgent">عاجلة</option>
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-2">
            <Label>عنوان التسليم</Label>
            <Input
              value={form.delivery_address}
              onChange={(e) =>
                setForm({ ...form, delivery_address: e.target.value })
              }
            />
          </div>
          <div>
            <Label>قائمة التحقق</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border bg-background px-3"
              value={form.checklist_template_id}
              onChange={(e) =>
                setForm({ ...form, checklist_template_id: e.target.value })
              }
            >
              <option value="">بدون قائمة</option>
              {templates
                .filter((t) => t.is_active)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Label>ملاحظات</Label>
            <Textarea
              rows={4}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            الأصناف{" "}
            <Button type="button" onClick={() => setShowProductSearch(true)}>
              <Plus className="ml-2 h-4 w-4" />
              إضافة صنف
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 space-y-3">
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="draft-barcode">الباركود</Label>
              <Input
                ref={barcodeInputRef}
                id="draft-barcode"
                className="mt-1"
                value={barcodeInput}
                onChange={(event) => setBarcodeInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    event.stopPropagation()
                    void addByBarcode()
                  }
                }}
                placeholder="امسح أو اكتب الباركود"
                autoComplete="off"
              />
            </div>
            <Button
              type="button"
              disabled={barcodeSearching || !barcodeInput.trim()}
              onClick={() => void addByBarcode()}
            >
              {barcodeSearching ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="ml-2 h-4 w-4" />
              )}
              بحث وإضافة
            </Button>
          </div>
          {items.map((i, n) => (
            <div
              key={i.product_id}
              className="grid min-w-0 grid-cols-1 items-end gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-6"
            >
              <div className="min-w-0 sm:col-span-2 lg:col-span-2">
                <Label>الصنف</Label>
                <div className="break-words">{i.product_name}</div>
                {i.minimum_order_quantity > 0 && (
                  <small>الحد الأدنى: {i.minimum_order_quantity}</small>
                )}
              </div>
              <div>
                <Label>الكمية</Label>
                <Input
                  type="number"
                  step="0.0001"
                  min={i.minimum_order_quantity || 0.0001}
                  value={i.quantity}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) =>
                    setItems(
                      items.map((x, k) =>
                        k === n
                          ? { ...x, quantity: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </div>
              <div>
                <Label>السعر</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={i.price}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) =>
                    setItems(
                      items.map((x, k) =>
                        k === n ? { ...x, price: Number(e.target.value) } : x,
                      ),
                    )
                  }
                />
              </div>
              <div>
                <Label>الخصم</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={i.discount}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) =>
                    setItems(
                      items.map((x, k) =>
                        k === n
                          ? { ...x, discount: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </div>
              <Button
                variant="destructive"
                onClick={() => setItems(items.filter((_, k) => k !== n))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="text-left text-xl font-bold">
            الإجمالي: {total.toFixed(2)}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          {!readOnly && (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2">
              <Paperclip className="h-4 w-4" />
              إرفاق صور أو PDF
              <input
                hidden
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={attach}
              />
            </label>
          )}
          {files.map((f, n) => (
            <span
              key={n}
              className="inline-flex items-center gap-2 rounded bg-muted px-2 py-1 text-sm"
            >
              <span>{f.name}</span>
              {readOnly && f.data && (
                <>
                  <a
                    className="text-blue-600 underline"
                    href={f.data}
                    target="_blank"
                    rel="noreferrer"
                  >
                    مشاهدة
                  </a>
                  <a
                    className="text-emerald-600 underline"
                    href={f.data}
                    download={f.name}
                  >
                    تنزيل
                  </a>
                </>
              )}
            </span>
          ))}
        </CardContent>
      </Card>
      <SpecificationsDialog
        state={specification}
        setState={setSpecification}
        onSave={saveSpecifications}
      />
      <ProductSearchPopup
        visible={showProductSearch}
        onClose={() => setShowProductSearch(false)}
        onSelect={selectProducts}
        priceCategoryId={1}
        ShowSelect={true}
        searchText=""
        productTypes={[1]}
      />
    </fieldset>
  );
}

function SpecificationsDialog({
  state,
  setState,
  onSave,
}: {
  state: any;
  setState: (value: any) => void;
  onSave: () => void;
}) {
  const setValue = (
    scope: "product" | "component",
    ownerId: number,
    attributeId: number,
    value: string,
  ) =>
    setState((current: any) => {
      if (!current) return current;
      const values = {
        ...current.values,
        product: { ...current.values.product },
        components: { ...current.values.components },
      };
      if (scope === "product") values.product[String(attributeId)] = value;
      else
        values.components[String(ownerId)] = {
          ...(values.components[String(ownerId)] || {}),
          [String(attributeId)]: value,
        };
      return { ...current, values, error: "" };
    });
  const attributes = (owner: any, scope: "product" | "component") =>
    (owner.attributes || []).map((attribute: any) => (
      <div key={attribute.id} className="space-y-2">
        <Label>{attribute.name} *</Label>
        <div className="flex flex-wrap gap-2">
          {attribute.values.map((value: any) => {
            const selected =
              scope === "product"
                ? String(state.values.product[attribute.id] || "") ===
                  String(value.id)
                : String(
                    state.values.components[owner.id]?.[attribute.id] || "",
                  ) === String(value.id);
            return (
              <button
                type="button"
                key={value.id}
                onClick={() =>
                  setValue(scope, owner.id, attribute.id, String(value.id))
                }
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${selected ? "border-emerald-500 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500" : "hover:bg-muted"}`}
              >
                {value.image_url && (
                  <img
                    src={value.image_url}
                    alt=""
                    className="h-9 w-9 rounded-lg border object-cover"
                  />
                )}
                <span>{value.name}</span>
                {selected && <CheckCircle2 className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
      </div>
    ));
  return (
    <Dialog open={!!state} onOpenChange={(open) => !open && setState(null)}>
      <DialogContent
        dir="rtl"
        className="max-h-[92vh] max-w-4xl overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-emerald-600" />
            مواصفات الصنف
          </DialogTitle>
        </DialogHeader>
        {state?.loading ? (
          <div className="flex items-center justify-center gap-2 py-16">
            <Loader2 className="h-6 w-6 animate-spin" />
            جاري تحميل المواصفات...
          </div>
        ) : state?.data ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-l from-slate-900 to-emerald-950 p-4 text-white">
              {state.data.product_image && (
                <img
                  src={state.data.product_image}
                  alt=""
                  className="h-16 w-16 rounded-xl border border-white/20 object-cover"
                />
              )}
              <div>
                <h3 className="text-lg font-bold">{state.data.product_name}</h3>
                <p className="font-mono text-sm text-slate-300">
                  {state.data.product_code}
                </p>
              </div>
            </div>
            {(state.data.attributes || []).length > 0 && (
              <section className="space-y-4 rounded-xl border p-4">
                <h3 className="font-bold">المتغيرات والخصائص</h3>
                {attributes(state.data, "product")}
              </section>
            )}
            <section className="space-y-3">
              <h3 className="font-bold">
                مكونات التصنيع ({state.data.components?.length || 0})
              </h3>
              {state.data.components?.length ? (
                state.data.components.map((component: any) => (
                  <div
                    key={component.id}
                    className="rounded-xl border bg-slate-50/70 p-4"
                  >
                    <div className="mb-3 flex items-center gap-3">
                      {component.product_image ? (
                        <img
                          src={component.product_image}
                          alt=""
                          className="h-12 w-12 rounded-lg border object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg border bg-white" />
                      )}
                      <div className="flex-1">
                        <b>{component.product_name}</b>
                        <p className="text-xs text-muted-foreground">
                          {component.product_code}
                        </p>
                      </div>
                      <span className="rounded-lg bg-white px-3 py-1 font-semibold shadow-sm">
                        {component.quantity} × لكل وحدة
                      </span>
                    </div>
                    {component.attributes?.length > 0 ? (
                      <div className="space-y-4 border-t pt-3">
                        {attributes(component, "component")}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        لا توجد متغيرات أو خصائص لهذا المكون
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
                  لا توجد مكونات تصنيع معرفة لهذا الصنف
                </div>
              )}
            </section>
            {state.error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {state.error}
              </div>
            )}
            <Button type="button" className="w-full" onClick={onSave}>
              <CheckCircle2 className="ml-2 h-4 w-4" />
              حفظ المواصفات
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            {state?.error}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
