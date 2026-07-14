import { type NextRequest, NextResponse } from "next/server"
import { generateCustomerNumber } from "@/lib/number-generator";
import { neon } from "@neondatabase/serverless"

import { Pool } from "pg"

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


export async function GET(req: NextRequest) {
  try {
    console.log("[v0] API: Starting number generation...");

    if (!process.env.DATABASE_URL) {
      console.error("[v0] API: DATABASE_URL not found");
      return NextResponse.json(
        { message: "خطأ في إعدادات قاعدة البيانات", error: "DATABASE_URL not configured" },
        { status: 500 }
      );
    }

    // Read isSupplier from query params (default: false)
    const isSupplier = req.nextUrl.searchParams.get("isSupplier") === "true";


    const customerNumber = await generateCustomerNumber(isSupplier);
    console.log("[v0] API: Generated number:", customerNumber);

    return NextResponse.json({ customerNumber });
  } catch (error) {
    console.error("[v0] API: Error generating number:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        message: "فشل في توليد الرقم",
        error: errorMessage,
        details: "Database connection or query failed",
      },
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

