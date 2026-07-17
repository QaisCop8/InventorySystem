"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import { ReportGenerator } from "@/components/ui/report-generator"
import { useRecordNavigation } from "@/hooks/use-record-navigation"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Users } from "lucide-react"

interface Customer {
  id?: string
  customer_code: string
  name: string
  mobile1: string
  mobile2: string
  whatsapp1: string
  whatsapp2: string
  city: string
  address: string
  email: string
  status: string
  business_nature: string
  salesman: string
  classification: string
  registration_date: string
  web_username: string
  web_password: string
  transaction_notes: string
  general_notes: string
}

const customerSummary = [
  { title: "إجمالي العملاء", value: "342", icon: Users, color: "text-primary" },
  { title: "العملاء نشطون", value: "298", icon: Users, color: "text-success" },
  { title: "العملاء جدد هذا الشهر", value: "23", icon: Users, color: "text-accent" },
  { title: "إجمالي المبيعات", value: "1,245,800 شيكل", icon: Users, color: "text-chart-2" },
]

const reportColumns = [
  { key: "customer_code", label: "رقم العميل", width: "120px" },
  { key: "name", label: "اسم العميل", width: "200px" },
  { key: "mobile1", label: "الموبايل", width: "120px" },
  { key: "city", label: "المدينة", width: "100px" },
  { key: "business_nature", label: "النشاط", width: "150px" },
  { key: "status", label: "الحالة", width: "80px" },
  { key: "salesman", label: "المندوب", width: "120px" },
  { key: "registration_date", label: "تاريخ التسجيل", width: "120px" },
]

function CustomersWithToolbar() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showReport, setShowReport] = useState(false)
  const [generatingNumber, setGeneratingNumber] = useState(false)

  const createNewCustomer = (): Customer => ({
    customer_code: "",
    name: "",
    mobile1: "",
    mobile2: "",
    whatsapp1: "",
    whatsapp2: "",
    city: "",
    address: "",
    email: "",
    status: "نشط",
    business_nature: "",
    salesman: "",
    classification: "",
    registration_date: new Date().toISOString().split("T")[0],
    web_username: "",
    web_password: "",
    transaction_notes: "",
    general_notes: "",
  })

  const {
    currentRecord,
    currentIndex,
    isNew,
    isLoading: navLoading,
    totalRecords,
    goToFirst,
    goToPrevious,
    goToNext,
    goToLast,
    createNew,
    saveRecord,
    deleteRecord,
    updateRecord,
    canSave,
    canDelete,
    isFirstRecord,
    isLastRecord,
  } = useRecordNavigation({
    data: customers,
    onSave: handleSaveCustomer,
    onDelete: handleDeleteCustomer,
    createNewRecord: createNewCustomer,
  })

  useEffect(() => {
    fetchCustomers()
  }, [])

  const fetchCustomers = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch("/api/customers")

      if (response.ok) {
        const data = await response.json()
        if (Array.isArray(data)) {
          setCustomers(data)
        } else if (data && Array.isArray(data.customers)) {
          setCustomers(data.customers)
        } else {
          setCustomers([])
          setError("تنسيق البيانات غير صحيح")
        }
      } else {
        setCustomers([])
        setError("فشل في تحميل بيانات العملاء")
      }
    } catch (error) {
      console.error("Error fetching customers:", error)
      setCustomers([])
      setError("خطأ في الاتصال بقاعدة البيانات")
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveCustomer(customer: Customer, isNewRecord: boolean): Promise<void> {
    if (!customer.name.trim()) {
      throw new Error("اسم العميل مطلوب")
    }

    if (!customer.customer_code.trim()) {
      throw new Error("رقم العميل مطلوب")
    }

    const method = isNewRecord ? "POST" : "PUT"
    const url = isNewRecord ? "/api/customers" : `/api/customers/${customer.id}`

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(customer),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.message || "فشل في حفظ بيانات العميل")
    }

    await fetchCustomers()
  }

  async function handleDeleteCustomer(customer: Customer): Promise<void> {
    if (!confirm("هل أنت متأكد من حذف هذا العميل؟")) {
      throw new Error("تم إلغاء العملية")
    }

    const response = await fetch(`/api/customers/${customer.id}`, {
      method: "DELETE",
    })

    if (!response.ok) {
      throw new Error("فشل في حذف العميل")
    }

    await fetchCustomers()
  }

  const generateNewCustomerNumber = async () => {
    try {
      setGeneratingNumber(true)
      const response = await fetch("/api/customers/generate-number")

      if (response.ok) {
        const data = await response.json()
        updateRecord({ customer_code: data.customerNumber })
      } else {
        setError("فشل في توليد رقم جديد")
      }
    } catch (error) {
      console.error("Error generating customer number:", error)
      setError("خطأ في توليد رقم العميل")
    } finally {
      setGeneratingNumber(false)
    }
  }

  const handleReport = () => {
    setShowReport(true)
  }

  const handleExportExcel = async () => {
    // This will be handled by the ReportGenerator component
    setShowReport(true)
  }

  const handlePrint = () => {
    // This will be handled by the ReportGenerator component
    setShowReport(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">جاري تحميل بيانات العملاء...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="text-lg text-red-600">{error}</div>
        <Button onClick={fetchCustomers} variant="outline">
          إعادة المحاولة
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-1.5">
        {customerSummary.map((item, index) => (
          <Card key={index} className="erp-card">
            <CardHeader className="pb-0.5 pt-1 px-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[10px] font-medium text-muted-foreground">{item.title}</CardTitle>
                <item.icon className={`h-3 w-3 ${item.color}`} />
              </div>
            </CardHeader>
            <CardContent className="pt-0.5 px-2 pb-1">
              <div className="text-base font-bold">{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Universal Toolbar */}
      <UniversalToolbar
        currentIndex={currentIndex}
        totalRecords={totalRecords}
        onFirst={goToFirst}
        onPrevious={goToPrevious}
        onNext={goToNext}
        onLast={goToLast}
        onNew={createNew}
        onSave={saveRecord}
        onDelete={deleteRecord}
        onReport={handleReport}
        onExportExcel={handleExportExcel}
        onPrint={handlePrint}
        isLoading={navLoading}
        canSave={canSave}
        canDelete={canDelete}
        isFirstRecord={isFirstRecord}
        isLastRecord={isLastRecord}
      />

      {/* Customer Form */}
      <Card className="erp-card">
        <CardHeader className="py-1 px-3">
          <CardTitle className="text-sm">
            {isNew ? "عميل جديد" : `تعديل العميل: ${currentRecord.customer_code}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-2">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-2 py-1.5 rounded mb-2 text-xs">{error}</div>
          )}
          <div className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
              <div>
                <Label htmlFor="customerId" className="text-xs">
                  رقم العميل *
                </Label>
                <div className="flex gap-1.5">
                  <Input
                    id="customerId"
                    placeholder="أدخل رقم العميل أو اضغط جديد"
                    value={currentRecord.customer_code}
                    onChange={(e) => updateRecord({ customer_code: e.target.value })}
                    className="h-7 text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={generateNewCustomerNumber}
                    disabled={generatingNumber}
                    className="whitespace-nowrap bg-transparent h-7 text-xs px-2"
                  >
                    {generatingNumber ? "جاري..." : "جديد"}
                  </Button>
                </div>
              </div>
              <div>
                <Label htmlFor="customerName" className="text-xs">
                  اسم العميل *
                </Label>
                <Input
                  id="customerName"
                  placeholder="أدخل اسم العميل"
                  required
                  value={currentRecord.name}
                  onChange={(e) => updateRecord({ name: e.target.value })}
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label htmlFor="mobile1" className="text-xs">
                  رقم الموبايل 1
                </Label>
                <Input
                  id="mobile1"
                  type="tel"
                  placeholder="0599123456"
                  value={currentRecord.mobile1}
                  onChange={(e) => updateRecord({ mobile1: e.target.value })}
                  className="h-7 text-xs"
                />
              </div>

              <div>
                <Label htmlFor="city" className="text-xs">
                  المدينة
                </Label>
                <Select value={currentRecord.city} onValueChange={(value) => updateRecord({ city: value })}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="اختر المدينة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="نابلس">نابلس</SelectItem>
                    <SelectItem value="رام الله">رام الله</SelectItem>
                    <SelectItem value="القدس">القدس</SelectItem>
                    <SelectItem value="الخليل">الخليل</SelectItem>
                    <SelectItem value="جنين">جنين</SelectItem>
                    <SelectItem value="طولكرم">طولكرم</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="status" className="text-xs">
                  الحالة
                </Label>
                <Select value={currentRecord.status} onValueChange={(value) => updateRecord({ status: value })}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="اختر الحالة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="نشط">نشط</SelectItem>
                    <SelectItem value="غير نشط">غير نشط</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <div>
                <Label htmlFor="transactionNotes" className="text-xs">
                  ملاحظات تظهر في الحركات
                </Label>
                <Textarea
                  id="transactionNotes"
                  placeholder="ملاحظات خاصة بالحركات والفواتير"
                  value={currentRecord.transaction_notes}
                  onChange={(e) => updateRecord({ transaction_notes: e.target.value })}
                  className="text-xs min-h-[40px]"
                  rows={2}
                />
              </div>
              <div>
                <Label htmlFor="generalNotes" className="text-xs">
                  ملاحظات عامة
                </Label>
                <Textarea
                  id="generalNotes"
                  placeholder="ملاحظات عامة عن العميل"
                  value={currentRecord.general_notes}
                  onChange={(e) => updateRecord({ general_notes: e.target.value })}
                  className="text-xs min-h-[40px]"
                  rows={2}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Generator */}
      <ReportGenerator
        title="تقرير العملاء"
        data={customers}
        columns={reportColumns}
        isOpen={showReport}
        onClose={() => setShowReport(false)}
      />
    </div>
  )
}

export default CustomersWithToolbar



