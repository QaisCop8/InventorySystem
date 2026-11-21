import { NextResponse } from "next/server"
import { readCatalogStamp } from "@/lib/catalog-stamp"

// ختم كتالوج الأصناف (lib/catalog-stamp.ts): الكاشير والمطعم يعيدان تحميل الأصناف فقط عند تغيّره
export async function GET() {
  try {
    return NextResponse.json({ stamp: await readCatalogStamp() }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[pos/catalog-stamp] GET", error)
    return NextResponse.json({ error: "تعذر قراءة حالة الأصناف" }, { status: 500 })
  }
}
