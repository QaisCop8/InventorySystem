"use client";

import { tr, appDir } from "@/lib/i18n"
import { useEffect, useRef, useState, forwardRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Icons } from "@/components/ui/icons";
import { QuickThemeToggle } from "@/components/theme/theme-toggle";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { DisplayModeMenu } from "@/components/workspace/display-mode-menu";
import { Loader2, Building2, ChevronDown, ArrowLeftRight, ImagePlus, KeyRound, MapPin } from "lucide-react";
import { ChangePasswordDialog } from "@/components/management/change-password-dialog";
import { GlobalSearch } from "@/components/navigation/global-search";
import { menuItems, SECTION_TITLES, type MenuItem } from "@/components/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { activateCompany } from "@/lib/tenant-client";
import { deviceLabel } from "@/lib/device-label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { requestGuardedNavigation } from "@/lib/navigation-guard";
import { useDailyExchangeRatesCheck } from "@/hooks/use-daily-exchange-rates-check";
import { useToast } from "@/hooks/use-toast";

const DailyExchangeRatesDialog = dynamic(
  () => import("@/components/settings/daily-exchange-rates").then((module) => module.DailyExchangeRatesDialog),
  { ssr: false },
);
const NotificationCenter = dynamic(
  () => import("@/components/notifications/notification-center").then((module) => module.NotificationCenter),
  { ssr: false },
);
const ApplicationMenu = dynamic(
  () => import("@/components/navigation/application-menu").then((module) => module.ApplicationMenu),
  { ssr: false },
);

interface HeaderCompany {
  id: number;
  name: string;
  status: "pending" | "approved" | "rejected" | "stopped";
  expiry_date?: string | null;
}

const isCompanyExpired = (company: HeaderCompany) =>
  !!company.expiry_date && new Date(company.expiry_date).getTime() < Date.now();

interface HeaderProps {
  onMenuClick: () => void;
  activeSection: string;
  onProfileClick?: () => void;
  onSettingsClick?: () => void;
  onSectionChange: (section: string) => void;
}

// ForwardRef button so Radix can attach properly
const RefButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  (props, ref) => <button ref={ref} {...props} />
);
RefButton.displayName = "RefButton";

export function Header({ onMenuClick, activeSection, onSettingsClick, onSectionChange }: HeaderProps) {
  const router = useRouter();
  const { toast } = useToast();
  const {
    user,
    logout,
    activeBranchId,
    activeBranchName,
    activeDepartment,
    setActiveBranchContext,
    setActiveDepartmentContext,
  } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [myCompanies, setMyCompanies] = useState<HeaderCompany[]>([]);
  const [currentCompanyId, setCurrentCompanyId] = useState<number | null>(null);
  const [switchingCompanyName, setSwitchingCompanyName] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/management/companies").then((res) => (res.ok ? res.json() : [])),
      fetch("/api/management/current-company").then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([companiesData, current]) => {
        setMyCompanies(Array.isArray(companiesData) ? companiesData : []);
        setCurrentCompanyId(current?.id ?? null);
      })
      .catch(() => {});
  }, []);

  // تبديل الشركة من قائمة الهيدر المنسدلة — يعيد استخدام نفس منطق شركاتي (lib/tenant-client.ts)
  // حتى تتصرف كلتاهما بنفس الطريقة تماماً (sessionStorage الخاصة بهذا التبويب، تسجيل دخول تلقائي).
  const handleCompanyChange = async (companyId: number) => {
    if (companyId === currentCompanyId) return;
    const target = myCompanies.find((c) => c.id === companyId);
    if (!target || target.status !== "approved") return;

    setSwitchingCompanyName(target.name);
    let result = await activateCompany(companyId);
    // جهاز واحد لكل مستخدم: الحساب مفتوح على هذه الشركة من جهاز آخر
    if (result.code === "active_elsewhere" && window.confirm(tr("الحساب {0} مسجَّل الدخول الآن من جهاز آخر ({1}). هل تريد تسجيل الخروج من الجهاز الآخر والدخول من هذا الجهاز؟", result.account?.name || result.account?.email || "", deviceLabel(result.device?.user_agent)))) {
      result = await activateCompany(companyId, { force: true });
    }
    if (!result.success) {
      setSwitchingCompanyName(null);
      // العودة للشركة السابقة: لا شيء إضافي مطلوب هنا فعلياً — عنصر <select> مربوط بـcurrentCompanyId
      // الذي لم يتغيّر (لم يُعَد تعيينه بعد نجاح فعلي فقط)، فيعرض تلقائياً الشركة السابقة نفسها.
      toast({ title: tr("تعذّر فتح الشركة"), description: result.error || tr("تعذّر فتح الشركة"), variant: "destructive" });
      return;
    }
    window.location.href = `/?company=${companyId}`;
  };

  // logout فعلياً غير متزامن (طلب /api/auth/logout قبل تفريغ الجلسة) — بلا هذه الحالة كان الضغط
  // على "تسجيل الخروج" يُغلق القائمة المنسدلة فوراً دون أي مؤشر تحميل حتى تكتمل الجلسة وتُعاد
  // صفحة الدخول.
  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
  };

  useEffect(() => {
    if (!user?.id) {
      setAvatarUrl(null);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/settings/user?user_id=${encodeURIComponent(user.id)}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => setAvatarUrl(typeof data?.avatar_url === "string" ? data.avatar_url : null))
      .catch((error) => {
        if (error instanceof Error && error.name !== "AbortError") console.error("Failed to load user avatar:", error);
      });
    return () => controller.abort();
  }, [user?.id]);

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      toast({ title: tr("ملف غير صالح"), description: tr("يرجى اختيار ملف صورة"), variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: tr("حجم الصورة كبير"), description: tr("الحد الأقصى لحجم الصورة 2 ميجابايت"), variant: "destructive" });
      return;
    }

    setAvatarSaving(true);
    try {
      const imageData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error(tr("تعذّرت قراءة الصورة")));
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/settings/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user?.id, avatar_url: imageData }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || tr("تعذّر حفظ الصورة"));
      setAvatarUrl(imageData);
      toast({ title: tr("تم تحديث الصورة الشخصية") });
    } catch (error) {
      toast({ title: tr("تعذّر تحديث الصورة"), description: error instanceof Error ? error.message : tr("حدث خطأ غير متوقع"), variant: "destructive" });
    } finally {
      setAvatarSaving(false);
    }
  };

  const [branches, setBranches] = useState<Array<{ id: number; branch_name: string }>>([]);
  // تغيير الفرع يعيد تحميل كل الشاشات المفتوحة ⇐ يُسأل أولاً عن أي شاشة بتغييرات غير محفوظة (حفظ/عدم حفظ/رجوع)
  const changeBranchGuarded = (selected: { id: number; branch_name: string }) => {
    if (selected.id === activeBranchId) return;
    const apply = () => setActiveBranchContext({ id: selected.id, name: selected.branch_name });
    if (requestGuardedNavigation(apply)) apply();
  };
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [branchRetry, setBranchRetry] = useState(0);
  const { dialogOpen: exchangeRatesOpen, setDialogOpen: setExchangeRatesOpen, checkNow: recheckExchangeRates } = useDailyExchangeRatesCheck();

  useEffect(() => {
    if (!user?.id) {
      setBranches([]);
      return;
    }

    // أول دخول لشركة أُنشئت للتو: قد يُرسم الرأس قبل حفظ الشركة المختارة، أو يصل أول رد فارغاً (قاعدة جديدة ما زالت
    // تُهيّأ) — كان يبقى "لا توجد فروع" حتى Ctrl+F5. يُعاد المحاولة بفاصل قصير بدل الاستسلام من أول مرة.
    const tenantDb = sessionStorage.getItem("active_tenant_db") || localStorage.getItem("active_tenant_db");
    if (!tenantDb) {
      setBranches([]);
      if (branchRetry >= 20) return;
      const timer = window.setTimeout(() => setBranchRetry((count) => count + 1), 500);
      return () => window.clearTimeout(timer);
    }

    const controller = new AbortController();
    let retryTimer: number | undefined;
    const fetchBranches = async () => {
      try {
        setIsLoadingBranches(true);
        // فروع المستخدم فقط (عضوية user_branches) — نفس الفروع المتاحة له في الحركات
        const response = await fetch("/api/branches?scope=mine", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(tr("فشل في تحميل الفروع"));
        const data = await response.json();
        const normalized = Array.isArray(data) ? data : [];
        setBranches(normalized);
        if (!normalized.length && branchRetry < 5) {
          retryTimer = window.setTimeout(() => setBranchRetry((count) => count + 1), 1500);
        }

        // الفرع النشط المحفوظ قد لا يعود مسموحاً (تغيّرت صلاحياته) ⇐ يُستبدل بفرعه الافتراضي أو أول فرع مسموح
        if (normalized.length > 0 && (!activeBranchId || !normalized.some((branch) => branch.id === activeBranchId))) {
          const userBranch = user?.branchId
            ? normalized.find((branch) => branch.id === user.branchId)
            : undefined;
          const defaultBranch = userBranch || normalized[0];
          setActiveBranchContext({ id: defaultBranch.id, name: defaultBranch.branch_name });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("Failed to load branches", error);
          if (branchRetry < 5) retryTimer = window.setTimeout(() => setBranchRetry((count) => count + 1), 1500);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingBranches(false);
        }
      }
    };

    void fetchBranches();
    return () => {
      controller.abort();
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [activeBranchId, setActiveBranchContext, user?.branchId, user?.id, branchRetry]);

  useEffect(() => {
    if (!activeDepartment && user?.department) {
      setActiveDepartmentContext(user.department);
    }
  }, [activeDepartment, setActiveDepartmentContext, user?.department]);

  const sectionTitles: Record<string, string> = {
    "home-dashboard": tr("الرئيسية"),
    dashboard: tr("الرئيسية"),
    "order-tracking": tr("متابعة الطلبيات"),
    customers: tr("إدارة العملاء"),
    suppliers: tr("إدارة الموردين"),
    products: tr("الأصناف"),
    services: tr("الخدمات"),
    "product-groups": tr("مجموعات الأصناف"),
    definitions: tr("التعريفات"),
    "sales-orders": tr("طلبيات المبيعات"),
    "draft-sales-order": tr("مسودات طلبيات المبيعات"),
    "order-confirmation": tr("تأكيد الطلبيات"),
    "order-checklists": tr("قوائم تحقق الطلبيات"),
    "purchase-orders": tr("طلبيات المشتريات"),
    "exchange-rates": tr("أسعار الصرف اليومية"),
    "order-reports": tr("ملخص الطلبيات"),
    "orders-detailed-report": tr("تقرير الطلبيات تفصيلي"),
    "orders-total-report": tr("تقرير الطلبيات إجمالي"),
    "orders-by-item-report": tr("الطلبيات حسب الصنف"),
    "orders-by-party-report": tr("الطلبيات حسب العميل/المورد"),
    "orders-backlog-report": tr("الطلبيات غير المسلّمة"),
    "orders-by-salesman-report": tr("الطلبيات حسب المندوب"),
    "product-reports": tr("تقارير الأصناف والخدمات"),
    "item-balances-report": tr("أرصدة الأصناف بتاريخ معين"),
    "item-valuation-report": tr("تقييم البضاعة بتاريخ معين"),
    "item-card-report": tr("بطاقة صنف"),
    "receivables-statement-report": tr("بيان حساب الذمة"),
    "accounting-statement-report": tr("بيان حساب محاسبي"),
    "vouchers-report": tr("تقرير السندات"),
    "transactions-report": tr("تقرير الحركات"),
    "trial-balance-report": tr("ميزان المراجعة"),
    "balance-sheet-report": tr("ميزانية عمومية"),
    "income-statement-report": tr("قائمة الدخل"),
    cheques: tr("الشيكات"),
    "cheque-operations": tr("عمليات الشيكات"),
    "cheque-deposit-bulk": tr("إيداع الشيكات"),
    "visa-commission-journals": tr("قيود عمولة الفيزا"),
    "currency-transfer-journal": tr("قيد تحويل عملة"),
    "account-currency-transfer-journals": tr("قيود تحويل عملة حساب"),
    "currency-difference-journals": tr("قيود فرق عملة"),
    "cheque-endorse-bulk": tr("تجيير الشيكات"),
    "outgoing-cheque-clear-bulk": tr("إخراج الشيكات الصادرة"),
    "cheque-payment-vouchers": tr("سند صرف شيكات"),
    "pos-cashier": tr("كاشير نقطة البيع"),
    "restaurant-locations": tr("مواقع المطعم"),
    "restaurant-tables": tr("طاولات المطعم"),
    "restaurant-pos": tr("شاشة المطعم"),
    "restaurant-monitor-report": tr("مراقبة المطعم"),
    "restaurant-tables-report": tr("تقرير الطاولات"),
    "restaurant-orders-report": tr("طلبات المطعم تفصيلي"),
    "restaurant-items-report": tr("الأصناف المباعة في المطعم"),
    "restaurant-waiters-report": tr("المطعم حسب النادل"),
    "restaurant-locations-report": tr("المطعم حسب الموقع"),
    "restaurant-hours-report": tr("أوقات الذروة في المطعم"),
    "pos-points-settings": tr("إعداد نقاط البيع"),
    "user-settings": tr("المستخدمين"),
    "font-settings": tr("إعدادات الخطوط"),
    "print-settings": tr("إعدادات الطباعة"),
    "sms-settings": tr("إعدادات الرسائل SMS"),
    "pos-custody-report": tr("تقرير عهد البيع بالتجزئة"),
    "voucher-settings": tr("إعدادات السندات وطباعتها"),
    "system-settings": tr("إعدادات النظام"),
    permissions: tr("الصلاحيات"),
    "user-default-accounts": tr("اعدادات"),
    "api-settings": tr("إعدادات API والتكامل"),
  };

  // عنوان الشاشة + مسارها بالقائمة (مثال: المبيعات › الحركات)
  const findPath = (items: MenuItem[], path: string[] = []): string[] | null => {
    for (const item of items) {
      if (item.section === activeSection && !item.submenu?.length) return path;
      if (item.submenu?.length) {
        const found = findPath(item.submenu, [...path, item.title]);
        if (found) return found;
      }
    }
    return null;
  };
  const pageTitle = sectionTitles[activeSection] || SECTION_TITLES[activeSection] || "Noon ERP";
  const pagePath = (findPath(menuItems) || []).join(" › ");
  const toolButtonClass = "flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-emerald-600 hover:shadow-sm dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-emerald-300";

  return (
    <header
      className="user-typography relative flex h-14 items-center gap-2 border-b border-emerald-100/70 bg-gradient-to-b from-white to-emerald-50/40 px-3 shadow-[0_6px_20px_-16px_rgba(16,185,129,0.35)] md:h-16 md:gap-4 md:px-5 dark:border-white/5 dark:from-slate-900 dark:to-slate-900"
      dir={appDir()}
    >
      {/* لا backdrop-filter ولا z-index على <header>: كلاهما يحصر نافذة التطبيقات (position:fixed بملء الشاشة)
          داخل حدود الشريط بدل الشاشة كلها. */}
      {/* خط تمييز ناعم أسفل الشريط */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-l from-emerald-300/60 via-teal-200/40 to-transparent dark:from-emerald-500/30" />

      {/* البداية: التطبيقات + القائمة + عنوان الشاشة */}
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        <ApplicationMenu onNavigate={onSectionChange} />
        <RefButton
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-400 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
          onClick={onMenuClick}
          aria-label={tr("القائمة")}
        >
          <Icons.Menu />
        </RefButton>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="hidden h-8 w-1 shrink-0 rounded-full bg-gradient-to-b from-emerald-300 to-teal-200 md:block dark:from-emerald-500/60 dark:to-teal-500/30" />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold leading-tight text-slate-800 md:text-[17px] dark:text-slate-100">{pageTitle}</h1>
            {pagePath && <p className="hidden truncate text-[11px] leading-tight text-slate-400 md:block">{pagePath}</p>}
          </div>
        </div>
      </div>

      {/* الوسط: بحث النظام */}
      <div className="hidden min-w-0 flex-1 justify-center md:flex">
        <GlobalSearch onNavigate={onSectionChange} className="w-full max-w-md" />
      </div>
      <div className="flex-1 md:hidden" />

      {/* النهاية: سياق العمل + الأدوات + المستخدم */}
      <div className="flex shrink-0 items-center gap-1.5 md:gap-2.5">
        {/* الفرع والقسم والشركة — كبسولة واحدة */}
        <div className="hidden items-center divide-x divide-x-reverse divide-emerald-100 rounded-full border border-emerald-100/80 bg-emerald-50/50 xl:flex dark:divide-white/10 dark:border-white/10 dark:bg-white/5">
          <label className="flex items-center gap-1.5 px-3 py-1.5" title={tr("الفرع النشط")}>
            <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            <select
              className="max-w-[130px] cursor-pointer bg-transparent text-start text-sm font-medium outline-none"
              value={activeBranchId?.toString() || ""}
              onChange={(event) => {
                const selected = branches.find((branch) => branch.id === Number(event.target.value));
                if (selected) changeBranchGuarded(selected);
              }}
              disabled={isLoadingBranches || branches.length === 0}
            >
              {branches.length === 0 ? (
                <option value="">{tr("لا توجد فروع")}</option>
              ) : (
                branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.branch_name}
                  </option>
                ))
              )}
            </select>
            <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] text-emerald-700/80 shadow-sm dark:bg-white/10 dark:text-emerald-200">
              {activeDepartment || user?.department || tr("القسم")}
            </span>
          </label>

          {/* الشركة الحالية — التبديل يعيد تحميل النظام على الشركة الجديدة */}
          {myCompanies.length > 0 && (
            <label className="flex items-center gap-1.5 px-3 py-1.5" title={tr("الشركة")}>
              <Building2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <select
                className="max-w-[150px] cursor-pointer truncate bg-transparent text-sm font-medium text-card-foreground outline-none"
                value={currentCompanyId ?? ""}
                onChange={(e) => handleCompanyChange(Number(e.target.value))}
                disabled={!!switchingCompanyName}
              >
                {myCompanies.map((c) => {
                  const expired = isCompanyExpired(c);
                  const disabled = c.status !== "approved" || expired;
                  return (
                    <option key={c.id} value={c.id} disabled={disabled}>
                      {c.name}
                      {expired ? tr(" (منتهي الاشتراك)") : c.status !== "approved" ? tr(" (غير جاهزة)") : ""}
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </label>
          )}
        </div>

        {/* الأدوات */}
        <div className="flex items-center gap-0.5 rounded-full bg-slate-100/70 p-1 dark:bg-white/5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <RefButton className={toolButtonClass} onClick={() => setExchangeRatesOpen(true)} aria-label={tr("اسعار الصرف اليومية")}>
                  <ArrowLeftRight className="h-[18px] w-[18px]" />
                </RefButton>
              </TooltipTrigger>
              <TooltipContent side="bottom">{tr("اسعار الصرف اليومية")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* جرس واحد: مركز الإشعارات نفسه هو زر الهيدر (كان داخل قائمة منسدلة بجرس ثانٍ يجب النقر عليه) */}
          <NotificationCenter userId={user?.id} department={user?.department} className={`${toolButtonClass} [&_svg]:h-[18px] [&_svg]:w-[18px]`} />


          {/* طريقة عرض الصفحات: شاشة مقسمة / تبويبات — تفضيل شخصي (dashboard_layout.display_mode) */}
          <div className="hidden xl:block">
            <DisplayModeMenu userId={user?.id} />
          </div>

          <LanguageToggle />
          <QuickThemeToggle />
        </div>

        {/* المستخدم */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <RefButton className="flex h-auto items-center gap-2 rounded-full p-1 transition hover:bg-emerald-50/70 md:py-1 md:pe-1 md:ps-3 dark:hover:bg-white/5">
              <div className="hidden min-w-0 max-w-36 text-start xl:block">
                <p className="truncate text-sm font-semibold leading-tight text-slate-700 dark:text-slate-200">{user?.fullName}</p>
                <p className="truncate text-[11px] leading-tight text-slate-400">{user?.email}</p>
              </div>
              <Avatar className="h-8 w-8 bg-emerald-100 ring-2 ring-emerald-100 ring-offset-1 ring-offset-white md:h-9 md:w-9 dark:ring-emerald-500/20 dark:ring-offset-slate-900">
                <AvatarImage src={avatarUrl || undefined} alt={user?.fullName || ""} className="object-cover" />
                <AvatarFallback className="bg-gradient-to-br from-emerald-300 to-teal-400 text-white"><Icons.User className="h-3.5 w-3.5 md:h-4 md:w-4" /></AvatarFallback>
              </Avatar>
            </RefButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 md:w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1 text-start">
                <p className="text-sm font-medium leading-none">{user?.fullName}</p>
                <p className="text-xs leading-none text-muted-foreground">{user?.role}</p>
                <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>

            {/* الشاشات الصغيرة: البحث والفرع والشركة مخفية من الشريط العلوي، فتُعرض هنا. */}
            <div className="space-y-2 border-t px-2 py-2 text-start xl:hidden" dir={appDir()} onKeyDown={(event) => event.stopPropagation()}>
              <div className="md:hidden">
                <GlobalSearch onNavigate={onSectionChange} />
              </div>
              <label className="block text-xs text-muted-foreground">
                {tr("الفرع")}
                <select
                  className="mt-1 block w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  value={activeBranchId?.toString() || ""}
                  onChange={(event) => {
                    const selected = branches.find((branch) => branch.id === Number(event.target.value));
                    if (selected) changeBranchGuarded(selected);
                  }}
                  disabled={isLoadingBranches || branches.length === 0}
                >
                  {branches.length === 0 ? <option value="">{tr("لا توجد فروع")}</option> : branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.branch_name}</option>)}
                </select>
              </label>
              {myCompanies.length > 0 && (
                <label className="block text-xs text-muted-foreground">
                  {tr("الشركة")}
                  <select
                    className="mt-1 block w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                    value={currentCompanyId ?? ""}
                    onChange={(e) => handleCompanyChange(Number(e.target.value))}
                    disabled={!!switchingCompanyName}
                  >
                    {myCompanies.map((c) => {
                      const expired = isCompanyExpired(c);
                      return <option key={c.id} value={c.id} disabled={c.status !== "approved" || expired}>{c.name}{expired ? tr(" (منتهي الاشتراك)") : c.status !== "approved" ? tr(" (غير جاهزة)") : ""}</option>;
                    })}
                  </select>
                </label>
              )}
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuItem onSelect={(event) => { event.preventDefault(); avatarInputRef.current?.click(); }} disabled={avatarSaving} className="justify-center cursor-pointer">
              <ImagePlus className="me-2 h-4 w-4" />
              {avatarSaving ? tr("جاري حفظ الصورة...") : tr("تغيير صورة المستخدم")}
            </DropdownMenuItem>

            <DropdownMenuItem onSelect={() => setChangePasswordOpen(true)} className="justify-center cursor-pointer">
              <KeyRound className="me-2 h-4 w-4" />
              {tr("تغيير كلمة المرور")}
            </DropdownMenuItem>

            <DropdownMenuItem onClick={() => onSettingsClick?.()} className="justify-center cursor-pointer">
              {tr("الإعدادات")}
            </DropdownMenuItem>

            <DropdownMenuItem onClick={() => router.push("/management/companies")} className="justify-center cursor-pointer">
              {tr("شركاتي")}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={handleLogout} className="text-red-600 justify-center cursor-pointer">
              {tr("تسجيل الخروج")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleAvatarChange} />
        {/* كلمة مرور دخول بوابة الإدارة (نفس نافذة "شركاتي") — تُكتب أيضاً في كل شركات المستخدم */}
        <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
      </div>

      {loggingOut && (
        <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center gap-3 bg-white/85 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-sm font-medium text-slate-700">{tr("جاري تسجيل الخروج يرجى الانتظار...")}</p>
        </div>
      )}

      {switchingCompanyName && (
        <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center gap-3 bg-white/85 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
          <p className="text-sm font-medium text-slate-700">
            {tr("جاري التحويل للشركة - ")}{switchingCompanyName}{tr(" - يرجى الانتظار ...")}
          </p>
        </div>
      )}

      <DailyExchangeRatesDialog
        open={exchangeRatesOpen}
        onOpenChange={setExchangeRatesOpen}
        onSaved={recheckExchangeRates}
      />
    </header>
  );
}



