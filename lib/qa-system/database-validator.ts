import sql from "@/lib/database"

interface DatabaseField {
  name: string
  type: string
  nullable: boolean
}

interface TableSchema {
  name: string
  fields: DatabaseField[]
}

interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  suggestions: string[]
}

export class DatabaseValidator {
  private sql = sql
  private schema: Map<string, TableSchema> = new Map()

  private initializeSchema() {
    this.schema.set("customers", {
      name: "customers",
      fields: [
        { name: "id", type: "integer", nullable: false },
        { name: "customer_name", type: "varchar", nullable: true },
        { name: "customer_code", type: "varchar", nullable: true },
        { name: "mobile1", type: "varchar", nullable: true },
        { name: "mobile2", type: "varchar", nullable: true },
        { name: "email", type: "varchar", nullable: true },
        { name: "address", type: "text", nullable: true },
        { name: "city", type: "varchar", nullable: true },
        { name: "whatsapp1", type: "varchar", nullable: true },
        { name: "whatsapp2", type: "varchar", nullable: true },
        { name: "business_nature", type: "varchar", nullable: true },
        { name: "classifications", type: "varchar", nullable: true },
        { name: "salesman", type: "varchar", nullable: true },
        { name: "status", type: "varchar", nullable: true },
        { name: "api_number", type: "varchar", nullable: true },
        { name: "account_opening_date", type: "date", nullable: true },
        { name: "general_notes", type: "text", nullable: true },
        { name: "movement_notes", type: "text", nullable: true },
        { name: "attachments", type: "text", nullable: true },
        { name: "created_at", type: "timestamp", nullable: true },
      ],
    })

    this.schema.set("suppliers", {
      name: "suppliers",
      fields: [
        { name: "id", type: "integer", nullable: false },
        { name: "supplier_name", type: "varchar", nullable: true },
        { name: "supplier_code", type: "varchar", nullable: true },
        { name: "mobile1", type: "varchar", nullable: true },
        { name: "mobile2", type: "varchar", nullable: true },
        { name: "email", type: "varchar", nullable: true },
        { name: "address", type: "text", nullable: true },
        { name: "city", type: "varchar", nullable: true },
        { name: "whatsapp1", type: "varchar", nullable: true },
        { name: "whatsapp2", type: "varchar", nullable: true },
        { name: "business_nature", type: "varchar", nullable: true },
        { name: "classifications", type: "varchar", nullable: true },
        { name: "salesman", type: "varchar", nullable: true },
        { name: "status", type: "varchar", nullable: true },
        { name: "api_number", type: "varchar", nullable: true },
        { name: "account_opening_date", type: "date", nullable: true },
        { name: "general_notes", type: "text", nullable: true },
        { name: "movement_notes", type: "text", nullable: true },
        { name: "attachments", type: "text", nullable: true },
        { name: "web_username", type: "varchar", nullable: true },
        { name: "web_password", type: "varchar", nullable: true },
        { name: "created_at", type: "timestamp", nullable: true },
      ],
    })

    this.schema.set("products", {
      name: "products",
      fields: [
        { name: "id", type: "integer", nullable: false },
        { name: "product_name", type: "varchar", nullable: true },
        { name: "product_code", type: "varchar", nullable: true },
        { name: "barcode", type: "varchar", nullable: true },
        { name: "description", type: "text", nullable: true },
        { name: "category", type: "varchar", nullable: true },
        { name: "product_type", type: "varchar", nullable: true },
        { name: "main_unit", type: "varchar", nullable: true },
        { name: "secondary_unit", type: "varchar", nullable: true },
        { name: "conversion_factor", type: "numeric", nullable: true },
        { name: "last_purchase_price", type: "numeric", nullable: true },
        { name: "currency", type: "varchar", nullable: true },
        { name: "manufacturer_number", type: "varchar", nullable: true },
        { name: "original_number", type: "varchar", nullable: true },
        { name: "has_expiry", type: "boolean", nullable: true },
        { name: "has_batch", type: "boolean", nullable: true },
        { name: "has_colors", type: "boolean", nullable: true },
        { name: "max_quantity", type: "numeric", nullable: true },
        { name: "order_quantity", type: "numeric", nullable: true },
        { name: "status", type: "varchar", nullable: true },
        { name: "classifications", type: "varchar", nullable: true },
        { name: "general_notes", type: "text", nullable: true },
        { name: "product_image", type: "text", nullable: true },
        { name: "attachments", type: "text", nullable: true },
        { name: "entry_date", type: "date", nullable: true },
        { name: "created_at", type: "timestamp", nullable: true },
      ],
    })

    this.schema.set("sales_orders", {
      name: "sales_orders",
      fields: [
        { name: "id", type: "integer", nullable: false },
        { name: "order_number", type: "varchar", nullable: true },
        { name: "customer_id", type: "integer", nullable: true },
        { name: "customer_name", type: "varchar", nullable: true },
        { name: "order_date", type: "date", nullable: true },
        { name: "delivery_datetime", type: "timestamp", nullable: true },
        { name: "total_amount", type: "numeric", nullable: true },
        { name: "currency_code", type: "varchar", nullable: true },
        { name: "currency_name", type: "varchar", nullable: true },
        { name: "exchange_rate", type: "numeric", nullable: true },
        { name: "salesman", type: "varchar", nullable: true },
        { name: "order_status", type: "varchar", nullable: true },
        { name: "financial_status", type: "varchar", nullable: true },
        { name: "workflow_sequence_id", type: "integer", nullable: true },
        { name: "invoice_number", type: "varchar", nullable: true },
        { name: "manual_document", type: "varchar", nullable: true },
        { name: "barcode", type: "varchar", nullable: true },
        { name: "notes", type: "text", nullable: true },
        { name: "attachments", type: "text", nullable: true },
        { name: "created_at", type: "timestamp", nullable: true },
        { name: "updated_at", type: "timestamp", nullable: true },
      ],
    })

    this.schema.set("sales_order_items", {
      name: "sales_order_items",
      fields: [
        { name: "id", type: "integer", nullable: false },
        { name: "sales_order_id", type: "integer", nullable: true },
        { name: "product_id", type: "integer", nullable: true },
        { name: "product_name", type: "varchar", nullable: true },
        { name: "product_code", type: "varchar", nullable: true },
        { name: "barcode", type: "varchar", nullable: true },
        { name: "quantity", type: "numeric", nullable: true },
        { name: "unit_price", type: "numeric", nullable: true },
        { name: "total_price", type: "numeric", nullable: true },
        { name: "discount_percentage", type: "numeric", nullable: true },
        { name: "bonus_quantity", type: "numeric", nullable: true },
        { name: "delivered_quantity", type: "numeric", nullable: true },
        { name: "unit", type: "varchar", nullable: true },
        { name: "warehouse", type: "varchar", nullable: true },
        { name: "batch_number", type: "varchar", nullable: true },
        { name: "expiry_date", type: "date", nullable: true },
        { name: "item_status", type: "varchar", nullable: true },
        { name: "notes", type: "text", nullable: true },
        { name: "created_at", type: "timestamp", nullable: true },
      ],
    })
  }

  constructor() {
    this.initializeSchema()
  }

  validateApiFieldNames(tableName: string, data: any): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
    }

    const tableSchema = this.schema.get(tableName)
    if (!tableSchema) {
      result.isValid = false
      result.errors.push(`Table '${tableName}' not found in schema`)
      return result
    }

    const validFields = new Set(tableSchema.fields.map((f) => f.name))
    const dataFields = Object.keys(data)

    // Check for invalid field names
    for (const field of dataFields) {
      if (!validFields.has(field)) {
        result.isValid = false
        result.errors.push(`Invalid field '${field}' for table '${tableName}'`)

        // Suggest similar field names
        const suggestions = this.findSimilarFields(field, Array.from(validFields))
        if (suggestions.length > 0) {
          result.suggestions.push(`Did you mean: ${suggestions.join(", ")}?`)
        }
      }
    }

    // Check for missing required fields (non-nullable fields)
    const requiredFields = tableSchema.fields.filter((f) => !f.nullable).map((f) => f.name)
    for (const requiredField of requiredFields) {
      if (requiredField !== "id" && !dataFields.includes(requiredField)) {
        result.warnings.push(`Missing recommended field '${requiredField}' for table '${tableName}'`)
      }
    }

    return result
  }

  private findSimilarFields(target: string, fields: string[]): string[] {
    return fields
      .map((field) => ({
        field,
        distance: this.levenshteinDistance(target.toLowerCase(), field.toLowerCase()),
      }))
      .filter((item) => item.distance <= 2)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3)
      .map((item) => item.field)
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = []
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i]
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        }
      }
    }
    return matrix[str2.length][str1.length]
  }

  validateDataTypes(tableName: string, data: any): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
    }

    const tableSchema = this.schema.get(tableName)
    if (!tableSchema) {
      result.isValid = false
      result.errors.push(`Table '${tableName}' not found in schema`)
      return result
    }

    for (const [fieldName, value] of Object.entries(data)) {
      const field = tableSchema.fields.find((f) => f.name === fieldName)
      if (!field) continue

      if (value === null || value === undefined) {
        if (!field.nullable) {
          result.errors.push(`Field '${fieldName}' cannot be null`)
          result.isValid = false
        }
        continue
      }

      // Type validation
      const expectedType = this.mapDatabaseTypeToJS(field.type)
      const actualType = typeof value

      if (expectedType === "number" && actualType !== "number") {
        if (isNaN(Number(value))) {
          result.errors.push(`Field '${fieldName}' should be a number, got ${actualType}`)
          result.isValid = false
        } else {
          result.warnings.push(`Field '${fieldName}' should be a number, auto-converting from ${actualType}`)
        }
      } else if (expectedType === "boolean" && actualType !== "boolean") {
        result.warnings.push(`Field '${fieldName}' should be a boolean, got ${actualType}`)
      } else if (expectedType === "string" && actualType !== "string") {
        result.warnings.push(`Field '${fieldName}' should be a string, got ${actualType}`)
      }
    }

    return result
  }

  private mapDatabaseTypeToJS(dbType: string): string {
    if (dbType.includes("integer") || dbType.includes("numeric")) return "number"
    if (dbType.includes("boolean")) return "boolean"
    if (dbType.includes("date") || dbType.includes("timestamp")) return "string"
    return "string"
  }

  getTableSchema(tableName: string): TableSchema | null {
    return this.schema.get(tableName) || null
  }

  getAllTables(): string[] {
    return Array.from(this.schema.keys())
  }
}
