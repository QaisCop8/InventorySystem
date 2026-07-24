import { neon } from "@neondatabase/serverless"
import { Pool, types } from "pg"

// node-postgres يحوّل أعمدة DATE افتراضياً إلى كائن JS Date مربوط بمنتصف الليل بالتوقيت المحلي
// لخادم Node (لا UTC ولا أي علاقة بالقيمة المخزَّنة فعلياً) — فتاريخ مثل "1990-01-01" على خادم
// بتوقيت +02:00 (Africa/Cairo هنا) يصبح "1989-12-31T22:00:00.000Z"، ويظهر بعدها كيوم سابق خاطئ في
// أي مكان يعرضه (تأكَّد تجريبياً: القيمة المخزَّنة فعلياً في القاعدة صحيحة، والعطل فقط في تحويل
// pg لها لجافاسكربت). التسجيل هنا (OID 1082 = date) يُعيدها كنص "YYYY-MM-DD" خام بلا تحويل، وهو
// الإصلاح المعياري الموصى به لِهذه المشكلة المعروفة في node-postgres. لا يؤثر على مسار Neon
// (neon() أدناه) لأنه لا يستخدم سجل الأنواع هذا التابع لحزمة pg.
types.setTypeParser(1082, (value: string) => value)

let sql: any = null

try {
  if (!process.env.DATABASE_URL) {
    console.error("[v0] DATABASE_URL environment variable is not set")
  } else {
    const dbUrl = process.env.DATABASE_URL

    if (dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1")) {
      console.log("[v0] Using local PostgreSQL with pg Pool")
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

// Database utility functions
export async function executeQuery(query: string, params: any[] = []) {
  try {
    // neon doesn't support .query() method, only template literals
    // For parameterized queries, we need to use the template literal syntax
    const result = await sql([query] as any, ...params)
    return { success: true, data: result }
  } catch (error) {
    console.error("[v0] Database query error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown database error",
    }
  }
}

// Customer operations
export async function getCustomers() {
  try {
    const result = await sql`SELECT * FROM customers ORDER BY created_at DESC`
    return { success: true, data: result }
  } catch (error) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}

export async function createCustomer(customerData: any) {
  const query = `
    INSERT INTO customers (
      customer_code, customer_name, mobile1, mobile2, whatsapp1, whatsapp2,
      city, address, email, business_nature, salesman, classifications,
      movement_notes, general_notes, api_number,
      account_opening_date, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING *
  `
  const params = [
    customerData.customer_code,
    customerData.customer_name || customerData.name, // Support both field names for compatibility
    customerData.mobile1,
    customerData.mobile2,
    customerData.whatsapp1,
    customerData.whatsapp2,
    customerData.city,
    customerData.address,
    customerData.email,
    customerData.business_nature,
    customerData.salesman,
    customerData.classifications,
    customerData.movement_notes,
    customerData.general_notes,
    customerData.api_number,
    customerData.account_opening_date,
    customerData.status || "active",
  ]
  return executeQuery(query, params)
}

// Supplier operations
export async function getSuppliers() {
  try {
    const result = await sql`SELECT * FROM suppliers ORDER BY created_at DESC`
    return { success: true, data: result }
  } catch (error) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}

export async function createSupplier(supplierData: any) {
  const query = `
    INSERT INTO suppliers (
      supplier_code, supplier_name, mobile1, mobile2, whatsapp1, whatsapp2,
      city, address, email, business_nature, salesman, classifications,
      movement_notes, general_notes, api_number,
      account_opening_date, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING *
  `
  const params = [
    supplierData.supplier_code,
    supplierData.supplier_name || supplierData.name, // Support both field names for compatibility
    supplierData.mobile1,
    supplierData.mobile2,
    supplierData.whatsapp1,
    supplierData.whatsapp2,
    supplierData.city,
    supplierData.address,
    supplierData.email,
    supplierData.business_nature,
    supplierData.salesman,
    supplierData.classifications,
    supplierData.movement_notes,
    supplierData.general_notes,
    supplierData.api_number,
    supplierData.account_opening_date,
    supplierData.status || "active",
  ]
  return executeQuery(query, params)
}

// Product operations
export async function getProducts() {
  try {
    const result = await sql`
      SELECT p.*, ig.group_name as category_name, s.supplier_name as supplier_name
      FROM products p
      LEFT JOIN item_groups ig ON p.category = ig.group_name
      LEFT JOIN suppliers s ON p.product_code = s.supplier_code
      ORDER BY p.created_at DESC
    `
    return { success: true, data: result }
  } catch (error) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}

export async function createProduct(productData: any) {
  const query = `
    INSERT INTO products (
      product_code, product_name, description, barcode, original_number,
      manufacturer_number, category, main_unit, secondary_unit,
      conversion_factor, currency, last_purchase_price, 
      order_quantity, max_quantity, has_expiry, has_batch_number, 
      has_colors, status, product_type, entry_date, product_image
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
    RETURNING *
  `
  const params = [
    productData.product_code,
    productData.product_name || productData.name, // Support both field names for compatibility
    productData.description,
    productData.barcode,
    productData.original_number,
    productData.manufacturer_number,
    productData.category,
    productData.main_unit,
    productData.secondary_unit,
    productData.conversion_factor || 1,
    productData.currency,
    productData.last_purchase_price || 0,
    productData.order_quantity || 0,
    productData.max_quantity || 0,
    productData.has_expiry || false,
    productData.has_batch_number || false,
    productData.has_colors || false,
    productData.status || "active",
    productData.product_type || "عادي",
    productData.entry_date || new Date().toISOString().split("T")[0],
    productData.product_image,
  ]
  return executeQuery(query, params)
}

// Sales Orders operations
export async function getSalesOrders() {
  try {
    const result = await sql`
      SELECT so.*, c.customer_name as customer_name
      FROM sales_orders so
      LEFT JOIN customers c ON so.customer_id = c.id
      ORDER BY so.created_at DESC
    `
    return { success: true, data: result }
  } catch (error) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}

export async function createSalesOrder(orderData: any) {
  const query = `
    INSERT INTO sales_orders (
      order_number, order_date, customer_id, customer_code, salesman,
      currency_name, currency_symbol, exchange_rate, manual_document,
      financial_status, order_status, delivery_date, subtotal, tax_amount,
      discount_amount, total_amount, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING *
  `
  const params = [
    orderData.order_number,
    orderData.order_date,
    orderData.customer_id,
    orderData.customer_code,
    orderData.salesman,
    orderData.currency_name,
    orderData.currency_symbol,
    orderData.exchange_rate || 1,
    orderData.manual_document,
    orderData.financial_status,
    orderData.order_status,
    orderData.delivery_date,
    orderData.subtotal || 0,
    orderData.tax_amount || 0,
    orderData.discount_amount || 0,
    orderData.total_amount || 0,
    orderData.notes,
  ]
  return executeQuery(query, params)
}

// Purchase Orders operations
export async function getPurchaseOrders() {
  try {
    const result = await sql`
      SELECT po.*, s.supplier_name as supplier_name
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      ORDER BY po.created_at DESC
    `
    return { success: true, data: result }
  } catch (error) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}

export async function createPurchaseOrder(orderData: any) {
  const query = `
    INSERT INTO purchase_orders (
      order_number, order_date, supplier_id, supplier_code, salesman,
      currency_name, currency_symbol, exchange_rate, manual_document,
      expected_date, subtotal, tax_amount, discount_amount, total_amount,
      status, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING *
  `
  const params = [
    orderData.order_number,
    orderData.order_date,
    orderData.supplier_id,
    orderData.supplier_code,
    orderData.salesman,
    orderData.currency_name,
    orderData.currency_symbol,
    orderData.exchange_rate || 1,
    orderData.manual_document,
    orderData.expected_date,
    orderData.subtotal || 0,
    orderData.tax_amount || 0,
    orderData.discount_amount || 0,
    orderData.total_amount || 0,
    orderData.status || "قيد التنفيذ",
    orderData.notes,
  ]
  return executeQuery(query, params)
}

// Exchange rates operations
export async function getExchangeRates() {
  try {
    const result = await sql`
      SELECT * FROM exchange_rates 
      ORDER BY currency_code
    `
    return { success: true, data: result }
  } catch (error) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}

export async function getCurrenciesWithLatestRate() {
  try {
    const result = await sql`
      SELECT 
        c.id AS currency_id,
        c.currency_code,
        c.currency_name,
        c.is_active AS is_active,
        c.created_at AS currency_created,
        c.updated_at AS currency_updated,
        er.id AS id,
        er.buy_rate,
        er.sell_rate,
        er.exchange_rate,
        er.rate_date,
        er.is_active AS rate_active,
        er.created_at AS rate_created,
        er.updated_at AS rate_updated
      FROM currency c
      LEFT JOIN LATERAL (
        SELECT *
        FROM exchange_rates er
        WHERE er.currency_id = c.id
        ORDER BY er.rate_date DESC, er.created_at DESC
        LIMIT 1
      ) er ON true
      ORDER BY c.id
    `

    return { success: true, data: result }
  } catch (error: any) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}
export async function getExchangeRate(
  currency_id: number,
  rate_date?: string | null
) {
  try {
    const result = await sql`
  SELECT COALESCE(
           (SELECT exchange_rate
            FROM exchange_rates
            WHERE currency_id = ${currency_id}
              AND is_active = true
              AND rate_date <= ${rate_date}
            ORDER BY rate_date DESC
            LIMIT 1),
           1
         ) AS exchange_rate
`;

    // Defensive check in case result.rows is undefined
    const exchangeRate = result[0]?.exchange_rate
      ? Number(result[0].exchange_rate) > 0 ? Number(result[0].exchange_rate) : 1
      : 1;

    return {
      success: true,
      data: exchangeRate,
    };
  } catch (error: any) {
    console.error("Error fetching exchange rate:", error);
    return {
      success: false,
      error: error.message || "Unknown error",
    };
  }
}
export async function updateExchangeRate(id: number, rates: any) {
  if (rates.type === 1) {
    const existing = await executeQuery(`
  SELECT * FROM exchange_rates 
  WHERE currency_id = ${rates.currency_id} 
  AND rate_date = CURRENT_DATE
  LIMIT 1
`);

    if (existing.success && existing.data.length > 0) {
      const query = `
    UPDATE exchange_rates
    SET 
      buy_rate = ${rates.buy_rate},
      sell_rate = ${rates.sell_rate},
      exchange_rate = ${rates.exchange_rate},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${existing.data[0].id}
    RETURNING *
  `;
      return executeQuery(query);
    } else {
      // insert new
      const query = `
    INSERT INTO exchange_rates (
      currency_id,
      buy_rate,
      sell_rate,
      exchange_rate,
      is_active,
      rate_date
    ) VALUES (
      ${rates.currency_id},
      ${rates.buy_rate},
      ${rates.sell_rate},
      ${rates.exchange_rate},
      ${rates.is_active ?? true},
      CURRENT_DATE
    ) RETURNING *
  `;
      return executeQuery(query);

    }
  } else {
    const query = `
      UPDATE exchange_rates 
      SET 
        buy_rate = ${rates.buy_rate},
        sell_rate = ${rates.sell_rate},
        exchange_rate = ${rates.exchange_rate},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;
    return executeQuery(query);
  }
}


// Order Items operations
export async function getOrderItems(orderType: string, orderId: number) {
  try {
    const result = await sql`
      SELECT oi.*, p.product_name as product_name
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_type = ${orderType} AND oi.order_id = ${orderId}
      ORDER BY oi.created_at
    `
    return { success: true, data: result }
  } catch (error) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}

export async function createOrderItem(itemData: any) {
  const query = `
    INSERT INTO order_items (
      order_type, order_id, product_id, product_code, product_name,
      barcode, warehouse_id, quantity, bonus_quantity, unit,
      unit_price, total_price, expiry_date, batch_number, item_notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *
  `
  const params = [
    itemData.order_type,
    itemData.order_id,
    itemData.product_id,
    itemData.product_code,
    itemData.product_name,
    itemData.barcode,
    itemData.warehouse_id,
    itemData.quantity,
    itemData.bonus_quantity || 0,
    itemData.unit,
    itemData.unit_price,
    itemData.total_price,
    itemData.expiry_date,
    itemData.batch_number,
    itemData.item_notes,
  ]
  return executeQuery(query, params)
}

// Warehouses operations
export async function getWarehouses() {
  try {
    const result = await sql`SELECT * FROM warehouses ORDER BY name`
    return { success: true, data: result }
  } catch (error) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}

// Product Categories operations
export async function getProductCategories() {
  try {
    const result = await sql`SELECT * FROM product_categories ORDER BY name`
    return { success: true, data: result }
  } catch (error) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}

// Dashboard statistics
export async function getDashboardStats() {
  try {
    const [customers, suppliers, products, salesOrders, purchaseOrders] = await Promise.all([
      sql`SELECT COUNT(*) as count FROM customers WHERE status = 'active'`,
      sql`SELECT COUNT(*) as count FROM suppliers WHERE status = 'active'`,
      sql`SELECT COUNT(*) as count FROM products WHERE status = 'active'`,
      sql`SELECT COUNT(*) as count FROM sales_orders WHERE order_status != 'cancelled'`,
      sql`SELECT COUNT(*) as count FROM purchase_orders WHERE workflow_status != 'cancelled'`,
    ])

    return {
      success: true,
      data: {
        customers: customers[0]?.count || 0,
        suppliers: suppliers[0]?.count || 0,
        products: products[0]?.count || 0,
        salesOrders: salesOrders[0]?.count || 0,
        purchaseOrders: purchaseOrders[0]?.count || 0,
      },
    }
  } catch (error) {
    console.error("Database query error:", error)
    return { success: false, error: error.message }
  }
}
