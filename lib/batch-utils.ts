// ========================================
// مكتبة مساعدة موحدة لإدارة الباتش نمبر
// Unified Batch Number Utility Library
// ========================================

import sql from "@/lib/database"
// ========================================
// Types and Interfaces
// ========================================

export interface BatchInfo {
  lotId: number
  batchNumber: string
  productId: number
  productCode: string
  productName: string
  manufacturingDate?: string
  expiryDate?: string
  currentQuantity: number
  reservedQuantity: number
  availableQuantity: number
  unitCost: number
  status: string
  supplierName?: string
  expiryStatus: "no_expiry" | "good" | "near_expiry" | "expired"
  daysUntilExpiry?: number
  totalValue: number
}

export interface BatchAllocation {
  lotId: number
  batchNumber: string
  availableQuantity: number
  allocatedQuantity: number
  unitCost: number
  expiryDate?: string
  expiryStatus: string
  daysUntilExpiry?: number
}

export interface FIFOAllocationResult {
  allocations: BatchAllocation[]
  totalAllocated: number
  remainingNeeded: number
  canFulfill: boolean
  totalCost: number
}

export interface BatchSettings {
  documentType: string
  mandatoryBatchSelection: boolean
  autoSelectFifo: boolean
  allowNegativeStock: boolean
  requireExpiryDate: boolean
}

// ========================================
// Core Batch Functions
// ========================================

/**
 * الحصول على معلومات باتش معين
 * Get information for a specific batch
 */
export async function getBatchInfo(lotId: number): Promise<BatchInfo | null> {
  try {
    const result = await sql`
      SELECT * FROM batch_inventory_view
      WHERE lot_id = ${lotId}
    `
    return result.length > 0 ? (result[0] as BatchInfo) : null
  } catch (error) {
    console.error("[v0] Error getting batch info:", error)
    throw error
  }
}

/**
 * الحصول على جميع الباتشات المتاحة لمنتج معين
 * Get all available batches for a product
 */
export async function getAvailableBatches(productId: number): Promise<BatchInfo[]> {
  try {
    const result = await sql`
      SELECT * FROM batch_inventory_view
      WHERE product_id = ${productId}
        AND available_quantity > 0
        AND status = 'active'
      ORDER BY 
        CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
        expiry_date ASC NULLS LAST,
        manufacturing_date ASC NULLS LAST,
        created_at ASC
    `
    return result as BatchInfo[]
  } catch (error) {
    console.error("[v0] Error getting available batches:", error)
    throw error
  }
}

/**
 * حساب توزيع الباتشات حسب نظام FIFO
 * Calculate batch allocation using FIFO method
 */
export async function calculateFIFOAllocation(
  productId: number,
  requestedQuantity: number,
): Promise<FIFOAllocationResult> {
  try {
    const batches = await getAvailableBatches(productId)

    const allocations: BatchAllocation[] = []
    let remainingQuantity = requestedQuantity
    let totalCost = 0

    for (const batch of batches) {
      if (remainingQuantity <= 0) break

      const allocatedQty = Math.min(remainingQuantity, batch.availableQuantity)

      if (allocatedQty > 0) {
        allocations.push({
          lotId: batch.lotId,
          batchNumber: batch.batchNumber,
          availableQuantity: batch.availableQuantity,
          allocatedQuantity: allocatedQty,
          unitCost: batch.unitCost,
          expiryDate: batch.expiryDate,
          expiryStatus: batch.expiryStatus,
          daysUntilExpiry: batch.daysUntilExpiry,
        })

        totalCost += allocatedQty * batch.unitCost
        remainingQuantity -= allocatedQty
      }
    }

    return {
      allocations,
      totalAllocated: requestedQuantity - remainingQuantity,
      remainingNeeded: remainingQuantity,
      canFulfill: remainingQuantity === 0,
      totalCost,
    }
  } catch (error) {
    console.error("[v0] Error calculating FIFO allocation:", error)
    throw error
  }
}

/**
 * حجز كميات من الباتشات
 * Reserve quantities from batches
 */
export async function reserveBatches(
  allocations: BatchAllocation[],
  referenceType: string,
  referenceId: number,
  createdBy: string,
): Promise<void> {
  try {
    for (const allocation of allocations) {
      // تحديث الكميات المحجوزة والمتاحة
      await sql`
        UPDATE product_lots 
        SET 
          reserved_quantity = reserved_quantity + ${allocation.allocatedQuantity},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${allocation.lotId}
      `

      // تسجيل الحركة
      await sql`
        INSERT INTO lot_transactions (
          lot_id, 
          transaction_type, 
          quantity, 
          unit_cost,
          reference_type, 
          reference_id, 
          created_by, 
          notes
        ) VALUES (
          ${allocation.lotId}, 
          'reserve', 
          ${allocation.allocatedQuantity}, 
          ${allocation.unitCost},
          ${referenceType}, 
          ${referenceId}, 
          ${createdBy}, 
          'Reserved via FIFO allocation'
        )
      `
    }
  } catch (error) {
    console.error("[v0] Error reserving batches:", error)
    throw error
  }
}

/**
 * إلغاء حجز كميات من الباتشات
 * Release reserved quantities from batches
 */
export async function releaseBatches(
  allocations: BatchAllocation[],
  referenceType: string,
  referenceId: number,
  createdBy: string,
): Promise<void> {
  try {
    for (const allocation of allocations) {
      // تحديث الكميات المحجوزة والمتاحة
      await sql`
        UPDATE product_lots 
        SET 
          reserved_quantity = reserved_quantity - ${allocation.allocatedQuantity},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${allocation.lotId}
      `

      // تسجيل الحركة
      await sql`
        INSERT INTO lot_transactions (
          lot_id, 
          transaction_type, 
          quantity, 
          unit_cost,
          reference_type, 
          reference_id, 
          created_by, 
          notes
        ) VALUES (
          ${allocation.lotId}, 
          'release', 
          ${allocation.allocatedQuantity}, 
          ${allocation.unitCost},
          ${referenceType}, 
          ${referenceId}, 
          ${createdBy}, 
          'Released reservation'
        )
      `
    }
  } catch (error) {
    console.error("[v0] Error releasing batches:", error)
    throw error
  }
}

/**
 * استهلاك كميات من الباتشات (تقليل الكمية الفعلية)
 * Consume quantities from batches (reduce actual quantity)
 */
export async function consumeBatches(
  allocations: BatchAllocation[],
  referenceType: string,
  referenceId: number,
  createdBy: string,
): Promise<void> {
  try {
    for (const allocation of allocations) {
      // تحديث الكميات الفعلية والمحجوزة
      await sql`
        UPDATE product_lots 
        SET 
          current_quantity = current_quantity - ${allocation.allocatedQuantity},
          reserved_quantity = reserved_quantity - ${allocation.allocatedQuantity},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${allocation.lotId}
      `

      // تسجيل الحركة
      await sql`
        INSERT INTO lot_transactions (
          lot_id, 
          transaction_type, 
          quantity, 
          unit_cost,
          reference_type, 
          reference_id, 
          created_by, 
          notes
        ) VALUES (
          ${allocation.lotId}, 
          'consume', 
          ${allocation.allocatedQuantity}, 
          ${allocation.unitCost},
          ${referenceType}, 
          ${referenceId}, 
          ${createdBy}, 
          'Consumed from inventory'
        )
      `
    }
  } catch (error) {
    console.error("[v0] Error consuming batches:", error)
    throw error
  }
}

/**
 * البحث عن باتش برقم الباتش أو الباركود
 * Search for batch by batch number or barcode
 */
export async function searchBatch(searchTerm: string): Promise<BatchInfo[]> {
  try {
    const result = await sql`
      SELECT * FROM batch_inventory_view
      WHERE batch_number ILIKE ${`%${searchTerm}%`}
        OR barcode ILIKE ${`%${searchTerm}%`}
        OR product_code ILIKE ${`%${searchTerm}%`}
      ORDER BY created_at DESC
      LIMIT 50
    `
    return result as BatchInfo[]
  } catch (error) {
    console.error("[v0] Error searching batch:", error)
    throw error
  }
}

/**
 * الحصول على إعدادات الباتش لنوع سند معين
 * Get batch settings for a specific document type
 */
export async function getBatchSettings(documentType: string): Promise<BatchSettings | null> {
  try {
    const result = await sql`
      SELECT 
        document_type as "documentType",
        mandatory_batch_selection as "mandatoryBatchSelection",
        auto_select_fifo as "autoSelectFifo",
        allow_negative_stock as "allowNegativeStock",
        require_expiry_date as "requireExpiryDate"
      FROM batch_settings
      WHERE document_type = ${documentType}
    `
    return result.length > 0 ? (result[0] as BatchSettings) : null
  } catch (error) {
    console.error("[v0] Error getting batch settings:", error)
    throw error
  }
}

/**
 * التحقق من صلاحية الباتش
 * Validate batch expiry
 */
export function validateBatchExpiry(expiryDate: string | undefined): {
  isValid: boolean
  status: "no_expiry" | "good" | "near_expiry" | "expired"
  daysUntilExpiry?: number
  message: string
} {
  if (!expiryDate) {
    return {
      isValid: true,
      status: "no_expiry",
      message: "لا يوجد تاريخ انتهاء",
    }
  }

  const expiry = new Date(expiryDate)
  const today = new Date()
  const daysUntilExpiry = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntilExpiry < 0) {
    return {
      isValid: false,
      status: "expired",
      daysUntilExpiry,
      message: "منتهي الصلاحية",
    }
  }

  if (daysUntilExpiry <= 30) {
    return {
      isValid: true,
      status: "near_expiry",
      daysUntilExpiry,
      message: `قريب من الانتهاء (${daysUntilExpiry} يوم متبقي)`,
    }
  }

  return {
    isValid: true,
    status: "good",
    daysUntilExpiry,
    message: "صالح",
  }
}

/**
 * الحصول على ملخص الباتشات لمنتج معين
 * Get batch summary for a product
 */
export async function getProductBatchSummary(productId: number) {
  try {
    const result = await sql`
      SELECT * FROM product_batch_summary
      WHERE product_id = ${productId}
    `
    return result.length > 0 ? result[0] : null
  } catch (error) {
    console.error("[v0] Error getting product batch summary:", error)
    throw error
  }
}
