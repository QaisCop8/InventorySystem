"use client"

import { tr, appDir } from "@/lib/i18n"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TrendingUp, Package, Users, GitBranch, Loader2, Sparkles, RefreshCw } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

export function SmartAnalyticsDashboard() {
  const [activeTab, setActiveTab] = useState("sales")
  const [timeframe, setTimeframe] = useState("30")
  const [insights, setInsights] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)

  const analyzeData = async (analysisType: string) => {
    setIsLoading(true)
    setInsights("")

    try {
      const response = await fetch("/api/ai-analytics/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisType, timeframe: Number.parseInt(timeframe) }),
      })

      const result = await response.json()

      if (result.success) {
        setInsights(result.insights)
      } else {
        setInsights("فشل في توليد التحليل. يرجى المحاولة مرة أخرى.")
      }
    } catch (error) {
      console.error("[v0] Error analyzing data:", error)
      setInsights("حدث خطأ أثناء التحليل. يرجى المحاولة مرة أخرى.")
    } finally {
      setIsLoading(false)
    }
  }

  const analysisTypes = [
    {
      id: "sales",
      title: tr("تحليل المبيعات"),
      description: tr("رؤى وتوصيات حول أداء المبيعات"),
      icon: TrendingUp,
      color: "text-green-600",
    },
    {
      id: "inventory",
      title: tr("تحليل المخزون"),
      description: tr("تقييم حالة المخزون وتوصيات التحسين"),
      icon: Package,
      color: "text-blue-600",
    },
    {
      id: "customers",
      title: tr("تحليل العملاء"),
      description: tr("فهم سلوك العملاء وفرص النمو"),
      icon: Users,
      color: "text-purple-600",
    },
    {
      id: "workflow",
      title: tr("تحليل سير العمل"),
      description: tr("تقييم كفاءة العمليات والاختناقات"),
      icon: GitBranch,
      color: "text-orange-600",
    },
  ]

  return (
    <div className="space-y-6" dir={appDir()}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">{tr("لوحة التحليلات الذكية")}</h2>
          <p className="text-muted-foreground mt-1">{tr("رؤى وتوصيات مدعومة بالذكاء الاصطناعي")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{tr("آخر 7 أيام")}</SelectItem>
              <SelectItem value="30">{tr("آخر 30 يوم")}</SelectItem>
              <SelectItem value="60">{tr("آخر 60 يوم")}</SelectItem>
              <SelectItem value="90">{tr("آخر 90 يوم")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          {analysisTypes.map((type) => (
            <TabsTrigger key={type.id} value={type.id} className="gap-2">
              <type.icon className="h-4 w-4" />
              {type.title}
            </TabsTrigger>
          ))}
        </TabsList>

        {analysisTypes.map((type) => (
          <TabsContent key={type.id} value={type.id} className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-lg bg-muted ${type.color}`}>
                      <type.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <CardTitle>{type.title}</CardTitle>
                      <CardDescription>{type.description}</CardDescription>
                    </div>
                  </div>
                  <Button onClick={() => analyzeData(type.id)} disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 me-2 animate-spin" />
                        {tr("جاري التحليل...")}
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 me-2" />
                        {tr("توليد التحليل")}
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {insights ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-lg">{tr("الرؤى والتوصيات")}</h3>
                      <Button variant="outline" size="sm" onClick={() => analyzeData(type.id)}>
                        <RefreshCw className="h-4 w-4 me-2" />
                        {tr("تحديث")}
                      </Button>
                    </div>
                    <ScrollArea className="h-[500px] rounded-lg border p-4 bg-muted/30">
                      <div className="prose prose-sm max-w-none whitespace-pre-wrap" dir={appDir()}>
                        {insights}
                      </div>
                    </ScrollArea>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">{tr("اضغط على \"توليد التحليل\" للحصول على رؤى وتوصيات ذكية")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{tr("كيف يعمل التحليل الذكي؟")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{tr("1. يقوم النظام بجمع البيانات من قاعدة البيانات")}</p>
            <p>{tr("2. يتم تحليل البيانات باستخدام الذكاء الاصطناعي (Grok)")}</p>
            <p>{tr("3. يتم توليد رؤى وتوصيات مخصصة")}</p>
            <p>{tr("4. يمكنك تحديث التحليل في أي وقت للحصول على رؤى جديدة")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{tr("نصائح للاستفادة القصوى")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{tr("• اختر الفترة الزمنية المناسبة للتحليل")}</p>
            <p>{tr("• قارن التحليلات بين فترات مختلفة")}</p>
            <p>{tr("• طبق التوصيات المقترحة وراقب النتائج")}</p>
            <p>{tr("• استخدم التحليلات لاتخاذ قرارات استراتيجية")}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
