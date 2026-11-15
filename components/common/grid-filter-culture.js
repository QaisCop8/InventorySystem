"use client";

import * as wjcCore from "@grapecity/wijmo";
import { Operator } from "@grapecity/wijmo.grid.filter";
import { isEnglish } from "@/lib/i18n";

// نصوص نافذة فلتر أعمدة Wijmo (ترتيب، فلتر بالقيمة/بالشرط، تحديد الكل...) بالعربية عند كون اللغة عربية — فقط نصوص
// FlexGridFilter (لا تُغيَّر ثقافة الأرقام/التواريخ في Wijmo فتبقى المبالغ بنفس تنسيقها)
let applied = false;

export function applyGridFilterCulture() {
  if (applied || typeof window === "undefined" || isEnglish()) return;
  applied = true;
  const current = (wjcCore.culture && wjcCore.culture.FlexGridFilter) || {};
  wjcCore.culture.FlexGridFilter = {
    ...current,
    ascending: "↑ تصاعدي",
    descending: "↓ تنازلي",
    apply: "تطبيق",
    cancel: "إلغاء",
    clear: "مسح",
    conditions: "فلتر بالشرط",
    values: "فلتر بالقيمة",
    search: "بحث",
    selectAll: "تحديد الكل",
    includeSelection: "تضمين التحديد الحالي",
    null: "(فارغ)",
    exceedsMaxValues: "لا تظهر كل القيم",
    popupBody: "يحتوي هذا العمود على أكثر من 250 قيمة مختلفة — تُعرض أول 250 قيمة فقط.",
    popupOkButton: "موافق",
    header: "إظهار الأسطر التي قيمتها",
    and: "و",
    or: "أو",
    stringOperators: [
      { name: "(بدون)", op: null }, { name: "تساوي", op: Operator.EQ }, { name: "لا تساوي", op: Operator.NE },
      { name: "تبدأ بـ", op: Operator.BW }, { name: "لا تبدأ بـ", op: Operator.NBW }, { name: "تنتهي بـ", op: Operator.EW },
      { name: "لا تنتهي بـ", op: Operator.NEW }, { name: "تحتوي", op: Operator.CT }, { name: "لا تحتوي", op: Operator.NC },
    ],
    multiFilterBlankOperators: [{ name: "فارغ", op: Operator.BLANK }, { name: "غير فارغ", op: Operator.NOTBLANK }],
    numberOperators: [
      { name: "(بدون)", op: null }, { name: "تساوي", op: Operator.EQ }, { name: "لا تساوي", op: Operator.NE },
      { name: "أكبر من", op: Operator.GT }, { name: "أكبر من أو تساوي", op: Operator.GE },
      { name: "أصغر من", op: Operator.LT }, { name: "أصغر من أو تساوي", op: Operator.LE },
    ],
    dateOperators: [{ name: "(بدون)", op: null }, { name: "يساوي", op: Operator.EQ }, { name: "قبل", op: Operator.LT }, { name: "بعد", op: Operator.GT }],
    booleanOperators: [{ name: "(بدون)", op: null }, { name: "تساوي", op: Operator.EQ }, { name: "لا تساوي", op: Operator.NE }],
  };
}
