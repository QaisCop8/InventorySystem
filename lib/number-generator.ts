/**
 * Utility functions for generating standardized entity numbers
 * All numbers are 8 characters: PREFIX + 7 digits (padded with zeros)
 */

import sql from "./database"
import { buildVoucherCode } from "./voucher-code"

export default sql

// إعدادات ترقيم الطلبيات (بادئة النظام + بداية الترقيم) — نفس نمط getStockVoucherNumberSettings
// بـapp/api/stock-vouchers/_lib.ts، لكن قراءة مباشرة من system_settings (بنفس أسلوب
// getPrefixFromSettings أدناه) بدل استدعاء HTTP ذاتي، لأن هذا الملف يُستدعى من الخادم مباشرة (كـ
// lib/orders.ts) بلا سياق طلب دوماً. order_prefix/order_start لطلبات المبيعات، purchase_prefix/
// purchase_start لطلبات الشراء — نفس المفاتيح التي تعرضها شاشة الإعدادات العامة (system-settings.tsx).
async function getOrderNumberSettings(vchType: number): Promise<{ prefix: string; startNumber: number }> {
  const isPurchase = vchType === 2
  const defaultPrefix = isPurchase ? "PO" : "SO"
  const prefixKey = isPurchase ? "purchase_prefix" : "order_prefix"
  const startKey = isPurchase ? "purchase_start" : "order_start"
  try {
    const result = await sql`
      SELECT id, value FROM system_settings WHERE id IN (${[prefixKey, startKey]})
    `
    const map = Object.fromEntries(result.map((row: any) => [row.id, row.value]))
    const prefixRaw = String(map[prefixKey] || defaultPrefix).trim().toUpperCase()
    const prefix = /^[A-Z]{1,3}$/.test(prefixRaw) ? prefixRaw : defaultPrefix
    const startNumber = Number(map[startKey]) || 1
    return { prefix, startNumber }
  } catch (error) {
    console.error("[v0] Error fetching order number settings:", error)
    return { prefix: defaultPrefix, startNumber: 1 }
  }
}

// دفتر السندات الافتراضي لمستخدم معيَّن على نوع سند معيَّن (voucher_book_user_permissions_tbl،
// is_default=1) — نفس منطق app/api/receipts/voucher-books/route.ts تماماً (بما فيه حلّ المعرّف
// النصي user_settings.user_id إلى المفتاح الرقمي user_settings.id أولاً)، لكن استعلام مباشر هنا
// بدل HTTP لأن هذا يُستدعى من الخادم مباشرة (lib/orders.ts createOrder) بلا سياق طلب. تُستخدَم عند
// حفظ طلبية دون رقم طلبية جاهز من الواجهة (كالنافذة السريعة QuickSalesOrder التي لا تعرف شيئاً عن
// دفاتر السندات) بدل الرجوع لحرف ثابت غير مرتبط بصلاحيات المستخدم فعلياً.
export async function resolveDefaultVoucherBookName(userId: string, voucherTypeId: number): Promise<string | null> {
  if (!userId || !voucherTypeId) return null
  try {
    const userRows = await sql`SELECT id FROM user_settings WHERE user_id = ${userId}`
    const resolvedUserId: number | null = userRows[0]?.id ?? null
    if (!resolvedUserId) return null

    const permissionRows = await sql`
      SELECT vch_book_id FROM voucher_book_user_permissions_tbl
      WHERE user_id = ${resolvedUserId} AND voucher_type_id = ${voucherTypeId} AND is_default = 1
      LIMIT 1
    `
    const bookId = permissionRows[0]?.vch_book_id ?? null
    if (!bookId) return null

    const bookRows = await sql`SELECT name FROM voucher_books_tbl WHERE id = ${bookId}`
    return bookRows[0]?.name ?? null
  } catch (error) {
    console.error("[v0] Error resolving default voucher book:", error)
    return null
  }
}

// التسلسل التالي ضمن orders.order_number لبادئة (بادئة الطلبية + رمز الدفتر) معيَّنة — نفس منطق
// nextVoucherSequence بـapp/api/stock-vouchers/_lib.ts، لكن على جدول orders بدل voucher_header_tbl.
async function nextOrderSequence(codePrefix: string, startNumber: number): Promise<number> {
  const rows = await sql`
    SELECT order_number FROM orders WHERE order_number LIKE ${codePrefix + "%"}
  `
  let maxNumber = 0
  for (const row of rows as any[]) {
    const suffix = String(row.order_number || "").slice(codePrefix.length)
    const match = suffix.match(/^[A-Za-z]?([0-9]+)$/)
    const value = Number(match?.[1] ?? suffix)
    if (Number.isFinite(value) && value > maxNumber) maxNumber = value
  }
  return maxNumber >= startNumber ? maxNumber + 1 : startNumber
}

async function getPrefixFromSettings(type: "customer" | "supplier" | "salesman" | "subscriber" | "item_group"): Promise<string> {
  try {
    if (!process.env.DATABASE_URL) {
      return type === "customer"
        ? "C"
        : type === "supplier"
          ? "S"
          : type === "salesman"
            ? "C"
            : type === "subscriber"
              ? "G"
              : "G"
    }

    const result = await sql`
      SELECT id, value
      FROM system_settings
      WHERE id IN (${["customer_prefix", "supplier_prefix", "salesman_prefix", "subscriber_prefix", "item_group_prefix"]})
      ORDER BY id ASC
    `

    const prefixMap = Object.fromEntries(result.map((row: any) => [row.id, row.value]))
    const prefix =
      type === "customer"
        ? prefixMap.customer_prefix
        : type === "supplier"
          ? prefixMap.supplier_prefix
          : type === "salesman"
            ? prefixMap.salesman_prefix ?? prefixMap.customer_prefix
            : type === "subscriber"
              ? prefixMap.subscriber_prefix ?? prefixMap.customer_prefix
              : prefixMap.item_group_prefix

    return String(prefix || (type === "customer" ? "C" : type === "supplier" ? "S" : type === "salesman" ? "C" : type === "subscriber" ? "G" : "G"))
  } catch (error) {
    console.error("[v0] Error fetching prefix from settings:", error)
    return type === "customer" ? "C" : type === "supplier" ? "S" : type === "salesman" ? "C" : type === "subscriber" ? "G" : "G"
  }
}

export async function generateCustomerNumber(entityTypeOrSupplier: boolean | number = false, isSalesman: boolean = false, isSubscriber: boolean = false): Promise<string> {
  const entityType = typeof entityTypeOrSupplier === "number"
    ? entityTypeOrSupplier
    : isSubscriber
      ? 4
      : isSalesman
        ? 3
        : entityTypeOrSupplier
          ? 2
          : 1

  const typeKey = entityType === 2 ? "supplier" : entityType === 3 ? "salesman" : entityType === 4 ? "subscriber" : "customer"
  const prefix = await getPrefixFromSettings(typeKey)

  return await getNextSequentialNumber(prefix, "customers", "customer_code", entityType)
}


export async function generateSupplierNumber(): Promise<string> {
  const prefix = await getPrefixFromSettings("supplier")
  return await getNextSequentialNumber(prefix, "suppliers", "supplier_code")
}

// رقم الطلبية = بادئة الطلبية (إعدادات النظام) + رمز دفتر السندات + رقم تسلسلي مبطّن بأصفار،
// بمجموع 10 خانات كحد أقصى (lib/voucher-code.ts buildVoucherCode) — نفس منطق ترقيم السندات
// الموحَّد (سند قبض/صرف/قيد، سندات المخزون...) بدل الصيغة القديمة "O"/"T" + دفتر + 8 أرقام ثابتة
// التي لم تكن لها أي علاقة ببادئة الطلبية الفعلية بإعدادات النظام.
export async function generateSalesOrderNumber(vchBook: string): Promise<string> {
  const bookName = String(vchBook || "").trim().toUpperCase()
  const { prefix, startNumber } = await getOrderNumberSettings(1)
  const codePrefix = `${prefix}${bookName}`
  const sequence = await nextOrderSequence(codePrefix, startNumber)
  return buildVoucherCode(prefix, bookName, sequence)
}

export async function generatePurchaseOrderNumber(vchBook: string): Promise<string> {
  const bookName = String(vchBook || "").trim().toUpperCase()
  const { prefix, startNumber } = await getOrderNumberSettings(2)
  const codePrefix = `${prefix}${bookName}`
  const sequence = await nextOrderSequence(codePrefix, startNumber)
  return buildVoucherCode(prefix, bookName, sequence)
}


export async function generateItemGroupNumber(): Promise<string> {
  const prefix = await getPrefixFromSettings("item_group")
  return await getNextSequentialNumber(prefix, "item_groups", "group_code")
}

// Helper function to validate number format
export function validateNumberFormat(number: string, prefix: string): boolean {
  const regex = new RegExp(`^${prefix}\\d{9}$`)
  return regex.test(number)
}

async function getNextSequentialNumber(prefix: string, tableName: string, columnName: string,type?:number): Promise<string> {
  try {

    if (!process.env.DATABASE_URL) {
      
      throw new Error("DATABASE_URL environment variable is not set")
    }


    let result: any[] = []

    // Use proper SQL template literals based on table name
    if (tableName === "customers") {
      console.log("[v0] Querying customers table...")
      console.log("[v0] Query: SELECT customer_code FROM customers WHERE customer_code LIKE", prefix + "%")
      result = await sql`
        SELECT customer_code as code 
        FROM customers 
        WHERE customer_code LIKE ${prefix + "%"}
        ORDER BY customer_code ASC
      `
      console.log("[v0] Customers query completed")
    } else if (tableName === "suppliers") {
      console.log("[v0] Querying suppliers table...")
      result = await sql`
        SELECT supplier_code as code 
        FROM suppliers 
        WHERE supplier_code LIKE ${prefix + "%"} 
        ORDER BY supplier_code DESC 
        LIMIT 1
      `
      console.log("[v0] Suppliers query completed")
    } else if (tableName === "orders") {
      result = await sql`
        SELECT order_number as code 
        FROM orders 
        WHERE order_number LIKE ${prefix + "%"} 
        ORDER BY order_number DESC 
        LIMIT 1
      `
      console.log("[v0] Sales orders query completed")
    } else if (tableName === "purchase_orders") {
      console.log("[v0] Querying purchase_orders table...")
      result = await sql`
        SELECT order_number as code 
        FROM orders 
        WHERE order_number LIKE ${prefix + "%"} 
        ORDER BY order_number DESC 
        LIMIT 1
      `
      console.log("[v0] Purchase orders query completed")
    } else if (tableName === "item_groups") {
      console.log("[v0] Querying item_groups table...")
      result = await sql`
        SELECT group_code as code 
        FROM item_groups 
        WHERE group_code LIKE ${prefix + "%"} 
        ORDER BY group_code ASC
      `
    }


    let nextCode = "000000001";
    if (tableName === "orders") {
      nextCode = "00000001";
    }

    if (result.length > 0) {
      const matchingCodes = result
        .map((row: any) => String(row?.code || ""))
        .filter((code: string) => code && code.startsWith(prefix))

      if (matchingCodes.length > 0) {
        const parsedNumbers = matchingCodes
          .map((code: string) => {
            const match = code.match(/^([^\d]*)(\d+)$/)
            return match ? { code, value: Number(match[2]), width: match[2].length } : null
          })
          .filter(Boolean) as Array<{ code: string; value: number; width: number }>

        if (parsedNumbers.length > 0) {
          const maxEntry = parsedNumbers.reduce((best, current) => {
            if (current.value > best.value) return current
            if (current.value === best.value && current.width > best.width) return current
            return best
          }, parsedNumbers[0])

          nextCode = adjustCodePlusOne(maxEntry.code, 10)
          console.log(`[v0] Highest matching code: ${maxEntry.code}`)
        }
      }
    } else {
      console.log("[v0] No existing codes found, starting with 1")
    }

    const finalNumber = nextCode.startsWith(prefix) ? nextCode : `${prefix}${nextCode}`
    console.log(`[v0] Generated final number: ${finalNumber}`)
    console.log(`[v0] ========== END getNextSequentialNumber (SUCCESS) ==========`)

    return finalNumber
  } catch (error) {
    console.error("[v0] ========== ERROR in getNextSequentialNumber ==========")
    console.error("[v0] Error generating sequential number:", error)
    console.error("[v0] Error type:", error instanceof Error ? error.constructor.name : typeof error)
    console.error("[v0] Error message:", error instanceof Error ? error.message : String(error))
    console.error("[v0] Error stack:", error instanceof Error ? error.stack : undefined)

    if (error instanceof Error) {
      if (error.message.includes("DATABASE_URL")) {
        throw new Error("Database configuration error: " + error.message)
      } else if (error.message.includes("connect")) {
        throw new Error("Database connection failed: " + error.message)
      } else {
        throw new Error("Database query failed: " + error.message)
      }
    }

    // Return proper starting number as fallback
    console.log("[v0] Returning fallback number due to error")
    return `${prefix}0000001`
  }
}

function getNextCode(currentCode: string) {
  return currentCode
}

function adjustCodePlusOne(code: string, codeLen = 10): string {
  if (!code || !code.trim()) return ""

  const normalizedCode = String(code).trim().toUpperCase()
  const match = normalizedCode.match(/^([^\d]*)(\d+)$/)
  if (!match) return normalizedCode

  const prefix = match[1] || ""
  const numericPart = match[2]
  const nextValue = (Number(numericPart) + 1).toString()
  const digitsLength = Math.max(1, codeLen - prefix.length)

  return `${prefix}${nextValue.padStart(digitsLength, "0")}`.slice(0, codeLen)
}


// Legacy functions for backward compatibility
export function generateCustomerNumberSync(): string {
  const timestamp = Date.now().toString()
  const lastSeven = timestamp.slice(-7).padStart(7, "0")
  return `C${lastSeven}`
}

export function generateSupplierNumberSync(): string {
  const timestamp = Date.now().toString()
  const lastSeven = timestamp.slice(-7).padStart(7, "0")
  return `S${lastSeven}`
}
