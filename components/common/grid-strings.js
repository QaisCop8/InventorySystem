import { appDir, tr } from "@/lib/i18n";

// نصوص شبكات Wijmo (DataGridView + قائمة الزر الأيمن FlexGridContextMenu) — منقولة من الشامل ويب حيث كانت تُستبدل
// "$.strings.x" عند البناء؛ هنا جدول عربي يُترجَم بـ tr() لحظة القراءة (اللغة تتبع app_lang وقت فتح الشبكة).
const AR = {
  dir: "rtl",
  active: "نشط",
  inactive: "موقوف",
  status: "الحالة",
  yes: "نعم",
  no: "لا",
  globalFilter: "بحث في كل الأعمدة...",
  groupingRow: "اسحب عنوان عمود إلى هنا للتجميع حسبه",
  recordsOrder: "ترتيب السجلات",
  postVouchers: { canceled: "محذوف" },
  searchGeneral: { generalFilterWarning: "أدخل نص البحث" },
  PermissionsUsersAccess: { active: "مفعّل", inactive: "غير مفعّل" },
  sort: "الترتيب",
  ascending: "تصاعدي",
  descending: "تنازلي",
  noSort: "بدون ترتيب",
  clearAllSort: "إلغاء كل الترتيب",
  pinUnpin: "تثبيت / إلغاء تثبيت العمود",
  autoSize: "ملاءمة عرض العمود",
  autoSizeAll: "ملاءمة عرض كل الأعمدة",
  columnsChooser: "اختيار الأعمدة",
  showAll: "إظهار الكل",
  hideAll: "إخفاء الكل",
  groupUnGroup: "تجميع / إلغاء التجميع حسب العمود",
  clearAllGroups: "إلغاء كل التجميعات",
  gridExport: "تصدير",
  excelFileExport: "ملف Excel",
  csvFileExport: "ملف CSV",
  pdfFileExport: "ملف PDF",
  reportsDesigner: { title: "تصميم التقرير", saveDesign: "حفظ التصميم", searchDesign: "التصاميم المحفوظة" },
};

const translate = (node) =>
  new Proxy(node, {
    get(target, key) {
      if (key === "dir") return appDir();
      const value = target[key];
      if (typeof value === "string") return tr(value);
      if (value && typeof value === "object") return translate(value);
      return value;
    },
  });

/** $.strings للشبكات: gridStrings.sort ⇐ «الترتيب» أو "Sort" بالإنجليزية */
export const gridStrings = translate(AR);
