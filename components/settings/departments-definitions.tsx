"use client"

import { tr } from "@/lib/i18n"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus } from "lucide-react"

const branches = [
  {
    id: "B001",
    name: "الفرع الرئيسي",
    address: "نابلس - المركز",
    manager: "أحمد محمد",
  },
]

const departments = [
  {
    id: "D001",
    name: "المبيعات",
    branch: "الفرع الرئيسي",
    manager: "محمد أحمد",
  },
]

const cities = [
  { id: "C001", name: "نابلس" },
  { id: "C002", name: "رام الله" },
  { id: "C003", name: "الخليل" },
]

const warehouses = [
  { id: "W001", name: "المستودع الرئيسي", departments: ["المبيعات", "المشتريات"], printer: "HP LaserJet" },
  { id: "W002", name: "مستودع الفرع الثاني", departments: ["المبيعات"], printer: "Canon Printer" },
]

const customerCategories = [
  { id: "CC001", name: "العملاء VIP", customers: ["أحمد محمد", "علي حسن"] },
  { id: "CC002", name: "العملاء عاديين", customers: ["محمد علي", "خالد أحمد"] },
]

const supplierCategories = [
  { id: "SC001", name: "موردين محليين", suppliers: ["شركة الأمل", "مؤسسة النور"] },
  { id: "SC002", name: "موردين دوليين", suppliers: ["شركة عالمية", "مؤسسة دولية"] },
]

const productCategories = [
  { id: "PC001", name: "إلكترونيات", products: ["لابتوب", "موبايل"] },
  { id: "PC002", name: "ملابس", products: ["قميص", "بنطلون"] },
]

const currencies = [
  { code: "USD", name: "دولار أمريكي", sellPrice: 3.65, buyPrice: 3.6, exchangeRate: 3.62 },
  { code: "EUR", name: "يورو", sellPrice: 4.1, buyPrice: 4.05, exchangeRate: 4.07 },
  { code: "JOD", name: "دينار أردني", sellPrice: 5.15, buyPrice: 5.1, exchangeRate: 5.12 },
]

function DepartmentsDefinitions() {
  const [showBranchForm, setShowBranchForm] = useState(false)
  const [showDepartmentForm, setShowDepartmentForm] = useState(false)
  const [activeTab, setActiveTab] = useState("departments")

  return (
    <div className="p-6">
      <h1 className="text-2xl font-heading font-bold text-primary mb-6">{tr("الأقسام والفروع والتعريفات")}</h1>

      <div className="flex gap-4 mb-6 border-b">
        <button
          onClick={() => setActiveTab("departments")}
          className={`px-4 py-2 font-heading ${activeTab === "departments" ? "border-b-2 border-primary text-primary" : "text-gray-600"}`}
        >
          {tr("الأقسام والفروع")}
        </button>
        <button
          onClick={() => setActiveTab("definitions")}
          className={`px-4 py-2 font-heading ${activeTab === "definitions" ? "border-b-2 border-primary text-primary" : "text-gray-600"}`}
        >
          {tr("التعريفات")}
        </button>
      </div>

      {activeTab === "departments" && (
        <div className="flex gap-5">
          {/* Branches Section */}
          <div className="flex-1">
            <h2 className="text-lg font-heading font-semibold mb-5">{tr("الفروع")}</h2>
            <Button className="erp-btn-primary mb-5" onClick={() => setShowBranchForm(!showBranchForm)}>
              <Plus className="h-4 w-4 ms-2" />
              {tr("إضافة فرع جديد")}
            </Button>

            {showBranchForm && (
              <div className="bg-white rounded-lg border p-6 mb-6">
                <div className="mb-6 pb-5 border-b-2 border-gray-200">
                  <h2 className="text-xl font-heading font-semibold text-gray-800">{tr("بيانات الفرع")}</h2>
                </div>
                <form className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <Label className="erp-label">{tr("رقم الفرع")}</Label>
                      <Input placeholder={tr("يتم توليده تلقائياً")} readOnly className="erp-input bg-gray-50" />
                    </div>
                    <div>
                      <Label className="erp-label">{tr("اسم الفرع *")}</Label>
                      <Input required className="erp-input" />
                    </div>
                    <div>
                      <Label className="erp-label">{tr("العنوان")}</Label>
                      <Input className="erp-input" />
                    </div>
                    <div>
                      <Label className="erp-label">{tr("مسؤول الفرع")}</Label>
                      <Select>
                        <SelectTrigger className="erp-input">
                          <SelectValue placeholder={tr("اختر المسؤول")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ahmed">{tr("أحمد محمد")}</SelectItem>
                          <SelectItem value="ali">{tr("علي حسن")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="erp-label">{tr("الأقسام المرتبطة بالفرع")}</Label>
                    <div className="flex flex-wrap gap-4 mt-2">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="rounded" />
                        <span className="text-sm">{tr("المبيعات")}</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="rounded" />
                        <span className="text-sm">{tr("المشتريات")}</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="rounded" />
                        <span className="text-sm">{tr("المحاسبة")}</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="rounded" />
                        <span className="text-sm">{tr("المستودعات")}</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-5 border-t border-gray-200">
                    <Button type="button" variant="outline" onClick={() => setShowBranchForm(false)}>
                      {tr("إلغاء")}
                    </Button>
                    <Button type="submit" className="erp-btn-primary">
                      {tr("حفظ البيانات")}
                    </Button>
                  </div>
                </form>
              </div>
            )}

            <div className="bg-white rounded-lg border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("رقم الفرع")}</th>
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("اسم الفرع")}</th>
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("العنوان")}</th>
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("المسؤول")}</th>
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("الإجراءات")}</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map((branch) => (
                    <tr key={branch.id} className="hover:bg-gray-50">
                      <td className="p-3 text-gray-600">{branch.id}</td>
                      <td className="p-3 text-gray-600">{branch.name}</td>
                      <td className="p-3 text-gray-600">{branch.address}</td>
                      <td className="p-3 text-gray-600">{branch.manager}</td>
                      <td className="p-3">
                        <Button variant="outline" size="sm">
                          {tr("تعديل")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Departments Section */}
          <div className="flex-1">
            <h2 className="text-lg font-heading font-semibold mb-5">{tr("الأقسام")}</h2>
            <Button className="erp-btn-primary mb-5" onClick={() => setShowDepartmentForm(!showDepartmentForm)}>
              <Plus className="h-4 w-4 ms-2" />
              {tr("إضافة قسم جديد")}
            </Button>

            {showDepartmentForm && (
              <div className="bg-white rounded-lg border p-6 mb-6">
                <div className="mb-6 pb-5 border-b-2 border-gray-200">
                  <h2 className="text-xl font-heading font-semibold text-gray-800">{tr("بيانات القسم")}</h2>
                </div>
                <form className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <Label className="erp-label">{tr("رقم القسم")}</Label>
                      <Input placeholder={tr("يتم توليده تلقائياً")} readOnly className="erp-input bg-gray-50" />
                    </div>
                    <div>
                      <Label className="erp-label">{tr("اسم القسم *")}</Label>
                      <Input required className="erp-input" />
                    </div>
                    <div>
                      <Label className="erp-label">{tr("تابع لفرع")}</Label>
                      <Select>
                        <SelectTrigger className="erp-input">
                          <SelectValue placeholder={tr("اختر الفرع")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="main">{tr("الفرع الرئيسي")}</SelectItem>
                          <SelectItem value="nablus">{tr("فرع نابلس")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="erp-label">{tr("مسؤول القسم")}</Label>
                      <Select>
                        <SelectTrigger className="erp-input">
                          <SelectValue placeholder={tr("اختر المسؤول")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mohamed">{tr("محمد أحمد")}</SelectItem>
                          <SelectItem value="ali">{tr("علي حسن")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="erp-label">{tr("الموظفين التابعين للقسم")}</Label>
                    <select multiple className="w-full h-24 p-2 border border-gray-300 rounded-md mt-2">
                      <option>{tr("محمد أحمد")}</option>
                      <option>{tr("علي حسن")}</option>
                      <option>{tr("أحمد علي")}</option>
                      <option>{tr("خالد محمد")}</option>
                    </select>
                  </div>

                  <div className="flex justify-end gap-3 pt-5 border-t border-gray-200">
                    <Button type="button" variant="outline" onClick={() => setShowDepartmentForm(false)}>
                      {tr("إلغاء")}
                    </Button>
                    <Button type="submit" className="erp-btn-primary">
                      {tr("حفظ البيانات")}
                    </Button>
                  </div>
                </form>
              </div>
            )}

            <div className="bg-white rounded-lg border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("رقم القسم")}</th>
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("اسم القسم")}</th>
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("الفرع")}</th>
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("المسؤول")}</th>
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("الإجراءات")}</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((dept) => (
                    <tr key={dept.id} className="hover:bg-gray-50">
                      <td className="p-3 text-gray-600">{dept.id}</td>
                      <td className="p-3 text-gray-600">{dept.name}</td>
                      <td className="p-3 text-gray-600">{dept.branch}</td>
                      <td className="p-3 text-gray-600">{dept.manager}</td>
                      <td className="p-3">
                        <Button variant="outline" size="sm">
                          {tr("تعديل")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "definitions" && (
        <div className="space-y-8">
          {/* Cities Section */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-heading font-semibold mb-4">{tr("المدن")}</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("الرقم")}</th>
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("اسم المدينة")}</th>
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("الإجراءات")}</th>
                  </tr>
                </thead>
                <tbody>
                  {cities.map((city) => (
                    <tr key={city.id} className="hover:bg-gray-50">
                      <td className="p-3 text-gray-600">{city.id}</td>
                      <td className="p-3 text-gray-600">{city.name}</td>
                      <td className="p-3">
                        <Button variant="outline" size="sm">
                          {tr("تعديل")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Warehouses Section */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-heading font-semibold mb-4">{tr("المستودعات")}</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("رقم المستودع")}</th>
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("اسم المستودع")}</th>
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("الأقسام التابعة")}</th>
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("الطابعة")}</th>
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("الإجراءات")}</th>
                  </tr>
                </thead>
                <tbody>
                  {warehouses.map((warehouse) => (
                    <tr key={warehouse.id} className="hover:bg-gray-50">
                      <td className="p-3 text-gray-600">{warehouse.id}</td>
                      <td className="p-3 text-gray-600">{warehouse.name}</td>
                      <td className="p-3 text-gray-600">{warehouse.departments.join(", ")}</td>
                      <td className="p-3 text-gray-600">{warehouse.printer}</td>
                      <td className="p-3">
                        <Button variant="outline" size="sm">
                          {tr("تعديل")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Classifications Section */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-heading font-semibold mb-4">{tr("التصنيفات")}</h2>

            {/* Customer Classifications */}
            <div className="mb-6">
              <h3 className="text-md font-heading font-medium mb-3">{tr("تصنيفات العملاء")}</h3>
              <div className="overflow-x-auto">
                <table className="w-full mb-4">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("الرقم")}</th>
                      <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("اسم التصنيف")}</th>
                      <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("العملاء التابعين")}</th>
                      <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("الإجراءات")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerCategories.map((category) => (
                      <tr key={category.id} className="hover:bg-gray-50">
                        <td className="p-3 text-gray-600">{category.id}</td>
                        <td className="p-3 text-gray-600">{category.name}</td>
                        <td className="p-3 text-gray-600">{category.customers.join(", ")}</td>
                        <td className="p-3">
                          <Button variant="outline" size="sm">
                            {tr("تعديل")}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Supplier Classifications */}
            <div className="mb-6">
              <h3 className="text-md font-heading font-medium mb-3">{tr("تصنيفات الموردين")}</h3>
              <div className="overflow-x-auto">
                <table className="w-full mb-4">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("الرقم")}</th>
                      <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("اسم التصنيف")}</th>
                      <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("الموردين التابعين")}</th>
                      <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("الإجراءات")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierCategories.map((category) => (
                      <tr key={category.id} className="hover:bg-gray-50">
                        <td className="p-3 text-gray-600">{category.id}</td>
                        <td className="p-3 text-gray-600">{category.name}</td>
                        <td className="p-3 text-gray-600">{category.suppliers.join(", ")}</td>
                        <td className="p-3">
                          <Button variant="outline" size="sm">
                            {tr("تعديل")}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Product Classifications */}
            <div>
              <h3 className="text-md font-heading font-medium mb-3">{tr("تصنيفات الأصناف")}</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("الرقم")}</th>
                      <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("اسم التصنيف")}</th>
                      <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("الأصناف التابعة")}</th>
                      <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("الإجراءات")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productCategories.map((category) => (
                      <tr key={category.id} className="hover:bg-gray-50">
                        <td className="p-3 text-gray-600">{category.id}</td>
                        <td className="p-3 text-gray-600">{category.name}</td>
                        <td className="p-3 text-gray-600">{category.products.join(", ")}</td>
                        <td className="p-3">
                          <Button variant="outline" size="sm">
                            {tr("تعديل")}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Currencies Section */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-heading font-semibold mb-4">{tr("العملات")}</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("رمز العملة")}</th>
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("اسم العملة")}</th>
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("سعر البيع")}</th>
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("سعر الشراء")}</th>
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("سعر الصرف")}</th>
                    <th className="text-start p-3 font-heading font-semibold text-gray-700">{tr("الإجراءات")}</th>
                  </tr>
                </thead>
                <tbody>
                  {currencies.map((currency) => (
                    <tr key={currency.code} className="hover:bg-gray-50">
                      <td className="p-3 text-gray-600 font-mono">{currency.code}</td>
                      <td className="p-3 text-gray-600">{currency.name}</td>
                      <td className="p-3 text-gray-600">{currency.sellPrice.toFixed(2)}</td>
                      <td className="p-3 text-gray-600">{currency.buyPrice.toFixed(2)}</td>
                      <td className="p-3 text-gray-600">{currency.exchangeRate.toFixed(2)}</td>
                      <td className="p-3">
                        <Button variant="outline" size="sm">
                          {tr("تعديل")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export { DepartmentsDefinitions }
export default DepartmentsDefinitions



