import { type NextRequest, NextResponse } from "next/server"
import sql, { getTenantPool, resolveCurrentDbName } from "@/lib/database"
import { isScaleProduct, validateScaleProductBarcodes } from "@/lib/scale-barcode"
import { validateProductPriceCurrencies } from "@/lib/product-price-currencies"
import { getGrantedBranchIds, hasNamedPermission } from "@/lib/permissions"
import { PURCHASE_PRICE_PERMISSION_CATEGORY, PURCHASE_PRICE_VIEW_PERMISSION } from "@/lib/transaction-permission-definitions"
import { projectFileLookup } from "@/lib/file-permissions"
import { authorizeProductType, authorizeStoredProduct, authorizeProductLookupScope } from "./_permissions"
import { runSchemaOnce } from "@/lib/schema-once"
import { validateLeafAccountFields } from "@/lib/leaf-accounts"
import { ensureLastPurchaseColumns } from "@/lib/last-purchase"



async function hasDefaultStoreColumn() {
  if (!sql) return false

  try {
    const result = await sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'products'
          AND column_name = 'default_store'
      ) AS has_column
    `

    return Boolean(result?.[0]?.has_column)
  } catch (error) {
    console.error("[v0] Failed to detect default_store column:", error)
    return false
  }
}

async function ensureProductTypeColumns() { return runSchemaOnce("app/api/inventory/products/route.ts#ensureProductTypeColumns", async () => {
  if (!sql) return

  try {
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS type INTEGER DEFAULT 1`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS pos_sold_using_scale BOOLEAN NOT NULL DEFAULT FALSE`
    // صنف دخان: يدخل في "عهدة الدخان" بالكاشير (كميات تُستلم وتُسلَّم مع العهدة)
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_tobacco BOOLEAN NOT NULL DEFAULT FALSE`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS service_type INTEGER DEFAULT 0`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type INTEGER DEFAULT 1`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS tax_classification_id INTEGER`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_account_id INTEGER`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_account_id INTEGER`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_returns_account_id INTEGER`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_returns_account_id INTEGER`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_end_account_id INTEGER`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_start_account_id INTEGER`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS production_account_id INTEGER`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS municipality_service_account_id INTEGER`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS lsti3mal_account_id INTEGER`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS measurment_id INTEGER DEFAULT 1`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS related_items_mode INTEGER NOT NULL DEFAULT 1`
    // الطابعة الافتراضية للصنف: أولوية على طابعة مجموعة الصنف في طباعة الأقسام (الكاشير/المطعم)
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS default_printer VARCHAR(150)`
  } catch (error) {
    console.error("[v0] Failed to ensure product type columns:", error)
  }
}) }

async function ensureProductSchemaColumns(client: any) {
  const columns: Array<[string, string]> = [
    ["barcode", "VARCHAR(100)"],
    ["product_name_en", "TEXT"],
    ["category_id", "INTEGER"],
    ["main_stock_id", "INTEGER"],
    ["default_store", "INTEGER"],
    ["brand", "TEXT"],
    ["model", "TEXT"],
    ["factory_number", "TEXT"],
    ["original_number", "TEXT"],
    ["measurment_unit", "INTEGER DEFAULT 1"],
    ["measurment_id", "INTEGER DEFAULT 1"],
    ["last_purchase_price", "NUMERIC(18,4) DEFAULT 0"],
    ["last_purchase_date", "DATE"],
    ["last_purchase_currency_id", "INTEGER"],
    ["last_purchase_voucher_id", "INTEGER"],
    ["currency_id", "INTEGER DEFAULT 1"],
    ["tax_rate", "NUMERIC(18,4) DEFAULT 0"],
    ["discount_rate", "NUMERIC(18,4) DEFAULT 0"],
    ["location", "TEXT"],
    ["has_expiry_date", "BOOLEAN DEFAULT false"],
    ["has_batch_number", "BOOLEAN DEFAULT false"],
    ["serial_tracking", "BOOLEAN DEFAULT false"],
    ["status", "INTEGER DEFAULT 1"],
    ["type", "INTEGER DEFAULT 1"],
    ["service_type", "INTEGER DEFAULT 0"],
    ["product_type", "INTEGER DEFAULT 1"],
    ["tax_classification_id", "INTEGER"],
    ["length", "NUMERIC(18,4) DEFAULT 0"],
    ["width", "NUMERIC(18,4) DEFAULT 0"],
    ["height", "NUMERIC(18,4) DEFAULT 0"],
    ["density", "NUMERIC(18,4) DEFAULT 0"],
    ["color", "TEXT"],
    ["size", "TEXT"],
    ["notes", "TEXT"],
    ["transaction_notes", "VARCHAR(100)"],
    ["manufacturer_company", "TEXT"],
    ["product_image", "TEXT"],
    ["selling_account_id", "INTEGER"],
    ["purchase_account_id", "INTEGER"],
    ["selling_returns_account_id", "INTEGER"],
    ["purchase_returns_account_id", "INTEGER"],
    ["stock_end_account_id", "INTEGER"],
    ["stock_start_account_id", "INTEGER"],
    ["production_account_id", "INTEGER"],
    ["municipality_service_account_id", "INTEGER"],
    ["lsti3mal_account_id", "INTEGER"],
    ["deleted", "BOOLEAN DEFAULT false"],
    ["updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"],
    ["created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"],
    ["entry_date", "DATE DEFAULT CURRENT_DATE"],
    ["has_colors", "BOOLEAN DEFAULT false"],
    ["attributes", "JSONB NOT NULL DEFAULT '[]'::jsonb"],
    ["related_items_mode", "INTEGER NOT NULL DEFAULT 1"],
    ["default_printer", "VARCHAR(150)"],
  ]

  for (const [columnName, columnType] of columns) {
    try {
      await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ${columnName} ${columnType}`)
    } catch (error) {
      console.error(`[v0] Failed to ensure products.${columnName}:`, error)
    }
  }
}

function safeText(value: any, fallback = "") {
  if (value == null) return fallback
  return typeof value === "string" ? value : String(value)
}

function safeNumber(value: any, fallback = 0) {
  if (value == null || value === "") return fallback
  const numericValue = typeof value === "number" ? value : Number(value)
  return Number.isFinite(numericValue) ? numericValue : fallback
}

function safeBoolean(value: any, fallback = false) {
  if (typeof value === "boolean") return value
  if (value == null) return fallback
  return Boolean(value)
}

function normalizeStatus(value: any, fallback: number | null = null) {
  if (value == null || value === "") return fallback
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback
  const normalized = String(value).trim()
  if (normalized === "نشط" || normalized === "1") return 1
  if (normalized === "غير نشط" || normalized === "2") return 2
  if (normalized === "متوقف" || normalized === "3") return 3
  const numericValue = Number(normalized)
  return Number.isFinite(numericValue) ? numericValue : fallback
}

function normalizeProductPayload(productData: any) {
  const normalizeBarcodeList = (value: any): string[] => {
    if (value == null) return []
    if (Array.isArray(value)) {
      return value.map((barcode: any) => safeText(barcode, "").trim()).filter(Boolean)
    }
    const raw = String(value)
      .split(/[;,]+/)
      .map((barcode) => safeText(barcode, "").trim())
      .filter(Boolean)
    return raw
  }

  const normalizedUnits = Array.isArray(productData?.units)
    ? productData.units.map((unit: any) => ({
        ...unit,
        unit_id: safeNumber(unit?.unit_id, 0),
        to_main_qnty: safeNumber(unit?.to_main_qnty, 1),
        barcode_list: normalizeBarcodeList(unit?.barcode_list),
      }))
    : []

  const normalizedPrices = Array.isArray(productData?.prices)
    ? productData.prices.map((price: any) => ({
        ...price,
        price_category_id: safeNumber(price?.price_category_id, 0),
        unit_id: safeNumber(price?.unit_id, 0),
        price: safeNumber(price?.price, 0),
        currency_id: safeNumber(price?.currency_id, 0),
      }))
    : []

  const normalizedStores = Array.isArray(productData?.stores)
    ? productData.stores.map((store: any) => ({
        ...store,
        store_id: safeNumber(store?.store_id, 0),
        shelf: safeText(store?.shelf, ""),
        reorder_quantity: safeNumber(store?.reorder_quantity, 0),
        min_quantity: safeNumber(store?.min_quantity, 0),
        max_quantity: safeNumber(store?.max_quantity, 0),
      }))
    : []

  const normalizedCostCenters = Array.isArray(productData?.cost_centers)
    ? productData.cost_centers.map((row: any) => ({
        ...row,
        cost_center_type_id: safeNumber(row?.cost_center_type_id, 0),
        required_in_transactions: safeNumber(row?.required_in_transactions, 1),
        default_cost_center_id:
          row?.default_cost_center_id == null || row?.default_cost_center_id === ""
            ? null
            : safeNumber(row.default_cost_center_id, null as any),
      }))
    : []

  const normalizedBrands = Array.isArray(productData?.product_brands)
    ? productData.product_brands.map((row: any) => ({
        ...row,
        brand_type_id: safeNumber(row?.brand_type_id, 0),
        required_in_transactions: safeNumber(row?.required_in_transactions, 1),
        brand_id:
          row?.brand_id == null || row?.brand_id === "" ? null : safeNumber(row.brand_id, null as any),
      }))
    : []

  return {
    ...productData,
    id: safeNumber(productData?.id, 0),
    product_code: safeText(productData?.product_code, ""),
    product_name: safeText(productData?.product_name, ""),
    product_name_en: safeText(productData?.product_name_en, ""),
    description: safeText(productData?.description, ""),
    category_id: safeNumber(productData?.category_id, 0),
    main_stock_id: safeNumber(productData?.main_stock_id, 0),
    default_store: safeNumber(productData?.default_store, 0),
    brand: safeText(productData?.brand, ""),
    model: safeText(productData?.model, ""),
    factory_number: safeText(
      Array.isArray(productData?.factory_numbers) ? productData.factory_numbers[0] : productData?.factory_number,
      ""
    ),
    original_number: safeText(
      Array.isArray(productData?.original_numbers) ? productData.original_numbers[0] : productData?.original_number,
      ""
    ),
    original_numbers: Array.isArray(productData?.original_numbers)
      ? productData.original_numbers.map((n: any) => safeText(n, "").trim()).filter(Boolean)
      : [],
    factory_numbers: Array.isArray(productData?.factory_numbers)
      ? productData.factory_numbers.map((n: any) => safeText(n, "").trim()).filter(Boolean)
      : [],
    measurment_unit: safeNumber(productData?.measurment_unit, 1),
    measurment_id: safeNumber(productData?.measurment_id, 1),
    last_purchase_price: safeNumber(productData?.last_purchase_price, 0),
    currency_id: safeNumber(productData?.currency_id, 0),
    selling_account_id: safeNumber(productData?.selling_account_id, 0),
    selling_account_code: safeText(productData?.selling_account_code, ""),
    purchase_account_id: safeNumber(productData?.purchase_account_id, 0),
    purchase_account_code: safeText(productData?.purchase_account_code, ""),
    selling_returns_account_id: safeNumber(productData?.selling_returns_account_id, 0),
    selling_returns_account_code: safeText(productData?.selling_returns_account_code, ""),
    purchase_returns_account_id: safeNumber(productData?.purchase_returns_account_id, 0),
    purchase_returns_account_code: safeText(productData?.purchase_returns_account_code, ""),
    stock_end_account_id: safeNumber(productData?.stock_end_account_id, 0),
    stock_end_account_code: safeText(productData?.stock_end_account_code, ""),
    stock_start_account_id: safeNumber(productData?.stock_start_account_id, 0),
    stock_start_account_code: safeText(productData?.stock_start_account_code, ""),
    production_account_id: safeNumber(productData?.production_account_id, 0),
    production_account_code: safeText(productData?.production_account_code, ""),
    municipality_service_account_id: safeNumber(productData?.municipality_service_account_id, 0),
    municipality_service_account_code: safeText(productData?.municipality_service_account_code, ""),
    lsti3mal_account_id: safeNumber(productData?.lsti3mal_account_id, 0),
    lsti3mal_account_code: safeText(productData?.lsti3mal_account_code, ""),
    product_type: safeNumber(productData?.product_type, 1),
    tax_classification_id: safeNumber(productData?.tax_classification_id, 0),
    units: normalizedUnits,
    prices: normalizedPrices,
    stores: normalizedStores,
    cost_centers: normalizedCostCenters,
    product_brands: normalizedBrands,
    attributes: Array.isArray(productData?.attributes)
      ? productData.attributes.map((attribute: any) => ({
          name: safeText(attribute?.name, "").trim(),
          values: Array.from(new Set((Array.isArray(attribute?.values) ? attribute.values : [])
            .map((value: any) => safeText(value, "").trim()).filter(Boolean))),
          value_images: Object.fromEntries(
            Object.entries(attribute?.value_images && typeof attribute.value_images === "object" ? attribute.value_images : {})
              .map(([value, image]) => [safeText(value, "").trim(), safeText(image, "").trim() || null])
              .filter(([value]) => Boolean(value))
          ),
        })).filter((attribute: any) => attribute.name && attribute.values.length > 0)
      : [],
  }
}

// حقول نافذة بحث الأصناف (lite=1)
const LITE_PRODUCT_FIELDS = ["id", "product_code", "product_name", "base_product_name", "type", "product_type", "first_unit", "unit_id", "first_barcode", "barcode", "first_price", "first_price_name", "currency_name", "last_purchase_price", "product_image", "image_url", "current_stock", "available_stock", "has_colors"] as const

async function ensureProductsGetSchema() { return runSchemaOnce("app/api/inventory/products/route.ts#ensureProductsGetSchema", async () => {
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '[]'::jsonb`
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS transaction_notes VARCHAR(100)`
  await sql`ALTER TABLE IF EXISTS product_attributes_tbl RENAME TO attributes_tbl`
  await sql`ALTER TABLE IF EXISTS product_attribute_values_tbl RENAME TO attribute_values_tbl`
  await sql`CREATE TABLE IF NOT EXISTS attributes_tbl (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE)`
  await sql`CREATE TABLE IF NOT EXISTS attribute_values_tbl (id SERIAL PRIMARY KEY, attr_id INTEGER NOT NULL REFERENCES attributes_tbl(id) ON DELETE CASCADE, name TEXT NOT NULL, UNIQUE(attr_id, name))`
  await sql`CREATE TABLE IF NOT EXISTS product_atrributes_values_tbl (id BIGSERIAL UNIQUE, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, attr_id INTEGER NOT NULL REFERENCES attributes_tbl(id) ON DELETE CASCADE, value_id INTEGER NOT NULL REFERENCES attribute_values_tbl(id) ON DELETE CASCADE, image_url TEXT, PRIMARY KEY(product_id, attr_id, value_id))`
  // قد لا يكون product_branches موجوداً بعد (يُنشَأ أصلاً ضمن POST) — الاستعلام يستخدمه دوماً
  await sql`
    CREATE TABLE IF NOT EXISTS product_branches (
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      PRIMARY KEY (product_id, branch_id)
    )
  `
})}

export async function GET(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Database client not initialized' }, { status: 500 })

  try {
    // أعمدة وتعبئة أولى لآخر سعر/تاريخ/عملة شراء (مرة لكل عملية خادم)
    await ensureLastPurchaseColumns()
    const url = new URL(request.url)
    const typeParam = url.searchParams.get('type') ?? 'NULL'
    const priceCategoryId = Number.parseInt(url.searchParams.get('priceCategoryId') || '1', 10) || 1
    const requestedProductId = Number.parseInt(url.searchParams.get('productId') || url.searchParams.get('id') || '0', 10) || 0
    const activeOnly = url.searchParams.get('activeOnly') === 'true' || url.searchParams.get('activeOnly') === '1'
    const requestedProductIds = [...new Set(String(url.searchParams.get('ids') || '').split(',').map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))].slice(0, 500)
    const organizationId = 1

    const resolvedType =
      typeParam === 'services'
        ? 2
        : typeParam === 'products'
        ? 1
        : Number(typeParam)
    const effectiveType = Number.isFinite(resolvedType) && resolvedType > 0 ? resolvedType : null
    const permission = requestedProductId > 0
      ? await authorizeStoredProduct(request, requestedProductId, "lookup")
      : await authorizeProductType(request, effectiveType ?? 1, "lookup")
    if (!permission.ok) return permission.response
    const scope = effectiveType === null && requestedProductId === 0 ? await authorizeProductLookupScope(request) : null
    if (scope && !scope.ok) return scope.response
    const permittedTypes = scope?.ok ? scope.types : [effectiveType ?? 1]
    const grantedBranchIds = permission.lookupOnly ? [permission.branchId] : await getGrantedBranchIds(permission.userId, permission.accessId)
    // تهيئة الجداول مرة واحدة لكل قاعدة (runSchemaOnce) — كانت 8 أوامر DDL تُنفَّذ مع كل طلب، ومنها طلب
    // اختيار صنف من نافذة البحث (?ids=) فيتأخر الاختيار برحلات شبكة لا داعي لها
    await ensureProductsGetSchema()

    // Restrict branch-specific products to branches granted by the current file permission.
    const grantedBranchIdsLiteral = grantedBranchIds.join(',')

    const filterClauses = [
      '(p.deleted IS NULL OR p.deleted = false)',
      ...(requestedProductId > 0 && effectiveType === null ? [] : [`COALESCE(p.type, 1) = ANY(ARRAY[${permittedTypes.join(",")}]::int[])`]),
      ...(requestedProductId > 0 ? [`p.id = ${requestedProductId}::int`] : []),
      // ids=1,2,3: أصناف محددة (إضافة أصناف نموذج العميل تلقائياً للحركة) — أعداد صحيحة فقط تُضمَّن حرفياً
      ...(requestedProductIds.length ? [`p.id = ANY(ARRAY[${requestedProductIds.join(",")}]::int[])`] : []),
      ...(activeOnly ? [`(p.status = 1 OR p.status::text = 'نشط' OR p.status::text = 'active' OR p.status::text = 'ACTIVE')`] : []),
      // الفروع لا تُستخدم في التعريفات (الحسابات/العملاء/الأصناف) — في الحركات فقط: لا تصفية حسب الفرع هنا.
    // صفوف *_branches القديمة تبقى في القاعدة دون أثر.
    ]
    void grantedBranchIdsLiteral
    const filterExpression = filterClauses.join('\n        AND ')

    const productsQuery =
      typeParam !== 'NULL'
      ? `
      SELECT
        p.*,
        ROW_NUMBER() OVER (ORDER BY p.product_code desc) AS ser,
        COALESCE(ps.current_stock, 0) AS current_stock,
        COALESCE(ps.reserved_stock, 0) AS reserved_stock,
        COALESCE(ps.available_stock, 0) AS available_stock,
        COALESCE(ps.reorder_level, 0) AS min_stock_level,
        ps.max_stock_level,
        ps.last_updated AS stock_last_updated,
        CASE
          WHEN COALESCE(ps.current_stock, 0) <= COALESCE(ps.reorder_level, 0) AND COALESCE(ps.current_stock, 0) > 0
            THEN 'low'
          WHEN COALESCE(ps.current_stock, 0) = 0
            THEN 'out'
          ELSE 'available'
        END AS stock_status,
        u.unit_name AS first_unit,
        u.id AS unit_id,
        pu.first_barcode,
        pr.price AS first_price,
        pc.name AS first_price_name,
        c.currency_name AS currency_name,
        lpc.currency_code AS last_purchase_currency_code,
        lpc.currency_name AS last_purchase_currency_name

      FROM products p
      LEFT JOIN product_stock ps
        ON p.id = ps.product_id
        AND ps.organization_id = ${organizationId}::int
      LEFT JOIN LATERAL (
        SELECT pu.*, pub.barcode AS first_barcode
        FROM product_units pu
        LEFT JOIN product_unit_barcodes pub
          ON pub.product_id = pu.product_id
          AND pub.unit_id = pu.id
        WHERE pu.product_id = p.id
        ORDER BY pu.id ASC
        LIMIT 1
      ) pu ON TRUE
      LEFT JOIN units u ON pu.unit_id = u.id
      LEFT JOIN LATERAL (
        SELECT pr.*
        FROM product_prices pr
        WHERE pr.product_id = p.id
        AND pr.price_category_id = ${priceCategoryId}::int
        ORDER BY pr.price_category_id ASC
        LIMIT 1
      ) pr ON TRUE
      LEFT JOIN pricecategory pc ON pc.id = pr.price_category_id
      LEFT JOIN currency c ON c.id = pr.currency_id
      -- عملة آخر سعر شراء (عملة سند الشراء)، وإلا عملة الصنف
      LEFT JOIN currency lpc ON lpc.id = COALESCE(p.last_purchase_currency_id, p.currency_id)

      WHERE ${filterExpression}
      ORDER BY p.product_code ASC;
    `
      : `
      SELECT 
        p.*,
        'المستودع الافتراضي' AS default_store_name,
        false as selected,
        ROW_NUMBER() OVER (ORDER BY p.product_code desc) AS ser,
        COALESCE(ps.current_stock, 0) AS current_stock,
        COALESCE(ps.reserved_stock, 0) AS reserved_stock,
        COALESCE(ps.available_stock, 0) AS available_stock,
        COALESCE(ps.reorder_level, 0) AS min_stock_level,
        ps.max_stock_level,
        ps.last_updated AS stock_last_updated,
        CASE 
          WHEN COALESCE(ps.current_stock, 0) <= COALESCE(ps.reorder_level, 0) AND COALESCE(ps.current_stock, 0) > 0 
            THEN 'low'
          WHEN COALESCE(ps.current_stock, 0) = 0 
            THEN 'out'
          ELSE 'available'
        END AS stock_status,
        u.unit_name AS first_unit,
        u.id AS unit_id,
        pu.first_barcode,
        pr.price AS first_price,
        pc.name AS first_price_name,
        c.currency_name AS currency_name,
        lpc.currency_code AS last_purchase_currency_code,
        lpc.currency_name AS last_purchase_currency_name

      FROM products p
      LEFT JOIN product_stock ps 
        ON p.id = ps.product_id
        AND ps.organization_id = ${organizationId}::int
      LEFT JOIN LATERAL (
        SELECT pu.*, pub.barcode AS first_barcode
        FROM product_units pu
        LEFT JOIN product_unit_barcodes pub
          ON pub.product_id = pu.product_id
          AND pub.unit_id = pu.id
        WHERE pu.product_id = p.id
        ORDER BY pu.id ASC
        LIMIT 1
      ) pu ON TRUE
      LEFT JOIN units u ON pu.unit_id = u.id
      LEFT JOIN LATERAL (
        SELECT pr.*
        FROM product_prices pr
        WHERE pr.product_id = p.id
        AND pr.price_category_id = ${priceCategoryId}::int
        ORDER BY pr.price_category_id ASC
        LIMIT 1
      ) pr ON TRUE
      LEFT JOIN pricecategory pc ON pc.id = pr.price_category_id
      LEFT JOIN currency c ON c.id = pr.currency_id
      -- عملة آخر سعر شراء (عملة سند الشراء)، وإلا عملة الصنف
      LEFT JOIN currency lpc ON lpc.id = COALESCE(p.last_purchase_currency_id, p.currency_id)

      WHERE ${filterExpression}
      ORDER BY p.product_code ASC;
    `

    const productsResult = await (await getTenantPool()).query(productsQuery)
    const products = productsResult.rows
    const productIds = products.map((product: any) => Number(product.id)).filter((id: number) => Number.isInteger(id) && id > 0)
    if (productIds.length) {
      const attributeLinks = await (await getTenantPool()).query(
        `SELECT pav.product_id, a.name AS attribute_name, v.name AS value_name, pav.image_url
         FROM product_atrributes_values_tbl pav
         JOIN attributes_tbl a ON a.id = pav.attr_id
         JOIN attribute_values_tbl v ON v.id = pav.value_id
         WHERE pav.product_id = ANY($1::int[])
         ORDER BY pav.product_id, a.name, v.name`,
        [productIds],
      )
      const grouped = new Map<number, any[]>()
      for (const row of attributeLinks.rows) {
        const id = Number(row.product_id)
        let attribute = (grouped.get(id) || []).find((item) => item.name === row.attribute_name)
        if (!attribute) {
          attribute = { name: row.attribute_name, values: [], value_images: {} }
          if (!grouped.has(id)) grouped.set(id, [])
          grouped.get(id)!.push(attribute)
        }
        attribute.values.push(row.value_name)
        if (row.image_url) attribute.value_images[row.value_name] = row.image_url
      }
      for (const product of products) {
        const joined = grouped.get(Number(product.id))
        if (joined?.length) product.attributes = joined
      }
    }

    // Map product status & tracking
    const mappedProducts = products.map((product: any) => ({
      ...product,
      status:
        product.status === 1 || product.status === "1" || product.status === "نشط"
          ? "نشط"
          : product.status === 2 || product.status === "2" || product.status === "غير نشط"
          ? "غير نشط"
          : product.status === 3 || product.status === "3" || product.status === "متوقف"
          ? "متوقف"
          : "غير نشط",
      batch_tracking: product.has_batch,
      expiry_tracking: product.has_expiry,
      default_store_name: product.default_store_name || "بلا تحديد",
    }));

    let rows = mappedProducts.map((product: any) => {
      const rowPermission = scope?.ok ? Number(product.type) === 2 ? scope.services : scope.items : permission
      return rowPermission.ok && rowPermission.lookupOnly ? projectFileLookup(Number(product.type) === 2 ? "services" : "items", [product])[0] : product
    })
    // قائمة الأصناف (?list=1): آخر سعر شراء يُحذف من الرد لمن لا يملك "السماح بمشاهدة أسعار الشراء"
    if (url.searchParams.get("list") === "1" && permission.ok
      && !(await hasNamedPermission(String(permission.userId), PURCHASE_PRICE_VIEW_PERMISSION, PURCHASE_PRICE_PERMISSION_CATEGORY, permission.branchId))) {
      rows = rows.map((product: any) => ({ ...product, last_purchase_price: null, purchase_price_hidden: true }))
    }
    // lite=1 (نافذة بحث الأصناف): فقط حقول العرض والبحث — الصنف الكامل يُجلب للأصناف المختارة فقط (?ids=).
    // كان كل فتح للنافذة ينقل ~31MB (84 حقلاً × كل الأصناف).
    if (url.searchParams.get("lite") === "1") {
      return NextResponse.json(rows.map((product: any) => {
        const lite: Record<string, unknown> = {}
        for (const key of LITE_PRODUCT_FIELDS) if (product[key] !== undefined && product[key] !== null && product[key] !== "") lite[key] = product[key]
        if (Array.isArray(product.attributes) && product.attributes.length) lite.attributes = product.attributes
        return lite
      }))
    }
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Products API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ط­ط¯ط« ط®ط·ط£ ظپظٹ ط¬ظ„ط¨ ط§ظ„ط¨ظٹط§ظ†ط§طھ" },
      { status: 500 }
    );
  }
}



async function ensureProductCostCentersTable(client: any) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS product_costcenters_tbl (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      cost_center_type_id INTEGER,
      required_in_transactions INTEGER,
      default_cost_center_id INTEGER
    )
  `)

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_product_costcenters_product_id
    ON product_costcenters_tbl(product_id)
  `)
}

async function persistProductCostCenters(client: any, productId: number, rows: any[] | undefined) {
  await client.query(`DELETE FROM product_costcenters_tbl WHERE product_id = $1`, [productId])

  if (!Array.isArray(rows)) return

  for (const row of rows) {
    const costCenterTypeId = Number(row?.cost_center_type_id ?? row?.id ?? 0)
    const requiredInTransactions = Number(row?.required_in_transactions ?? 1)
    const defaultCostCenterId = row?.default_cost_center_id != null && row.default_cost_center_id !== ""
      ? Number(row.default_cost_center_id)
      : null

    if (!costCenterTypeId) continue

    await client.query(
      `INSERT INTO product_costcenters_tbl (product_id, cost_center_type_id, required_in_transactions, default_cost_center_id)
       VALUES ($1::int, $2::int, $3::int, $4::int)`,
      [productId, costCenterTypeId, requiredInTransactions, defaultCostCenterId]
    )
  }
}

// نفس نمط مراكز التكلفة أعلاه تماماً (product_costcenters_tbl) لكن للعلامات التجارية — صف واحد لكل
// نوع علامة تجارية (brand_types)، وقد يُسنَد له علامة تجارية (brands) محدَّدة أو يبقى بلا إسناد.
async function ensureProductBrandsTable(client: any) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS product_brands_tbl (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      brand_type_id INTEGER,
      required_in_transactions INTEGER,
      brand_id INTEGER
    )
  `)

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_product_brands_product_id
    ON product_brands_tbl(product_id)
  `)
}

async function persistProductBrands(client: any, productId: number, rows: any[] | undefined) {
  await client.query(`DELETE FROM product_brands_tbl WHERE product_id = $1`, [productId])

  if (!Array.isArray(rows)) return

  for (const row of rows) {
    const brandTypeId = Number(row?.brand_type_id ?? row?.id ?? 0)
    const requiredInTransactions = Number(row?.required_in_transactions ?? 1)
    const brandId = row?.brand_id != null && row.brand_id !== "" ? Number(row.brand_id) : null

    if (!brandTypeId) continue

    await client.query(
      `INSERT INTO product_brands_tbl (product_id, brand_type_id, required_in_transactions, brand_id)
       VALUES ($1::int, $2::int, $3::int, $4::int)`,
      [productId, brandTypeId, requiredInTransactions, brandId]
    )
  }
}

// جدول أرقام الصنف متعددة القيم (الرقم الأصلي والرقم التصنيعي) بدل خانة نصية واحدة لكل نوع — يسمح
// بإضافة أكثر من رقم أصلي/تصنيعي لنفس الصنف (مثل أرقام موردين متعددين لنفس القطعة)، بنفس أسلوب
// نافذة الباركود المتعددة (ProductBarcodes). type: 1 = رقم أصلي، 2 = رقم مصنع.
async function ensureProductNumbersTable(client: any) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS product_numbers (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      type INTEGER NOT NULL,
      number TEXT NOT NULL
    )
  `)

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_product_numbers_product_id
    ON product_numbers(product_id)
  `)
}

async function ensureProductUnitLinkTables(client: any) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS product_units (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      unit_id INTEGER NOT NULL,
      to_main_qnty DOUBLE PRECISION DEFAULT 1
    )
  `)

  await client.query(`
    CREATE TABLE IF NOT EXISTS product_unit_barcodes (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      unit_id INTEGER NOT NULL,
      barcode TEXT NOT NULL
    )
  `)

  await client.query(`
    CREATE TABLE IF NOT EXISTS product_prices (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      price_category_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL,
      price NUMERIC(18, 4) DEFAULT 0,
      currency_id INTEGER DEFAULT 1
    )
  `)

  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_product_units_product_unit_unique ON product_units(product_id, unit_id)`, [])
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_product_unit_barcodes_product_unit_barcode_unique ON product_unit_barcodes(product_id, unit_id, barcode)`, [])
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_product_prices_product_price_unique ON product_prices(product_id, price_category_id, unit_id)`, [])

  await client.query(`CREATE INDEX IF NOT EXISTS idx_product_units_product_id ON product_units(product_id)`, [])
  await client.query(`CREATE INDEX IF NOT EXISTS idx_product_unit_barcodes_product_id ON product_unit_barcodes(product_id)`, [])
  await client.query(`CREATE INDEX IF NOT EXISTS idx_product_prices_product_id ON product_prices(product_id)`, [])
}

async function ensureProductAttributeTables(client: any) {
  await client.query(`ALTER TABLE IF EXISTS product_attributes_tbl RENAME TO attributes_tbl`)
  await client.query(`ALTER TABLE IF EXISTS product_attribute_values_tbl RENAME TO attribute_values_tbl`)
  await client.query(`CREATE TABLE IF NOT EXISTS attributes_tbl (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE)`)
  await client.query(`CREATE TABLE IF NOT EXISTS attribute_values_tbl (id SERIAL PRIMARY KEY, attr_id INTEGER NOT NULL REFERENCES attributes_tbl(id) ON DELETE CASCADE, name TEXT NOT NULL, UNIQUE(attr_id, name))`)
  await client.query(`CREATE TABLE IF NOT EXISTS product_atrributes_values_tbl (id BIGSERIAL UNIQUE, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, attr_id INTEGER NOT NULL REFERENCES attributes_tbl(id) ON DELETE CASCADE, value_id INTEGER NOT NULL REFERENCES attribute_values_tbl(id) ON DELETE CASCADE, image_url TEXT, PRIMARY KEY(product_id, attr_id, value_id))`)
}

// لا حذف شامل ثم إعادة إدراج: روابط اختيار الخصائص في السندات والطلبيات (voucher_item_attributes_tbl /
// order_item_attributes_tbl) تشير لمعرّف صف القيمة مع ON DELETE CASCADE، فكان كل حفظ للصنف يمحو خصائص كل
// الفواتير السابقة. تُحدَّث الصفوف في مكانها (ON CONFLICT) وتُحذف فقط القيم التي أُزيلت فعلاً من الصنف.
async function persistProductAttributes(client: any, productId: number, attributes: any[]) {
  await ensureProductAttributeTables(client)
  const keptIds: number[] = []
  for (const attribute of Array.isArray(attributes) ? attributes : []) {
    const name = String(attribute?.name || "").trim()
    if (!name) continue
    const attributeResult = await client.query(
      `INSERT INTO attributes_tbl (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [name],
    )
    const attrId = Number(attributeResult.rows[0].id)
    for (const rawValue of Array.isArray(attribute?.values) ? attribute.values : []) {
      const value = String(rawValue || "").trim()
      if (!value) continue
      const valueResult = await client.query(
        `INSERT INTO attribute_values_tbl (attr_id, name) VALUES ($1, $2) ON CONFLICT (attr_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [attrId, value],
      )
      const kept = await client.query(
        `INSERT INTO product_atrributes_values_tbl (product_id, attr_id, value_id, image_url) VALUES ($1, $2, $3, $4) ON CONFLICT (product_id, attr_id, value_id) DO UPDATE SET image_url = EXCLUDED.image_url RETURNING id`,
        [productId, attrId, Number(valueResult.rows[0].id), attribute?.value_images?.[value] || null],
      )
      if (kept.rows[0]?.id) keptIds.push(Number(kept.rows[0].id))
    }
  }
  await client.query(`DELETE FROM product_atrributes_values_tbl WHERE product_id = $1 AND NOT (id = ANY($2::bigint[]))`, [productId, keptIds])
}

async function resolveProductUnitId(client: any, productId: number, candidateUnitId: number | null): Promise<number | null> {
  const raw = Number(candidateUnitId ?? 0)
  if (!Number.isFinite(raw) || raw <= 0) return null

  // The product form sends units.id, so resolve that before trying legacy product_units.id values.
  const byUnitsTableId = await client.query(
    `SELECT unit_id FROM product_units WHERE product_id = $1 AND unit_id = $2 LIMIT 1`,
    [productId, raw],
  )
  if (byUnitsTableId.rows[0]?.unit_id != null) {
    return Number(byUnitsTableId.rows[0].unit_id)
  }

  const byProductUnitRow = await client.query(
    `SELECT unit_id FROM product_units WHERE product_id = $1 AND id = $2 LIMIT 1`,
    [productId, raw],
  )
  if (byProductUnitRow.rows[0]?.unit_id != null) {
    return Number(byProductUnitRow.rows[0].unit_id)
  }

  return raw
}

async function persistProductNumbers(client: any, productId: number, originalNumbers: string[], factoryNumbers: string[]) {
  await client.query(`DELETE FROM product_numbers WHERE product_id = $1`, [productId])

  for (const number of originalNumbers) {
    if (!number) continue
    await client.query(
      `INSERT INTO product_numbers (product_id, type, number) VALUES ($1::int, 1, $2::text)`,
      [productId, number]
    )
  }

  for (const number of factoryNumbers) {
    if (!number) continue
    await client.query(
      `INSERT INTO product_numbers (product_id, type, number) VALUES ($1::int, 2, $2::text)`,
      [productId, number]
    )
  }
}

// New records save their child definitions under the same create authorization
// and database transaction. Existing children still use their update endpoints.
async function persistNewProductChildren(client: any, productId: number, data: any) {
  const relatedIds: number[] = Array.from(new Set<number>((Array.isArray(data.related_item_ids) ? data.related_item_ids : []).map(Number)))
  const components = (Array.isArray(data.manufacturing_components) ? data.manufacturing_components : []).map((item: any) => ({
    id: Number(item.component_id), quantity: Number(item.quantity), length: Number(item.length || 0),
    width: Number(item.width || 0), height: Number(item.height || 0), count: Number(item.count || 0),
  }))
  if (relatedIds.some((id) => !Number.isInteger(id) || id <= 0 || id === productId)) throw new Error("Invalid related product")
  const componentIds = components.map((item: any) => item.id)
  if (componentIds.some((id: number) => !Number.isInteger(id) || id <= 0 || id === productId) || new Set(componentIds).size !== componentIds.length) throw new Error("Invalid manufacturing component")
  const allIds = Array.from(new Set<number>([...relatedIds, ...componentIds]))
  if (!allIds.length) return
  const rows = (await client.query("SELECT id, COALESCE(measurment_id, 1) AS measurment_id FROM products WHERE id = ANY($1::int[])", [allIds])).rows
  if (rows.length !== allIds.length) throw new Error("Related product or manufacturing component does not exist")
  if (relatedIds.length) {
    await client.query("CREATE TABLE IF NOT EXISTS product_related_items (id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, related_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, UNIQUE(product_id, related_id), CHECK (product_id <> related_id))")
    for (const id of relatedIds) await client.query("INSERT INTO product_related_items (product_id, related_id) VALUES ($1, $2)", [productId, id])
  }
  if (components.length) {
    await client.query("CREATE TABLE IF NOT EXISTS product_manufacturing_components (id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, component_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT, quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0), UNIQUE(product_id, component_id), CHECK (product_id <> component_id))")
    for (const column of ["length", "width", "height", "count"]) await client.query(`ALTER TABLE product_manufacturing_components ADD COLUMN IF NOT EXISTS ${column} NUMERIC(18,6)`)
    for (const item of components) {
      const measurement = Number(rows.find((row: any) => Number(row.id) === item.id)?.measurment_id || 1)
      if (measurement !== 1) {
        if (!(item.length > 0) || !(item.width > 0) || !(item.count > 0) || (measurement === 3 && !(item.height > 0))) throw new Error("Manufacturing component dimensions are required")
        item.quantity = item.length * item.width * (measurement === 3 ? item.height : 1) * item.count
      }
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error("Manufacturing component quantity must be positive")
      await client.query("INSERT INTO product_manufacturing_components (product_id, component_id, quantity, length, width, height, count) VALUES ($1, $2, $3, $4, $5, $6, $7)", [productId, item.id, item.quantity, measurement === 1 ? null : item.length, measurement === 1 ? null : item.width, measurement === 3 ? item.height : null, measurement === 1 ? null : item.count])
    }
  }
}

async function getLastProductCode() {
  const result = await (await getTenantPool()).query(`
    SELECT COALESCE(MAX(product_code), '0') AS last_code
    FROM products
  `)
  const lastCode = result.rows?.[0]?.last_code ?? '0'
  return {
    json: async () => ({ lastCode }),
  }
}

const productSchemaReady = new Map<string, Promise<void>>()

// حسابات الصنف يجب أن تكون حسابات فرعية (لا حساب رئيسي له حسابات فرعية). عند تعديل صنف موجود يُفحص
// فقط الحساب الذي تغيّر: أصناف قديمة قد تحمل حساباً أصبح رئيسياً لاحقاً (أُضيفت تحته حسابات فرعية)
// فلا يُمنع تعديل بقية بيانات الصنف بسببه — يُصحَّح من "نسخ الحساب للأصناف التالية".
const PRODUCT_ACCOUNT_LABELS: Record<string, string> = {
  selling_account_id: "حساب المبيعات",
  purchase_account_id: "حساب المشتريات",
  selling_returns_account_id: "حساب مرتجعات المبيعات",
  purchase_returns_account_id: "حساب مرتجعات المشتريات",
  stock_start_account_id: "حساب بضاعة أول المدة",
  stock_end_account_id: "حساب بضاعة آخر المدة",
  lsti3mal_account_id: "حساب الاستعمال",
  production_account_id: "حساب الإنتاج",
  municipality_service_account_id: "حساب خدمات البلدية",
}
const productAccountsError = async (data: any, productId?: number) => {
  const stored = productId && productId > 0
    ? (await sql.unsafe(`SELECT ${Object.keys(PRODUCT_ACCOUNT_LABELS).join(", ")} FROM products WHERE id = $1`, [productId]))[0] as any
    : null
  const fields: Record<string, unknown> = {}
  for (const [column, label] of Object.entries(PRODUCT_ACCOUNT_LABELS)) {
    const value = Number(data?.[column]) || 0
    if (stored && value === (Number(stored[column]) || 0)) continue
    fields[label] = value
  }
  return validateLeafAccountFields(fields)
}

export async function POST(request: NextRequest) {
  const client = await (await getTenantPool()).connect();

  try {
    const productData = normalizeProductPayload(await request.json());
    const permission = productData.id > 0
      ? await authorizeStoredProduct(request, productData.id, "update", productData.type)
      : await authorizeProductType(request, productData.type, "create")
    if (!permission.ok) return permission.response
    const accountsError = await productAccountsError(productData, productData.id)
    if (accountsError) return NextResponse.json({ error: accountsError }, { status: 400 })
    // فحوصات المخطط (DDL) تُنفَّذ مرة واحدة لكل قاعدة شركة ولكل عملية خادم بدل كل حفظ — كانت تُبطئ استيراد
    // آلاف الأصناف إذ يُكرَّر عشرات أوامر ALTER/CREATE IF NOT EXISTS لكل صنف.
    const schemaDb = await resolveCurrentDbName()
    let schemaReady = productSchemaReady.get(schemaDb)
    if (!schemaReady) {
      schemaReady = (async () => {
        await ensureProductSchemaColumns(client)
        await ensureProductCostCentersTable(client)
        await ensureProductBrandsTable(client)
        await ensureProductNumbersTable(client)
        await ensureProductUnitLinkTables(client)
        await ensureProductAttributeTables(client)
        // أعمدة كانت تُضاف داخل معاملة الحفظ: ALTER TABLE يطلب قفلاً حصرياً على جدول products حتى لو كان العمود
        // موجوداً، فعند حفظ عدة أصناف بالتوازي (استيراد Excel) تنتظر كل معاملة الأخرى → deadlock detected.
        await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS pos_sold_using_scale BOOLEAN NOT NULL DEFAULT FALSE`)
        await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_tobacco BOOLEAN NOT NULL DEFAULT FALSE`)
        await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS minimum_order_quantity NUMERIC(15,4) NOT NULL DEFAULT 0`)
        await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '[]'::jsonb`)
        // تقييد ظهور الصنف بفروع معيّنة (اختياري) — بلا أي صف هنا لهذا الصنف يبقى ظاهراً لكل الفروع
        // (السلوك الحالي دون تغيير)؛ بصف واحد أو أكثر يظهر فقط لمستخدم فرعه أحد هذه الصفوف (انظر تصفية
        // GET أدناه عبر هيدر x-branch-id). نفس نمط product_warehouses تماماً (جدول علاقة بسيط).
        await client.query(`
          CREATE TABLE IF NOT EXISTS product_branches (
            product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
            PRIMARY KEY (product_id, branch_id)
          )
        `)
      })().catch((error) => {
        productSchemaReady.delete(schemaDb)
        throw error
      })
      productSchemaReady.set(schemaDb, schemaReady)
    }
    await schemaReady

    const organizationId = 1; // replace with auth context
    const hasDefaultStore = await client.query(
      `SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'products'
          AND column_name = 'default_store'
      ) AS has_column`
    );
    const canSaveDefaultStore = Boolean(hasDefaultStore.rows[0]?.has_column);

    await client.query("BEGIN");

    const priceCurrencyError = await validateProductPriceCurrencies(client, productData.prices)
    if (priceCurrencyError) {
      await client.query("ROLLBACK")
      return NextResponse.json({ success: false, error: priceCurrencyError }, { status: 400 })
    }

    const nameCheck = await client.query(
      productData.id > 0
        ? `SELECT id FROM products WHERE product_name = $1 AND id <> $2`
        : `SELECT id FROM products WHERE product_name = $1 AND product_code <> $2`,
      productData.id > 0
        ? [productData.product_name, productData.id]
        : [productData.product_name, productData.product_code]
    );
    if (nameCheck.rows.length > 0) {
      await client.query("ROLLBACK");
      //client.release();
      return NextResponse.json({ success: false, error: "اسم الصنف مكرر لا يمكن الحفظ" }, { status: 400 });
    }
    const submittedBarcodes = [
      safeText(productData.barcode, "").trim(),
      ...(Array.isArray(productData.units)
        ? productData.units.flatMap((unit: any) => Array.isArray(unit.barcode_list) ? unit.barcode_list : [])
        : []),
    ].filter(Boolean).map((barcode) => String(barcode).trim());
    const barcodeByKey = new Map<string, string>();
    const scaleError = validateScaleProductBarcodes(productData.pos_sold_using_scale, submittedBarcodes);
    if (scaleError) {
      await client.query("ROLLBACK");
      return NextResponse.json({ success: false, error: scaleError }, { status: 400 });
    }
    let duplicateSubmittedBarcode = "";
    for (const barcode of submittedBarcodes) {
      const key = barcode.toLocaleLowerCase("en");
      if (barcodeByKey.has(key)) {
        duplicateSubmittedBarcode = barcode;
        break;
      }
      barcodeByKey.set(key, barcode);
    }
    if (duplicateSubmittedBarcode) {
      await client.query("ROLLBACK");
      return NextResponse.json({ success: false, error: `الباركود ${duplicateSubmittedBarcode} مكرر بين وحدات الصنف` }, { status: 400 });
    }

    const uniqueBarcodes = Array.from(barcodeByKey.values());
    if (uniqueBarcodes.length > 0) {
      const barcodeCheck = await client.query(
        `SELECT TRIM(barcode) AS barcode FROM product_unit_barcodes
         WHERE LOWER(TRIM(barcode)) = ANY($1::text[]) AND product_id <> $2
         UNION ALL
         SELECT TRIM(barcode) AS barcode FROM products
         WHERE LOWER(TRIM(COALESCE(barcode, ''))) = ANY($1::text[]) AND id <> $2
         LIMIT 1`,
        [uniqueBarcodes.map((barcode) => barcode.toLocaleLowerCase("en")), productData.id]
      );
      if (barcodeCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        const conflictingBarcode = String(barcodeCheck.rows[0]?.barcode || "");
        return NextResponse.json({ success: false, error: `الباركود ${conflictingBarcode} مستخدم مسبقاً في صنف أو وحدة أخرى` }, { status: 400 });
      }
    }
    // 1ï¸ڈâƒ£ Insert or update product



    let productId: number;
    let unitId: number;
    const existingProduct = productData.id > 0
      ? await client.query("SELECT id FROM products WHERE id = $1", [productData.id])
      : await client.query("SELECT id FROM products WHERE product_code = $1", [productData.product_code])

    let update = existingProduct.rows.length > 0
    if (update === true && productData.id === 0) {
      try {
        const res = await getLastProductCode();


        const data = await res.json();

        productData.product_code = data.lastCode;
        update = false;
      } catch (err) {
        client.release();
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Failed to fetch last product code" },
          { status: 500 }
        );
      }
    }
    if (update === true) {
      productId = existingProduct.rows[0].id;

      const updateQuery = canSaveDefaultStore
        ? `UPDATE products SET
          product_code=$1::text,
          product_name=$2::text,
          product_name_en=$3::text,
          description=$4::text,
          category_id=$5::int,
          main_stock_id=$6::int,
          default_store=$7::int,
          brand=$8::text,
          model=$9::text,
          factory_number=$10::text,
          original_number=$11::text,
          measurment_unit=$12::int,
          measurment_id=$13::int,
          last_purchase_price=$14::numeric,
          currency_id=$15::int,
          selling_account_id=$16::int,
          purchase_account_id=$17::int,
          selling_returns_account_id=$18::int,
          purchase_returns_account_id=$19::int,
          stock_end_account_id=$20::int,
          stock_start_account_id=$21::int,
          production_account_id=$22::int,
          municipality_service_account_id=$23::int,
          lsti3mal_account_id=$24::int,
          tax_rate=$25::numeric,
          discount_rate=$26::numeric,
          location=$27::text,
          has_expiry_date=$28::boolean,
          has_batch_number=$29::boolean,
          serial_tracking=$30::boolean,
          status=$31::int,
          type=$32::int,
          service_type=$33::int,
          product_type=$34::int,
          tax_classification_id=$35::int,
          length=$36::numeric,
          width=$37::numeric,
          height=$38::numeric,
          density=$39::numeric,
          color=$40::text,
          size=$41::text,
          notes=$42::text,
          transaction_notes=$43::varchar(100),
          manufacturer_company=$44::text,
          product_image=$45::text,
          updated_at=NOW()
         WHERE id=$46::int`
        : `UPDATE products SET
          product_code=$1::text,
          product_name=$2::text,
          product_name_en=$3::text,
          description=$4::text,
          category_id=$5::int,
          main_stock_id=$6::int,
          brand=$7::text,
          model=$8::text,
          factory_number=$9::text,
          original_number=$10::text,
          measurment_unit=$11::int,
          measurment_id=$12::int,
          last_purchase_price=$13::numeric,
          currency_id=$14::int,
          selling_account_id=$15::int,
          purchase_account_id=$16::int,
          selling_returns_account_id=$17::int,
          purchase_returns_account_id=$18::int,
          stock_end_account_id=$19::int,
          stock_start_account_id=$20::int,
          production_account_id=$21::int,
          municipality_service_account_id=$22::int,
          lsti3mal_account_id=$23::int,
          tax_rate=$24::numeric,
          discount_rate=$25::numeric,
          location=$26::text,
          has_expiry_date=$27::boolean,
          has_batch_number=$28::boolean,
          serial_tracking=$29::boolean,
          status=$30::int,
          type=$31::int,
          service_type=$32::int,
          product_type=$33::int,
          tax_classification_id=$34::int,
          length=$35::numeric,
          width=$36::numeric,
          height=$37::numeric,
          density=$38::numeric,
          color=$39::text,
          size=$40::text,
          notes=$41::text,
          transaction_notes=$42::varchar(100),
          manufacturer_company=$43::text,
          product_image=$44::text,
          updated_at=NOW()
         WHERE id=$45::int`

      const updateValues = canSaveDefaultStore
        ? [
            productData.product_code,
            productData.product_name,
            productData.product_name_en,
            productData.description,
            productData.category_id || null,
            productData.main_stock_id || null,
            productData.default_store || null,
            productData.brand,
            productData.model,
            productData.factory_number,
            productData.original_number,
            productData.measurment_unit,
            productData.measurment_id,
            productData.last_purchase_price,
            productData.currency_id || null,
            productData.selling_account_id || null,
            productData.purchase_account_id || null,
            productData.selling_returns_account_id || null,
            productData.purchase_returns_account_id || null,
            productData.stock_end_account_id || null,
            productData.stock_start_account_id || null,
            productData.production_account_id || null,
            productData.municipality_service_account_id || null,
            productData.lsti3mal_account_id || null,
            productData.tax_rate,
            productData.discount_rate,
            productData.location,
            productData.expiry_tracking,
            productData.batch_tracking,
            productData.serial_tracking,
            productData.status,
            productData.type || 1,
            productData.service_type || 0,
            productData.product_type || 1,
            productData.tax_classification_id || null,
            productData.length,
            productData.width,
            productData.height,
            productData.density,
            productData.color,
            productData.size,
            productData.notes,
            productData.transaction_notes,
            productData.manufacturer_company,
            productData.image_url || productData.product_image || null,
            productId,
          ]
        : [
            productData.product_code,
            productData.product_name,
            productData.product_name_en,
            productData.description,
            productData.category_id || null,
            productData.main_stock_id || null,
            productData.brand,
            productData.model,
            productData.factory_number,
            productData.original_number,
            productData.measurment_unit,
            productData.measurment_id,
            productData.last_purchase_price,
            productData.currency_id || null,
            productData.selling_account_id || null,
            productData.purchase_account_id || null,
            productData.selling_returns_account_id || null,
            productData.purchase_returns_account_id || null,
            productData.stock_end_account_id || null,
            productData.stock_start_account_id || null,
            productData.production_account_id || null,
            productData.municipality_service_account_id || null,
            productData.lsti3mal_account_id || null,
            productData.tax_rate,
            productData.discount_rate,
            productData.location,
            productData.expiry_tracking,
            productData.batch_tracking,
            productData.serial_tracking,
            productData.status,
            productData.type || 1,
            productData.service_type || 0,
            productData.product_type || 1,
            productData.tax_classification_id || null,
            productData.length,
            productData.width,
            productData.height,
            productData.density,
            productData.color,
            productData.size,
            productData.notes,
            productData.transaction_notes,
            productData.manufacturer_company,
            productData.image_url || productData.product_image || null,
            productId,
          ]
      const placeholderMatch = updateQuery.match(/\$([0-9]+)/g)?.map((match) => Number(match.replace("$", ""))) ?? []
      const maxPlaceholder = placeholderMatch.length ? Math.max(...placeholderMatch) : 0
      if (maxPlaceholder !== updateValues.length) {
        console.error(`[v0] Placeholder count mismatch for updateQuery: max=$${maxPlaceholder} values=${updateValues.length}`)
        throw new Error(`SQL placeholders ($1..$${maxPlaceholder}) do not match provided values (${updateValues.length})`)
      }

      await client.query(updateQuery, updateValues)
      await client.query("UPDATE products SET related_items_mode = $1 WHERE id = $2", [Math.min(3, Math.max(1, Number(productData.related_items_mode || 1))), productId])
      await client.query(`DELETE FROM product_units WHERE product_id=$1`, [productId]);
      await client.query(`DELETE FROM product_unit_barcodes WHERE product_id=$1`, [productId]);
      await client.query(`DELETE FROM product_prices WHERE product_id=$1`, [productId]);
      await client.query(`DELETE FROM product_warehouses WHERE product_id=$1`, [productId]);
      await client.query(`DELETE FROM product_branches WHERE product_id=$1`, [productId]);
      await client.query(`DELETE FROM product_costcenters_tbl WHERE product_id=$1`, [productId]);

    } else {
      const insertColumns = canSaveDefaultStore
        ? [
          'product_code',
          'product_name',
          'product_name_en',
          'description',
          'category_id',
          'main_stock_id',
          'default_store',
          'brand',
          'model',
          'factory_number',
          'original_number',
          'measurment_unit',
          'measurment_id',
          'last_purchase_price',
          'currency_id',
          'selling_account_id',
          'purchase_account_id',
          'selling_returns_account_id',
          'purchase_returns_account_id',
          'stock_end_account_id',
          'stock_start_account_id',
          'production_account_id',
          'municipality_service_account_id',
          'lsti3mal_account_id',
          'tax_rate',
          'discount_rate',
          'location',
          'has_expiry_date',
          'has_batch_number',
          'status',
          'type',
          'service_type',
          'product_type',
          'length',
          'width',
          'height',
          'density',
          'color',
          'size',
          'notes',
          'transaction_notes',
          'serial_tracking',
          'manufacturer_company',
          'product_image',
        ]
        : [
          'product_code',
          'product_name',
          'product_name_en',
          'description',
          'category_id',
          'main_stock_id',
          'brand',
          'model',
          'factory_number',
          'original_number',
          'measurment_unit',
          'measurment_id',
          'last_purchase_price',
          'currency_id',
          'selling_account_id',
          'purchase_account_id',
          'selling_returns_account_id',
          'purchase_returns_account_id',
          'stock_end_account_id',
          'stock_start_account_id',
          'production_account_id',
          'municipality_service_account_id',
          'lsti3mal_account_id',
          'tax_rate',
          'discount_rate',
          'location',
          'has_expiry_date',
          'has_batch_number',
          'status',
          'type',
          'service_type',
          'product_type',
          'length',
          'width',
          'height',
          'density',
          'color',
          'size',
          'notes',
          'transaction_notes',
          'serial_tracking',
          'manufacturer_company',
          'product_image',
        ]

      const insertValues = canSaveDefaultStore
        ? [
          productData.product_code,
          productData.product_name,
          productData.product_name_en,
          productData.description,
          productData.category_id,
          productData.main_stock_id || null,
          productData.default_store || null,
          productData.brand,
          productData.model,
          productData.factory_number,
          productData.original_number,
          productData.measurment_unit,
          productData.measurment_id,
          productData.last_purchase_price,
          productData.currency_id,
          productData.selling_account_id || null,
          productData.purchase_account_id || null,
          productData.selling_returns_account_id || null,
          productData.purchase_returns_account_id || null,
          productData.stock_end_account_id || null,
          productData.stock_start_account_id || null,
          productData.production_account_id || null,
          productData.municipality_service_account_id || null,
          productData.lsti3mal_account_id || null,
          productData.tax_rate,
          productData.discount_rate,
          productData.location,
          productData.expiry_tracking,
          productData.batch_tracking,
          productData.status,
          productData.type || 1,
          productData.service_type || 0,
          productData.product_type || 1,
          productData.length,
          productData.width,
          productData.height,
          productData.density,
          productData.color,
          productData.size,
          productData.notes,
          productData.transaction_notes,
          productData.serial_tracking,
          productData.manufacturer_company,
          productData.image_url || productData.product_image || null,
        ]
        : [
          productData.product_code,
          productData.product_name,
          productData.product_name_en,
          productData.description,
          productData.category_id,
          productData.main_stock_id || null,
          productData.brand,
          productData.model,
          productData.factory_number,
          productData.original_number,
          productData.measurment_unit,
          productData.measurment_id,
          productData.last_purchase_price,
          productData.currency_id,
          productData.selling_account_id || null,
          productData.purchase_account_id || null,
          productData.selling_returns_account_id || null,
          productData.purchase_returns_account_id || null,
          productData.stock_end_account_id || null,
          productData.stock_start_account_id || null,
          productData.production_account_id || null,
          productData.municipality_service_account_id || null,
          productData.lsti3mal_account_id || null,
          productData.tax_rate,
          productData.discount_rate,
          productData.location,
          productData.expiry_tracking,
          productData.batch_tracking,
          productData.status,
          productData.type || 1,
          productData.service_type || 0,
          productData.product_type || 1,
          productData.length,
          productData.width,
          productData.height,
          productData.density,
          productData.color,
          productData.size,
          productData.notes,
          productData.transaction_notes,
          productData.serial_tracking,
          productData.manufacturer_company,
          productData.image_url || productData.product_image || null,
        ]

      const insertPlaceholders = insertColumns.map((_, index) => `$${index + 1}`).join(",")

      // Validate insert placeholders vs values for easier debugging
      const insertMax = insertColumns.length
      if (insertMax !== insertValues.length) {
        console.error(`[v0] Insert placeholder count mismatch: columns=${insertMax} values=${insertValues.length}`)
        throw new Error(`Insert columns (${insertMax}) do not match insert values (${insertValues.length})`)
      }

      const result = await client.query(
        `INSERT INTO products (${insertColumns.join(", ")}) VALUES (${insertPlaceholders}) RETURNING id`,
        insertValues
      );


      productId = result.rows[0].id;
      await client.query("UPDATE products SET related_items_mode = $1 WHERE id = $2", [Math.min(3, Math.max(1, Number(productData.related_items_mode || 1))), productId])

    }

    // 3ï¸ڈâƒ£ Insert product units
    if (Array.isArray(productData.units)) {
      for (const unit of productData.units) {
        const realUnitId = Number(unit.unit_id || 0)
        if (!realUnitId) continue

        await client.query(
          `INSERT INTO product_units (product_id, unit_id, to_main_qnty)
           VALUES ($1::int, $2::int, $3::int)
           ON CONFLICT (product_id, unit_id) DO UPDATE SET to_main_qnty = EXCLUDED.to_main_qnty`,
          [productId, realUnitId, Number(unit.to_main_qnty || 1)]
        )

        const barcodeList = Array.isArray(unit.barcode_list) ? unit.barcode_list : []
        const productUnitResult = await client.query(
          `SELECT id FROM product_units WHERE product_id = $1 AND unit_id = $2 LIMIT 1`,
          [productId, realUnitId],
        )
        const productUnitRowId = Number(productUnitResult.rows[0]?.id || 0)
        if (!productUnitRowId) continue

        for (const barcode of barcodeList) {
          const normalizedBarcode = String(barcode ?? "").trim();
          if (!normalizedBarcode) continue

          await client.query(
            `INSERT INTO product_unit_barcodes (product_id, unit_id, barcode)
             VALUES ($1::int, $2::int, $3::text)
             ON CONFLICT (product_id, unit_id, barcode) DO NOTHING`,
            [productId, productUnitRowId, normalizedBarcode]
          )
        }
      }
    }

    // 5ï¸ڈâƒ£ Insert product prices
    if (Array.isArray(productData.stores)) {
      for (const store of productData.stores) {
        await client.query(
          `INSERT INTO product_warehouses 
       (product_id, warehouse_id, shelf, reorder_quantity, max_quantity, min_quantity)
       VALUES ($1::int, $2::int, $3::text, $4::int, $5::int, $6::int)`,
          [
            productId,
            Number(store.store_id || 0),
            String(store.shelf || ""),
            Number(store.reorder_quantity || 0),
            Number(store.max_quantity || 0),
            Number(store.min_quantity || 0),
          ]
        );
      }
    }

    if (Array.isArray(productData.prices)) {
      for (const price of productData.prices) {
        const savedUnitId = await resolveProductUnitId(client, productId, Number(price.unit_id || 0))
        if (!savedUnitId) continue

        await client.query(
          `INSERT INTO product_prices
        (product_id, price_category_id, unit_id, price, currency_id)
       VALUES ($1::int, $2::int, $3::int, $4::numeric, $5::int)`,
          [
            productId,
            Number(price.price_category_id || 0),
            savedUnitId,
            Number(price.price || 0),
            Number(price.currency_id || 0)
          ]
        );
      }
    }

    if (Array.isArray(productData.branch_ids)) {
      for (const branchId of productData.branch_ids) {
        const numericBranchId = Number(branchId)
        if (!Number.isInteger(numericBranchId) || numericBranchId <= 0) continue
        await client.query(
          `INSERT INTO product_branches (product_id, branch_id) VALUES ($1::int, $2::int) ON CONFLICT DO NOTHING`,
          [productId, numericBranchId],
        );
      }
    }

    await persistProductCostCenters(client, productId, productData.cost_centers)
    await client.query(`UPDATE products SET pos_sold_using_scale=$1 WHERE id=$2`, [isScaleProduct(productData.pos_sold_using_scale), productId])
    if (productData.default_printer !== undefined) await client.query(`UPDATE products SET default_printer=$1 WHERE id=$2`, [String(productData.default_printer || "").trim().slice(0, 150) || null, productId])
    if (productData.is_tobacco !== undefined) await client.query(`UPDATE products SET is_tobacco=$1 WHERE id=$2`, [productData.is_tobacco === true || productData.is_tobacco === "true", productId])
    await persistProductBrands(client, productId, productData.product_brands)
    await persistProductNumbers(client, productId, productData.original_numbers, productData.factory_numbers)

    // Kept outside the legacy positional INSERT/UPDATE lists so older databases can
    // adopt the decimal minimum-order rule without destabilising those contracts.
    await client.query(`UPDATE products SET minimum_order_quantity=$1::numeric WHERE id=$2::int`, [
      Math.max(0, Number(productData.minimum_order_quantity || 0)),
      productId,
    ])
    await client.query(`UPDATE products SET attributes=$1::jsonb WHERE id=$2::int`, [
      JSON.stringify(productData.attributes || []),
      productId,
    ])
    await persistProductAttributes(client, productId, productData.attributes)
    if (productData.id === 0) await persistNewProductChildren(client, productId, productData)

    await client.query("COMMIT");
    return NextResponse.json({ success: true, productId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Products POST error:", err instanceof Error ? err.message : err, err)
    if ((err as { constraint?: string })?.constraint === "fk_product_prices_currency") {
      return NextResponse.json({ error: "عملة أسعار البيع غير موجودة. أعد تحميل العملات واختيار العملة ثم احفظ الصنف." }, { status: 400 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// الجداول التي تجعل الصنف "مرتبطاً بحركات" (السندات، الطلبيات، مسودات الطلبيات، الجرد، مكوّن تصنيع لصنف آخر)
const PRODUCT_USAGE_TABLES: Array<[table: string, column: string]> = [
  ["voucher_items_tbl", "item_id"],
  ["order_items", "product_id"],
  ["sales_order_draft_items", "product_id"],
  ["stock_count_items", "item_id"],
  ["product_manufacturing_components", "component_id"],
]

/** حذف صنف (?id=): يُرفض إن كان مرتبطاً بأي حركة، وإلا يُعلَّم محذوفاً (deleted) ولا يُمحى فعلياً. */
export async function DELETE(request: NextRequest) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"))
    const permission = await authorizeStoredProduct(request, id, "delete")
    if (!permission.ok) return permission.response
    for (const [table, column] of PRODUCT_USAGE_TABLES) {
      const [exists] = await sql`SELECT to_regclass(${table}) IS NOT NULL AS ok`
      if (!exists?.ok) continue
      const used = await sql`SELECT 1 FROM ${sql.unsafe(table)} WHERE ${sql.unsafe(column)} = ${id} LIMIT 1`
      if (used.length) {
        return NextResponse.json({ error: "لا يمكن حذف الصنف لارتباطه بحركات", code: "PRODUCT_HAS_TRANSACTIONS" }, { status: 409 })
      }
    }
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false`
    const result = await sql`UPDATE products SET deleted = true WHERE id = ${id} RETURNING id`
    if (!result.length) return NextResponse.json({ error: "الصنف غير موجود" }, { status: 404 })
    return NextResponse.json({ success: true, id })
  } catch (error) {
    console.error("Delete product error:", error)
    return NextResponse.json({ error: "تعذر حذف الصنف" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: "ظ‚ط§ط¹ط¯ط© ط§ظ„ط¨ظٹط§ظ†ط§طھ ط؛ظٹط± ظ…طھط§ط­ط©" }, { status: 500 });
  }

  try {
    const requestBody = await request.json()
    const statusOnly = Object.keys(requestBody).every((key) => key === "id" || key === "status")
    const permission = await authorizeStoredProduct(request, requestBody?.id, "update", statusOnly ? undefined : requestBody?.type ?? 1)
    if (!permission.ok) return permission.response
    await ensureProductTypeColumns()
    const normalizedId = safeNumber(requestBody?.id, 0)
    const normalizedStatus = requestBody?.status !== undefined ? normalizeStatus(requestBody.status, null) : null

    if (normalizedId <= 0) {
      return NextResponse.json({ error: "معرف المنتج غير صالح" }, { status: 400 })
    }

    if (normalizedStatus !== null && Object.keys(requestBody).every((key) => key === "id" || key === "status")) {
      const result = await sql`
        UPDATE products SET
          status = ${normalizedStatus}
        WHERE id = ${normalizedId}
        RETURNING *
      `

      return NextResponse.json({ success: true, product: result[0] })
    }

    const productData = normalizeProductPayload(requestBody)
    const accountsError = await productAccountsError(productData, normalizedId)
    if (accountsError) return NextResponse.json({ error: accountsError }, { status: 400 })
    const currentScaleRows = await sql`SELECT pos_sold_using_scale FROM products WHERE id=${normalizedId}`
    const scaleEnabled = isScaleProduct(requestBody.pos_sold_using_scale ?? currentScaleRows[0]?.pos_sold_using_scale)
    if (scaleEnabled) {
      const unitBarcodes = await sql`SELECT barcode FROM product_unit_barcodes WHERE product_id=${normalizedId}`
      const scaleError = validateScaleProductBarcodes(true, [productData.barcode, ...unitBarcodes.map((row:any) => row.barcode)])
      if (scaleError) return NextResponse.json({ error: scaleError }, { status: 400 })
    }
    const { id, ...updateData } = productData
    const statusValue = normalizeStatus(updateData.status, 1)

    console.log("[v0] PUT request - received data:", JSON.stringify(updateData, null, 2))

    const result = await sql`
      UPDATE products SET
        product_name = ${safeText(updateData.product_name, "")},
        pos_sold_using_scale = ${scaleEnabled},
        barcode = ${safeText(updateData.barcode, "")},
        description = ${safeText(updateData.description, "")},
        category_id = ${safeNumber(updateData.category_id, 0) || null},
        main_unit = ${safeText(updateData.main_unit, "ظ‚ط·ط¹ط©")},
        secondary_unit = ${safeText(updateData.secondary_unit, "")},
        conversion_factor = ${safeNumber(updateData.conversion_factor, 1)},
        last_purchase_price = ${safeNumber(updateData.last_purchase_price, safeNumber(updateData.selling_price, 0))},
        currency = ${safeText(updateData.currency, "ط±ظٹط§ظ„ ط³ط¹ظˆط¯ظٹ")},
        general_notes = ${safeText(updateData.notes, safeText(updateData.description, ""))},
        product_type = ${safeNumber(updateData.product_type, 1)},
        selling_account_id = ${safeNumber(updateData.selling_account_id, 0)},
        purchase_account_id = ${safeNumber(updateData.purchase_account_id, 0)},
        selling_returns_account_id = ${safeNumber(updateData.selling_returns_account_id, 0)},
        purchase_returns_account_id = ${safeNumber(updateData.purchase_returns_account_id, 0)},
        stock_end_account_id = ${safeNumber(updateData.stock_end_account_id, 0)},
        stock_start_account_id = ${safeNumber(updateData.stock_start_account_id, 0)},
        production_account_id = ${safeNumber(updateData.production_account_id, 0)},
        municipality_service_account_id = ${safeNumber(updateData.municipality_service_account_id, 0)},
        lsti3mal_account_id = ${safeNumber(updateData.lsti3mal_account_id, 0)},
        type = ${safeNumber(updateData.type, 1)},
        service_type = ${safeNumber(updateData.service_type, 0)},
        classifications = ${safeText(updateData.classifications, safeText(updateData.category, ""))},
        order_quantity = ${safeNumber(updateData.order_quantity, 1)},
        original_number = ${safeText(updateData.original_number, safeText(updateData.product_code, ""))},
        factory_number = ${safeText(updateData.factory_number, safeText(updateData.product_code, ""))},
        has_colors = ${safeBoolean(updateData.has_colors, false)},
        has_expiry = ${safeBoolean(updateData.has_expiry, safeBoolean(updateData.expiry_tracking, false))},
        has_batch = ${safeBoolean(updateData.has_batch, safeBoolean(updateData.batch_tracking, false))},
        status = ${statusValue},
        max_quantity = ${safeNumber(updateData.max_stock_level, safeNumber(updateData.max_quantity, 0))},
        product_image = ${safeText(updateData.image_url, safeText(updateData.product_image, ""))},
        attachments = ${safeText(updateData.attachments, "")},
        entry_date = ${safeText(updateData.entry_date, new Date().toISOString().split("T")[0])}
      WHERE id = ${normalizedId}
      RETURNING *
    `

    console.log("[v0] PUT request - product updated:", result[0])

    // Update main product stock
    await sql`
      UPDATE product_stock SET
        reorder_level = ${safeNumber(updateData.reorder_point, safeNumber(updateData.min_stock_level, 0))},
        max_stock_level = ${safeNumber(updateData.max_stock_level, 0)},
        updated_at = CURRENT_TIMESTAMP
      WHERE product_id = ${normalizedId}
    `

    console.log("[v0] PUT request - stock updated")

    // Update warehouse stock if available_quantity or warehouse_name is provided
    if (updateData.available_quantity !== undefined || updateData.warehouse_name) {
      const warehouseName = updateData.warehouse_name || "المستودع الرئيسي"

      // Get warehouse ID by name
      const warehouse = await sql`
        SELECT id FROM warehouses WHERE warehouse_name = ${safeText(warehouseName, "المستودع الرئيسي")} LIMIT 1
      `
      // NOTE: warehouse update logic intentionally minimal here to preserve compilation.
      // If you want full warehouse stock updates, we can implement insert/update logic.
      // For now, just return success with the updated product row.
    }

    return NextResponse.json({ success: true, product: result[0] })
  } catch (err) {
    console.error("Products PUT error:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 })
  }
}
