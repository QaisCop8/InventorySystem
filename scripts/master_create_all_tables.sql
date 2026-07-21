-- سكريبت رئيسي لإنشاء جميع الجداول بالترتيب الصحيح
-- يمكن تشغيل هذا السكريبت لإنشاء جميع الجداول دفعة واحدة

\echo 'بدء إنشاء جميع جداول قاعدة البيانات...'

-- 1. الجداول الأساسية (بدون foreign keys)
\i scripts/tables/01_audit_logs.sql
\i scripts/tables/02_system_settings.sql
\i scripts/tables/03_user_settings.sql
\i scripts/tables/04_custom_roles.sql
\i scripts/tables/28_exchange_rates.sql
\i scripts/tables/29_units.sql
\i scripts/tables/32_theme_settings.sql
\i scripts/tables/33_print_settings.sql
\i scripts/tables/34_error_logs.sql
\i scripts/tables/35_failed_login_attempts.sql
\i scripts/tables/36_general_settings.sql
\i scripts/tables/37_batch_settings.sql
\i scripts/tables/38_workflow_settings.sql
\i scripts/tables/39_document_settings.sql
\i scripts/tables/43_users_currencies_default_account_tbl.sql
\i scripts/tables/44_virtual_cash_bank_accounts.sql

-- 2. جداول العملاء والموردين
\i scripts/tables/05_customers.sql
\i scripts/tables/06_suppliers.sql

-- 3. جداول المنتجات والمخزون
\i scripts/tables/07_item_groups.sql
\i scripts/tables/08_products.sql
\i scripts/tables/09_warehouses.sql
\i scripts/tables/10_product_warehouses.sql
\i scripts/tables/11_product_stock.sql
\i scripts/tables/12_product_lots.sql

-- 4. جداول سير العمل
\i scripts/tables/17_workflow_stages.sql
\i scripts/tables/18_workflow_sequences.sql
\i scripts/tables/19_workflow_sequence_steps.sql

-- 5. جداول الطلبيات
\i scripts/tables/13_sales_orders.sql
\i scripts/tables/14_sales_order_items.sql
\i scripts/tables/15_purchase_orders.sql
\i scripts/tables/16_purchase_order_items.sql

-- 6. جداول حالة سير العمل
\i scripts/tables/20_order_workflow_status.sql
\i scripts/tables/21_workflow_history.sql

-- 7. جداول الإشعارات والرسائل
\i scripts/tables/22_whatsapp_notification_settings.sql
\i scripts/tables/23_whatsapp_notification_log.sql
\i scripts/tables/24_message_templates.sql
\i scripts/tables/25_scheduled_messages.sql
\i scripts/tables/27_notifications.sql

-- 8. جداول بوابة العملاء
\i scripts/tables/26_customer_portal.sql
\i scripts/tables/40_customer_notification_settings.sql
\i scripts/tables/41_customer_notification_log.sql

-- 9. جداول الحركات
\i scripts/tables/30_inventory_transactions.sql
\i scripts/tables/31_lot_transactions.sql

\echo 'تم إنشاء جميع الجداول بنجاح!'
