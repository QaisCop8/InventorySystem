-- إضافة إعداد السماح بتكرار الرقم التشغيلي إلى جدول system_settings
-- Add setting to allow duplicate batch numbers in system_settings

ALTER TABLE system_settings
ADD COLUMN IF NOT EXISTS allow_duplicate_batch_number BOOLEAN DEFAULT FALSE;

UPDATE system_settings
SET allow_duplicate_batch_number = COALESCE(allow_duplicate_batch_number, FALSE)
WHERE id = 1;

COMMENT ON COLUMN system_settings.allow_duplicate_batch_number IS 'السماح بتكرار الرقم التشغيلي في أكثر من سطر عند الحاجة';
