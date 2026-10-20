// خط المستخدم وحجمه (شاشة "اعدادات الخطوط") — المرجع الوحيد لمتغيرات الخط في الواجهة.
// كانت ثلاثة مصادر تكتب نفس المتغيرات (--font-family-custom/--font-size-custom وخط body): إعدادات الخط، وثيم
// الشركة (contexts/theme-context.tsx)، وThemeLoader — فيفوز آخرها تحميلاً، ولذلك كان الخط "أحياناً" غير صحيح.
// الآن: كل من يغيّر النمط يعيد تطبيق خط المستخدم بعده (reapplyUserFont)، ويُطبَّق المحفوظ قبل أول رسم (USER_FONT_BOOT_SCRIPT).

export const USER_FONT_STORAGE_KEY = "erp-font-settings"

export type UserFont = {
  fontFamily?: string
  fontSize?: number
  fontWeight?: string | number
  lineHeight?: number
  letterSpacing?: number
  gridHeaderHeight?: number
  gridHeaderColor?: string
  gridHeaderFontFamily?: string
  gridRowHeight?: number
  gridSelectedRowColor?: string
}

export function readUserFont(): UserFont | null {
  if (typeof window === "undefined") return null
  try {
    const value = JSON.parse(localStorage.getItem(USER_FONT_STORAGE_KEY) || "null")
    return value && typeof value === "object" ? value : null
  } catch {
    return null
  }
}

export function applyUserFont(font: UserFont) {
  if (typeof document === "undefined") return
  const root = document.documentElement
  const set = (name: string, value: unknown) => { if (value !== undefined && value !== null && value !== "") root.style.setProperty(name, String(value)) }
  set("--font-family-custom", font.fontFamily)
  if (Number(font.fontSize) > 0) set("--font-size-custom", `${Number(font.fontSize)}px`)
  set("--font-weight-custom", font.fontWeight)
  set("--line-height-custom", font.lineHeight)
  if (font.letterSpacing !== undefined) set("--letter-spacing-custom", `${font.letterSpacing}px`)
  if (Number(font.gridHeaderHeight) > 0) set("--datagrid-header-height", `${Number(font.gridHeaderHeight)}px`)
  set("--datagrid-header-color", font.gridHeaderColor)
  set("--datagrid-header-font-family", font.gridHeaderFontFamily)
  if (Number(font.gridRowHeight) > 0) set("--datagrid-row-height", `${Number(font.gridRowHeight)}px`)
  set("--datagrid-selected-row-color", font.gridSelectedRowColor)
  // خط body يتبع المتغيرات (لا قيمة ثابتة من الثيم تتجاوزها)
  if (document.body) {
    document.body.style.fontFamily = "var(--font-family-custom), Cairo, sans-serif"
    document.body.style.fontSize = "var(--font-size-custom, 14px)"
  }
}

/** بعد أي تطبيق لثيم/نمط يكتب الخط: يعيد خط المستخدم المحفوظ فيبقى هو الفائز دائماً */
export function reapplyUserFont() {
  const font = readUserFont()
  if (font) applyUserFont(font)
}

/** يُضمَّن في <head> (app/layout.tsx): يطبّق الخط المحفوظ قبل أول رسم — بلا وميض الحجم الافتراضي وبلا انتظار الشبكة */
export const USER_FONT_BOOT_SCRIPT = `
try {
  var f = JSON.parse(localStorage.getItem(${JSON.stringify(USER_FONT_STORAGE_KEY)}) || "null");
  if (f) {
    var r = document.documentElement.style;
    if (f.fontFamily) r.setProperty("--font-family-custom", f.fontFamily);
    if (Number(f.fontSize) > 0) r.setProperty("--font-size-custom", Number(f.fontSize) + "px");
    if (Number(f.gridHeaderHeight) > 0) r.setProperty("--datagrid-header-height", Number(f.gridHeaderHeight) + "px");
    if (f.gridHeaderColor) r.setProperty("--datagrid-header-color", f.gridHeaderColor);
    if (f.gridHeaderFontFamily) r.setProperty("--datagrid-header-font-family", f.gridHeaderFontFamily);
    if (Number(f.gridRowHeight) > 0) r.setProperty("--datagrid-row-height", Number(f.gridRowHeight) + "px");
    if (f.gridSelectedRowColor) r.setProperty("--datagrid-selected-row-color", f.gridSelectedRowColor);
  }
} catch (e) {}
`
