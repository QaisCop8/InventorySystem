export async function expandProductWithRelatedItems(product: any, cachedProducts: any[] = []): Promise<any[]> {
  const canonical = cachedProducts.find((item) => Number(item.id) === Number(product.id)) || product
  const productId = Number(canonical.id || product.id)
  if (!Number.isInteger(productId) || productId <= 0) return [product]

  // Always read the mode from the saved product record. Search results and
  // client caches can be stale and must not decide whether followers are added.
  const response = await fetch(`/api/inventory/products/${productId}/related-items?includeMode=1`, { cache: "no-store" })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload?.error || `تعذر تحميل توابع الصنف ${canonical.product_name || canonical.name || ""}`)
  const mode = Math.min(3, Math.max(1, Number(payload?.related_items_mode || 1)))
  const relations = Array.isArray(payload?.related_items) ? payload.related_items : []
  if (mode === 1) return [product]

  const related = await Promise.all(relations.map(async (row: any) => {
    const cached = cachedProducts.find((item) => Number(item.id) === Number(row.related_id))
    if (cached) return cached
    const productResponse = await fetch(`/api/inventory/products?productId=${Number(row.related_id)}`, { cache: "no-store" })
    const productData = await productResponse.json()
    if (!productResponse.ok) return null
    const rows = Array.isArray(productData) ? productData : Array.isArray(productData?.products) ? productData.products : []
    return rows[0] || null
  }))

  const validRelated = related.filter(Boolean)
  return mode === 2 ? validRelated : [product, ...validRelated]
}
