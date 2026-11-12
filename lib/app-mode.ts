// وضع التطبيق المخصّص (مشغّل ويندوز launcher.exe وتطبيقا أندرويد للكاشير والمطعم): يفتح المشغّل النظام بـ ?app=cashier
// أو ?app=restaurant. سكربت في app/layout.tsx يحفظ القيمة في localStorage عند أول تحميل (قبل صفحة الدخول التي تفقد
// الرابط)، ثم تفتح الصفحة الرئيسية شاشة الكاشير/المطعم مباشرة بدل الرئيسية ولا تحوّل للبداية السريعة أو العملات.
// لكل مشغّل ملف تعريف (متصفح/تطبيق) مستقل، فلا يؤثر الوضع على فتح النظام العادي من المتصفح.
export const APP_MODE_KEY = "noon_app_mode"

const APP_MODE_SECTIONS: Record<string, string> = {
  cashier: "pos-cashier",
  restaurant: "restaurant-pos",
}

/** سكربت يُضمَّن في <body> قبل وحدات التطبيق */
export const APP_MODE_BOOT_SCRIPT = `try{var m=new URLSearchParams(location.search).get("app");if(m==="cashier"||m==="restaurant")localStorage.setItem("${APP_MODE_KEY}",m)}catch(e){}`

/** قسم البداية لوضع التطبيق (pos-cashier / restaurant-pos) أو null في النظام العادي */
export function appModeSection(): string | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("app")
    const mode = fromUrl && APP_MODE_SECTIONS[fromUrl] ? fromUrl : localStorage.getItem(APP_MODE_KEY)
    return (mode && APP_MODE_SECTIONS[mode]) || null
  } catch {
    return null
  }
}
