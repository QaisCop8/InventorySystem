-- تسلسل "طلب العميل" (سند مبيعات) المكوّن من 14 مرحلة، كما طلبه المستخدم:
-- طلب جديد ← مراجعة البيانات ← فحص تجاري وائتماني ← اعتماد الطلب ← تخصيص المخزون ←
-- إطلاق للمستودع ← تحضير ← تدقيق ← تعبئة ← تحميل ← في الطريق ← تسليم ←
-- تحصيل أو معالجة فرق ← إغلاق
--
-- آمن للتنفيذ أكثر من مرة (كل إدراج محروس بشرط عدم وجوده مسبقاً). يُنفَّذ مرة على القاعدة
-- المرجعية (DATABASE_URL، تُنسَخ منها جداول اللوكاب لأي شركة جديدة عبر lib/provisioning.ts)
-- ومرة أخرى على كل قاعدة شركة قائمة فعلياً اليوم (التزويد لا يُعيد تشغيله على شركات موجودة
-- مسبقاً، فهذا التنفيذ اليدوي وحده يُغطّيها).
DO $$
DECLARE
  v_sequence_id INTEGER;
BEGIN
  -- 1) المراحل الأربع عشرة (REJECTED/ON_HOLD الموجودتان مسبقاً تُستخدَمان كمسارات بديلة فقط، بلا
  -- حاجة لإعادة إنشائهما).
  INSERT INTO workflow_stages
    (stage_code, stage_name, stage_name_en, description, stage_type, stage_color, icon_name, requires_approval, max_duration_hours)
  VALUES
    ('SO_NEW', 'طلب جديد', 'New Order', 'استلام طلب عميل جديد', 'start', '#10B981', 'plus-circle', false, 24),
    ('SO_DATA_REVIEW', 'مراجعة البيانات', 'Data Review', 'مراجعة بيانات الطلب والعميل', 'normal', '#0EA5E9', 'file-search', false, 24),
    ('SO_CREDIT_CHECK', 'فحص تجاري وائتماني', 'Credit Check', 'فحص السجل التجاري والحد الائتماني للعميل', 'normal', '#F59E0B', 'shield-check', false, 24),
    ('SO_APPROVED', 'اعتماد الطلب', 'Order Approval', 'اعتماد الطلب للتنفيذ', 'normal', '#3B82F6', 'check-circle', true, 12),
    ('SO_STOCK_ALLOC', 'تخصيص المخزون', 'Stock Allocation', 'تخصيص الكميات من المخزون', 'normal', '#8B5CF6', 'archive', false, 24),
    ('SO_RELEASE_WH', 'إطلاق للمستودع', 'Release to Warehouse', 'إطلاق الطلب لمستودع التنفيذ', 'normal', '#6366F1', 'send', false, 12),
    ('SO_PREPARING', 'تحضير', 'Preparing', 'تحضير أصناف الطلب', 'normal', '#06B6D4', 'package', false, 48),
    ('SO_QC_AUDIT', 'تدقيق', 'QC Audit', 'تدقيق مطابقة الأصناف والكميات', 'normal', '#14B8A6', 'search-check', false, 12),
    ('SO_PACKING', 'تعبئة', 'Packing', 'تعبئة وتغليف الطلب', 'normal', '#84CC16', 'box', false, 12),
    ('SO_LOADING', 'تحميل', 'Loading', 'تحميل الطلب على وسيلة النقل', 'normal', '#EAB308', 'truck-loading', false, 6),
    ('SO_IN_TRANSIT', 'في الطريق', 'In Transit', 'الطلب في الطريق للعميل', 'normal', '#F97316', 'truck', false, 48),
    ('SO_DELIVERED', 'تسليم', 'Delivered', 'تسليم الطلب للعميل', 'normal', '#22C55E', 'check-circle-2', false, 24),
    ('SO_COLLECTION', 'تحصيل أو معالجة فرق', 'Collection / Variance Handling', 'تحصيل المبلغ أو معالجة أي فرق بالتسليم', 'normal', '#EC4899', 'wallet', false, 72),
    ('SO_CLOSED', 'إغلاق', 'Closed', 'إغلاق الطلب نهائياً', 'end', '#22C55E', 'flag', false, null)
  ON CONFLICT (stage_code) DO NOTHING;

  -- 2) التسلسل نفسه (لا يوجد قيد UNIQUE على sequence_name، فالحراسة يدوية هنا).
  SELECT id INTO v_sequence_id FROM workflow_sequences
    WHERE sequence_name = 'تسلسل طلب العميل المعتمد' AND sequence_type = 'sales_order';

  IF v_sequence_id IS NULL THEN
    INSERT INTO workflow_sequences (sequence_name, sequence_type, description, is_default, is_active)
    VALUES ('تسلسل طلب العميل المعتمد', 'sales_order', 'تسلسل طلب العميل المعتمد: طلب جديد إلى إغلاق (14 مرحلة)', true, true)
    RETURNING id INTO v_sequence_id;
  END IF;

  -- التسلسل الجديد يصبح الافتراضي الوحيد لطلبيات المبيعات؛ القديم يبقى (لسلامة السجل التاريخي
  -- لأي طلبية سابقة تشير إليه عبر order_workflow_status.sequence_id) لكن يتوقف عن الاستخدام.
  UPDATE workflow_sequences SET is_default = false WHERE sequence_type = 'sales_order' AND id <> v_sequence_id;
  UPDATE workflow_sequences SET is_default = true WHERE id = v_sequence_id;

  -- 3) خطوات التسلسل (14 خطوة خطية) — محروسة ككتلة واحدة: إن وُجدت أي خطوة لهذا التسلسل فعلاً لا
  -- يُعاد إدراجها. REJECTED مسار بديل عند فشل الفحص الائتماني أو رفض الاعتماد، ON_HOLD عند تعذّر
  -- تخصيص المخزون (نقص كمية مثلاً).
  IF NOT EXISTS (SELECT 1 FROM workflow_sequence_steps WHERE sequence_id = v_sequence_id) THEN
    INSERT INTO workflow_sequence_steps (sequence_id, stage_id, step_order, is_optional, next_stage_id, alternative_stage_id)
    SELECT v_sequence_id, ws.id, v.step_order, false, wsn.id, wsa.id
    FROM (VALUES
      ('SO_NEW', 1, 'SO_DATA_REVIEW', NULL::text),
      ('SO_DATA_REVIEW', 2, 'SO_CREDIT_CHECK', NULL::text),
      ('SO_CREDIT_CHECK', 3, 'SO_APPROVED', 'REJECTED'),
      ('SO_APPROVED', 4, 'SO_STOCK_ALLOC', 'REJECTED'),
      ('SO_STOCK_ALLOC', 5, 'SO_RELEASE_WH', 'ON_HOLD'),
      ('SO_RELEASE_WH', 6, 'SO_PREPARING', NULL::text),
      ('SO_PREPARING', 7, 'SO_QC_AUDIT', NULL::text),
      ('SO_QC_AUDIT', 8, 'SO_PACKING', NULL::text),
      ('SO_PACKING', 9, 'SO_LOADING', NULL::text),
      ('SO_LOADING', 10, 'SO_IN_TRANSIT', NULL::text),
      ('SO_IN_TRANSIT', 11, 'SO_DELIVERED', NULL::text),
      ('SO_DELIVERED', 12, 'SO_COLLECTION', NULL::text),
      ('SO_COLLECTION', 13, 'SO_CLOSED', NULL::text),
      ('SO_CLOSED', 14, NULL::text, NULL::text)
    ) AS v(code, step_order, next_code, alt_code)
    JOIN workflow_stages ws ON ws.stage_code = v.code
    LEFT JOIN workflow_stages wsn ON wsn.stage_code = v.next_code
    LEFT JOIN workflow_stages wsa ON wsa.stage_code = v.alt_code
    ORDER BY v.step_order;
  END IF;
END $$;
