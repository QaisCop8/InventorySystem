
import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET(request: Request, { params }: { params: { navigationType: string } }) {
  try {
    const { searchParams } = new URL(request.url);
    const navigationType = params.navigationType;

    // فتح طلبية محدَّدة بمعرّفها (id) — المسار الفعلي المُستخدَم عند فتح طلبية موجودة للتعديل من
    // قائمة الطلبيات؛ يُعيد أيضاً بنود الطلبية (order_items) مع اسم مخطط سير العمل المرتبط بكل بند
    // إن وُجد (workflow_id)، إذ كانت هذه النقطة سابقاً تتجاهل id كلياً وتطلب order_number دوماً.
    if (navigationType === "Byid") {
      const id = Number(searchParams.get("id"));
      if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
      }

      const orderResult = await pool.query(
        `SELECT so.*, COALESCE(c.name, '') AS customer_name
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
        `SELECT oi.*, w.name AS workflow_name
         FROM order_items oi
         LEFT JOIN task_workflows w ON w.id = oi.workflow_id
         WHERE oi.order_id = $1
         ORDER BY oi.id`,
        [id]
      );

      return NextResponse.json({ ...order, items: itemsResult.rows }, { status: 200 });
    }

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
        COALESCE(c.name, '') AS customer_name
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
      `SELECT oi.*, w.name AS workflow_name
       FROM order_items oi
       LEFT JOIN task_workflows w ON w.id = oi.workflow_id
       WHERE oi.order_id = $1
       ORDER BY oi.id`,
      [order.id]
    );

    return NextResponse.json(
      { ...order, items: itemsResult.rows },
      { status: 200 }
    );

  } catch (error) {
    console.error("getorderbycode error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
