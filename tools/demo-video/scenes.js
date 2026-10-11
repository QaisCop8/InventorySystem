// مشاهد فيديو العرض — عدّل الترتيب/النصوص/المدد بحرية.
// section: معرّف الشاشة (?section=)  ·  menu: نص البحث في القائمة الجانبية (null = انتقال مباشر)
// chapter: بطاقة فصل تظهر قبل المشهد  ·  title/subtitle: الشريط السفلي  ·  actions: ما يحدث في الشاشة
// ملاحظة: لا يوجد أي مشهد يضغط "حفظ" أو "حذف" — الفيديو لا يغيّر أي بيانات.

module.exports = [
  {
    section: "home-dashboard", menu: null,
    title: "لوحة التحكم الرئيسية", subtitle: "نظرة شاملة على أداء المنشأة في شاشة واحدة",
    actions: [{ do: "wait", ms: 2500 }, { do: "scroll", amount: 900 }, { do: "wait", ms: 1500 }, { do: "scroll", amount: -900 }],
  },
  {
    chapter: { title: "المبيعات ونقاط البيع", subtitle: "من الطلبية حتى الفاتورة والتحصيل" },
    section: "pos-cashier", menu: "كاشير نقطة البيع",
    title: "كاشير نقطة البيع", subtitle: "بيع سريع بالباركود، بحث الأصناف F10، وتنبيهات صوتية لكل عملية",
    actions: [{ do: "wait", ms: 3500 }, { do: "hover", selector: "button", count: 4 }],
  },
  {
    section: "sales-orders", menu: "طلبيات المبيعات",
    title: "طلبيات المبيعات", subtitle: "طلبيات العملاء مع الأسعار والخصومات والضريبة على مستوى الصنف",
    actions: [{ do: "wait", ms: 2500 }, { do: "hover", selector: "[role=tab]", count: 4 }, { do: "scroll", amount: 500 }],
  },
  {
    section: "sales-invoices", menu: "فاتورة مبيعات",
    title: "فواتير المبيعات", subtitle: "فوترة كاملة مع الأرقام التسلسلية وتواريخ الصلاحية ومنع الرصيد السالب",
    actions: [{ do: "wait", ms: 2500 }, { do: "hover", selector: "[role=tab]", count: 4 }],
  },
  {
    chapter: { title: "المحاسبة والمالية", subtitle: "سندات وقيود آلية وتقارير مالية دقيقة" },
    section: "receipt-vouchers", menu: "سند قبض",
    title: "سندات القبض", subtitle: "تحصيل نقدي وشيكات وبطاقات في سند واحد مع قيد محاسبي تلقائي",
    actions: [{ do: "wait", ms: 2500 }, { do: "hover", selector: "[role=tab]", count: 5 }],
  },
  {
    section: "journal-vouchers", menu: "سند قيد",
    title: "سندات القيد", subtitle: "قيود يومية بمراكز تكلفة وعملات متعددة",
    actions: [{ do: "wait", ms: 3000 }, { do: "scroll", amount: 400 }],
  },
  {
    section: "income-statement-report", menu: "قائمة الدخل",
    title: "قائمة الدخل", subtitle: "تقارير مالية لحظية قابلة للتصفية حسب الفرع والفترة والعملة",
    actions: [{ do: "wait", ms: 3000 }, { do: "scroll", amount: 700 }],
  },
  {
    section: "receivables-aging-report", menu: "تقرير تعمير الذمم",
    title: "تعمير الذمم", subtitle: "متابعة أعمار ديون العملاء بفترات قابلة للتخصيص",
    actions: [{ do: "wait", ms: 3000 }, { do: "scroll", amount: 500 }],
  },
  {
    section: "tax-sales-statement-report", menu: "كشف المبيعات الضريبية",
    title: "التقارير الضريبية", subtitle: "كشوف المبيعات والمشتريات الضريبية والمقاصة جاهزة للتقديم",
    actions: [{ do: "wait", ms: 3000 }],
  },
  {
    section: "cc-income-statement-report", menu: "قائمة الدخل بمراكز التكلفة",
    title: "مراكز التكلفة", subtitle: "ربحية كل فرع ومشروع وقسم بعشرة تقارير تحليلية",
    actions: [{ do: "wait", ms: 3000 }],
  },
  {
    chapter: { title: "المخزون والأصول", subtitle: "تحكم كامل بالأصناف والمستودعات" },
    section: "products", menu: "الأصناف",
    title: "إدارة الأصناف", subtitle: "وحدات متعددة، باركودات، تصنيفات ضريبية وأسعار حسب الفئة",
    actions: [{ do: "wait", ms: 3000 }, { do: "scroll", amount: 600 }],
  },
  {
    section: "stock-counts", menu: "جرد المخازن",
    title: "جرد المخازن", subtitle: "جرد حسب الفرع والمستودع والدفعة والرقم التسلسلي مع تسوية آلية",
    actions: [{ do: "wait", ms: 3000 }],
  },
  {
    section: "fixed-assets", menu: "الأصول الثابتة",
    title: "الأصول الثابتة", subtitle: "سجل الأصول والإهلاك والقيود الآلية",
    actions: [{ do: "wait", ms: 3000 }],
  },
  {
    chapter: { title: "الموارد البشرية", subtitle: "دوام، مناوبات ورواتب متكاملة" },
    section: "shifts", menu: "الورديات وجدول المناوبات",
    title: "جدول المناوبات", subtitle: "تخطيط الورديات يوماً بيوم كما في المستشفيات مع متابعة التغطية",
    actions: [{ do: "wait", ms: 3000 }, { do: "scroll", amount: 400 }],
  },
  {
    section: "attendance-processing", menu: "معالجة حركات الدخول والخروج",
    title: "معالجة الدوام", subtitle: "تحويل البصمات إلى دوام يومي: تأخير، خروج مبكر، عمل إضافي وغياب",
    actions: [{ do: "wait", ms: 3000 }],
  },
  {
    section: "salary-periods", menu: "فتح راتب شهر",
    title: "الرواتب", subtitle: "احتساب الرواتب مع الضريبة وحركات الدوام وقيد رواتب آلي",
    actions: [{ do: "wait", ms: 3000 }],
  },
  {
    chapter: { title: "الذكاء الاصطناعي", subtitle: "اسأل نظامك بلغتك" },
    section: "ai-assistant", menu: null,
    title: "المساعد الذكي", subtitle: "اسأل عن المبيعات والأرصدة، أو اطلب إنشاء سند بجملة واحدة",
    actions: [{ do: "wait", ms: 2000 }, { do: "type", selector: "textarea, input[type=text]", text: "أعطني ملخص المبيعات خلال آخر 30 يوماً", submit: true }, { do: "wait", ms: 9000 }],
  },
]
