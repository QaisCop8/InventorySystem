import { NextRequest, NextResponse } from "next/server"

import sql, { getTenantPool } from "@/lib/database"




// لا يوجد تعريف CREATE TABLE لهذا الجدول في أي مكان بالمستودع (كان يُفترَض موجوداً مسبقاً بقاعدة
// البيانات الحية فقط) — يُنشَأ دفاعياً هنا لضمان عمله على أي شركة/قاعدة بيانات جديدة (لم يكن ضمن
// LOOKUP_TABLES في lib/provisioning.ts فتبقى شركات جديدة بلا هذا الجدول دون هذا).
const ensureVoucherColumnSettingsTable = async () => {
    const pool = await getTenantPool()
    await pool.query(`
        CREATE TABLE IF NOT EXISTS voucher_column_settings (
            id SERIAL PRIMARY KEY,
            voucher_type INTEGER NOT NULL,
            target INTEGER NOT NULL,
            column_key VARCHAR(50) NOT NULL,
            is_visible BOOLEAN DEFAULT true,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (voucher_type, target, column_key)
        )
    `)
}

/* =========================
   GET: Load settings
========================= */
export async function GET(req: Request) {
    try {
        await ensureVoucherColumnSettingsTable()
        const { searchParams } = new URL(req.url);

        const target = searchParams.get("target");
        let targetCondition = 1;
        if (target === "print") {
            targetCondition = 2;
        }
        if (!target) {
            return NextResponse.json(
                { message: "Missing parameters" },
                { status: 400 }
            );
        }

        const { rows } = await (await getTenantPool()).query(
            `
      SELECT column_key, is_visible,voucher_type
      FROM voucher_column_settings
      WHERE target = $1
      group by voucher_type, column_key, is_visible
      ORDER BY voucher_type, column_key
      `,
            [targetCondition]
        );

        const columnsByVoucher: Record<string, Record<string, boolean>> = {};

        rows.forEach(r => {
            if (!columnsByVoucher[r.voucher_type]) {
                columnsByVoucher[r.voucher_type] = {};
            }
            columnsByVoucher[r.voucher_type][r.column_key] = r.is_visible;
        });

        return NextResponse.json({
            target,
            columns: columnsByVoucher
        });
    } catch (error) {
        console.error("GET voucher-settings error:", error);
        return NextResponse.json(
            { message: "Failed to load settings" },
            { status: 500 }
        );
    }
}

/* =========================
   POST: Save settings
========================= */
export async function POST(req: Request) {
    await ensureVoucherColumnSettingsTable()
    const client = await (await getTenantPool()).connect();

    try {
        const body = await req.json();
        const { voucher_type, target, columns } = body;
        let targetCondition = 1;
        if (target === "print") {
            targetCondition = 2;
        }
        if (!voucher_type || !target || !columns) {
            return NextResponse.json(
                { message: "Invalid payload" },
                { status: 400 }
            );
        }

        await client.query("BEGIN");

        for (const columnKey of Object.keys(columns)) {
            await client.query(
                `
        INSERT INTO voucher_column_settings
          (voucher_type, target, column_key, is_visible)
        VALUES
          ($1, $2, $3, $4)
        ON CONFLICT (voucher_type, target, column_key)
        DO UPDATE SET
          is_visible = EXCLUDED.is_visible,
          updated_at = CURRENT_TIMESTAMP
        `,
                [
                    voucher_type,
                    targetCondition,
                    columnKey,
                    Boolean(columns[columnKey])
                ]
            );
        }

        await client.query("COMMIT");

        return NextResponse.json({ success: true });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("POST voucher-settings error:", error);

        return NextResponse.json(
            { message: "Failed to save settings" },
            { status: 500 }
        );
    } finally {
        client.release();
    }
}
