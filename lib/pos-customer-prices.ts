type PricedProduct = { id: number; unitId: number | null; price: number; unitPrices?: { unitId: number | null; price: number }[]; barcodeOptions: { unitId: number | null; price: number }[] }

export function repricePosCart<T extends { id: number; unitId: number | null; price: number }>(cart: T[], products: PricedProduct[]): T[] {
  return cart.map(line => {
    const product = products.find(row => row.id === line.id)
    const unitPrice = product?.unitPrices?.find(row => row.unitId === line.unitId)?.price
    const price = unitPrice ?? (product?.unitId === line.unitId ? product.price : product?.barcodeOptions.find(row => row.unitId === line.unitId)?.price)
    if (price == null || !Number.isFinite(price) || price <= 0) throw new Error("لا يمكن اختيار العميل يوجد اصناف سعرها صفر لفئة بيع العميل")
    return { ...line, price }
  })
}
