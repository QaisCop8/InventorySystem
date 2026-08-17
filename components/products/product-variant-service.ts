export interface ConfigurableProduct {
  id: number
  product_name?: string
  product_image?: string | null
  image_url?: string | null
  attributes?: Array<{ name: string; values: string[] }>
  selected_attributes?: Record<string, string>
  attribute_summary?: string
  [key: string]: any
}

export const PRODUCT_VARIANT_REQUEST_EVENT = "erp:product-variant-request"

export function requestProductVariant<T extends ConfigurableProduct>(product: T): Promise<T | null> {
  const attributes = Array.isArray(product.attributes)
    ? product.attributes.filter((attribute) => attribute.name && Array.isArray(attribute.values) && attribute.values.length > 0)
    : []
  if (attributes.length === 0 || product.selected_attributes) return Promise.resolve(product)
  return new Promise<T | null>((resolve) => {
    window.dispatchEvent(new CustomEvent(PRODUCT_VARIANT_REQUEST_EVENT, { detail: { product: { ...product, attributes }, resolve } }))
  })
}
