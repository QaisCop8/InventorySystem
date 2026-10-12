import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { authorizeFile, authorizeFileRead, type FileAction } from "@/lib/file-permissions"

export const productFileFamily = (type: unknown) => Number(type) === 2 || type === "services" ? "services" as const : "items" as const

export async function authorizeProductType(request: NextRequest, type: unknown, action: FileAction | "lookup") {
  const family = productFileFamily(type)
  return action === "lookup" ? authorizeFileRead(request, [family]) : authorizeFile(request, family, action)
}

export async function authorizeStoredProduct(request: NextRequest, id: unknown, action: FileAction | "lookup", nextType?: unknown) {
  const productId = Number(id)
  if (!Number.isInteger(productId) || productId <= 0) return { ok: false as const, response: NextResponse.json({ error: "معرف الصنف غير صالح" }, { status: 400 }) }
  const product = (await sql`SELECT type FROM products WHERE id = ${productId} LIMIT 1`)[0]
  if (!product) return { ok: false as const, response: NextResponse.json({ error: "الصنف غير موجود" }, { status: 404 }) }
  const permission = await authorizeProductType(request, product.type, action)
  if (!permission.ok) return permission
  if (nextType !== undefined && productFileFamily(nextType) !== productFileFamily(product.type)) {
    const target = await authorizeProductType(request, nextType, "create")
    if (!target.ok) return target
  }
  return permission
}

export async function authorizeProductLookupScope(request: NextRequest) {
  const items = await authorizeProductType(request, 1, "lookup")
  if (!items.ok && items.response.status === 401) return items
  const services = await authorizeProductType(request, 2, "lookup")
  if (!items.ok && !services.ok) return items
  const types = [...(items.ok ? [1] : []), ...(services.ok ? [2] : [])]
  return { ok: true as const, types, items, services }
}
