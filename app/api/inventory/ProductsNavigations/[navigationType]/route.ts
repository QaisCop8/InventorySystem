import { NextRequest, NextResponse } from "next/server";
import { Pool } from 'pg';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET(
  req: NextRequest,
  { params }: { params: { navigationType: string, id: string } }
) {
  const { navigationType, id } = params;
  // Support filtering by entity type: "products" or "services"
  const typeStr = req.nextUrl.searchParams.get("type");
  let typeParam: number | null = null;
  if (typeStr === "services") typeParam = 2;
  else if (typeStr === "products") typeParam = 1;
  let productQuery = "";
  let values: any[] = [];

  try {
    switch (navigationType) {
      case "first":
        productQuery = `
          SELECT * FROM products
          WHERE (deleted IS NULL OR deleted = false)
          AND ($TYPE_FILTER$)
          ORDER BY id ASC
          LIMIT 1
        `;
        break;

      case "last":
        productQuery = `
          SELECT * FROM products
          WHERE (deleted IS NULL OR deleted = false)
          AND ($TYPE_FILTER$)
          ORDER BY id DESC
          LIMIT 1
        `;
        break;

      case "previous": {
        const currentId = Number(req.nextUrl.searchParams.get("currentId") || 0);
        productQuery = `
          SELECT * FROM products
          WHERE id < $1
          AND (deleted IS NULL OR deleted = false)
          AND ($TYPE_FILTER$)
          ORDER BY id DESC
          LIMIT 1
        `;
        values = [currentId];
        break;
      }

      case "next": {
        const currentId = Number(req.nextUrl.searchParams.get("currentId") || 0);
        productQuery = `
          SELECT * FROM products
          WHERE id > $1
          AND (deleted IS NULL OR deleted = false)
          AND ($TYPE_FILTER$)
          ORDER BY id ASC
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
        productQuery = `
          SELECT * FROM products
          WHERE id = $1
          AND (deleted IS NULL OR deleted = false)
          AND ($TYPE_FILTER$)
        `;
        values = [Number(id)];
        break;
      }


      default:
        return NextResponse.json({ error: "Invalid navigation type" }, { status: 400 });
    }

    const client = await pool.connect();
    // Replace placeholder with proper parameterized condition (or TRUE when no filter)
    if (productQuery.includes("$TYPE_FILTER$")) {
      if (typeParam != null) {
        const paramIndex = values.length + 1;
        const cond = `$${paramIndex}::int IS NULL OR type = $${paramIndex}::int`;
        productQuery = productQuery.replace(/\$TYPE_FILTER\$/g, cond);
        values.push(typeParam);
      } else {
        productQuery = productQuery.replace(/\$TYPE_FILTER\$/g, 'TRUE');
      }
    }

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

    // fetch related accounts for autocomplete display (if present)
    const accountFields = [
      'selling_account_id',
      'purchase_account_id',
      'selling_returns_account_id',
      'purchase_returns_account_id',
      'stock_end_account_id',
      'stock_start_account_id',
      'production_account_id',
      'municipality_service_account_id',
      'lsti3mal_account_id',
    ];

    for (const field of accountFields) {
      const accId = product[field];
      if (accId && Number(accId) > 0) {
        try {
          const accRes = await pool.query(
            'SELECT id, code, name FROM account_tbl WHERE id = $1 LIMIT 1',
            [Number(accId)]
          );
          const acc = accRes.rows[0] || null;
          const baseName = field.replace(/_id$/, '');
          product[baseName] = acc;
          product[`${baseName}_code`] = acc?.code || null;
        } catch (err) {
          // ignore account fetch errors
          const baseName = field.replace(/_id$/, '');
          product[baseName] = null;
          product[`${baseName}_code`] = null;
        }
      } else {
        const baseName = field.replace(/_id$/, '');
        product[baseName] = null;
        product[`${baseName}_code`] = null;
      }
    }

    // fetch cost centers (optional table)
    try {
      const ccResult = await pool.query(
        `SELECT cost_center_type_id, required_in_transactions, default_cost_center_id FROM product_costcenters_tbl WHERE product_id=$1`,
        [product.id]
      );
      product.cost_centers = ccResult.rows;
    } catch (err) {
      product.cost_centers = product.cost_centers || [];
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
