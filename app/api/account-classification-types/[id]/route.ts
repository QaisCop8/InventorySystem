"use client"
import { AIChat } from "@/components/ai-assistant/ai-chat"

export default function AIAssistantPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">المساعد الذكي</h1>
          <p className="text-muted-foreground">اسأل المساعد الذكي عن أي شيء يتعلق بالنظام أو البيانات</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 mb-8">
          <div className="p-6 border rounded-lg">
            <h3 className="font-semibold mb-2">📊 التحليلات والإحصائيات</h3>
            <p className="text-sm text-muted-foreground">احصل على تقارير فورية عن المبيعات، المشتريات، والمخزون</p>
          </div>

          <div className="p-6 border rounded-lg">
            <h3 className="font-semibold mb-2">🔍 البحث الذكي</h3>
            <p className="text-sm text-muted-foreground">ابحث عن المنتجات، العملاء، والطلبيات باللغة الطبيعية</p>
          </div>

          <div className="p-6 border rounded-lg">
            <h3 className="font-semibold mb-2">💡 التوصيات</h3>
            <p className="text-sm text-muted-foreground">احصل على توصيات ذكية لتحسين المخزون والمبيعات</p>
          </div>

          <div className="p-6 border rounded-lg">
            <h3 className="font-semibold mb-2">❓ المساعدة</h3>
            <p className="text-sm text-muted-foreground">اسأل عن كيفية استخدام أي ميزة في النظام</p>
          </div>
        </div>

        <div className="p-6 border rounded-lg bg-muted/50">
          <h3 className="font-semibold mb-4">أمثلة على الأسئلة:</h3>
          <ul className="space-y-2 text-sm">
            <li>• كم عدد الطلبيات المعلقة اليوم؟</li>
            <li>• ما هي المنتجات التي تحتاج إعادة طلب؟</li>
            <li>• أعطني تقرير عن أفضل 10 منتجات مبيعاً هذا الشهر</li>
            <li>• ما هي حالة المخزون للمنتج X؟</li>
            <li>• كم عدد العملاء الجدد هذا الأسبوع؟</li>
            <li>• ما هي الطلبيات المتأخرة في سير العمل؟</li>
          </ul>
        </div>
      </div>

      <AIChat />
    </div>
  )
}

