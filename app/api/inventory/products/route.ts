import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { Pool } from "pg"

let sql: any = null

try {
  if (!process.env.DATABASE_URL) {
    console.error("[v0] DATABASE_URL environment variable is not set")
  } else {
    const dbUrl = process.env.DATABASE_URL

    if (dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1")) {
      const pool = new Pool({ connectionString: dbUrl })
      sql = async (strings: TemplateStringsArray, ...values: any[]) => {
        const client = await pool.connect()
        try {
          const query =
            strings.reduce(
              (prev, curr, i) =>
                prev + curr + (i < values.length ? `$${i + 1}` : ""),
              ""
            )
          const result = await client.query(query, values)
          return result.rows
        } finally {
          client.release()
        }
      }
    } else {
      console.log("[v0] Using Neon serverless client")
      sql = neon(dbUrl)
    }

    console.log("[v0] Database client initialized successfully")
  }
} catch (error) {
  console.error("[v0] Failed to initialize DB client:", error)
  sql = null
}

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

async function ensureProductTypeColumns() {
  if (!sql) return

  try {
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS type INTEGER DEFAULT 1`
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
  } catch (error) {
    console.error("[v0] Failed to ensure product type columns:", error)
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
  const normalizedUnits = Array.isArray(productData?.units)
    ? productData.units.map((unit: any) => ({
        ...unit,
        unit_id: safeNumber(unit?.unit_id, 0),
        to_main_qnty: safeNumber(unit?.to_main_qnty, 1),
        barcode_list: Array.isArray(unit?.barcode_list)
          ? unit.barcode_list.map((barcode: any) => safeText(barcode, ""))
          : [],
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
    factory_number: safeText(productData?.factory_number, ""),
    original_number: safeText(productData?.original_number, ""),
    measurment_unit: safeNumber(productData?.measurment_unit, 1),
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
  }
}

export async function GET(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Database client not initialized' }, { status: 500 })

  try {
    const url = new URL(request.url)
    const typeParam = url.searchParams.get('type') ?? 'NULL'
    const priceCategoryId = Number.parseInt(url.searchParams.get('priceCategoryId') || '1', 10) || 1
    const requestedProductId = Number.parseInt(url.searchParams.get('productId') || url.searchParams.get('id') || '0', 10) || 0
    const activeOnly = url.searchParams.get('activeOnly') === 'true' || url.searchParams.get('activeOnly') === '1'
    const organizationId = 1

    const resolvedType =
      typeParam === 'services'
        ? 2
        : typeParam === 'products'
        ? 1
        : Number(typeParam)
    const effectiveType = Number.isFinite(resolvedType) && resolvedType > 0 ? resolvedType : null

    const filterClauses = [
      '(p.deleted IS NULL OR p.deleted = false)',
      ...(effectiveType !== null ? [`p.type = ${effectiveType}::int`] : []),
      ...(requestedProductId > 0 ? [`p.id = ${requestedProductId}::int`] : []),
      ...(activeOnly ? [`(p.status = 1 OR p.status::text = 'نشط' OR p.status::text = 'active' OR p.status::text = 'ACTIVE')`] : []),
    ]
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
        c.currency_name AS currency_name

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

      WHERE ${filterExpression}
      ORDER BY p.product_code DESC;
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
        c.currency_name AS currency_name

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

      WHERE ${filterExpression}
      ORDER BY p.product_code DESC;
    `

    const productsResult = await pool.query(productsQuery)
    const products = productsResult.rows

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

    return NextResponse.json(mappedProducts);
  } catch (error) {
    console.error("Products API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ط­ط¯ط« ط®ط·ط£ ظپظٹ ط¬ظ„ط¨ ط§ظ„ط¨ظٹط§ظ†ط§طھ" },
      { status: 500 }
    );
  }
}



const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function ensureProductCostCentersTable(client: any = pool) {
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

async function getLastProductCode() {
  const result = await pool.query(`
    SELECT COALESCE(MAX(product_code), '0') AS last_code
    FROM products
  `)
  const lastCode = result.rows?.[0]?.last_code ?? '0'
  return {
    json: async () => ({ lastCode }),
  }
}

export async function POST(request: NextRequest) {
  const client = await pool.connect();

  try {
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS type INTEGER DEFAULT 1`)
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS service_type INTEGER DEFAULT 0`)
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_account_id INTEGER`)
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_account_id INTEGER`)
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_returns_account_id INTEGER`)
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_returns_account_id INTEGER`)
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_end_account_id INTEGER`)
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_start_account_id INTEGER`)
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS production_account_id INTEGER`)
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS municipality_service_account_id INTEGER`)
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS lsti3mal_account_id INTEGER`)
    await ensureProductCostCentersTable(client)

    const productData = normalizeProductPayload(await request.json());
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
      return NextResponse.json({ success: false, message: "ط§ط³ظ… ط§ظ„طµظ†ظپ ظ…ظƒط±ط±" }, { status: 400 });
    }
    if (Array.isArray(productData.units)) {
      for (const unit of productData.units) {
        if (Array.isArray(unit.barcode_list) && unit.barcode_list.length > 0) {
          const barcodeCheck = await client.query(
            `SELECT id FROM product_unit_barcodes WHERE barcode = ANY($1::text[]) AND product_id <> $2`,
            [unit.barcode_list,productData.id]
          );
          if (barcodeCheck.rows.length > 0) {
            await client.query("ROLLBACK");
            //client.release();
            return NextResponse.json({ success: false, message: `ط£ط­ط¯ ط§ظ„ط¨ط§ط±ظƒظˆط¯ط§طھ ظ…ظˆط¬ظˆط¯ ظ…ط³ط¨ظ‚ط§ظ‹: ${unit.barcode_list.join(", ")}` }, { status: 400 });
          }
        }
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
          manufacturer_company=$42::text,
          updated_at=NOW()
         WHERE id=$43::int`
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
          last_purchase_price=$12::numeric,
          currency_id=$13::int,
          selling_account_id=$14::int,
          purchase_account_id=$15::int,
          selling_returns_account_id=$16::int,
          purchase_returns_account_id=$17::int,
          stock_end_account_id=$18::int,
          stock_start_account_id=$19::int,
          production_account_id=$20::int,
          municipality_service_account_id=$21::int,
          lsti3mal_account_id=$22::int,
          tax_rate=$23::numeric,
          discount_rate=$24::numeric,
          location=$25::text,
          has_expiry_date=$26::boolean,
          has_batch_number=$27::boolean,
          serial_tracking=$28::boolean,
          status=$29::int,
          type=$30::int,
          service_type=$31::int,
          product_type=$32::int,
          tax_classification_id=$33::int,
          length=$34::numeric,
          width=$35::numeric,
          height=$36::numeric,
          density=$37::numeric,
          color=$38::text,
          size=$39::text,
          notes=$40::text,
          manufacturer_company=$41::text,
          updated_at=NOW()
         WHERE id=$42::int`

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
            productData.manufacturer_company,
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
            productData.manufacturer_company,
            productId,
          ]
      const placeholderMatch = updateQuery.match(/\$([0-9]+)/g)?.map((match) => Number(match.replace("$", ""))) ?? []
      const maxPlaceholder = placeholderMatch.length ? Math.max(...placeholderMatch) : 0
      if (maxPlaceholder !== updateValues.length) {
        console.error(`[v0] Placeholder count mismatch for updateQuery: max=$${maxPlaceholder} values=${updateValues.length}`)
        throw new Error(`SQL placeholders ($1..$${maxPlaceholder}) do not match provided values (${updateValues.length})`)
      }

      await client.query(updateQuery, updateValues)
      await client.query(`DELETE FROM product_units WHERE product_id=$1`, [productId]);
      await client.query(`DELETE FROM product_unit_barcodes WHERE product_id=$1`, [productId]);
      await client.query(`DELETE FROM product_prices WHERE product_id=$1`, [productId]);
      await client.query(`DELETE FROM product_warehouses WHERE product_id=$1`, [productId]);
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
          'serial_tracking',
          'manufacturer_company',
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
          'serial_tracking',
          'manufacturer_company',
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
          productData.serial_tracking,
          productData.manufacturer_company,
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
          productData.serial_tracking,
          productData.manufacturer_company,
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

    }

    // 3ï¸ڈâƒ£ Insert product units
    if (Array.isArray(productData.units)) {
      for (const unit of productData.units) {
        const unitResult = await client.query(
          `INSERT INTO product_units (product_id, unit_id, to_main_qnty)
           VALUES ($1::int, $2::int, $3::int) RETURNING id`,
          [productId, Number(unit.unit_id || 0), Number(unit.to_main_qnty || 1)]
        );
        unitId = unitResult.rows[0].id;
        // 4ï¸ڈâƒ£ Insert barcodes for this unit
        if (Array.isArray(unit.barcode_list)) {
          for (const barcode of unit.barcode_list) {
            await client.query(
              `INSERT INTO product_unit_barcodes (product_id, unit_id, barcode)
               VALUES ($1::int, $2::int, $3::text)`,
              [productId, unitId, String(barcode)]
            );
          }
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
        await client.query(
          `INSERT INTO product_prices
        (product_id, price_category_id, unit_id, price, currency_id)
       VALUES ($1::int, $2::int, $3::int, $4::numeric, $5::int)`,
          [
            productId,
            Number(price.price_category_id || 0),
            Number(price.unit_id || 0),
            Number(price.price || 0),
            Number(price.currency_id || 0)
          ]
        );
      }
    }

    await persistProductCostCenters(client, productId, productData.cost_centers)

    await client.query("COMMIT");
    return NextResponse.json({ success: true, productId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Products POST error:", err instanceof Error ? err.message : err, err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function PUT(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: "ظ‚ط§ط¹ط¯ط© ط§ظ„ط¨ظٹط§ظ†ط§طھ ط؛ظٹط± ظ…طھط§ط­ط©" }, { status: 500 });
  }

  await ensureProductTypeColumns()

  try {
    const requestBody = await request.json()
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
    const { id, ...updateData } = productData
    const statusValue = normalizeStatus(updateData.status, 1)

    console.log("[v0] PUT request - received data:", JSON.stringify(updateData, null, 2))

    const result = await sql`
      UPDATE products SET
        product_name = ${safeText(updateData.product_name, "")},
        barcode = ${safeText(updateData.barcode, "")},
        description = ${safeText(updateData.description, "")},
        category = ${safeText(updateData.category, "")},
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
