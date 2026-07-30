import { NextRequest, NextResponse } from "next/server";
import { getTenantPool } from "@/lib/database";

export async function GET(
  req: NextRequest,
  { params }: { params: { navigationType: string, id: string } }
) {
  // كانت هذه الشاشة تتصل مباشرة بـprocess.env.DATABASE_URL (قاعدة الإدارة/المرجعية) بدل قاعدة
  // الشركة الحالية (tenant) — فيفشل أي بحث/تصفّح دوماً مهما كان الصنف موجوداً فعلاً في قاعدة
  // الشركة، لأن الاستعلام ينفَّذ أصلاً على قاعدة مختلفة تماماً لا تحوي هذا الصنف غالباً. getTenantPool
  // يحل قاعدة الشركة النشطة لهذا الطلب تحديداً (نفس آلية sql في بقية مسارات API)، مطابقاً app/api/
  // inventory/products/route.ts الصحيح أصلاً.
  const pool = await getTenantPool();
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

    // fetch product brands (optional table) — نفس نمط مراكز التكلفة أعلاه تماماً
    try {
      const brandResult = await pool.query(
        `SELECT brand_type_id, required_in_transactions, brand_id FROM product_brands_tbl WHERE product_id=$1`,
        [product.id]
      );
      product.product_brands = brandResult.rows;
    } catch (err) {
      product.product_brands = product.product_brands || [];
    }

    // فروع الصنف المقيَّد بها (اختياري — انظر product_branches بـapp/api/inventory/products/
    // route.ts) — بلا صفوف هنا يبقى الصنف ظاهراً لكل الفروع، فيُعاد مصفوفة فارغة ليعكسها حقل
    // "الفروع" بنموذج الصنف (لا شيء مُحدَّد = كل الفروع).
    try {
      const branchesResult = await pool.query(
        `SELECT branch_id FROM product_branches WHERE product_id=$1`,
        [product.id]
      );
      product.branch_ids = branchesResult.rows.map((r: any) => r.branch_id);
    } catch (err) {
      product.branch_ids = [];
    }

    // fetch original/factory numbers (optional table, type 1 = رقم أصلي، 2 = رقم مصنع)
    try {
      const numbersResult = await pool.query(
        `SELECT type, number FROM product_numbers WHERE product_id=$1 ORDER BY id`,
        [product.id]
      );
      product.original_numbers = numbersResult.rows.filter((r: any) => r.type === 1).map((r: any) => r.number);
      product.factory_numbers = numbersResult.rows.filter((r: any) => r.type === 2).map((r: any) => r.number);
    } catch (err) {
      product.original_numbers = product.original_number ? [product.original_number] : [];
      product.factory_numbers = product.factory_number ? [product.factory_number] : [];
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
