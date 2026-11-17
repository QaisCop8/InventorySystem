"use client"

// جسر بين إعدادات النظام الفعلية (المحفوظة عبر /api/settings/system، كـdecimal_places_count بشاشة
// "إعدادات السندات العامة") وآلية Util.getSystemSetting القديمة بـcomponents/common/Util.js التي
// تقرأ حصراً من localStorage['systemSettingsList'] — كانت هذه القائمة غير مُعبَّأة من أي مصدر إطلاقاً
// (Util.js يقرأها فقط، لا يكتبها أحد)، فيعود Util.getSystemSetting(17) (معرّف "عدد الخانات العشرية"
// بنمط الإعدادات القديم) undefined دوماً بصرف النظر عمّا يختاره المستخدم فعلياً بشاشة الإعدادات.
// يُعبِّئ هذا الملف نفس القائمة بالقيمة الحقيقية عند بدء التطبيق وبعد كل حفظ للإعدادات، ليقرأها
// DataGridView.js (تنسيق أعمدة الأرقام وصفوف المجاميع) بصرف النظر عن أي شبكة تستخدمه بالتطبيق.
const SYSTEM_SETTINGS_STORAGE_KEY = "systemSettingsList"
export const SYSTEM_SETTINGS_UPDATED_EVENT = "system-settings-updated"
const DECIMAL_PLACES_SETTING_ID = 17
const DEFAULT_DECIMAL_PLACES = 2

function readList(): any[] {
  try {
    const raw = localStorage.getItem(SYSTEM_SETTINGS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeList(list: any[]) {
  try {
    localStorage.setItem(SYSTEM_SETTINGS_STORAGE_KEY, JSON.stringify(list))
  } catch {
    // تجاهل أخطاء الحصة/التسلسل — تبقى القيمة الافتراضية بـUtil.getSystemSetting(17) سارية.
  }
}

export async function syncSystemSettingsToLocalStorage(): Promise<void> {
  if (typeof window === "undefined") return
  try {
    const response = await fetch("/api/settings/system")
    if (!response.ok) return
    const data = await response.json()
    const payload = data?.settings ?? data
    const decimalPlacesRaw = Number(payload?.decimal_places_count)
    const decimalPlaces = Number.isFinite(decimalPlacesRaw) ? decimalPlacesRaw : DEFAULT_DECIMAL_PLACES

    const list = readList()
    const put = (entry: { id: number; value: unknown; default_value: unknown }) => {
      const index = list.findIndex((row) => String(row?.id) === String(entry.id))
      if (index >= 0) list[index] = { ...list[index], ...entry }
      else list.push(entry)
    }
    put({ id: DECIMAL_PLACES_SETTING_ID, value: decimalPlaces, default_value: DEFAULT_DECIMAL_PLACES })
    // 16 «الاشارة السالبة للرصيد» (credit/debit) و18 «اظهار فواصل الالاف» — نفس معرّفات ShamelAPI SystemSettingsEnum (2026-11-17)
    put({ id: 16, value: String(payload?.negative_balance_sign || "credit"), default_value: "credit" })
    put({ id: 18, value: payload?.show_thousands_separator === undefined || payload?.show_thousands_separator === null ? "true" : String(Boolean(payload.show_thousands_separator) && String(payload.show_thousands_separator) !== "false"), default_value: "true" })
    writeList(list)

    window.dispatchEvent(new CustomEvent(SYSTEM_SETTINGS_UPDATED_EVENT))
  } catch {
    // فشل الشبكة يُبقي القيمة الافتراضية (2) بـUtil.getSystemSetting(17) — لا حاجة لإعادة محاولة هنا.
  }
}
