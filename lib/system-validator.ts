// مدقق شامل لاستقرار النظام
// Comprehensive system stability validator

import sql from "@/lib/database"
export interface SystemValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  recommendations: string[]
  summary: {
    tablesChecked: number
    criticalIssues: number
    warnings: number
    recommendations: number
  }
}

export async function validateSystemStability(): Promise<SystemValidationResult> {
  const result: SystemValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    recommendations: [],
    summary: {
      tablesChecked: 0,
      criticalIssues: 0,
      warnings: 0,
      recommendations: 0,
    },
  }

  try {
    // 1. فحص الجداول الأساسية
    await validateCoreTables(result)

    // 2. فحص العلاقات والمفاتيح الخارجية
    await validateRelationships(result)

    // 3. فحص البيانات الأساسية المطلوبة
    await validateEssentialData(result)

    // 4. فحص الفهارس والأداء
    await validateIndexesAndPerformance(result)

    // 5. فحص الصلاحيات والأمان
    await validateSecurityAndPermissions(result)

    // 6. فحص التكامل بين المكونات
    await validateComponentIntegration(result)

    // تحديث الملخص
    result.summary.criticalIssues = result.errors.length
    result.summary.warnings = result.warnings.length
    result.summary.recommendations = result.recommendations.length
    result.isValid = result.errors.length === 0
  } catch (error) {
    result.errors.push(`خطأ في التحقق من النظام: ${error}`)
    result.isValid = false
  }

  return result
}

async function validateCoreTables(result: SystemValidationResult) {
  const requiredTables = [
    "products",
    "customers",
    "suppliers",
    "sales_orders",
    "purchase_orders",
    "sales_order_items",
    "purchase_order_items",
    "product_stock",
    "inventory_transactions",
    "units",
    "warehouses",
    "item_groups",
    "system_settings",
    "exchange_rates",
  ]

  for (const table of requiredTables) {
    try {
      const tableExists = await sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = ${table}
        )
      `

      if (!tableExists[0].exists) {
        result.errors.push(`الجدول المطلوب غير موجود: ${table}`)
      } else {
        result.summary.tablesChecked++

        // فحص الأعمدة الأساسية
        const columns = await sql`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_name = ${table}
          AND table_schema = 'public'
        `

        if (columns.length === 0) {
          result.warnings.push(`الجدول ${table} موجود لكن لا يحتوي على أعمدة`)
        }
      }
    } catch (error) {
      result.errors.push(`خطأ في فحص الجدول ${table}: ${error}`)
    }
  }
}

async function validateRelationships(result: SystemValidationResult) {
  try {
    // فحص العلاقات بين الجداول
    const orphanedRecords = await sql`
      SELECT 'sales_order_items' as table_name, COUNT(*) as count
      FROM sales_order_items soi
      LEFT JOIN sales_orders so ON soi.sales_order_id = so.id
      WHERE so.id IS NULL
      
      UNION ALL
      
      SELECT 'purchase_order_items' as table_name, COUNT(*) as count
      FROM purchase_order_items poi
      LEFT JOIN purchase_orders po ON poi.purchase_order_id = po.id
      WHERE po.id IS NULL
      
      UNION ALL
      
      SELECT 'product_stock' as table_name, COUNT(*) as count
      FROM product_stock ps
      LEFT JOIN products p ON ps.product_id = p.id
      WHERE p.id IS NULL
    `

    for (const record of orphanedRecords) {
      if (record.count > 0) {
        result.errors.push(`توجد سجلات يتيمة في الجدول ${record.table_name}: ${record.count} سجل`)
      }
    }
  } catch (error) {
    result.warnings.push(`تعذر فحص العلاقات: ${error}`)
  }
}

async function validateEssentialData(result: SystemValidationResult) {
  try {
    // فحص وجود الوحدات الأساسية
    const unitsCount = await sql`SELECT COUNT(*) as count FROM units WHERE is_active = true`
    if (unitsCount[0].count === 0) {
      result.errors.push("لا توجد وحدات قياس نشطة في النظام")
    }

    // فحص وجود المستودعات
    const warehousesCount = await sql`SELECT COUNT(*) as count FROM warehouses WHERE is_active = true`
    if (warehousesCount[0].count === 0) {
      result.errors.push("لا توجد مستودعات نشطة في النظام")
    }

    // فحص إعدادات النظام
    const systemSettings = await sql`SELECT COUNT(*) as count FROM system_settings`
    if (systemSettings[0].count === 0) {
      result.errors.push("إعدادات النظام غير موجودة")
    }

    // فحص أسعار الصرف
    const exchangeRates = await sql`SELECT COUNT(*) as count FROM exchange_rates`
    if (exchangeRates[0].count === 0) {
      result.warnings.push("لا توجد أسعار صرف محددة")
    }
  } catch (error) {
    result.warnings.push(`تعذر فحص البيانات الأساسية: ${error}`)
  }
}

async function validateIndexesAndPerformance(result: SystemValidationResult) {
  try {
    // فحص الفهارس المهمة
    const missingIndexes = await sql`
      SELECT 
        schemaname,
        tablename,
        attname,
        n_distinct,
        correlation
      FROM pg_stats
      WHERE schemaname = 'public'
      AND tablename IN ('products', 'customers', 'suppliers', 'sales_orders', 'purchase_orders')
      AND n_distinct > 100
      AND attname NOT IN (
        SELECT a.attname
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = (schemaname||'.'||tablename)::regclass
      )
    `

    if (missingIndexes.length > 0) {
      result.recommendations.push("يُنصح بإضافة فهارس على بعض الأعمدة لتحسين الأداء")
    }

    // فحص حجم الجداول
    const tableSizes = await sql`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
        pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      LIMIT 10
    `

    for (const table of tableSizes) {
      if (table.size_bytes > 100 * 1024 * 1024) {
        // أكبر من 100 ميجا
        result.recommendations.push(`الجدول ${table.tablename} كبير الحجم (${table.size}) - قد يحتاج تحسين`)
      }
    }
  } catch (error) {
    result.warnings.push(`تعذر فحص الأداء: ${error}`)
  }
}

async function validateSecurityAndPermissions(result: SystemValidationResult) {
  try {
    // فحص وجود جدول المستخدمين
    const usersTable = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'user_settings'
      )
    `

    if (!usersTable[0].exists) {
      result.warnings.push("جدول إعدادات المستخدمين غير موجود")
    }

    // فحص سجلات التدقيق
    const auditLogs = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'audit_logs'
      )
    `

    if (!auditLogs[0].exists) {
      result.warnings.push("جدول سجلات التدقيق غير موجود")
    } else {
      const recentLogs = await sql`
        SELECT COUNT(*) as count 
        FROM audit_logs 
        WHERE created_at > NOW() - INTERVAL '7 days'
      `

      if (recentLogs[0].count === 0) {
        result.recommendations.push("لا توجد سجلات تدقيق حديثة - تأكد من تفعيل نظام التدقيق")
      }
    }
  } catch (error) {
    result.warnings.push(`تعذر فحص الأمان: ${error}`)
  }
}

async function validateComponentIntegration(result: SystemValidationResult) {
  try {
    // فحص تكامل المخزون
    const stockIntegrity = await sql`
      SELECT 
        p.product_code,
        p.product_name,
        COALESCE(ps.current_stock, 0) as current_stock,
        COALESCE(ps.available_stock, 0) as available_stock,
        COALESCE(ps.reserved_stock, 0) as reserved_stock
      FROM products p
      LEFT JOIN product_stock ps ON p.id = ps.product_id
      WHERE ps.id IS NULL OR ps.available_stock < 0
      LIMIT 10
    `

    if (stockIntegrity.length > 0) {
      result.warnings.push(`توجد مشاكل في بيانات المخزون لـ ${stockIntegrity.length} منتج`)
    }

    // فحص تكامل الطلبيات
    const orderIntegrity = await sql`
      SELECT 
        so.order_number,
        so.total_amount,
        COALESCE(SUM(soi.total_price), 0) as items_total
      FROM sales_orders so
      LEFT JOIN sales_order_items soi ON so.id = soi.sales_order_id
      GROUP BY so.id, so.order_number, so.total_amount
      HAVING ABS(so.total_amount - COALESCE(SUM(soi.total_price), 0)) > 0.01
      LIMIT 5
    `

    if (orderIntegrity.length > 0) {
      result.warnings.push(`توجد تضارب في مجاميع الطلبيات لـ ${orderIntegrity.length} طلبية`)
    }
  } catch (error) {
    result.warnings.push(`تعذر فحص تكامل المكونات: ${error}`)
  }
}

// دالة لإصلاح المشاكل التلقائية
export async function autoFixSystemIssues(): Promise<string[]> {
  const fixes: string[] = []

  try {
    // إصلاح available_stock
    await sql`
      UPDATE product_stock 
      SET available_stock = GREATEST(0, COALESCE(current_stock, 0) - COALESCE(reserved_stock, 0))
      WHERE available_stock IS NULL 
      OR available_stock != GREATEST(0, COALESCE(current_stock, 0) - COALESCE(reserved_stock, 0))
    `
    fixes.push("تم إصلاح حسابات المخزون المتاح")

    // إصلاح المتسلسلات
    const sequences = [
      "products_id_seq",
      "customers_id_seq",
      "suppliers_id_seq",
      "sales_orders_id_seq",
      "purchase_orders_id_seq",
    ]

    for (const seq of sequences) {
      try {
        await sql`SELECT setval('${seq}', COALESCE((SELECT MAX(id) FROM ${seq.replace("_id_seq", "")}), 1))`
        fixes.push(`تم إصلاح المتسلسل ${seq}`)
      } catch (error) {
        // تجاهل الأخطاء في المتسلسلات غير الموجودة
      }
    }

    // تحديث الإحصائيات
    await sql`ANALYZE`
    fixes.push("تم تحديث إحصائيات قاعدة البيانات")
  } catch (error) {
    fixes.push(`خطأ في الإصلاح التلقائي: ${error}`)
  }

  return fixes
}
