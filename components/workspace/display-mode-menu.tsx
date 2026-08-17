"use client"

import { useEffect, useRef, useState } from "react"
import { Columns2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useWorkspace } from "@/contexts/workspace-context"

interface DisplayModeMenuProps {
  userId?: string
}

// يقرأ/يحفظ تفضيل "الشاشة المقسمة"/"التبويبات" الشخصي — بنفس عمود dashboard_layout المُستخدَم
// أصلاً لـdefault_screen (انظر components/settings/user-settings.tsx)، مع تحميل طازج من قاعدة
// البيانات عند الإقلاع (لا الاعتماد على erp_user المخزَّن محلياً، الذي لا يتحدَّث بعد أي PUT هنا —
// نفس نمط components/theme-loader.tsx لـtheme_preference).
export function DisplayModeMenu({ userId }: DisplayModeMenuProps) {
  const { splitEnabled, tabsEnabled, popupsInTab, setSplitEnabled, setTabsEnabled, setPopupsInTab, hydrateModes } = useWorkspace()
  const dashboardLayoutRef = useRef<Record<string, any>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    fetch(`/api/settings/user?user_id=${userId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        const dashboardLayout = data.dashboard_layout || {}
        dashboardLayoutRef.current = dashboardLayout
        const displayMode = dashboardLayout.display_mode || { split: false, tabs: false, popupsInTab: false }
        hydrateModes({ split: !!displayMode.split, tabs: !!displayMode.tabs, popupsInTab: !!displayMode.popupsInTab })
      })
      .catch(() => {
        // تجاهل — يبقى الوضع الافتراضي (بلا شاشة مقسمة/تبويبات) كما لو لم يُحفَظ تفضيل من قبل
      })

    return () => {
      cancelled = true
    }
  }, [userId, hydrateModes])

  const persist = async (next: { split: boolean; tabs: boolean; popupsInTab: boolean }) => {
    if (!userId) return
    const nextDashboardLayout = { ...dashboardLayoutRef.current, display_mode: next }
    dashboardLayoutRef.current = nextDashboardLayout
    setSaving(true)
    try {
      await fetch("/api/settings/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, dashboard_layout: nextDashboardLayout }),
      })
      // يُبقي erp_user المخزَّن محلياً متزامناً فوراً بلا انتظار إعادة تسجيل دخول — أياً كانت مساحة
      // التخزين التي استُخدمت عند الدخول (تذكرني مفعّل أم لا، انظر auth-context.tsx login()).
      for (const storage of [localStorage, sessionStorage]) {
        const raw = storage.getItem("erp_user")
        if (!raw) continue
        try {
          const parsed = JSON.parse(raw)
          storage.setItem("erp_user", JSON.stringify({ ...parsed, dashboard_layout: nextDashboardLayout }))
        } catch {
          // تجاهل — قيمة مخزَّنة غير متوقعة، لا تستحق فشل الحفظ الأساسي
        }
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" title="طريقة عرض الصفحات">
          <Columns2 className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72" dir="rtl">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="split-screen-toggle">الشاشة المقسمة</Label>
              <p className="text-xs text-muted-foreground">تقسيم منطقة العرض لجزأين مستقلَّين</p>
            </div>
            <Switch
              id="split-screen-toggle"
              checked={splitEnabled}
              disabled={saving}
              onCheckedChange={(checked) => {
                setSplitEnabled(checked)
                void persist({ split: checked, tabs: tabsEnabled, popupsInTab })
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="tabs-toggle">فتح الصفحات كتبويبات</Label>
              <p className="text-xs text-muted-foreground">إبقاء الصفحات المفتوحة كتبويبات بدل استبدالها</p>
            </div>
            <Switch
              id="tabs-toggle"
              checked={tabsEnabled}
              disabled={saving}
              onCheckedChange={(checked) => {
                setTabsEnabled(checked)
                void persist({ split: splitEnabled, tabs: checked, popupsInTab })
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="popups-in-tab-toggle">فتح النوافذ داخل التبويب</Label>
              <p className="text-xs text-muted-foreground">حصر التعتيم والنافذة داخل التبويب النشط دون قفل النظام</p>
            </div>
            <Switch
              id="popups-in-tab-toggle"
              checked={popupsInTab}
              disabled={saving}
              onCheckedChange={(checked) => {
                setPopupsInTab(checked)
                void persist({ split: splitEnabled, tabs: tabsEnabled, popupsInTab: checked })
              }}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
