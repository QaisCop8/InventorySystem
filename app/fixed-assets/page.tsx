"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/components/auth/auth-context"
import { Archive, ArrowLeftRight, CalendarClock, CircleDollarSign, FilePlus2, Landmark, PackagePlus, Plus, Search, ShieldCheck, Trash2 } from "lucide-react"

type Row = Record<string, any>
const money = (value: unknown) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const today = () => new Date().toISOString().slice(0, 10)
const thisPeriod = () => today().slice(0, 7)

const emptyAsset = { asset_code: "", name: "", category_id: "", serial_number: "", supplier_account_id: "", purchase_invoice_no: "", purchase_date: today(), capitalization_date: today(), depreciation_start_date: today(), cost: "", salvage_value: "0", useful_life_months: "", depreciation_method: "straight_line", branch_id: "", department_id: "", cost_center_id: "", location_id: "", responsible_employee_id: "", store_id: "", project_id: "", currency_id: "", exchange_rate: "1", quantity: "1", notes: "", create_voucher: false }
const emptyCategory = { code: "", name: "", default_useful_life_months: "60", default_salvage_value: "0", default_depreciation_method: "straight_line", asset_account_id: "", accumulated_depreciation_account_id: "", depreciation_expense_account_id: "", gain_account_id: "", loss_account_id: "", notes: "" }

export default function FixedAssetsPage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const [assets, setAssets] = useState<Row[]>([])
  const [categories, setCategories] = useState<Row[]>([])
  const [runs, setRuns] = useState<Row[]>([])
  const [transfers, setTransfers] = useState<Row[]>([])
  const [disposals, setDisposals] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState("register")
  const [assetOpen, setAssetOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [transferAsset, setTransferAsset] = useState<Row | null>(null)
  const [disposeAsset, setDisposeAsset] = useState<Row | null>(null)
  const [card, setCard] = useState<Row | null>(null)
  const [assetForm, setAssetForm] = useState(emptyAsset)
  const [categoryForm, setCategoryForm] = useState(emptyCategory)
  const [transferForm, setTransferForm] = useState({ transfer_date: today(), branch_id: "", department_id: "", cost_center_id: "", location_id: "", responsible_employee_id: "", store_id: "", project_id: "", reason: "" })
  const [disposalForm, setDisposalForm] = useState({ disposal_date: today(), sale_price: "0", proceeds_account_id: "", reason: "sale" })
  const [period, setPeriod] = useState(thisPeriod())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const responses = await Promise.all([
        fetch("/api/fixed-assets", { cache: "no-store" }),
        fetch("/api/fixed-assets/categories", { cache: "no-store" }),
        fetch("/api/fixed-assets/depreciation", { cache: "no-store" }),
        fetch("/api/fixed-assets/transfers", { cache: "no-store" }),
        fetch("/api/fixed-assets/disposals", { cache: "no-store" }),
      ])
      const payloads = await Promise.all(responses.map(response => response.json()))
      const failedIndex = responses.findIndex(response => !response.ok)
      if (failedIndex >= 0) throw new Error(payloads[failedIndex]?.error || "تعذر تحميل بيانات الأصول")
      setAssets(payloads[0]); setCategories(payloads[1]); setRuns(payloads[2]); setTransfers(payloads[3]); setDisposals(payloads[4])
    } catch (error) {
      toast({ title: "تعذر تحميل الأصول الثابتة", description: error instanceof Error ? error.message : "حدث خطأ", variant: "destructive" })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { void load() }, [load])

  const postedLines = useMemo(() => runs.filter(run => run.status === "posted").flatMap(run => run.lines || []), [runs])
  const activeAssets = assets.filter(asset => asset.status === "active")
  const totalCost = activeAssets.reduce((sum, asset) => sum + Number(asset.cost || 0) + Number(asset.additions || 0), 0)
  const accumulated = activeAssets.reduce((sum, asset) => sum + Number(asset.accumulated_depreciation || 0), 0)
  const netBookValue = Math.max(0, totalCost - accumulated)
  const monthlyDepreciation = activeAssets.reduce((sum, asset) => sum + Math.max(0, Number(asset.cost || 0) + Number(asset.additions || 0) - Number(asset.salvage_value || 0) - Number(asset.accumulated_depreciation || 0)) / Math.max(1, Number(asset.useful_life_months || 60)), 0)
  const filteredAssets = assets.filter(asset => `${asset.asset_code} ${asset.name} ${asset.serial_number || ""} ${asset.category_name || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  const submit = async (url: string, body: Row, success: string, after = load) => {
    setBusy(true)
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-user-id": String(user?.id || "") }, body: JSON.stringify(body) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر حفظ البيانات")
      toast({ title: success })
      await after()
      return data
    } catch (error) {
      toast({ title: "تعذر إكمال العملية", description: error instanceof Error ? error.message : "حدث خطأ", variant: "destructive" })
      return null
    } finally { setBusy(false) }
  }

  const saveAsset = async () => {
    const result = await submit("/api/fixed-assets", { ...assetForm, category_id: Number(assetForm.category_id), cost: Number(assetForm.cost), salvage_value: Number(assetForm.salvage_value), useful_life_months: Number(assetForm.useful_life_months), quantity: Number(assetForm.quantity), exchange_rate: Number(assetForm.exchange_rate) }, "تم تسجيل الأصل")
    if (result) { setAssetOpen(false); setAssetForm(emptyAsset) }
  }
  const saveCategory = async () => {
    const result = await submit("/api/fixed-assets/categories", { ...categoryForm, default_useful_life_months: Number(categoryForm.default_useful_life_months), default_salvage_value: Number(categoryForm.default_salvage_value) }, "تم إنشاء تصنيف الأصل", load)
    if (result) { setCategoryOpen(false); setCategoryForm(emptyCategory) }
  }
  const calculateDepreciation = async () => {
    const result = await submit("/api/fixed-assets/depreciation", { period, posting_date: `${period}-01`, create_voucher: true, post_immediately: true }, `تم احتساب إهلاك ${period}`)
    if (result) setTab("depreciation")
  }
  const saveTransfer = async () => {
    if (!transferAsset) return
    const result = await submit("/api/fixed-assets/transfers", { ...transferForm, asset_id: transferAsset.id }, "تم تسجيل تحويل الأصل")
    if (result) setTransferAsset(null)
  }
  const saveDisposal = async () => {
    if (!disposeAsset) return
    const result = await submit("/api/fixed-assets/disposals", { ...disposalForm, asset_id: disposeAsset.id, sale_price: Number(disposalForm.sale_price), proceeds_account_id: Number(disposalForm.proceeds_account_id) }, "تم استبعاد الأصل وإنشاء القيد")
    if (result) setDisposeAsset(null)
  }
  const showAssetCard = async (asset: Row) => {
    const response = await fetch(`/api/fixed-assets/${asset.id}`, { cache: "no-store" })
    const data = await response.json()
    if (!response.ok) { toast({ title: "تعذر تحميل بطاقة الأصل", description: data.error, variant: "destructive" }); return }
    setCard(data)
  }

  return <main dir="rtl" className="min-h-full space-y-5 bg-background p-4 text-foreground md:p-6">
    <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-primary"><Landmark className="size-4" />الأصول والرقابة المالية</div><h1 className="text-2xl font-bold">الأصول الثابتة</h1><p className="mt-1 text-sm text-muted-foreground">سجل الأصول، الإهلاك الشهري، التحويلات والاستبعادات المرتبطة بالدفتر العام.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setCategoryOpen(true)}><ShieldCheck className="ml-2 size-4" />تصنيف جديد</Button><Button onClick={() => setAssetOpen(true)}><Plus className="ml-2 size-4" />تسجيل أصل</Button></div>
    </header>

    <section className="grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<Landmark className="size-4" />} label="تكلفة الأصول النشطة" value={money(totalCost)} detail={`${assets.length} أصل مسجل`} />
      <Metric icon={<Archive className="size-4" />} label="الإهلاك المتراكم" value={money(accumulated)} detail={`${runs.filter(run => run.status === "posted").length} تجميع مرحل`} />
      <Metric icon={<CircleDollarSign className="size-4" />} label="صافي القيمة الدفترية" value={money(netBookValue)} detail="التكلفة ناقص الإهلاك المرحل" />
      <Metric icon={<CalendarClock className="size-4" />} label="الإهلاك الشهري التقديري" value={money(monthlyDepreciation)} detail="حسب طريقة القسط الثابت" />
    </section>

    <Tabs value={tab} onValueChange={setTab} dir="rtl" className="space-y-4">
      <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg border border-border bg-muted/60 p-1">
        <TabsTrigger value="register" className="min-w-max rounded-md">سجل الأصول</TabsTrigger>
        <TabsTrigger value="categories" className="min-w-max rounded-md">التصنيفات</TabsTrigger>
        <TabsTrigger value="depreciation" className="min-w-max rounded-md">الإهلاك</TabsTrigger>
        <TabsTrigger value="movements" className="min-w-max rounded-md">التحويلات والاستبعاد</TabsTrigger>
      </TabsList>

      <TabsContent value="register" className="space-y-4">
        <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">سجل الأصول</h2><p className="text-xs text-muted-foreground">القيمة الدفترية الحالية والحالة والموقع التنظيمي.</p></div><div className="relative w-full sm:max-w-sm"><Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pr-9" value={query} onChange={event => setQuery(event.target.value)} placeholder="بحث بالكود أو الاسم أو الرقم التسلسلي" /></div></div>
        <div className="overflow-x-auto border border-border"><table className="w-full min-w-[900px] text-sm"><thead className="bg-muted text-xs text-muted-foreground"><tr>{["الكود","الأصل","التصنيف","تاريخ الرسملة","التكلفة","الإهلاك","صافي القيمة","الفرع / مركز التكلفة","الحالة",""].map(label => <th key={label} className="px-3 py-3 text-right font-semibold">{label}</th>)}</tr></thead><tbody>{filteredAssets.map(asset => {const depreciated=Number(asset.accumulated_depreciation||0);const cost=Number(asset.cost||0)+Number(asset.additions||0);return <tr key={asset.id} className="border-t border-border hover:bg-muted/30"><td className="px-3 py-3 font-mono text-xs">{asset.asset_code}</td><td className="px-3 py-3"><button className="text-right font-semibold hover:text-primary" onClick={() => void showAssetCard(asset)}>{asset.name}</button><span className="mt-1 block text-xs text-muted-foreground">{asset.serial_number || "بدون رقم تسلسلي"}</span></td><td className="px-3 py-3">{asset.category_name}</td><td className="px-3 py-3 tabular-nums">{String(asset.capitalization_date || "—").slice(0,10)}</td><td className="px-3 py-3 tabular-nums">{money(cost)}</td><td className="px-3 py-3 tabular-nums">{money(depreciated)}</td><td className="px-3 py-3 font-semibold tabular-nums">{money(Math.max(0,cost-depreciated))}</td><td className="px-3 py-3 text-xs">{asset.branch_name || "—"}<span className="block text-muted-foreground">{asset.cost_center_name || "—"}</span></td><td className="px-3 py-3"><Badge variant={asset.status==="active"?"default":"secondary"}>{asset.status==="active"?"نشط":asset.status==="disposed"?"مستبعد":asset.status}</Badge></td><td className="px-3 py-3"><div className="flex gap-1"><Button size="sm" variant="ghost" title="تحويل" disabled={asset.status!=="active"} onClick={()=>{setTransferAsset(asset);setTransferForm({transfer_date:today(),branch_id:String(asset.branch_id||""),department_id:String(asset.department_id||""),cost_center_id:String(asset.cost_center_id||""),location_id:String(asset.location_id||""),responsible_employee_id:String(asset.responsible_employee_id||""),store_id:String(asset.store_id||""),project_id:String(asset.project_id||""),reason:""})}}><ArrowLeftRight className="size-4"/></Button><Button size="sm" variant="ghost" title="استبعاد" disabled={asset.status!=="active"} onClick={()=>setDisposeAsset(asset)}><Archive className="size-4"/></Button></div></td></tr>})}</tbody></table>{!loading&&!filteredAssets.length&&<p className="p-12 text-center text-sm text-muted-foreground">لا توجد أصول مطابقة.</p>}{loading&&<p className="p-12 text-center text-sm text-muted-foreground">جاري تحميل سجل الأصول...</p>}</div>
      </TabsContent>

      <TabsContent value="categories" className="space-y-4"><div className="flex items-end justify-between border-b border-border pb-3"><div><h2 className="font-semibold">تصنيفات الأصول</h2><p className="text-xs text-muted-foreground">إعداد العمر والحسابات الافتراضية لكل فئة.</p></div><Button size="sm" onClick={()=>setCategoryOpen(true)}><Plus className="ml-2 size-4"/>تصنيف جديد</Button></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{categories.map(category=><Card key={category.id} className="rounded-lg"><CardContent className="space-y-3 p-4"><div className="flex justify-between gap-3"><div><Badge variant="outline" className="font-mono">{category.code}</Badge><h3 className="mt-2 font-bold">{category.name}</h3></div><ShieldCheck className="size-5 text-primary"/></div><div className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs"><Info label="العمر الإنتاجي" value={`${category.default_useful_life_months} شهر`}/><Info label="طريقة الإهلاك" value={category.default_depreciation_method==="straight_line"?"القسط الثابت":"الرصيد المتناقص"}/><Info label="حساب الأصل" value={category.asset_account_id||"غير معرف"}/><Info label="مصروف الإهلاك" value={category.depreciation_expense_account_id||"غير معرف"}/></div></CardContent></Card>)}</div>{!categories.length&&<p className="border border-dashed p-10 text-center text-sm text-muted-foreground">أضف تصنيفاً أولاً لضبط العمر الإنتاجي وحسابات الإهلاك.</p>}</TabsContent>

      <TabsContent value="depreciation" className="space-y-4"><div className="flex flex-col gap-4 border-b border-border pb-4 md:flex-row md:items-end md:justify-between"><div><h2 className="font-semibold">الإهلاك الشهري</h2><p className="text-xs text-muted-foreground">إنشاء تجميع شهري وقيده في دفتر الأستاذ باستخدام حسابات التصنيفات.</p></div><div className="flex flex-wrap items-end gap-2"><div><Label className="mb-1 block text-xs">الفترة</Label><Input type="month" value={period} onChange={event=>setPeriod(event.target.value)}/></div><Button onClick={()=>void calculateDepreciation()} disabled={busy||!assets.some(asset=>asset.status==="active")}><FilePlus2 className="ml-2 size-4"/>احتساب وترحيل</Button></div></div><div className="overflow-x-auto border border-border"><table className="w-full min-w-[700px] text-sm"><thead className="bg-muted text-xs text-muted-foreground"><tr>{["الفترة","تاريخ القيد","عدد الأصول","إجمالي الإهلاك","الحالة","رقم القيد"].map(x=><th key={x} className="px-3 py-3 text-right">{x}</th>)}</tr></thead><tbody>{runs.map(run=><tr key={run.id} className="border-t border-border"><td className="px-3 py-3 font-semibold">{run.period}</td><td className="px-3 py-3">{String(run.posting_date).slice(0,10)}</td><td className="px-3 py-3">{run.lines?.length||0}</td><td className="px-3 py-3 font-semibold tabular-nums">{money(run.total_depreciation)}</td><td className="px-3 py-3"><Badge variant={run.status==="posted"?"default":"secondary"}>{run.status==="posted"?"مرحّل":"مسودة"}</Badge></td><td className="px-3 py-3 font-mono text-xs">{run.voucher_id||"—"}</td></tr>)}</tbody></table>{!runs.length&&<p className="p-10 text-center text-sm text-muted-foreground">لا توجد تجميعات إهلاك.</p>}</div></TabsContent>

      <TabsContent value="movements" className="space-y-5"><section><h2 className="mb-3 font-semibold">تحويلات الأصول</h2><MovementTable rows={transfers} type="transfer"/></section><section><h2 className="mb-3 font-semibold">الاستبعادات</h2><MovementTable rows={disposals} type="disposal"/></section></TabsContent>
    </Tabs>

    <Dialog open={assetOpen} onOpenChange={setAssetOpen}><DialogContent dir="rtl" className="max-h-[90dvh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>تسجيل أصل ثابت</DialogTitle><DialogDescription>أدخل بيانات الأصل والتواريخ التنظيمية والمالية.</DialogDescription></DialogHeader><div className="grid gap-3 py-2 sm:grid-cols-2 lg:grid-cols-3">{[
      ["كود الأصل","asset_code"],["اسم الأصل","name"],["الرقم التسلسلي","serial_number"],["المورد (رقم الحساب)","supplier_account_id"],["رقم فاتورة الشراء","purchase_invoice_no"],["الكمية","quantity"],["التكلفة","cost"],["القيمة المتبقية","salvage_value"],["العمر الإنتاجي (شهر)","useful_life_months"],["تاريخ الشراء","purchase_date"],["تاريخ الرسملة","capitalization_date"],["بدء الإهلاك","depreciation_start_date"],["الفرع","branch_id"],["القسم","department_id"],[" مركز التكلفة","cost_center_id"],["الموقع","location_id"],["الموظف المسؤول","responsible_employee_id"],["المخزن","store_id"],["المشروع","project_id"],["العملة","currency_id"],["سعر الصرف","exchange_rate"],
    ].map(([label,key])=><Field key={key} label={label}><Input type={key.includes("date")?"date":"text"} inputMode={/[0-9]|cost|value|months|quantity|rate|_id/.test(key)?"decimal":"text"} value={(assetForm as any)[key]} onChange={event=>setAssetForm(current=>({...current,[key]:event.target.value}))}/></Field>)}<Field label="التصنيف"><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={assetForm.category_id} onChange={event=>{const category=categories.find(row=>Number(row.id)===Number(event.target.value));setAssetForm(current=>({...current,category_id:event.target.value,useful_life_months:String(category?.default_useful_life_months||current.useful_life_months),salvage_value:String(category?.default_salvage_value??current.salvage_value),depreciation_method:category?.default_depreciation_method||current.depreciation_method}))}}><option value="">اختر التصنيف</option>{categories.map(category=><option key={category.id} value={category.id}>{category.code} — {category.name}</option>)}</select></Field><Field label="طريقة الإهلاك"><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={assetForm.depreciation_method} onChange={event=>setAssetForm(current=>({...current,depreciation_method:event.target.value}))}><option value="straight_line">القسط الثابت</option><option value="declining_balance">الرصيد المتناقص</option></select></Field><label className="flex items-center gap-2 rounded-md border border-border p-3 text-sm sm:col-span-2"><input type="checkbox" checked={assetForm.create_voucher} onChange={event=>setAssetForm(current=>({...current,create_voucher:event.target.checked}))}/>إنشاء قيد اقتناء (مدين حساب الأصل / دائن المورد)</label><Field label="ملاحظات"><Input value={assetForm.notes} onChange={event=>setAssetForm(current=>({...current,notes:event.target.value}))}/></Field></div><DialogFooter><Button variant="outline" onClick={()=>setAssetOpen(false)}>إلغاء</Button><Button disabled={busy||!categories.length} onClick={()=>void saveAsset()}>{busy?"جاري الحفظ...":"حفظ الأصل"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}><DialogContent dir="rtl" className="max-w-2xl"><DialogHeader><DialogTitle>تصنيف أصل جديد</DialogTitle><DialogDescription>تحدد حسابات دفتر الأستاذ التي تستخدمها الأصول من هذه الفئة.</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2">{[["الكود","code"],["اسم التصنيف","name"],["العمر الإنتاجي بالأشهر","default_useful_life_months"],["القيمة المتبقية الافتراضية","default_salvage_value"],["حساب الأصل","asset_account_id"],["حساب الإهلاك المتراكم","accumulated_depreciation_account_id"],["مصروف الإهلاك","depreciation_expense_account_id"],["حساب ربح الاستبعاد","gain_account_id"],["حساب خسارة الاستبعاد","loss_account_id"],["ملاحظات","notes"]].map(([label,key])=><Field key={key} label={label}><Input value={(categoryForm as any)[key]} onChange={event=>setCategoryForm(current=>({...current,[key]:event.target.value}))}/></Field>)}<Field label="طريقة الإهلاك"><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={categoryForm.default_depreciation_method} onChange={event=>setCategoryForm(current=>({...current,default_depreciation_method:event.target.value}))}><option value="straight_line">القسط الثابت</option><option value="declining_balance">الرصيد المتناقص</option></select></Field></div><DialogFooter><Button variant="outline" onClick={()=>setCategoryOpen(false)}>إلغاء</Button><Button disabled={busy} onClick={()=>void saveCategory()}>حفظ التصنيف</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(transferAsset)} onOpenChange={open=>!open&&setTransferAsset(null)}><DialogContent dir="rtl" className="max-w-2xl"><DialogHeader><DialogTitle>تحويل أصل</DialogTitle><DialogDescription>{transferAsset?.asset_code} — {transferAsset?.name}. لا يغيّر التحويل التكلفة أو الإهلاك المتراكم.</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2">{[["تاريخ التحويل","transfer_date"],["الفرع","branch_id"],["القسم","department_id"],[" مركز التكلفة","cost_center_id"],["الموقع","location_id"],["الموظف المسؤول","responsible_employee_id"],["المخزن","store_id"],["المشروع","project_id"],["السبب","reason"]].map(([label,key])=><Field key={key} label={label}><Input type={key==="transfer_date"?"date":"text"} value={(transferForm as any)[key]} onChange={event=>setTransferForm(current=>({...current,[key]:event.target.value}))}/></Field>)}</div><DialogFooter><Button variant="outline" onClick={()=>setTransferAsset(null)}>إلغاء</Button><Button disabled={busy} onClick={()=>void saveTransfer()}>تسجيل التحويل</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(disposeAsset)} onOpenChange={open=>!open&&setDisposeAsset(null)}><DialogContent dir="rtl" className="max-w-xl"><DialogHeader><DialogTitle>استبعاد أصل</DialogTitle><DialogDescription>{disposeAsset?.asset_code} — {disposeAsset?.name}. سيتم احتساب صافي القيمة وإنشاء قيد استبعاد متوازن.</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><Field label="تاريخ الاستبعاد"><Input type="date" value={disposalForm.disposal_date} onChange={event=>setDisposalForm(current=>({...current,disposal_date:event.target.value}))}/></Field><Field label="نوع الاستبعاد"><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={disposalForm.reason} onChange={event=>setDisposalForm(current=>({...current,reason:event.target.value}))}><option value="sale">بيع</option><option value="scrap">خردة</option><option value="donation">تبرع</option><option value="theft">فقد / سرقة</option><option value="write_off">شطب</option></select></Field><Field label="متحصلات البيع"><Input inputMode="decimal" value={disposalForm.sale_price} onChange={event=>setDisposalForm(current=>({...current,sale_price:event.target.value}))}/></Field><Field label="حساب المتحصلات"><Input inputMode="numeric" value={disposalForm.proceeds_account_id} onChange={event=>setDisposalForm(current=>({...current,proceeds_account_id:event.target.value}))}/></Field></div><DialogFooter><Button variant="outline" onClick={()=>setDisposeAsset(null)}>إلغاء</Button><Button variant="destructive" disabled={busy} onClick={()=>void saveDisposal()}>استبعاد وإنشاء القيد</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(card)} onOpenChange={open=>!open&&setCard(null)}><DialogContent dir="rtl" className="max-h-[90dvh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>بطاقة الأصل · {card?.asset_code}</DialogTitle><DialogDescription>{card?.name} · {card?.category_name}</DialogDescription></DialogHeader><div className="grid gap-2 border-y border-border py-4 sm:grid-cols-3"><Info label="التكلفة" value={money(card?.cost)}/><Info label="القيمة المتبقية" value={money(card?.salvage_value)}/><Info label="العمر الإنتاجي" value={`${card?.useful_life_months||0} شهر`}/><Info label="تاريخ الشراء" value={String(card?.purchase_date||"—").slice(0,10)}/><Info label="تاريخ الرسملة" value={String(card?.capitalization_date||"—").slice(0,10)}/><Info label="بدء الإهلاك" value={String(card?.depreciation_start_date||"—").slice(0,10)}/></div><h3 className="font-semibold">الحركات والإهلاك</h3><div className="max-h-80 overflow-auto border border-border"><table className="w-full text-sm"><thead className="bg-muted text-xs"><tr><th className="p-2 text-right">التاريخ</th><th className="p-2 text-right">الحركة</th><th className="p-2 text-right">المبلغ</th><th className="p-2 text-right">البيان</th></tr></thead><tbody>{[...(card?.transactions||[]).map((row:Row)=>({...row,description:row.description})),...(card?.depreciation||[]).map((row:Row)=>({transaction_date:row.depreciation_date,transaction_type:`إهلاك ${row.period}`,amount:row.depreciation_amount,description:row.run_status==="posted"?`قيد ${row.voucher_id||""}`:"مسودة"}))].sort((a,b)=>String(b.transaction_date).localeCompare(String(a.transaction_date))).map((row:Row,index:number)=><tr key={`${row.transaction_type}-${index}`} className="border-t border-border"><td className="p-2">{String(row.transaction_date||"").slice(0,10)}</td><td className="p-2">{row.transaction_type}</td><td className="p-2 tabular-nums">{money(row.amount)}</td><td className="p-2 text-muted-foreground">{row.description||"—"}</td></tr>)}</tbody></table></div><DialogFooter><Button variant="outline" onClick={()=>setCard(null)}>إغلاق</Button></DialogFooter></DialogContent></Dialog>
  </main>
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <div className="bg-card p-4"><div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{label}</span><span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">{icon}</span></div><strong className="mt-3 block text-xl tabular-nums">{value}</strong><span className="mt-1 block text-[11px] text-muted-foreground">{detail}</span></div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="min-w-0 space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div> }
function Info({ label, value }: { label: string; value: React.ReactNode }) { return <div className="min-w-0"><span className="block text-xs text-muted-foreground">{label}</span><strong className="mt-1 block truncate text-sm">{value}</strong></div> }
function MovementTable({ rows, type }: { rows: Row[]; type: "transfer" | "disposal" }) {
  const fields = type === "transfer" ? ["transfer_date", "asset_code", "asset_name", "reason"] : ["disposal_date", "asset_code", "asset_name", "sale_price", "book_value", "gain_loss", "voucher_id"]
  const labels: Record<string, string> = { transfer_date: "التاريخ", disposal_date: "التاريخ", asset_code: "الكود", asset_name: "الأصل", reason: "السبب", sale_price: "المتحصلات", book_value: "صافي القيمة", gain_loss: "ربح / خسارة", voucher_id: "رقم القيد" }
  return <div className="overflow-x-auto border border-border"><table className="w-full min-w-[650px] text-sm"><thead className="bg-muted text-xs"><tr>{fields.map(field=><th key={field} className="p-3 text-right">{labels[field]}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id} className="border-t border-border">{fields.map(field=><td key={field} className="p-3">{["sale_price","book_value","gain_loss"].includes(field)?money(row[field]):String(row[field]??"—").slice(0,40)}</td>)}</tr>)}</tbody></table>{!rows.length&&<p className="p-8 text-center text-xs text-muted-foreground">لا توجد حركات مسجلة.</p>}</div>
}
