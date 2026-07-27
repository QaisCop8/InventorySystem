import { type NextRequest, NextResponse } from "next/server"
import { generateCustomerNumber } from "@/lib/number-generator";
import sql from "@/lib/database"
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

    const isSupplier = req.nextUrl.searchParams.get("isSupplier") === "true";
    const isSalesman = req.nextUrl.searchParams.get("isSalesman") === "true";
    const isSubscriber = req.nextUrl.searchParams.get("isSubscriber") === "true";

    const customerNumber = await generateCustomerNumber(isSupplier, isSalesman, isSubscriber);
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
