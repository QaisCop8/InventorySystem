
import { generateSalesOrderNumber } from "./number-generator"
import { generatePurchaseOrderNumber } from "./number-generator"
import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { Pool } from "pg"
import { db } from "@vercel/postgres"
import { adjustStock } from "./inventory"

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

export interface SalesOrder {
  id: number;
  order_number: string;
  order_date: string;
  customer_id: number;
  customer_name: string;
  customer_phone?: string | null;
  salesman_id?: number | null;
  currency_id?: number | null;
  exchange_rate: number;
  discount_amount: number;
  discount_type?: number | null;
  vat_amount: number;
  vat_percent: number;
  total_amount: number;
  order_type: number;        // 1=sales, 2=purchase, etc.
  order_status: number;      // 0=pending, 1=approved, etc.
  order_decision: number;    // 0=none, 1=approved, 2=rejected, etc.
  delivery_address: string;
  reference_number: string;
  created_at: Date;
  updated_at: Date;
  delivery_date: Date;
  shipping_cost: number;
  other_charges: number;
  general_notes: string;
  internal_notes: string;
  delivery_notes: string;
  received_by: string;
  customer_order_no?: string;
  user_id: string;
  order_status2: number;
}


export interface PurchaseOrder {
  id: number
  order_number: string
  order_date: string
  supplier_id: number
  supplier_name: string
  salesman: string
  total_amount: number
  currency_code: string
  currency_name: string
  exchange_rate: number
  workflow_status: string
  expected_delivery_date?: Date
  manual_document?: string
  notes?: string
  attachments?: string
  created_at: Date
  updated_at: Date
}

export interface OrderItem {
  id: number;                  // auto-increment item ID
  order_id: number;            // reference to the order
  product_id: number;
  product_name: string;
  quantity: number;            // required
  bonus: number;            // required
  price: number;               // renamed from unit_price to match schema
  discount?: number;           // optional discount
  total_price?: number;        // optional, can calculate as quantity * price
  delivered_quantity?: number; // default 0
  expiry_date?: Date | null;
  batch_number?: string | null;
  item_status?: number;        // integer, default 0
  barcode?: string | null;
  unit_id?: number | null;
  store_id?: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface OrderFilters {
  search?: string
  status?: string
  salesman?: string
  dateFrom?: string
  dateTo?: string
  customerId?: number
  supplierId?: number
}

// Create pool once
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});



// ---------------------------------------------------------------
// GET SALES ORDERS WITH SAFE FILTERS
// ---------------------------------------------------------------


export async function getSalesOrders(filters: any = {}) {
  const { search = null, status = null, salesman = null, dateFrom = null, dateTo = null, customerId = null, order_type = null } = filters;

  const whereClauses: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  whereClauses.push(` deleted = false `);
  if (order_type !== null && order_type != -1) {
    whereClauses.push(`order_type = $${paramIndex}`);
    params.push(order_type);
    paramIndex++;
  }
  if (search) {
    whereClauses.push(`(so.order_number ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }
  if (status && status !== "all") {
    whereClauses.push(`so.order_status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }
  if (salesman && salesman !== "all") {
    whereClauses.push(`so.salesman = $${paramIndex}`);
    params.push(salesman);
    paramIndex++;
  }
  if (dateFrom) {
    whereClauses.push(`so.order_date >= $${paramIndex}`);
    params.push(dateFrom);
    paramIndex++;
  }
  if (dateTo) {
    whereClauses.push(`so.order_date <= $${paramIndex}`);
    params.push(dateTo);
    paramIndex++;
  }
  if (customerId) {
    whereClauses.push(`so.customer_id = $${paramIndex}`);
    params.push(customerId);
    paramIndex++;
  }


  const whereSQL = whereClauses.length ? ` WHERE ${whereClauses.join(" AND ")}` : "";

  const queryText = `
    SELECT 
      so.*,
      COALESCE(c.name, '') AS customer_name,
      COALESCE(COUNT(oi.id), 0) AS item_count,
      COALESCE(SUM(oi.quantity), 0) AS total_quantity
    FROM orders so
    LEFT JOIN customers c ON so.customer_id = c.id
    LEFT JOIN order_items oi ON so.id = oi.order_id
    ${whereSQL}
    GROUP BY so.id, c.name
    ORDER BY so.created_at DESC
  `;

  // Use pool.query instead of sql template tag
  const result = await pool.query(queryText, params);
  return result.rows;
}


export async function getPurchaseOrders(filters: OrderFilters = {}, organizationId = 1) {
  try {
    const whereConditions = ["1=1"]
    const params: any[] = []
    let paramIndex = 1

    if (filters.search) {
      whereConditions.push(`(po.order_number ILIKE $${paramIndex} OR s.supplier_name ILIKE $${paramIndex})`)
      params.push(`%${filters.search}%`)
      paramIndex++
    }

    if (filters.status && filters.status !== "all") {
      whereConditions.push(`po.workflow_status = $${paramIndex}`)
      params.push(filters.status)
      paramIndex++
    }

    if (filters.dateFrom) {
      whereConditions.push(`po.order_date >= $${paramIndex}`)
      params.push(filters.dateFrom)
      paramIndex++
    }

    if (filters.dateTo) {
      whereConditions.push(`po.order_date <= $${paramIndex}`)
      params.push(filters.dateTo)
      paramIndex++
    }

    if (filters.supplierId) {
      whereConditions.push(`po.supplier_id = $${paramIndex}`)
      params.push(filters.supplierId)
      paramIndex++
    }

    const whereClause = whereConditions.join(" AND ")

    const result = await sql`
      SELECT 
        po.*,
        s.supplier_name,
        COUNT(poi.id) as item_count,
        SUM(poi.quantity) as total_quantity
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
      WHERE ${sql.unsafe(whereClause)}
      GROUP BY po.id, s.supplier_name
      ORDER BY po.created_at DESC
    `

    return result
  } catch (error) {
    console.error("Error fetching purchase orders:", error)
    if (error instanceof Error && error.message.includes("does not exist")) {
      return []
    }
    throw error
  }
}

export async function getSalesOrderItems(orderId: number) {
  try {
    const result = await sql`
      SELECT 
        soi.*,
        p.product_code,
        p.main_unit,
        ps.current_stock
      FROM sales_order_items soi
      LEFT JOIN products p ON soi.product_id = p.id
      LEFT JOIN product_stock ps ON p.id = ps.product_id
      WHERE soi.sales_order_id = ${orderId}
      ORDER BY soi.id
    `

    return result
  } catch (error) {
    console.error("Error fetching sales order items:", error)
    throw error
  }
}

export async function getPurchaseOrderItems(orderId: number) {
  try {
    const result = await sql`
      SELECT 
        poi.*,
        p.product_code,
        p.main_unit
      FROM purchase_order_items poi
      LEFT JOIN products p ON poi.product_id = p.id
      WHERE poi.purchase_order_id = ${orderId}
      ORDER BY poi.id
    `

    return result
  } catch (error) {
    console.error("Error fetching purchase order items:", error)
    throw error
  }
}

export async function createOrder(
  orderData: Partial<SalesOrder>,
  items: Partial<OrderItem>[]
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const vchBook = orderData.order_number?.[1] ?? "O";
    // Generate order number if missing
    if (!orderData.order_number) {
      if (orderData.order_type === 1) orderData.order_number = await generateSalesOrderNumber(vchBook);
      else orderData.order_number = await generatePurchaseOrderNumber(vchBook);
    }

    // Check for duplicate reference number
    if (orderData.reference_number && orderData.reference_number.trim() !== "") {
      let queryText = `SELECT id FROM orders WHERE reference_number = $1 AND deleted = false AND id != $2`;
      let params: (string | number)[] = [orderData.reference_number.trim(), orderData.id || 0];

      // For purchase orders, also check customer_id
      if (orderData.order_type === 2 && orderData.customer_id) {
        queryText += ` AND customer_id = $3`;
        params.push(orderData.customer_id);
      }

      const refExists = await client.query(queryText, params);
      if (refExists.rows.length > 0) {
        throw new Error(
          `السند اليدوي ${orderData.reference_number} موجود مسبقا. يرجى التحقق من البيانات وإعادة المحاولة.`
        );
      }
    }

    for (const item of items) {
      if (item.batch_number && item.batch_number.trim() !== "") {
        const batchExists = await client.query(
          `SELECT order_items.id FROM order_items INNER JOIN orders on orders.id = order_items.order_id
           WHERE batch_number = $1 and order_id <> $2 AND orders.deleted = false LIMIT 1`,
          [item.batch_number.trim(), orderData.id]
        );

        if (batchExists.rows.length > 0) {
          throw new Error(
            `الرقم التشغيلي ${item.batch_number}   موجود مسبقا. يرجى التحقق من البيانات وإعادة المحاولة.`
          );
        }
      }
    }
    if(!orderData.discount_amount)orderData.discount_amount = 0
    if (orderData.id === 0) {
      
    }

    console.log("[v0] Creating order with data:", orderData);

    // Insert order
    let order;
    const baseDate = new Date(orderData.order_date || new Date());
    const now = new Date();

    // Replace time part with current time
    baseDate.setHours(
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds()
    );

    const updatedDate = baseDate;

    orderData.order_date = updatedDate.toISOString();
    if (orderData.id && orderData.id > 0) {
      // UPDATE existing order
      const orderUpdateQuery = `
  UPDATE orders
  SET 
    order_number = $1,
    order_date = $2,
    customer_id = $3,
    customer_name = $4,
    customer_phone = $5,
    salesman_id = $6,
    currency_id = $7,
    exchange_rate = $8,
    discount_amount = $9,
    discount_type = $10,
    vat_amount = $11,
    vat_percent = $12,
    total_amount = $13,
    order_type = $14,
    order_status = $15,
    order_decision = $16,
    delivery_address = $17,
    reference_number = $18,
    delivery_date = $19,
    shipping_cost = $20,
    other_charges = $21,
    general_notes = $22,
    internal_notes = $23,
    delivery_notes = $24,
    received_by = $25,
    customer_order_no= $26,
    order_status2 = $27,
    updated_at = NOW()
  WHERE id = $28
  RETURNING *;
`;


      const orderValues = [
        orderData.order_number,
        orderData.order_date || new Date(),
        orderData.customer_id || null,
        orderData.customer_name || "",
        orderData.customer_phone || null,
        orderData.salesman_id || null,
        orderData.currency_id || null,
        orderData.exchange_rate || 1,
        orderData.discount_amount || 0,
        orderData.discount_type || null,
        orderData.vat_amount || 0,
        orderData.vat_percent || 0,
        orderData.total_amount || 0,
        orderData.order_type || 1,
        orderData.order_status || 1,
        orderData.order_decision || 0,
        orderData.delivery_address || "",
        orderData.reference_number || "",
        orderData.delivery_date || new Date(),
        orderData.shipping_cost || 0,
        orderData.other_charges || 0,
        orderData.general_notes || "",
        orderData.internal_notes || "",
        orderData.delivery_notes || "",
        orderData.received_by || "",
        orderData.customer_order_no || "",
        orderData.order_status2 || 1,
        orderData.id, // WHERE id
      ];

      const result = await pool.query(orderUpdateQuery, orderValues);
      order = result.rows[0];

    } else {
      // INSERT new order
      let exists = false;

      if (orderData.order_number && orderData.order_number.length >= 2) {
        // Check DB if this order_number already exists
        const res = await pool.query(
          `SELECT id FROM orders WHERE order_number = $1 LIMIT 1`,
          [orderData.order_number]
        );
        exists = res.rows.length > 0;
      }

      // Generate new order number if missing or already exists
      if (!orderData.order_number || orderData.order_number.length < 2 || exists) {
        if (orderData.order_type === 1) orderData.order_number = await generateSalesOrderNumber(vchBook);
        else orderData.order_number = await generatePurchaseOrderNumber(vchBook);
      }
      const orderInsertQuery = `
        INSERT INTO orders (
          order_number,
          order_date,
          customer_id,
          customer_name,
          customer_phone,
          salesman_id,
          currency_id,
          exchange_rate,
          discount_amount,
          discount_type,
          vat_amount,
          vat_percent,
          total_amount,
          order_type,
          order_status,
          order_decision,
          delivery_address,
          reference_number,
          delivery_date,
          shipping_cost,
          other_charges,
          general_notes,
          internal_notes,
          delivery_notes,
          received_by,
          customer_order_no,
          user_id,
          printed,
          printed_count,
          order_status2,
          created_at,
          updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
          NOW(),NOW()
        )
        RETURNING *;
      `;


      const orderValues = [
        orderData.order_number,
        orderData.order_date || new Date(),
        orderData.customer_id || null,
        orderData.customer_name || "",
        orderData.customer_phone || null,
        orderData.salesman_id || null,
        orderData.currency_id || null,
        orderData.exchange_rate || 1,
        orderData.discount_amount || 0,
        orderData.discount_type || null,
        orderData.vat_amount || 0,
        orderData.vat_percent || 0,
        orderData.total_amount || 0,
        orderData.order_type || 1,
        orderData.order_status || 0,
        orderData.order_decision || 0,
        orderData.delivery_address || "",
        orderData.reference_number || "",
        orderData.delivery_date || new Date(),
        orderData.shipping_cost || 0,
        orderData.other_charges || 0,
        orderData.general_notes || "",
        orderData.internal_notes || "",
        orderData.delivery_notes || "",
        orderData.received_by || "",
        orderData.customer_order_no || "",
        orderData.user_id || "",
        "0",
        "0",
        orderData.order_status2 || 0,
      ];


      const result = await pool.query(orderInsertQuery, orderValues);
      order = result.rows[0];
    }


    console.log("[v0] Order created:", order);
    if (order.id && order.id > 0) {
      // Delete existing items first
      await client.query(`DELETE FROM order_items WHERE order_id = $1`, [order.id]);
      await client.query(`DELETE FROM stock_batch WHERE order_id = $1`, [order.id]);
    }
    // Insert order items
    for (const item of items) {
      if (!item.product_name || (!item.quantity && !item.delivered_quantity)) continue;

      const itemInsertQuery = `
        INSERT INTO order_items (
          order_id, product_id, product_name, quantity, bonus, price, discount,
          barcode, unit_id, store_id, delivered_quantity,
          expiry_date, batch_number, item_status, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW()
        )
      `;

      const itemValues = [
        order.id,
        item.product_id || null,
        item.product_name,
        item.quantity || 0,
        item.bonus || 0,
        item.price || 0,
        item.discount || 0,
        item.barcode || null,
        item.unit_id || null,
        item.store_id || null,
        item.delivered_quantity || 0,
        item.expiry_date || null,
        item.batch_number || null,
        item.item_status || 0,
      ];

      await client.query(itemInsertQuery, itemValues);
    }

    if (orderData.order_type === 2) {
      for (const item of items) {
        if (!item.batch_number || item.batch_number.trim() === "") continue;

        const qty = Number(item.quantity || 0);
        const bonus = Number(item.bonus || 0);
        const total = qty + bonus;

        if (total <= 0) continue;

        // Insert into stock_batch
        const insertBatchQuery = `
      INSERT INTO stock_batch (
        product_id,
        order_id,
        batch_number,
        status_id,
        quantity
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
        const batchResult = await client.query(insertBatchQuery, [
          item.product_id,
          order.id,
          item.batch_number,
          1, // default status
          item.quantity
        ]);

        const batchId = batchResult.rows[0].id;

        // Insert into stock_batch_log
        const insertLogQuery = `
      INSERT INTO stock_batch_log (
        product_id,
        stock_batch_id,
        user_id,
        status
      )
      VALUES ($1, $2, $3, $4)
    `;
        await client.query(insertLogQuery, [
          item.product_id,
          batchId,
          orderData.user_id || '', // use the current user, fallback to 'system'
          1                               // same status as stock_batch
        ]);
      }
    }

    const statusId = order.id && order.id > 0 ? 2 : 1;

    const insertVoucherLogQuery = `
      INSERT INTO vouchers_log (
        voucher_id,
        voucher_type,
        user_id,
        status_id
      )
      VALUES ($1, $2, $3, $4)
    `;

    await client.query(insertVoucherLogQuery, [
      order.id,
      orderData.order_type,          // تأكد أنها موجودة
      orderData.user_id || null,   // أو 'system'
      statusId
    ]);


    await client.query("COMMIT");
    console.log("[v0] Order and items inserted successfully");

    return order;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[v0] Error creating order:", error);
    throw error;
  } finally {
    client.release();
  }
}
export async function createPurchaseOrder(orderData: Partial<PurchaseOrder>, items: Partial<OrderItem>[]) {
  try {
    // Generate order number if not provided
    if (!orderData.order_number) {
      const lastOrder = await sql`
        SELECT order_number FROM purchase_orders 
        WHERE order_number LIKE 'PO-%' 
        ORDER BY created_at DESC 
        LIMIT 1
      `

      let nextNumber = 1
      if (lastOrder.length > 0) {
        const lastNumber = Number.parseInt(lastOrder[0].order_number.split("-")[1])
        nextNumber = lastNumber + 1
      }

      orderData.order_number = `PO-${nextNumber.toString().padStart(6, "0")}`
    }

    // Create the purchase order
    const orderResult = await sql`
      INSERT INTO purchase_orders (
        order_number, order_date, supplier_id, supplier_name, salesman,
        total_amount, currency_code, currency_name, exchange_rate,
        workflow_status, expected_delivery_date, manual_document, notes
      ) VALUES (
        ${orderData.order_number}, ${orderData.order_date}, ${orderData.supplier_id},
        ${orderData.supplier_name}, ${orderData.salesman}, ${orderData.total_amount},
        ${orderData.currency_code}, ${orderData.currency_name}, ${orderData.exchange_rate},
        ${orderData.workflow_status || "pending"}, ${orderData.expected_delivery_date || null},
        ${orderData.manual_document || null}, ${orderData.notes || null}
      )
      RETURNING *
    `

    const order = orderResult[0]

    // Create order items
    for (const item of items) {
      if (item.product_id && item.quantity && item.unit_price) {
        await sql`
          INSERT INTO purchase_order_items (
            purchase_order_id, product_id, product_name, product_code,
            quantity, unit_price, total_price, notes
          ) VALUES (
            ${order.id}, ${item.product_id}, ${item.product_name}, ${item.product_code},
            ${item.quantity}, ${item.unit_price}, ${item.total_price}, ${item.notes || null}
          )
        `
      }
    }

    return order
  } catch (error) {
    console.error("Error creating purchase order:", error)
    throw error
  }
}

export async function updateOrderStatus(
  orderId: number,
  orderType: "sales" | "purchase",
  status: string,
  userId: string
) {
  try {
    const table = orderType === "sales" ? "sales_orders" : "purchase_orders"
    const statusField = orderType === "sales" ? "order_status" : "workflow_status"

    const result = await sql`
      UPDATE ${sql.unsafe(table)}
      SET ${sql.unsafe(statusField)} = ${status}, updated_at = NOW()
      WHERE id = ${orderId}
      RETURNING *
    `

    // Log the status change
    await sql`
      INSERT INTO workflow_history (
        order_id, order_type, order_number, previous_status, new_status,
        changed_by, change_reason, organization_id
      ) VALUES (
        ${orderId}, ${orderType}, 
        (SELECT order_number FROM ${sql.unsafe(table)} WHERE id = ${orderId}),
        (SELECT ${sql.unsafe(statusField)} FROM ${sql.unsafe(table)} WHERE id = ${orderId}),
        ${status}, ${userId}, 'Status updated via system', 1
      )
    `

    return result[0]
  } catch (error) {
    console.error("Error updating order status:", error)
    throw error
  }
}

export async function getOrderStatistics(organizationId = 1) {
  try {
    const salesStats = await sql`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE order_status = 'pending') as pending_orders,
        COUNT(*) FILTER (WHERE order_status = 'completed') as completed_orders,
        COUNT(*) FILTER (WHERE order_status = 'cancelled') as cancelled_orders,
        COALESCE(SUM(total_amount), 0) as total_value,
        COALESCE(SUM(total_amount) FILTER (WHERE order_status = 'completed'), 0) as completed_value
      FROM sales_orders
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
    `

    const purchaseStats = await sql`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE workflow_status = 'pending') as pending_orders,
        COUNT(*) FILTER (WHERE workflow_status = 'completed') as completed_orders,
        COUNT(*) FILTER (WHERE workflow_status = 'cancelled') as cancelled_orders,
        COALESCE(SUM(total_amount), 0) as total_value,
        COALESCE(SUM(total_amount) FILTER (WHERE workflow_status = 'completed'), 0) as completed_value
      FROM purchase_orders
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
    `

    return {
      sales: salesStats[0],
      purchase: purchaseStats[0],
    }
  } catch (error) {
    console.error("Error fetching order statistics:", error)
    throw error
  }
}

export async function getCustomers() {
  try {
    console.log("[v0] Fetching customers from database...")

    const result = await sql`
      SELECT id, customer_code, customer_name, email, mobile1, status
      FROM customers
      WHERE status = 'active'
      ORDER BY customer_name
    `

    console.log("[v0] Customers fetched:", result.length, "records")
    console.log("[v0] Sample customer data:", result[0])

    return result
  } catch (error) {
    console.error("[v0] Error fetching customers:", error)
    throw error
  }
}

export async function getSuppliers() {
  try {
    console.log("[v0] Fetching suppliers from database...")

    const result = await sql`
      SELECT id, supplier_code, supplier_name, email, mobile1, status
      FROM suppliers
      WHERE status = 'active'
      ORDER BY supplier_name
    `

    console.log("[v0] Suppliers fetched:", result.length, "records")
    console.log("[v0] Sample supplier data:", result[0])

    return result
  } catch (error) {
    console.error("[v0] Error fetching suppliers:", error)
    throw error
  }
}

export async function updateSalesOrder(orderId: number, orderData: Partial<SalesOrder>, items: Partial<OrderItem>[]) {
  try {
    console.log("[v0] Updating sales order:", orderId, orderData)

    // Update the sales order
    const orderResult = await sql`
      UPDATE sales_orders SET
        order_number = ${orderData.order_number},
        order_date = ${orderData.order_date},
        customer_id = ${orderData.customer_id},
        customer_name = ${orderData.customer_name},
        salesman = ${orderData.salesman || ""},
        total_amount = ${orderData.total_amount || 0},
        currency_code = ${orderData.currency_code || "SAR"},
        currency_name = ${orderData.currency_name || "ريال سعودي"},
        exchange_rate = ${orderData.exchange_rate || 1.0},
        order_status = ${orderData.order_status || "pending"},
        financial_status = ${orderData.financial_status || "unpaid"},
        delivery_datetime = ${orderData.delivery_datetime || null},
        manual_document = ${orderData.manual_document || null},
        notes = ${orderData.notes || null},
        invoice_number = ${orderData.invoice_number || null},
        barcode = ${orderData.barcode || null},
        attachments = ${orderData.attachments || null},
        workflow_sequence_id = ${orderData.workflow_sequence_id || null},
        updated_at = NOW()
      WHERE id = ${orderId}
      RETURNING *
    `

    const order = orderResult[0]
    console.log("[v0] Sales order updated:", order)

    // Delete existing items
    await sql`DELETE FROM sales_order_items WHERE sales_order_id = ${orderId}`

    // Insert new items
    for (const item of items) {
      if (item.product_name && item.quantity && item.unit_price) {
        console.log("[v0] Creating order item:", item)

        await sql`
          INSERT INTO sales_order_items (
            sales_order_id, product_id, product_name, product_code,
            quantity, unit_price, discount_percentage, total_price, 
            notes, barcode, unit, warehouse, bonus_quantity, 
            delivered_quantity, expiry_date, batch_number, item_status
          ) VALUES (
            ${orderId}, 
            ${item.product_id || null}, 
            ${item.product_name}, 
            ${item.product_code || ""},
            ${item.quantity}, 
            ${item.unit_price}, 
            ${item.discount_percentage || 0},
            ${item.total_price || item.quantity * item.unit_price}, 
            ${item.notes || null},
            ${item.barcode || null},
            ${item.unit || "قطعة"},
            ${item.warehouse || "المستودع الرئيسي"},
            ${item.bonus_quantity || 0},
            ${item.delivered_quantity || 0},
            ${item.expiry_date || null},
            ${item.batch_number || null},
            ${item.item_status || "pending"}
          )
        `
      }
    }

    console.log("[v0] Sales order update completed successfully")
    return order
  } catch (error) {
    console.error("Error updating sales order:", error)
    throw error
  }
}

export async function deleteSalesOrder(
  orderId: number,
  voucherType: number,
  userId: string | null
) {
  const client = await pool.connect(); // افترض أنك عندك pool
  try {
    await client.query('BEGIN'); // بدء المعاملة

    // 1️⃣ تحديث الطلب ليصبح محذوف (soft delete)
    await client.query(
      `UPDATE orders
       SET deleted = true
       WHERE id = $1`,
      [orderId]
    );

    // 2️⃣ إدراج سجل الحذف في vouchers_log
    const insertVoucherLogQuery = `
      INSERT INTO vouchers_log (
        voucher_id,
        voucher_type,
        user_id,
        status_id
      )
      VALUES ($1, $2, $3, $4)
    `;
    await client.query(insertVoucherLogQuery, [
      orderId,       // voucher_id
      voucherType,   // order_type / voucher_type
      userId,        // المستخدم
      2              // status_id = حذف
    ]);

    await client.query('COMMIT'); // إنهاء المعاملة بنجاح
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK'); // تراجع إذا حصل خطأ
    console.error("Error deleting sales order:", error);
    throw error;
  } finally {
    client.release(); // تحرير الاتصال من pool
  }
}


export async function updatePrintSalesOrder(
  orderId: number,
  voucherType: number,
  userId: string | null
) {
  const client = await pool.connect(); // افترض أنك عندك pool
  try {
    await client.query('BEGIN'); // بدء المعاملة

    // 1️⃣ تحديث الطلب ليصبح محذوف (soft delete)
    await client.query(
      `UPDATE orders
        SET 
            printed = 1,
            printed_count = COALESCE(printed_count, 0) + 1
        WHERE id = $1;`,
      [orderId]
    );

    // 2️⃣ إدراج سجل الحذف في vouchers_log
    const insertVoucherLogQuery = `
      INSERT INTO vouchers_log (
        voucher_id,
        voucher_type,
        user_id,
        status_id
      )
      VALUES ($1, $2, $3, $4)
    `;
    await client.query(insertVoucherLogQuery, [
      orderId,       // voucher_id
      voucherType,   // order_type / voucher_type
      userId,        // المستخدم
      3              // status_id = طباعة '
    ]);

    await client.query('COMMIT'); // إنهاء المعاملة بنجاح
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK'); // تراجع إذا حصل خطأ
    console.error("Error deleting sales order:", error);
    throw error;
  } finally {
    client.release(); // تحرير الاتصال من pool
  }
}

export async function UpdateOrderStatus(
  orderId: number,
  statusOrDecision: number,
  voucherType: number,
  userId: string | null,
  received_by: string | null
) {
  const client = await pool.connect(); // افترض أنك عندك pool
  try {
    await client.query('BEGIN'); // بدء المعاملة

    // 1️⃣ تحديث الطلب ليصبح محذوف (soft delete)
    if (statusOrDecision === 1)
      await client.query(
        `UPDATE orders
        SET 
            order_status = 2
        WHERE id = $1;`,
        [orderId]
      );
    else
      await client.query(
        `UPDATE orders
        SET 
            order_status2 = 2,
            received_by = $2
            
        WHERE id = $1;`,
        [orderId, received_by]
      );

    // 2️⃣ إدراج سجل الحذف في vouchers_log
    const insertVoucherLogQuery = `
      INSERT INTO vouchers_log (
        voucher_id,
        voucher_type,
        user_id,
        status_id
      )
      VALUES ($1, $2, $3, $4)
    `;
    await client.query(insertVoucherLogQuery, [
      orderId,       // voucher_id
      voucherType,   // order_type / voucher_type
      userId,        // المستخدم
      2              // status_id = طباعة '
    ]);

    await client.query('COMMIT'); // إنهاء المعاملة بنجاح
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK'); // تراجع إذا حصل خطأ
    console.error("Error deleting sales order:", error);
    throw error;
  } finally {
    client.release(); // تحرير الاتصال من pool
  }
}
