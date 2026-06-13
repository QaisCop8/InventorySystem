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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = Number.parseInt(searchParams.get("organizationId") || "1");
    const priceCategoryId = Number.parseInt(searchParams.get("priceCategoryId") || "1");
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
      { error: "حدث خطأ في جلب البيانات" },
      { status: 500 }
    );
  }
}



const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(request: NextRequest) {
  const client = await pool.connect();

  try {
    const productData = await request.json();
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
      `SELECT id FROM products WHERE product_name = $1 and product_code <> $2`,
      [productData.product_name, productData.product_code]
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
    const existingProduct = await client.query(
      "SELECT id FROM products WHERE product_code = $1",
      [productData.product_code]
    );
    let update = false
    if (existingProduct.rows.length > 0) update = true
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
          product_code=$1,
          product_name=$2,
          product_name_en=$3,
          description=$4,
          category_id=$5,
          main_stock_id=$6,
          default_store=$7,
          brand=$8,
          model=$9,
          factory_number=$10,
          original_number=$11,
          measurment_unit=$12,
          last_purchase_price=$13,
          currency_id=$14,
          tax_rate=$15,
          discount_rate=$16,
          location=$17,
          has_expiry_date=$18,
          has_batch_number=$19,
          serial_tracking=$20,
          status=$21,
          length=$22,
          width=$23,
          height=$24,
          density=$25,
          color=$26,
          size=$27,
          notes=$28,
          manufacturer_company=$29,
          updated_at=NOW()
         WHERE id=$30`
        : `UPDATE products SET
          product_code=$1,
          product_name=$2,
          product_name_en=$3,
          description=$4,
          category_id=$5,
          main_stock_id=$6,
          brand=$7,
          model=$8,
          factory_number=$9,
          original_number=$10,
          measurment_unit=$11,
          last_purchase_price=$12,
          currency_id=$13,
          tax_rate=$14,
          discount_rate=$15,
          location=$16,
          has_expiry_date=$17,
          has_batch_number=$18,
          serial_tracking=$19,
          status=$20,
          length=$21,
          width=$22,
          height=$23,
          density=$24,
          color=$25,
          size=$26,
          notes=$27,
          manufacturer_company=$28,
          updated_at=NOW()
         WHERE id=$29`

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

      await client.query(updateQuery, updateValues)
      await client.query(`DELETE FROM product_units WHERE product_id=$1`, [productId]);
      await client.query(`DELETE FROM product_unit_barcodes WHERE product_id=$1`, [productId]);
      await client.query(`DELETE FROM product_prices WHERE product_id=$1`, [productId]);
      await client.query(`DELETE FROM product_warehouses WHERE product_id=$1`, [productId]);

    } else {
      const insertColumns = canSaveDefaultStore
        ? `product_code, product_name, product_name_en, description,
      category_id, main_stock_id, default_store, brand, model,
      factory_number, original_number, measurment_unit,
      last_purchase_price, currency_id, tax_rate, discount_rate,
      location, has_expiry_date, has_batch_number, status,
      length, width, height, density, color, size, notes,serial_tracking,manufacturer_company`
        : `product_code, product_name, product_name_en, description,
      category_id, main_stock_id, brand, model,
      factory_number, original_number, measurment_unit,
      last_purchase_price, currency_id, tax_rate, discount_rate,
      location, has_expiry_date, has_batch_number, status,
      length, width, height, density, color, size, notes,serial_tracking,manufacturer_company`

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
          productData.length,
          productData.width,
          productData.height,
          productData.density,
          productData.color,
          productData.size,
          productData.notes,
          productData.serial_tracking,
          productData.manufacturer_company
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
          productData.length,
          productData.width,
          productData.height,
          productData.density,
          productData.color,
          productData.size,
          productData.notes,
          productData.serial_tracking,
          productData.manufacturer_company
        ]

      const result = await client.query(
        `INSERT INTO products
    (
      ${insertColumns}
    )
   VALUES
    (
      ${canSaveDefaultStore ? "$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29" : "$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28"}
    )
   RETURNING id`,
        insertValues
      );


      productId = result.rows[0].id;

    }

    // 3️⃣ Insert product units
    if (Array.isArray(productData.units)) {
      for (const unit of productData.units) {
        const unitResult = await client.query(
          `INSERT INTO product_units (product_id, unit_id, to_main_qnty)
           VALUES ($1,$2,$3)  RETURNING id`,
          [productId, unit.unit_id, unit.to_main_qnty || 1]
        );
        unitId = unitResult.rows[0].id;
        // 4️⃣ Insert barcodes for this unit
        if (Array.isArray(unit.barcode_list)) {
          for (const barcode of unit.barcode_list) {
            await client.query(
              `INSERT INTO product_unit_barcodes (product_id, unit_id, barcode)
               VALUES ($1,$2,$3)`,
              [productId, unitId, barcode]
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
       VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            productId,                       // product_id
            store.store_id,              // warehouse_id
            store.shelf || "",               // shelf, default empty string
            store.reorder_quantity || 0,     // reorder_quantity
            store.max_quantity || 0,         // max_quantity
            store.min_quantity || 0,         // min_quantity
          ]
        );
      }
    }

    if (Array.isArray(productData.prices)) {
      for (const price of productData.prices) {
        await client.query(
          `INSERT INTO product_prices
        (product_id, price_category_id, unit_id, price, currency_id)
       VALUES ($1, $2, $3, $4, $5)`,
          [
            productId,                       // product_id from inserted product
            price.price_category_id,          // must exist in pricecategory table
            price.unit_id,                    // must exist in units table
            price.price || 0,                 // numeric price value, default 0
            price.currency_id          // optional currency_id
          ]
        );
      }
    }


    await client.query("COMMIT");
    return NextResponse.json({ success: true, productId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function PUT(request: NextRequest) {
  try {
    const productData = await request.json()
    const { id, ...updateData } = productData

    console.log("[v0] PUT request - received data:", JSON.stringify(updateData, null, 2))

    const result = await sql`
      UPDATE products SET
        product_name = ${updateData.product_name || updateData.product_name_en || ""},
        barcode = ${updateData.barcode || ""},
        description = ${updateData.description || ""},
        category = ${updateData.category || ""},
        main_unit = ${updateData.main_unit || "قطعة"},
        secondary_unit = ${updateData.secondary_unit || ""},
        conversion_factor = ${updateData.conversion_factor || 1},
        last_purchase_price = ${updateData.last_purchase_price || updateData.selling_price || 0},
        currency = ${updateData.currency || "ريال سعودي"},
        general_notes = ${updateData.notes || updateData.description || ""},
        product_type = ${updateData.product_type || "منتج نهائي"},
        classifications = ${updateData.classifications || updateData.category || ""},
        order_quantity = ${updateData.order_quantity || 1},
        original_number = ${updateData.original_number || updateData.product_code || ""},
        factory_number = ${updateData.factory_number || updateData.product_code || ""},
        has_colors = ${updateData.has_colors || false},
        has_expiry = ${updateData.has_expiry || updateData.expiry_tracking || false},
        has_batch = ${updateData.has_batch || updateData.batch_tracking || false},
        status = ${updateData.status || "نشط"},
        max_quantity = ${updateData.max_stock_level || updateData.max_quantity || 0},
        product_image = ${updateData.image_url || updateData.product_image || ""},
        attachments = ${updateData.attachments || ""},
        entry_date = ${updateData.entry_date || new Date().toISOString().split("T")[0]}
      WHERE id = ${id}
      RETURNING *
    `

    console.log("[v0] PUT request - product updated:", result[0])

    // Update main product stock
    await sql`
      UPDATE product_stock SET
        reorder_level = ${updateData.reorder_point || updateData.min_stock_level || 0},
        max_stock_level = ${updateData.max_stock_level || null},
        updated_at = CURRENT_TIMESTAMP
      WHERE product_id = ${id}
    `

    console.log("[v0] PUT request - stock updated")

    // Update warehouse stock if available_quantity or warehouse_name is provided
    if (updateData.available_quantity !== undefined || updateData.warehouse_name) {
      const warehouseName = updateData.warehouse_name || "المستودع الرئيسي"

      // Get warehouse ID by name
      const warehouse = await sql`
        SELECT id FROM warehouses WHERE warehouse_name = ${warehouseName} LIMIT 1
      `

      if (warehouse.length > 0) {
        const warehouseId = warehouse[0].id

        // Check if product warehouse record exists
        const existingStock = await sql`
          SELECT id FROM product_warehouses 
          WHERE product_id = ${id} AND warehouse_id = ${warehouseId}
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

