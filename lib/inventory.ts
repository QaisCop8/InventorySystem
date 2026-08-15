import sql from "@/lib/database"
export interface Product {
  id: number
  product_code: string
  product_name: string
  description?: string
  category: string
  category_id?: number | null
  main_unit: string
  secondary_unit?: string
  conversion_factor: number
  last_purchase_price: number
  currency: string
  status: string
  product_type: string
  barcode?: string
  max_quantity?: number
  order_quantity?: number
  has_batch: boolean
  has_expiry: boolean
  has_colors: boolean
  general_notes?: string
  created_at: Date
}

export interface ProductStock {
  id: number
  product_id: number
  current_stock: number
  reserved_stock: number
  available_stock: number
  reorder_level: number
  max_stock_level?: number
  last_updated: Date
  organization_id: number
}

export interface InventoryTransaction {
  id: number
  product_id: number
  transaction_type: "in" | "out" | "adjustment" | "transfer"
  quantity: number
  unit_cost?: number
  reference_type?: string
  reference_id?: number
  notes?: string
  created_by: string
  created_at: Date
  organization_id: number
}

export interface StockMovement {
  product_id: number
  product_name: string
  product_code: string
  transaction_type: "in" | "out" | "adjustment" | "transfer"
  quantity: number
  unit_cost?: number
  reference_type?: string
  reference_id?: number
  notes?: string
  created_by: string
}

export async function getProductsWithStock(organizationId = 1) {
  try {
    const result = await sql`
      SELECT 
        p.id,
        p.product_code,
        p.product_name,
        p.description,
        p.category_id,
        COALESCE(ig.group_name, 'غير محدد') as category,
        p.main_unit,
        p.secondary_unit,
        p.conversion_factor,
        p.last_purchase_price,
        p.currency,
        p.status,
        p.product_type,
        p.barcode,
        p.max_quantity,
        p.order_quantity,
        p.has_batch,
        p.has_expiry,
        p.has_colors,
        p.created_at,
        COALESCE(ps.current_stock, 0) as current_stock,
        COALESCE(ps.reserved_stock, 0) as reserved_stock,
        COALESCE(ps.available_stock, 0) as available_stock,
        COALESCE(ps.reorder_level, 0) as reorder_level,
        ps.max_stock_level,
        ps.last_updated as stock_last_updated,
        CASE 
          WHEN COALESCE(ps.current_stock, 0) <= COALESCE(ps.reorder_level, 0) AND COALESCE(ps.current_stock, 0) > 0 THEN 'low'
          WHEN COALESCE(ps.current_stock, 0) = 0 THEN 'out'
          ELSE 'available'
        END as stock_status
      FROM products p
      LEFT JOIN item_groups ig ON ig.id = p.category_id
      LEFT JOIN product_stock ps ON p.id = ps.product_id AND ps.organization_id = ${organizationId}
      WHERE p.status = 'نشط'
      ORDER BY p.product_name
    `

    return result
  } catch (error) {
    console.error("Error fetching products with stock:", error)
    throw error
  }
}

export async function getProductStock(productId: number, organizationId = 1) {
  try {
    const result = await sql`
      SELECT * FROM product_stock 
      WHERE product_id = ${productId} AND organization_id = ${organizationId}
    `

    return result[0] || null
  } catch (error) {
    console.error("Error fetching product stock:", error)
    throw error
  }
}

export async function getInventoryTransactions(productId?: number, limit = 50, organizationId = 1) {
  try {
    let query
    if (productId) {
      query = sql`
        SELECT 
          it.*,
          p.product_name,
          p.product_code
        FROM inventory_transactions it
        JOIN products p ON it.product_id = p.id
        WHERE it.product_id = ${productId} AND it.organization_id = ${organizationId}
        ORDER BY it.created_at DESC
        LIMIT ${limit}
      `
    } else {
      query = sql`
        SELECT 
          it.*,
          p.product_name,
          p.product_code
        FROM inventory_transactions it
        JOIN products p ON it.product_id = p.id
        WHERE it.organization_id = ${organizationId}
        ORDER BY it.created_at DESC
        LIMIT ${limit}
      `
    }

    return await query
  } catch (error) {
    console.error("Error fetching inventory transactions:", error)
    throw error
  }
}

export async function createStockMovement(movement: StockMovement, organizationId = 1) {
  try {
    const result = await sql`
      INSERT INTO inventory_transactions (
        product_id, transaction_type, quantity, unit_cost, 
        reference_type, reference_id, notes, created_by, organization_id
      ) VALUES (
        ${movement.product_id}, ${movement.transaction_type}, ${movement.quantity},
        ${movement.unit_cost || null}, ${movement.reference_type || null}, 
        ${movement.reference_id || null}, ${movement.notes || null}, 
        ${movement.created_by}, ${organizationId}
      )
      RETURNING *
    `

    return result[0]
  } catch (error) {
    console.error("Error creating stock movement:", error)
    throw error
  }
}

export async function adjustStock(
  productId: number,
  newQuantity: number,
  reason: string,
  userId: string,
  organizationId = 1,
) {
  try {
    // Get current stock
    const currentStock = await getProductStock(productId, organizationId)
    const currentQuantity = currentStock?.current_stock || 0

    // Calculate adjustment
    const adjustment = newQuantity - currentQuantity

    if (adjustment !== 0) {
      // Create adjustment transaction
      await createStockMovement(
        {
          product_id: productId,
          product_name: "",
          product_code: "",
          transaction_type: "adjustment",
          quantity: Math.abs(adjustment),
          notes: `Stock adjustment: ${reason}. Previous: ${currentQuantity}, New: ${newQuantity}`,
          created_by: userId,
        },
        organizationId,
      )
    }

    return { success: true, adjustment }
  } catch (error) {
    console.error("Error adjusting stock:", error)
    throw error
  }
}

export async function getLowStockProducts(organizationId = 1) {
  try {
    const result = await sql`
      SELECT 
        p.id,
        p.product_code,
        p.product_name,
        p.main_unit,
        ps.current_stock,
        ps.reorder_level,
        ps.max_stock_level
      FROM products p
      JOIN product_stock ps ON p.id = ps.product_id
      WHERE ps.organization_id = ${organizationId}
        AND ps.current_stock <= ps.reorder_level
        AND p.status = 'نشط'
      ORDER BY (ps.current_stock - ps.reorder_level) ASC
    `

    return result
  } catch (error) {
    console.error("Error fetching low stock products:", error)
    throw error
  }
}

export async function getStockValuation(organizationId = 1) {
  try {
    const result = await sql`
      SELECT 
        p.product_code,
        p.product_name,
        p.currency,
        ps.current_stock,
        p.last_purchase_price,
        (ps.current_stock * p.last_purchase_price) as total_value
      FROM products p
      JOIN product_stock ps ON p.id = ps.product_id
      WHERE ps.organization_id = ${organizationId}
        AND ps.current_stock > 0
        AND p.status = 'نشط'
      ORDER BY total_value DESC
    `

    return result
  } catch (error) {
    console.error("Error calculating stock valuation:", error)
    throw error
  }
}

export async function createProduct(productData: Partial<Product>, organizationId = 1) {
  try {
    // Check if product_code already exists
    if (productData.product_code) {
      const existingProduct = await sql`
        SELECT id FROM products WHERE product_code = ${productData.product_code}
      `

      if (existingProduct.length > 0) {
        throw new Error(
          `Product code '${productData.product_code}' already exists. Please use a different code or leave empty for auto-generation.`,
        )
      }
    }

    // Generate product code if not provided
    if (!productData.product_code || productData.product_code.trim() === "") {
      const lastProduct = await sql`
        SELECT product_code FROM products 
        WHERE product_code ~ '^[0-9]+$' 
        ORDER BY CAST(product_code AS INTEGER) DESC 
        LIMIT 1
      `

      let nextCode = "1"
      if (lastProduct.length > 0) {
        const lastCode = Number.parseInt(lastProduct[0].product_code)
        nextCode = (lastCode + 1).toString()
      }

      productData.product_code = nextCode
    }

    const result = await sql`
      INSERT INTO products (
        product_code, product_name, description, category_id,
        main_unit, secondary_unit, conversion_factor, last_purchase_price, currency,
        status, product_type, barcode, max_quantity, order_quantity,
        has_batch, has_expiry, has_colors, general_notes
      ) VALUES (
        ${productData.product_code}, ${productData.product_name}, 
        ${productData.description || null}, ${productData.category_id ?? null},
        ${productData.main_unit}, ${productData.secondary_unit || null},
        ${productData.conversion_factor || 1}, ${productData.last_purchase_price || 0},
        ${productData.currency || "USD"}, ${productData.status || "نشط"},
        ${productData.product_type || "finished"}, ${productData.barcode || null},
        ${productData.max_quantity || null}, ${productData.order_quantity || null},
        ${productData.has_batch || false}, ${productData.has_expiry || false},
        ${productData.has_colors || false}, ${productData.general_notes || null}
      )
      RETURNING *
    `

    const product = result[0]

    // Initialize stock record
    await sql`
      INSERT INTO product_stock (
        product_id, current_stock, reserved_stock, reorder_level, 
        max_stock_level, organization_id
      ) VALUES (
        ${product.id}, 0, 0, ${productData.order_quantity || 0},
        ${productData.max_quantity || null}, ${organizationId}
      )
    `

    return product
  } catch (error) {
    console.error("Error creating product:", error)
    throw error
  }
}

export async function checkProductCodeExists(productCode: string) {
  try {
    const result = await sql`
      SELECT id FROM products WHERE product_code = ${productCode}
    `
    return result.length > 0
  } catch (error) {
    console.error("Error checking product code:", error)
    throw error
  }
}

export async function getProductByCode(productCode: string) {
  try {
    const result = await sql`
      SELECT 
        p.*,
        COALESCE(ps.current_stock, 0) as current_stock,
        COALESCE(ps.reserved_stock, 0) as reserved_stock,
        COALESCE(ps.available_stock, 0) as available_stock,
        COALESCE(ps.reorder_level, 0) as reorder_level,
        ps.max_stock_level,
        ps.last_updated as stock_last_updated
      FROM products p
      LEFT JOIN product_stock ps ON p.id = ps.product_id
      WHERE p.product_code = ${productCode}
    `

    return result[0] || null
  } catch (error) {
    console.error("Error fetching product by code:", error)
    throw error
  }
}

export async function updateProduct(productId: number, productData: Partial<Product>) {
  try {
    const result = await sql`
      UPDATE products SET
        product_name = COALESCE(${productData.product_name}, product_name),
        description = COALESCE(${productData.description}, description),
        category_id = COALESCE(${productData.category_id}, category_id),
        main_unit = COALESCE(${productData.main_unit}, main_unit),
        secondary_unit = COALESCE(${productData.secondary_unit}, secondary_unit),
        conversion_factor = COALESCE(${productData.conversion_factor}, conversion_factor),
        last_purchase_price = COALESCE(${productData.last_purchase_price}, last_purchase_price),
        currency = COALESCE(${productData.currency}, currency),
        status = COALESCE(${productData.status}, status),
        product_type = COALESCE(${productData.product_type}, product_type),
        barcode = COALESCE(${productData.barcode}, barcode),
        max_quantity = COALESCE(${productData.max_quantity}, max_quantity),
        order_quantity = COALESCE(${productData.order_quantity}, order_quantity),
        has_batch = COALESCE(${productData.has_batch}, has_batch),
        has_expiry = COALESCE(${productData.has_expiry}, has_expiry),
        has_colors = COALESCE(${productData.has_colors}, has_colors),
        general_notes = COALESCE(${productData.general_notes}, general_notes)
      WHERE id = ${productId}
      RETURNING *
    `

    return result[0]
  } catch (error) {
    console.error("Error updating product:", error)
    throw error
  }
}
