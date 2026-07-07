
import { type NextRequest, NextResponse } from "next/server"
import { Pool } from 'pg';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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

async function hasDefaultStoreColumn(client: any) {
  const result = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'products'
        AND column_name = 'default_store'
    ) AS has_column
  `)

  return Boolean(result.rows[0]?.has_column)
}

export async function GET(request: NextRequest) {
  try {
    let is_barcode = false;
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") || searchParams.get("code");
    const priceCategoryId = Number(searchParams.get("priceCategoryId") || 1);
    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const client = await pool.connect();
    await ensureProductCostCentersTable(client)
    const canJoinDefaultStore = await hasDefaultStoreColumn(client)

    // 1️⃣ Get product by product_code OR first barcode (from product_unit_barcodes)
    const productQuery = canJoinDefaultStore
      ? `
      SELECT p.*, COALESCE(w.warehouse_name, 'بلا تحديد') AS default_store_name
      FROM products p
      LEFT JOIN warehouses w ON w.id = p.default_store
      WHERE p.product_code = $1 
      LIMIT 1
    `
      : `
      SELECT p.*, 'بلا تحديد' AS default_store_name
      FROM products p
      WHERE p.product_code = $1 
      LIMIT 1
    `;
    let productResult = await client.query(productQuery, [query]);

    if (!productResult.rows.length) {

      const productQuery = `
      SELECT p.* FROM product_unit_barcodes p
      WHERE p.barcode = $1
      LIMIT 1
    `;
      const barcodeResult = await client.query(productQuery, [query]);

      if (!barcodeResult.rows.length) {
        client.release();
        return NextResponse.json({ error: "No product found" }, { status: 404 });
      }
      else {
        const productQuery = `
        ${canJoinDefaultStore
          ? `SELECT p.*, COALESCE(w.warehouse_name, 'بلا تحديد') AS default_store_name
        FROM products p
        LEFT JOIN warehouses w ON w.id = p.default_store
        WHERE p.id = $1 
        LIMIT 1`
          : `SELECT p.*, 'بلا تحديد' AS default_store_name
        FROM products p
        WHERE p.id = $1 
        LIMIT 1`}
      `;
        productResult = await client.query(productQuery, [barcodeResult.rows[0].product_id]);
        is_barcode = true;
      }
    }

    const product = productResult.rows[0];

    if (product.deleted) {
      client.release();
      return NextResponse.json({ error: "Product deleted" }, { status: 403 });
    }

    // 2️⃣ Get units for this product
    const unitsQuery = `
  SELECT u.id AS unit_id, u.unit_name, pu.to_main_qnty,
         pub.barcode,
         COALESCE(pp.price, 0) AS unit_price
  FROM product_units pu
  LEFT JOIN units u ON pu.unit_id = u.id
  LEFT JOIN product_unit_barcodes pub
    ON pu.product_id = pub.product_id AND pu.id = pub.unit_id
  LEFT JOIN product_prices pp
    ON pu.product_id = pp.product_id
    AND pu.unit_id = pp.unit_id
    AND pp.price_category_id = $2
  WHERE pu.product_id = $1
  ORDER BY pu.id
`;
    const unitsResult = await client.query(unitsQuery, [product.id, priceCategoryId]);
    product.units = unitsResult.rows;
    product.price = 0;
    if (!is_barcode) {
      product.unit_id = product.units[0].unit_id;
      product.unit_name = product.units[0].unit_name;
      product.price = product.units[0].unit_price;
      product.to_main_unit_qty = product.units[0].to_main_qty?? 1
      product.barcode = product.units[0].barcode
    }
    else {
      const barcodeUnit = product.units.find(
        (e: { barcode: string; }) => e.barcode === query
      );

      if (barcodeUnit) {
        product.unit_id = barcodeUnit.unit_id;
        product.unit_name = barcodeUnit.unit_name;
        product.price = barcodeUnit.unit_price ?? 0;
        if(product.price <= 0)
          product.price = product.units[0].unit_price * barcodeUnit.to_main_qnty || 0;
        product.to_main_unit_qty = barcodeUnit.to_main_qnty?? 1
        product.barcode = query
      }
    }
    const costCentersResult = await client.query(
      `SELECT id, product_id, cost_center_type_id, required_in_transactions, default_cost_center_id
       FROM product_costcenters_tbl
       WHERE product_id = $1
       ORDER BY id`,
      [product.id]
    );
    product.cost_centers = costCentersResult.rows;

    product.store_id = product.default_store ?? null;
    product.store_name = product.default_store_name || "بلا تحديد";
    client.release();
    return NextResponse.json(product);

  } catch (error) {
    console.error("Error searching product:", error);
    return NextResponse.json({ error: "Failed to search product" }, { status: 500 });
  }
}