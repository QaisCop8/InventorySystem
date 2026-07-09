import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { Pool } from "pg"
import { db } from "@vercel/postgres"

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

export default sql

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
    tax_rate: safeNumber(productData?.tax_rate, 0),
    discount_rate: safeNumber(productData?.discount_rate, 0),
    location: safeText(productData?.location, ""),
    expiry_tracking: safeBoolean(productData?.expiry_tracking, false),
    batch_tracking: safeBoolean(productData?.batch_tracking, false),
    serial_tracking: safeBoolean(productData?.serial_tracking, false),
    status: safeNumber(productData?.status, 1),
    type: safeNumber(productData?.type, 1),
    service_type: safeNumber(productData?.service_type, 0),
    length: safeNumber(productData?.length, 0),
    width: safeNumber(productData?.width, 0),
    height: safeNumber(productData?.height, 0),
    density: safeNumber(productData?.density, 0),
    color: safeText(productData?.color, ""),
    size: safeText(productData?.size, ""),
    notes: safeText(productData?.notes, ""),
    manufacturer_company: safeText(productData?.manufacturer_company, ""),
    units: normalizedUnits,
    prices: normalizedPrices,
    stores: normalizedStores,
    cost_centers: normalizedCostCenters,
  }
}

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: "قاعدة البيانات غير متاحة" }, { status: 500 });
  }

  await ensureProductTypeColumns()

  try {
    const { searchParams } = new URL(request.url);
    const organizationId = Number.parseInt(searchParams.get("organizationId") || "1", 10);
    const priceCategoryId = Number.parseInt(searchParams.get("priceCategoryId") || "1", 10);
    const requestedType = safeText(searchParams.get("type"), "").trim();
    const requestedTypeFilter = requestedType === "services" || requestedType === "products" ? requestedType : "";
    const typeParam: number | null = requestedTypeFilter === "services" ? 2 : requestedTypeFilter === "products" ? 1 : null;
    const hasDefaultStore = await hasDefaultStoreColumn()
    const products = hasDefaultStore
      ? await sql`
      SELECT 
        p.*,
        COALESCE(w.warehouse_name, 'بلا تحديد') AS default_store_name,
        false as selected,
        ROW_NUMBER() OVER (ORDER BY p.product_code desc) AS ser,
        -- ✅ Stock columns
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

        -- ✅ Main unit (first product unit)
        u.unit_name AS first_unit,
        u.id AS unit_id,
        -- ✅ First unit barcode
        pu.first_barcode,

        -- ✅ First price (based on category)
        pr.price AS first_price,
        pc.name AS first_price_name,
        c.currency_name AS currency_name

      FROM products p

      -- ✅ Stock join
      LEFT JOIN product_stock ps 
        ON p.id = ps.product_id
        AND ps.organization_id = ${organizationId}

      -- ✅ First unit join with barcode
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

      -- ✅ First price join
      LEFT JOIN LATERAL (
        SELECT pr.*
        FROM product_prices pr
        WHERE pr.product_id = p.id
        AND pr.price_category_id = ${priceCategoryId}
        ORDER BY pr.price_category_id ASC
        LIMIT 1
      ) pr ON TRUE

      LEFT JOIN pricecategory pc ON pc.id = pr.price_category_id
      LEFT JOIN currency c ON c.id = pr.currency_id
      LEFT JOIN warehouses w ON w.id = p.default_store

      WHERE (p.deleted IS NULL OR p.deleted = false)
        AND (${typeParam}::int IS NULL OR p.type = ${typeParam}::int)
      ORDER BY p.product_code DESC;
    `
      : await sql`
      SELECT 
        p.*,
        'بلا تحديد' AS default_store_name,
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
        AND ps.organization_id = ${organizationId}
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
        AND pr.price_category_id = ${priceCategoryId}
        ORDER BY pr.price_category_id ASC
        LIMIT 1
      ) pr ON TRUE
      LEFT JOIN pricecategory pc ON pc.id = pr.price_category_id
      LEFT JOIN currency c ON c.id = pr.currency_id

      WHERE (p.deleted IS NULL OR p.deleted = false)
        AND (${typeParam}::int IS NULL OR p.type = ${typeParam}::int)
      ORDER BY p.product_code DESC;
    `;

    // Map product status & tracking
    const mappedProducts = products.map((product: any) => ({
      ...product,
      status: product.status === 1 ? "نشط" : product.status === 2 ? "غير نشط" : "متوقف",
      batch_tracking: product.has_batch,
      expiry_tracking: product.has_expiry,
      default_store_name: product.default_store_name || "بلا تحديد",
    }));

    return NextResponse.json(mappedProducts);
  } catch (error) {
    console.error("Products API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "حدث خطأ في جلب البيانات" },
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

export async function POST(request: NextRequest) {
  const client = await pool.connect();

  try {
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS type INTEGER DEFAULT 1`)
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS service_type INTEGER DEFAULT 0`)
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
      return NextResponse.json({ success: false, message: "اسم الصنف مكرر" }, { status: 400 });
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
            return NextResponse.json({ success: false, message: `أحد الباركودات موجود مسبقاً: ${unit.barcode_list.join(", ")}` }, { status: 400 });
          }
        }
      }
    }
    // 1️⃣ Insert or update product



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
          tax_rate=$15::numeric,
          discount_rate=$16::numeric,
          location=$17::text,
          has_expiry_date=$18::boolean,
          has_batch_number=$19::boolean,
          serial_tracking=$20::boolean,
          status=$21::int,
          type=$22::int,
          service_type=$23::int,
          length=$24::numeric,
          width=$25::numeric,
          height=$26::numeric,
          density=$27::numeric,
          color=$28::text,
          size=$29::text,
          notes=$30::text,
          manufacturer_company=$31::text,
          updated_at=NOW()
         WHERE id=$32::int`
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
          tax_rate=$14::numeric,
          discount_rate=$15::numeric,
          location=$16::text,
          has_expiry_date=$17::boolean,
          has_batch_number=$18::boolean,
          serial_tracking=$19::boolean,
          status=$20::int,
          type=$21::int,
          service_type=$22::int,
          length=$23::numeric,
          width=$24::numeric,
          height=$25::numeric,
          density=$26::numeric,
          color=$27::text,
          size=$28::text,
          notes=$29::text,
          manufacturer_company=$30::text,
          updated_at=NOW()
         WHERE id=$31::int`

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
            productData.tax_rate,
            productData.discount_rate,
            productData.location,
            productData.expiry_tracking,
            productData.batch_tracking,
            productData.serial_tracking,
            productData.status,
            productData.type || 1,
            productData.service_type || 0,
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
            productData.tax_rate,
            productData.discount_rate,
            productData.location,
            productData.expiry_tracking,
            productData.batch_tracking,
            productData.serial_tracking,
            productData.status,
            productData.type || 1,
            productData.service_type || 0,
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

      // Validate that the update query placeholders match the supplied values
      const placeholderMatch = Array.from(updateQuery.matchAll(/\$(\d+)/g)).map(m => Number(m[1]))
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
          'tax_rate',
          'discount_rate',
          'location',
          'has_expiry_date',
          'has_batch_number',
          'status',
          'type',
          'service_type',
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
          'tax_rate',
          'discount_rate',
          'location',
          'has_expiry_date',
          'has_batch_number',
          'status',
          'type',
          'service_type',
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
          productData.tax_rate,
          productData.discount_rate,
          productData.location,
          productData.expiry_tracking,
          productData.batch_tracking,
          productData.status,
          productData.type || 1,
          productData.service_type || 0,
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
          productData.tax_rate,
          productData.discount_rate,
          productData.location,
          productData.expiry_tracking,
          productData.batch_tracking,
          productData.status,
          productData.type || 1,
          productData.service_type || 0,
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

    // 3️⃣ Insert product units
    if (Array.isArray(productData.units)) {
      for (const unit of productData.units) {
        const unitResult = await client.query(
          `INSERT INTO product_units (product_id, unit_id, to_main_qnty)
           VALUES ($1::int, $2::int, $3::int) RETURNING id`,
          [productId, Number(unit.unit_id || 0), Number(unit.to_main_qnty || 1)]
        );
        unitId = unitResult.rows[0].id;
        // 4️⃣ Insert barcodes for this unit
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

    // 5️⃣ Insert product prices
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
    return NextResponse.json({ error: "قاعدة البيانات غير متاحة" }, { status: 500 });
  }

  await ensureProductTypeColumns()

  try {
    const productData = normalizeProductPayload(await request.json())
    const { id, ...updateData } = productData
    const normalizedId = safeNumber(id, 0)

    console.log("[v0] PUT request - received data:", JSON.stringify(updateData, null, 2))

    const result = await sql`
      UPDATE products SET
        product_name = ${safeText(updateData.product_name, "")},
        barcode = ${safeText(updateData.barcode, "")},
        description = ${safeText(updateData.description, "")},
        category = ${safeText(updateData.category, "")},
        main_unit = ${safeText(updateData.main_unit, "قطعة")},
        secondary_unit = ${safeText(updateData.secondary_unit, "")},
        conversion_factor = ${safeNumber(updateData.conversion_factor, 1)},
        last_purchase_price = ${safeNumber(updateData.last_purchase_price, safeNumber(updateData.selling_price, 0))},
        currency = ${safeText(updateData.currency, "ريال سعودي")},
        general_notes = ${safeText(updateData.notes, safeText(updateData.description, ""))},
        product_type = ${safeText(updateData.product_type, "منتج نهائي")},
        type = ${safeNumber(updateData.type, 1)},
        service_type = ${safeNumber(updateData.service_type, 0)},
        classifications = ${safeText(updateData.classifications, safeText(updateData.category, ""))},
        order_quantity = ${safeNumber(updateData.order_quantity, 1)},
        original_number = ${safeText(updateData.original_number, safeText(updateData.product_code, ""))},
        factory_number = ${safeText(updateData.factory_number, safeText(updateData.product_code, ""))},
        has_colors = ${safeBoolean(updateData.has_colors, false)},
        has_expiry = ${safeBoolean(updateData.has_expiry, safeBoolean(updateData.expiry_tracking, false))},
        has_batch = ${safeBoolean(updateData.has_batch, safeBoolean(updateData.batch_tracking, false))},
        status = ${safeText(updateData.status, "نشط")},
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

      if (warehouse.length > 0) {
        const warehouseId = warehouse[0].id

        // Check if product warehouse record exists
        const existingStock = await sql`
          SELECT id FROM product_warehouses 
          WHERE product_id = ${normalizedId} AND warehouse_id = ${warehouseId}
        `

        if (existingStock.length > 0) {
          // Update existing warehouse stock record
          await sql`
            UPDATE product_warehouses SET
              quantity = ${updateData.available_quantity || 0},
              reserved_quantity = ${updateData.reserved_quantity || 0},
              max_stock_level = ${updateData.max_stock_level || null},
              min_stock_level = ${updateData.reorder_point || 0},
              area = ${updateData.location || ""},
              shelf = ${updateData.shelf || ""},
              floor = ${updateData.floor || ""},
              updated_at = CURRENT_TIMESTAMP
            WHERE product_id = ${id} AND warehouse_id = ${warehouseId}
          `
        } else {
          // Insert new warehouse stock record
          await sql`
            INSERT INTO product_warehouses (
              product_id, warehouse_id, quantity, reserved_quantity,
              max_stock_level, min_stock_level, area, shelf, floor
            ) VALUES (
              ${id}, ${warehouseId}, ${updateData.available_quantity || 0}, 
              ${updateData.reserved_quantity || 0}, ${updateData.max_stock_level || null}, 
              ${updateData.reorder_point || 0}, ${updateData.location || ""}, 
              ${updateData.shelf || ""}, ${updateData.floor || ""}
            )
          `
        }
      }
    }

    const mappedResult = {
      ...result[0],
      batch_tracking: result[0].has_batch,
      expiry_tracking: result[0].has_expiry,
    }

    return NextResponse.json(mappedResult)
  } catch (error) {
    console.error("Update product API error:", error)
    return NextResponse.json({ error: "حدث خطأ في تحديث المنتج" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 })
    }

    const existingProduct = await sql`
      SELECT id, product_name FROM products WHERE id = ${id}
    `

    if (existingProduct.length === 0) {
      return NextResponse.json({ error: "الصنف غير موجود" }, { status: 404 })
    }

    const deleteResult = await sql`UPDATE products SET deleted = true WHERE id = ${id} RETURNING *`;

    if (deleteResult.length === 0) {
      return NextResponse.json({ error: "فشل في حذف الصنف" }, { status: 500 })
    }


    return NextResponse.json({
      message: "تم حذف الصنف بنجاح",
      deletedProduct: deleteResult[0],
    })
  } catch (error) {
    console.error("Delete product API error:", error)
    return NextResponse.json({ error: "حدث خطأ في حذف المنتج" }, { status: 500 })
  }
}
function Inc_Code(code: string, prefix: string): string {
  let codeValue = code.replace(prefix, '');
  let codeArr = codeValue.split('');
  let i = codeArr.length - 1;

  while (i > 0 && codeArr[i] === ' ') i--;

  if (codeArr[i] === '9') {
    while (codeArr[i] === '9' && i > 0) {
      codeArr[i] = '0';
      i--;
    }
    if (codeArr[i] === '9') {
      codeArr[i] = 'A';
    } else {
      codeArr[i] = String.fromCharCode(codeArr[i].charCodeAt(0) + 1);
    }
  } else {
    if (codeArr[i] === '9') {
      codeArr[i] = 'A';
    } else {
      codeArr[i] = String.fromCharCode(codeArr[i].charCodeAt(0) + 1);
    }
  }

  const newCode = codeArr.join('');
  return newCode;
}
async function getLastProductCode() {
  const result = await pool.query(
    'SELECT product_code FROM products ORDER BY product_code DESC LIMIT 1'
  );
  const lastCode = result.rows[0]?.product_code ?? null;
  const prefix = 'I'; // set your prefix
  const newCode = lastCode ? `${prefix}${Inc_Code(lastCode, prefix)}` : `${prefix}0000001`;

  return NextResponse.json({ lastCode: newCode });
}

