# نظام إدارة المخزون والطلبات - Arabic ERP System

*نظام شامل لإدارة المخزون والطلبات باللغة العربية*

[![Built with v0](https://img.shields.io/badge/Built%20with-v0.app-black?style=for-the-badge)](https://v0.app)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue?style=for-the-badge&logo=postgresql)](https://postgresql.org)

## نظرة عامة

نظام إدارة المخزون والطلبات هو تطبيق ويب شامل مصمم خصيصاً للشركات العربية. يوفر النظام إدارة كاملة للمخزون، العملاء، الموردين، والطلبات مع واجهة مستخدم حديثة تدعم اللغة العربية بالكامل.

## الميزات الرئيسية

- 📦 **إدارة المخزون**: تتبع شامل للمنتجات والمخزون
- 👥 **إدارة العملاء**: قاعدة بيانات شاملة للعملاء
- 🏪 **إدارة الموردين**: تنظيم معلومات الموردين والتعاملات
- 📋 **إدارة الطلبات**: أوامر البيع والشراء
- 📊 **التقارير والإحصائيات**: لوحة تحكم تفاعلية
- 🏢 **إدارة المستودعات**: تتبع المخزون في مواقع متعددة
- 🔐 **نظام المصادقة**: حماية البيانات والوصول الآمن
- 🌙 **الوضع الليلي**: واجهة مريحة للعينين
- 📱 **تصميم متجاوب**: يعمل على جميع الأجهزة

## متطلبات النظام

- Node.js 18+ 
- PostgreSQL 15+
- npm أو yarn

## التركيب المحلي

### 1. تحميل المشروع

\`\`\`bash
# استنساخ المشروع من GitHub
git clone [repository-url]
cd inventory-ordering-system

# أو تحميل ZIP من v0.app
# فك الضغط والانتقال إلى مجلد المشروع
\`\`\`

### 2. تثبيت التبعيات

\`\`\`bash
npm install
# أو
yarn install
\`\`\`

### 3. إعداد قاعدة البيانات

#### الطريقة الأولى: PostgreSQL محلي

\`\`\`bash
# تثبيت PostgreSQL 18 (مطلوب لقراءة قالب قاعدة البيانات المرفق)
# على Ubuntu/Debian:
sudo apt install postgresql postgresql-contrib

# على macOS:
brew install postgresql

# على Windows: تحميل من postgresql.org

# أنشئ ملف البيئة ثم شغّل سكربت التثبيت؛ سيُنشئ قاعدة management فقط
cp .env.local.example .env.local
bash install.sh
\`\`\`

#### الطريقة الثانية: Docker

\`\`\`bash
docker run --name postgres-inventory \
  -e POSTGRES_DB=management \
  -e POSTGRES_USER=your_username \
  -e POSTGRES_PASSWORD=your_password \
  -p 5432:5432 \
  -d postgres:15
\`\`\`

### 4. تكوين متغيرات البيئة

أنشئ ملف `.env.local` في جذر المشروع:

\`\`\`env
# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/management"

# Encryption Key (generate a random 32-character string)
ENCRYPTION_KEY="your-32-character-encryption-key-here"

# Stack Auth (اختياري - للمصادقة)
NEXT_PUBLIC_STACK_PROJECT_ID="your-stack-project-id"
NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY="your-stack-client-key"
STACK_SECRET_SERVER_KEY="your-stack-server-key"
\`\`\`

### 5. إنشاء قاعدة البيانات

\`\`\`bash
# ينشئ قاعدة الإدارة وقالب الشركات من السكربتات المرفقة
bash scripts/bootstrap-databases.sh
\`\`\`

### 6. تشغيل التطبيق

\`\`\`bash
# تشغيل في وضع التطوير
npm run dev
# أو
yarn dev

# فتح المتصفح على
# http://localhost:3000
\`\`\`

## هيكل المشروع

\`\`\`
inventory-ordering-system/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   ├── globals.css        # الأنماط العامة
│   ├── layout.tsx         # التخطيط الرئيسي
│   └── page.tsx          # الصفحة الرئيسية
├── components/            # مكونات React
│   ├── auth/             # مكونات المصادقة
│   ├── products/         # إدارة المنتجات
│   ├── settings/         # الإعدادات
│   └── ui/               # مكونات الواجهة
├── lib/                  # المكتبات والأدوات
├── scripts/              # سكريبتات قاعدة البيانات
└── public/               # الملفات العامة
\`\`\`

## الاستخدام

### تسجيل الدخول
1. افتح التطبيق في المتصفح
2. سجل الدخول باستخدام بياناتك
3. ستنتقل إلى لوحة التحكم الرئيسية

### إدارة المنتجات
1. انتقل إلى قسم "المنتجات"
2. أضف مجموعات الأصناف أولاً
3. أضف المنتجات وحدد المجموعة المناسبة
4. حدد معلومات المستودعات والمخزون

### إدارة العملاء والموردين
1. استخدم قسم "العملاء" لإضافة وإدارة العملاء
2. استخدم قسم "الموردين" لإدارة الموردين
3. يمكن إضافة معلومات مفصلة لكل عميل ومورد

### إنشاء الطلبات
1. انتقل إلى "أوامر البيع" لإنشاء طلبات للعملاء
2. استخدم "أوامر الشراء" للطلبات من الموردين
3. تتبع حالة الطلبات والمدفوعات

## النشر على الإنتاج

### Vercel (الأسهل)
1. ادفع الكود إلى GitHub
2. اربط المشروع بـ Vercel
3. أضف متغيرات البيئة في إعدادات Vercel
4. انشر التطبيق

### خادم مخصص
\`\`\`bash
# بناء التطبيق
npm run build

# تشغيل في وضع الإنتاج
npm start
\`\`\`

## استكشاف الأخطاء

### مشاكل قاعدة البيانات
- تأكد من تشغيل PostgreSQL
- تحقق من صحة متغيرات البيئة
- تأكد من إنشاء الجداول بنجاح

### مشاكل التشغيل
- تأكد من تثبيت جميع التبعيات
- تحقق من إصدار Node.js (18+)
- راجع سجلات الأخطاء في وحدة التحكم

## المساهمة

نرحب بالمساهمات! يرجى:
1. عمل Fork للمشروع
2. إنشاء فرع جديد للميزة
3. إجراء التغييرات المطلوبة
4. إرسال Pull Request

## الدعم

للحصول على الدعم:
- افتح Issue في GitHub
- راسلنا على البريد الإلكتروني
- راجع الوثائق في المشروع

## الترخيص

هذا المشروع مرخص تحت رخصة MIT - راجع ملف LICENSE للتفاصيل.

---

**تم تطويره باستخدام v0.app - منصة تطوير التطبيقات بالذكاء الاصطناعي**
