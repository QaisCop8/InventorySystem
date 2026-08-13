
import { NextResponse } from "next/server";
import { getTenantPool } from "@/lib/database";

export async function GET(request: Request, { params }: { params: { navigationType: string } }) {
  try {
    const pool = await getTenantPool();
    const { searchParams } = new URL(request.url);
    const navigationType = params.navigationType;
    const currentId = Number(searchParams.get("currentId") || 0);
    const orderType = Number(searchParams.get("order_type") || 0);

    const orderQueryBase = `
      SELECT so.*, COALESCE(c.name, '') AS customer_name, COALESCE(c.customer_code, '') AS customer_code
      FROM orders so
      LEFT JOIN customers c ON so.customer_id = c.id
      WHERE so.deleted = false
      ${orderType ? "AND so.order_type = $2" : ""}
    `;

    if (navigationType === "first" || navigationType === "last" || navigationType === "previous" || navigationType === "next") {
      let rows: any[] = [];
      if (navigationType === "first") {
        rows = await pool.query(
          `${orderQueryBase} ORDER BY so.id ASC LIMIT 1`,
          orderType ? [orderType] : []
        ).then((result) => result.rows);
      } else if (navigationType === "last") {
        rows = await pool.query(
          `${orderQueryBase} ORDER BY so.id DESC LIMIT 1`,
          orderType ? [orderType] : []
        ).then((result) => result.rows);
      } else if (navigationType === "previous") {
        if (!currentId) {
          return NextResponse.json(null, { status: 200 });
        }
        rows = await pool.query(
          `${orderQueryBase} AND so.id < $1 ORDER BY so.id DESC LIMIT 1`,
          orderType ? [currentId, orderType] : [currentId]
        ).then((result) => result.rows);
      } else if (navigationType === "next") {
        if (!currentId) {
          return NextResponse.json(null, { status: 200 });
        }
        rows = await pool.query(
          `${orderQueryBase} AND so.id > $1 ORDER BY so.id ASC LIMIT 1`,
          orderType ? [currentId, orderType] : [currentId]
        ).then((result) => result.rows);
      }

      const order = rows[0];
      if (!order) {
        return NextResponse.json(null, { status: 200 });
      }

      const itemsResult = await pool.query(
        `SELECT oi.*, w.name AS workflow_name,
           COALESCE(p.product_code, '') AS product_code,
           COALESCE(u.unit_name, '') AS unit_name,
           COALESCE(wh.warehouse_name, '') AS store_name
         FROM order_items oi
         LEFT JOIN task_workflows w ON w.id = oi.workflow_id
         LEFT JOIN products p ON p.id = oi.product_id
         LEFT JOIN units u ON u.id = oi.unit_id
         LEFT JOIN warehouses wh ON wh.id = oi.store_id
         WHERE oi.order_id = $1
         ORDER BY oi.id`,
        [order.id]
      );

      return NextResponse.json({ ...order, items: itemsResult.rows }, { status: 200 });
    }

    if (navigationType === "Byid") {
      const id = Number(searchParams.get("id"));
      if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
      }

      const orderResult = await pool.query(
        `SELECT so.*, COALESCE(c.name, '') AS customer_name, COALESCE(c.customer_code, '') AS customer_code
         FROM orders so
         LEFT JOIN customers c ON so.customer_id = c.id
         WHERE so.id = $1 AND so.deleted = false
         LIMIT 1`,
        [id]
      );
      const order = orderResult.rows[0];
      if (!order) {
        return NextResponse.json(null, { status: 200 });
      }

      const itemsResult = await pool.query(
        `SELECT oi.*, w.name AS workflow_name,
           COALESCE(p.product_code, '') AS product_code,
           COALESCE(u.unit_name, '') AS unit_name,
           COALESCE(wh.warehouse_name, '') AS store_name
         FROM order_items oi
         LEFT JOIN task_workflows w ON w.id = oi.workflow_id
         LEFT JOIN products p ON p.id = oi.product_id
         LEFT JOIN units u ON u.id = oi.unit_id
         LEFT JOIN warehouses wh ON wh.id = oi.store_id
         WHERE oi.order_id = $1
         ORDER BY oi.id`,
        [id]
      );

      return NextResponse.json({ ...order, items: itemsResult.rows }, { status: 200 });
    }

    if (navigationType === "ByCode") {
      const order_number = searchParams.get("order_number");
      if (!order_number) {
        return NextResponse.json(
          { error: "order_number is required" },
          { status: 400 }
        );
      }

      const queryText = `
        SELECT
          so.*,
          COALESCE(c.name, '') AS customer_name,
          COALESCE(c.customer_code, '') AS customer_code
        FROM orders so
        LEFT JOIN customers c ON so.customer_id = c.id
        WHERE so.order_number = $1 AND so.deleted = false
        LIMIT 1
      `;

      const result = await pool.query(queryText, [order_number]);
      const order = result.rows[0];
      if (!order) {
        return NextResponse.json(null, { status: 200 });
      }

      const itemsResult = await pool.query(
        `SELECT oi.*, w.name AS workflow_name,
           COALESCE(p.product_code, '') AS product_code,
           COALESCE(u.unit_name, '') AS unit_name,
           COALESCE(wh.warehouse_name, '') AS store_name
         FROM order_items oi
         LEFT JOIN task_workflows w ON w.id = oi.workflow_id
         LEFT JOIN products p ON p.id = oi.product_id
         LEFT JOIN units u ON u.id = oi.unit_id
         LEFT JOIN warehouses wh ON wh.id = oi.store_id
         WHERE oi.order_id = $1
         ORDER BY oi.id`,
        [order.id]
      );

      return NextResponse.json(
        { ...order, items: itemsResult.rows },
        { status: 200 }
      );
    }

    return NextResponse.json({ error: "Invalid navigation type" }, { status: 400 });

  } catch (error) {
    console.error("getorderbycode error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
