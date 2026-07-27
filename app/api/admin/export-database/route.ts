import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export async function POST(request: NextRequest) {
  try {
    const { type } = await request.json()

    if (type === "full") {
      // Export full database structure and data
      const tables = await sql`
        SELECT table_name, table_schema 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name
      `

      let sqlDump = `-- Database Export Generated on ${new Date().toISOString()}\n`
      sqlDump += `-- Arabic ERP System Database Backup\n\n`
      sqlDump += `SET client_encoding = 'UTF8';\n`
      sqlDump += `SET standard_conforming_strings = on;\n\n`

      for (const table of tables) {
        // Get table structure
        const columns = await sql`
          SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
          FROM information_schema.columns 
          WHERE table_schema = ${table.table_schema} 
          AND table_name = ${table.table_name}
          ORDER BY ordinal_position
        `

        // Create table structure
        sqlDump += `-- Table: ${table.table_name}\n`
        sqlDump += `DROP TABLE IF EXISTS "${table.table_name}" CASCADE;\n`
        sqlDump += `CREATE TABLE "${table.table_name}" (\n`

        const columnDefs = columns.map((col) => {
          let def = `  "${col.column_name}" ${col.data_type}`

          if (col.character_maximum_length) {
            def += `(${col.character_maximum_length})`
          }

          if (col.is_nullable === "NO") {
            def += " NOT NULL"
          }

          if (col.column_default) {
            def += ` DEFAULT ${col.column_default}`
          }

          return def
        })

        sqlDump += columnDefs.join(",\n")
        sqlDump += `\n);\n\n`

        // Export data
        try {
          const data = await sql`SELECT * FROM ${sql(table.table_name)}`

          if (data.length > 0) {
            sqlDump += `-- Data for table: ${table.table_name}\n`

            const columnNames = columns.map((col) => `"${col.column_name}"`).join(", ")

            for (const row of data) {
              const values = columns
                .map((col) => {
                  const value = row[col.column_name]
                  if (value === null) return "NULL"
                  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`
                  if (typeof value === "boolean") return value ? "true" : "false"
                  if (value instanceof Date) return `'${value.toISOString()}'`
                  if (typeof value === "object") return `'${JSON.stringify(value).replace(/'/g, "''")}'`
                  return String(value)
                })
                .join(", ")

              sqlDump += `INSERT INTO "${table.table_name}" (${columnNames}) VALUES (${values});\n`
            }
            sqlDump += `\n`
          }
        } catch (error) {
          sqlDump += `-- Warning: Could not export data for table ${table.table_name}\n\n`
        }
      }

      return new NextResponse(sqlDump, {
        headers: {
          "Content-Type": "application/sql",
          "Content-Disposition": `attachment; filename="arabic-erp-backup-${new Date().toISOString().split("T")[0]}.sql"`,
        },
      })
    } else if (type === "data") {
      // Export data only in JSON format
      const tables = [
        "products",
        "customers",
        "suppliers",
        "warehouses",
        "sales_orders",
        "sales_order_items",
        "purchase_orders",
        "purchase_order_items",
        "product_lots",
        "lot_transactions",
        "inventory_transactions",
        "user_settings",
        "system_settings",
        "general_settings",
      ]

      const jsonExport = {
        exportDate: new Date().toISOString(),
        version: "1.0",
        tables: {} as Record<string, any[]>,
      }

      for (const tableName of tables) {
        try {
          const data = await sql`SELECT * FROM ${sql(tableName)}`
          jsonExport.tables[tableName] = data
        } catch (error) {
          jsonExport.tables[tableName] = []
        }
      }

      return NextResponse.json(jsonExport, {
        headers: {
          "Content-Disposition": `attachment; filename="arabic-erp-data-${new Date().toISOString().split("T")[0]}.json"`,
        },
      })
    }

    return NextResponse.json({ error: "Invalid export type" }, { status: 400 })
  } catch (error) {
    console.error("Database export error:", error)
    return NextResponse.json({ error: "Export failed" }, { status: 500 })
  }
}
