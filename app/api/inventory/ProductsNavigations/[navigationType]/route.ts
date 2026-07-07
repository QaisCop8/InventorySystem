import { NextRequest, NextResponse } from "next/server";
import { Pool } from 'pg';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function ensureProductCostCentersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_costcenters_tbl (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      cost_center_type_id INTEGER,
      required_in_transactions INTEGER,
      default_cost_center_id INTEGER
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_product_costcenters_product_id
    ON product_costcenters_tbl(product_id)
  `)
}

async function hasDefaultStoreColumn() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'products'
          AND column_name = 'default_store'
      ) AS has_column
    `)

    return Boolean(result.rows[0]?.has_column)
  } finally {
    client.release();
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { navigationType: string, id: string } }
) {
  const { navigationType, id } = params;
  let productQuery = "";
  let values: any[] = [];

  try {
    await ensureProductCostCentersTable()
    const canJoinDefaultStore = await hasDefaultStoreColumn();

    switch (navigationType) {
      case "first":
        productQuery = canJoinDefaultStore
          ? `
          SELECT p.*, COALESCE(w.warehouse_name, 'بلا تحديد') AS default_store_name
          FROM products p
          LEFT JOIN warehouses w ON w.id = p.default_store
          WHERE p.deleted IS NULL OR p.deleted = false
          ORDER BY p.id ASC
          LIMIT 1
        `
          : `
          SELECT p.*, 'بلا تحديد' AS default_store_name
          FROM products p
          WHERE p.deleted IS NULL OR p.deleted = false
          ORDER BY p.id ASC
          LIMIT 1
        `;
        break;

      case "last":
        productQuery = canJoinDefaultStore
          ? `
          SELECT p.*, COALESCE(w.warehouse_name, 'بلا تحديد') AS default_store_name
          FROM products p
          LEFT JOIN warehouses w ON w.id = p.default_store
          WHERE p.deleted IS NULL OR p.deleted = false
          ORDER BY p.id DESC
          LIMIT 1
        `
          : `
          SELECT p.*, 'بلا تحديد' AS default_store_name
          FROM products p
          WHERE p.deleted IS NULL OR p.deleted = false
          ORDER BY p.id DESC
          LIMIT 1
        `;
        break;

      case "previous": {
        const currentId = Number(req.nextUrl.searchParams.get("currentId") || 0);
        productQuery = canJoinDefaultStore
          ? `
          SELECT p.*, COALESCE(w.warehouse_name, 'بلا تحديد') AS default_store_name
          FROM products p
          LEFT JOIN warehouses w ON w.id = p.default_store
          WHERE p.id < $1
          AND (p.deleted IS NULL OR p.deleted = false)
          ORDER BY p.id DESC
          LIMIT 1
        `
          : `
          SELECT p.*, 'بلا تحديد' AS default_store_name
          FROM products p
          WHERE p.id < $1
          AND (p.deleted IS NULL OR p.deleted = false)
          ORDER BY p.id DESC
          LIMIT 1
        `;
        values = [currentId];
        break;
      }

      case "next": {
        const currentId = Number(req.nextUrl.searchParams.get("currentId") || 0);
        productQuery = canJoinDefaultStore
          ? `
          SELECT p.*, COALESCE(w.warehouse_name, 'بلا تحديد') AS default_store_name
          FROM products p
          LEFT JOIN warehouses w ON w.id = p.default_store
          WHERE p.id > $1
          AND (p.deleted IS NULL OR p.deleted = false)
          ORDER BY p.id ASC
          LIMIT 1
        `
          : `
          SELECT p.*, 'بلا تحديد' AS default_store_name
          FROM products p
          WHERE p.id > $1
          AND (p.deleted IS NULL OR p.deleted = false)
          ORDER BY p.id ASC
          LIMIT 1
        `;
        values = [currentId];
        break;
      }
      case "Byid": {
        const idStr = req.nextUrl.searchParams.get("id"); 
        const id = idStr ? parseInt(idStr, 10) : undefined;
        if (!id) {
          return NextResponse.json({ error: "ID is required" }, { status: 400 });
        }
        productQuery = canJoinDefaultStore
          ? `
          SELECT p.*, COALESCE(w.warehouse_name, 'بلا تحديد') AS default_store_name
          FROM products p
          LEFT JOIN warehouses w ON w.id = p.default_store
          WHERE p.id = $1
          AND (p.deleted IS NULL OR p.deleted = false)
        `
          : `
          SELECT p.*, 'بلا تحديد' AS default_store_name
          FROM products p
          WHERE p.id = $1
          AND (p.deleted IS NULL OR p.deleted = false)
        `;
        values = [Number(id)];
        break;
      }


      default:
        return NextResponse.json({ error: "Invalid navigation type" }, { status: 400 });
    }

    const client = await pool.connect();
    const result = await client.query(productQuery, values);
    client.release();

    if (!result.rows.length) {
      return NextResponse.json({ error: "No product found" }, { status: 404 });
    }

    const product = result.rows[0];

    // fetch units
    const unitsResult = await pool.query(
      "SELECT * FROM product_units WHERE product_id=$1",
      [product.id]
    );
    product.units = unitsResult.rows;

    let units = unitsResult.rows;

    for (let i = 0; i < units.length; i++) {
      units[i].ser = i + 1;

      const barcodeRes = await pool.query(
        `SELECT barcode FROM product_unit_barcodes WHERE unit_id = $1 and product_id = $2`,
        [units[i].id, product.id]
      );

      units[i].barcode_list = barcodeRes.rows.map(b => b.barcode);
    }

    product.units = units;
    // fetch prices
    const pricesResult = await pool.query(
      "SELECT * FROM product_prices WHERE product_id=$1",
      [product.id]
    );
    product.prices = pricesResult.rows;

    // fetch stores
    const storesResult = await pool.query(
      "SELECT * FROM product_warehouses WHERE product_id=$1",
      [product.id]
    );
    product.stores = storesResult.rows;

    const costCentersResult = await pool.query(
      "SELECT id, product_id, cost_center_type_id, required_in_transactions, default_cost_center_id FROM product_costcenters_tbl WHERE product_id=$1 ORDER BY id",
      [product.id]
    );
    product.cost_centers = costCentersResult.rows;

    return NextResponse.json(product);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
