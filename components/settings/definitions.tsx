"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Edit, Building, MapPin, Package, Package2, Users, CreditCard, Settings, Trash2, Currency } from "lucide-react"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { WorkflowStagesManagement } from "@/components/workflow/workflow-stages-management"
import { WorkflowSequencesManagement } from "@/components/workflow/workflow-sequences-management"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { LoadingCard } from "@/components/ui/loading-spinner"
import salesmen from "../salesmen/Salesmen"
import Salesmen from "../salesmen/Salesmen"

interface City {
  id: number
  name: string
  status: number
}

interface Warehouse {
  id: number
  warehouse_code: string
  warehouse_name: string
  warehouse_name_en?: string
  location?: string
  is_active: boolean
}

interface Branch {
  id: number
  branch_code: string
  branch_name: string
  address?: string
  manager?: string
  phone?: string
  is_active: boolean
}

interface Department {
  id: number
  department_code: string
  department_name: string
  branch_id?: number
  branch_name?: string
  manager?: string
  employee_count: number
  is_active: boolean
}

interface Currency {
  id: number
  currency_code: string
  currency_name: string
  sell_rate: number
  buy_rate: number
  exchange_rate: number
}
interface Customer_Categories {
  id: number
  name: string
  discount: number
}
interface Supplier_Categories {
  id: number
  name: string
  paymentterms: string
}
interface Product_Categories {
  id: number
  name: string
}
interface Unit {
  id: number
  unit_name: string,
  unit_name_e: string,
  description: string,
  is_active: boolean
}

interface Price {
  id: number
  name: string,
  name_en: string,
  description: string,
  status: number
}

interface IncomeStatementItem {
  id: number
  name: string
  status: number
}

interface BalanceSheetAssetItem {
  id: number
  name: string
  status: number
}

interface BalanceSheetLiabilityItem {
  id: number
  name: string
  status: number
}

interface CostCenterType {
  id: number
  name: string
  status: number
}

interface CostCenter {
  id: number
  name: string
  cost_type_id: number
  cost_type_name?: string
  parent_id?: number | null
  parent_name?: string | null
  level: number
  status: number
}

interface AccountClassificationType {
  id: number
  name: string
  status: number
}

interface AccountClassification {
  id: number
  name: string
  classification_type_id: number
  classification_type_name?: string
  status: number
}

const cities_initial = [
  { id: 1, name: "نابلس", status: 1 },
  { id: 2, name: "رام الله", status: 1 },
  { id: 3, name: "الخليل", status: 1 },
  { id: 4, name: "بيت لحم", status: 1 },
  { id: 5, name: "جنين", status: 1 },
]

const warehouses_initial = [
  {
    id: 1,
    warehouse_code: "W001",
    warehouse_name: "المستودع الرئيسي",
    warehouse_name_en: "Main Warehouse",
    location: "نابلس",
    is_active: true,
  },
  {
    id: 2,
    warehouse_code: "W002",
    warehouse_name: "مستودع الفرع الثاني",
    warehouse_name_en: "Branch 2 Warehouse",
    location: "رام الله",
    is_active: true,
  },
]

const customerCategories_initial = [
  { id: 1, name: "العملاء VIP", discount: 15 },
  { id: 2, name: "العملاء عاديين", discount: 5 },
  { id: 3, name: "العملاء الجملة", discount: 20 },
]
const colors = ["#10B981", "#6B7280", "#3B82F6", "#F59E0B", "#EF4444"];

const getStatusBadgeVariant = (status?: number) =>
  status === 1 ? "default" : status === 2 ? "secondary" : "destructive"

const getStatusLabel = (status?: number) =>
  status === 1 ? "نشط" : status === 2 ? "مجمّد" : "محذوف"

const getToggleStatusLabel = (status?: number) =>
  status === 2 ? "إلغاء التجميد" : "تجميد"

const getToggledStatus = (status?: number) => (status === 2 ? 1 : 2)

const supplierCategories_initial = [
  {
    id: 1,
    name: "موردين محليين",
    paymentterms: "30 يوم",

  },
  {
    id: 2,
    name: "موردين دوليين",
    paymentterms: "60 يوم",

  },
  { id: 3, name: "موردين استراتيجيين", paymentterms: "45 يوم" },
]

const productCategories_initial = [
  { id: 1, name: "إلكترونيات" },
  { id: 2, name: "ملابس" },
  { id: 3, name: "أجهزة منزلية" },
]

const currencies_initial = [
  { id: 1, currency_code: "USD", currency_name: "دولار أمريكي", sell_rate: 3.65, buy_rate: 3.6, exchange_rate: 3.62 },
  { id: 2, currency_code: "EUR", currency_name: "يورو", sell_rate: 4.1, buy_rate: 4.05, exchange_rate: 4.07 },
  { id: 3, currency_code: "JOD", currency_name: "دينار أردني", sell_rate: 5.15, buy_rate: 5.1, exchange_rate: 5.12 },
  { id: 4, currency_code: "ILS", currency_name: "شيكل إسرائيلي", sell_rate: 1.0, buy_rate: 1.0, exchange_rate: 1.0 },
]




function Definitions() {
  const [cities, setCities] = useState<City[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [customercategories, setCustomerCategories] = useState<Customer_Categories[]>([])
  const [suppliercategories, setSupplierCategories] = useState<Supplier_Categories[]>([])
  const [productcategories, setProductCategories] = useState<Product_Categories[]>([])
  const [taxClassifications, setTaxClassifications] = useState<Array<{ id: number; name: string; tax_percent?: number; status?: number }>>([])
  const [showTaxClassificationForm, setShowTaxClassificationForm] = useState(false)
  const [taxClassificationForm, setTaxClassificationForm] = useState<{ id?: number; name: string; tax_percent: number; status?: number }>({ name: "", tax_percent: 0, status: 1 })
  const [branches, setBranches] = useState<Branch[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [editingBranchId, setEditingBranchId] = useState<number | null>(null);
  const [showCityForm, setShowCityForm] = useState(false)
  const [showWarehouseForm, setShowWarehouseForm] = useState(false)
  const [showCurrencyForm, setShowCurrencyForm] = useState(false)
  const [showBranchForm, setShowBranchForm] = useState(false)
  const [showDepartmentForm, setShowDepartmentForm] = useState(false)
  const [showCustomerCategoryForm, setShowCustomerCategoryForm] = useState(false)
  const [showSupplierCategoryForm, setShowSupplierCategoryForm] = useState(false)
  const [showProductCategoryForm, setShowProductCategoryForm] = useState(false)
  const [currentBranchIndex, setCurrentBranchIndex] = useState(0)
  const [currentDepartmentIndex, setCurrentDepartmentIndex] = useState(0)
  const [currentCityIndex, setCurrentCityIndex] = useState(0)
  const [currentWarehouseIndex, setCurrentWarehouseIndex] = useState(0)

  const [cityForm, setCityForm] = useState({ id: 0, name: "", status: 1 })
  const [warehouseForm, setWarehouseForm] = useState({
    id: 0,
    warehouse_code: "",
    warehouse_name: "",
    location: "",
    status: 1,
  })
  const [customercategoryForm, setCustomercategoryForm] = useState({
    name: "",
    discount: 0
  })
  const [suppliercategoryForm, setSuppliercategoryForm] = useState({
    name: "",
    paymentterms: ""
  })
  const [productcategoryForm, setProductcategoryForm] = useState({
    name: "",
  })
  const [branchForm, setBranchForm] = useState({
    id: 0,
    branch_code: "",
    branch_name: "",
    address: "",
    manager: "",
    phone: "",
  })
  const [departmentForm, setDepartmentForm] = useState({
    id: 0,
    department_code: "",
    department_name: "",
    branch_id: "",
    manager: "",
  })
  const [currencyForm, setCurrencyForm] = useState({
    currency_code: "",
    currency_name: "",
    currency_symbol: "",
    buy_rate: "1",
    sell_rate: "1",
    exchange_rate: "1",
  })
  const [units, setUnits] = useState<Unit[]>([])
  const [prices, setPrices] = useState<Price[]>([])
  const [priceForm, setPriceForm] = useState({ name: "", name_en: "", description: "", status: 1 })
  const [unitForm, setUnitForm] = useState({ unit_name: "", unit_name_e: "", description: "", status: 1 })
  const [showUnitForm, setShowUnitForm] = useState(false)
  const [showPriceForm, setShowPriceForm] = useState(false)
  const [showIncomeStatementItemForm, setShowIncomeStatementItemForm] = useState(false)
  const [showBalanceSheetAssetItemForm, setShowBalanceSheetAssetItemForm] = useState(false)
  const [showBalanceSheetLiabilityItemForm, setShowBalanceSheetLiabilityItemForm] = useState(false)
  const [showCostCenterTypeForm, setShowCostCenterTypeForm] = useState(false)
  const [showCostCenterForm, setShowCostCenterForm] = useState(false)
  const [showAccountClassificationTypeForm, setShowAccountClassificationTypeForm] = useState(false)
  const [showAccountClassificationForm, setShowAccountClassificationForm] = useState(false)
  const [currentUnitIndex, setCurrentUnitIndex] = useState(0)
  const [currentPriceIndex, setCurrentPriceIndex] = useState(0)
  const [currentIncomeStatementItemIndex, setCurrentIncomeStatementItemIndex] = useState(0)
  const [currentBalanceSheetAssetItemIndex, setCurrentBalanceSheetAssetItemIndex] = useState(0)
  const [currentBalanceSheetLiabilityItemIndex, setCurrentBalanceSheetLiabilityItemIndex] = useState(0)
  const [currentCostCenterTypeIndex, setCurrentCostCenterTypeIndex] = useState(0)
  const [currentCostCenterIndex, setCurrentCostCenterIndex] = useState(0)
  const [currentAccountClassificationTypeIndex, setCurrentAccountClassificationTypeIndex] = useState(0)
  const [currentAccountClassificationIndex, setCurrentAccountClassificationIndex] = useState(0)
  const [editingUnitId, setEditingUnitId] = useState<number | null>(null)
  const [editingPriceId, setEditingPriceId] = useState<number | null>(null)
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false)
  const [confirmDeleteMessage, setConfirmDeleteMessage] = useState("هل أنت متأكد من حذف هذا العنصر؟")
  const [confirmDeleteAction, setConfirmDeleteAction] = useState<(() => void) | null>(null)

  const openDeleteConfirm = (message: string, action: () => void) => {
    setConfirmDeleteMessage(message)
    setConfirmDeleteAction(() => action)
    setConfirmDeleteVisible(true)
  }

  const handleCancelDeleteConfirm = () => {
    setConfirmDeleteVisible(false)
    setConfirmDeleteAction(null)
  }

  const handleConfirmDelete = () => {
    if (confirmDeleteAction) {
      confirmDeleteAction()
    }
    handleCancelDeleteConfirm()
  }

  const [incomeStatementItems, setIncomeStatementItems] = useState<IncomeStatementItem[]>([])
  const [balanceSheetAssetItems, setBalanceSheetAssetItems] = useState<BalanceSheetAssetItem[]>([])
  const [balanceSheetLiabilityItems, setBalanceSheetLiabilityItems] = useState<BalanceSheetLiabilityItem[]>([])
  const [costCenterTypes, setCostCenterTypes] = useState<CostCenterType[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [accountClassificationTypes, setAccountClassificationTypes] = useState<AccountClassificationType[]>([])
  const [accountClassifications, setAccountClassifications] = useState<AccountClassification[]>([])
  const [incomeStatementItemForm, setIncomeStatementItemForm] = useState({ id: 0, name: "", status: 1 })
  const [balanceSheetAssetItemForm, setBalanceSheetAssetItemForm] = useState({ id: 0, name: "", status: 1 })
  const [balanceSheetLiabilityItemForm, setBalanceSheetLiabilityItemForm] = useState({ id: 0, name: "", status: 1 })
  const [costCenterTypeForm, setCostCenterTypeForm] = useState({ id: 0, name: "", status: 1 })
  const [costCenterForm, setCostCenterForm] = useState({
    id: 0,
    name: "",
    cost_type_id: "",
    parent_id: "none",
    status: 1,
  })
  const [accountClassificationTypeForm, setAccountClassificationTypeForm] = useState({ id: 0, name: "", status: 1 })
  const [accountClassificationForm, setAccountClassificationForm] = useState({
    id: 0,
    name: "",
    classification_type_id: "",
    status: 1,
  })
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)

  const fetchAllData = async () => {
    setLoading(true)
    try {
      await Promise.all([fetchCities(), fetchWarehouses(), fetchBranches(), fetchDepartments(), fetchCurrencies(), fetchCustomerCategories(),
      fetchsupplierCategories(), fetchUnits(), fetchProductCategories(), fetchPrices(), fetchIncomeStatementItems(), fetchBalanceSheetAssetItems(), fetchBalanceSheetLiabilityItems(), fetchCostCenterTypes(), fetchCostCenters(), fetchAccountClassificationTypes(), fetchAccountClassifications()])
    } catch (error) {
      console.error("Error fetching data:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAllData()
  }, [])

  useEffect(() => {
    fetchTaxClassifications()
  }, [])

  const handleEditTaxClassification = (item: any) => {
    setTaxClassificationForm({ id: item.id, name: item.name, tax_percent: Number(item.tax_percent || 0), status: Number(item.status ?? 1) })
    setShowTaxClassificationForm(true)
  }

  const handleSaveTaxClassification = async (e: any) => {
    e.preventDefault()
    if (!taxClassificationForm.name.trim()) return
    if (Number(taxClassificationForm.tax_percent) > 100) {
      alert('قيمة الضريبة يجب أن لا تتجاوز 100')
      return
    }
    try {
      const url = '/api/tax-classifications'
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taxClassificationForm),
      })
      if (response.ok) {
        await fetchTaxClassifications()
        setTaxClassificationForm({ name: '', tax_percent: 0, status: 1 })
        setShowTaxClassificationForm(false)
      } else {
        const err = await response.json()
        console.error('Failed to save tax classification', err)
      }
    } catch (err) {
      console.error('Error saving tax classification', err)
    }
  }

  const handleFreezeTaxClassification = async (item: any) => {
    const nextStatus = item.status === 2 ? 1 : 2

    try {
      const response = await fetch(`/api/tax-classifications/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: item.name, tax_percent: item.tax_percent ?? 0, status: nextStatus }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || (nextStatus === 2 ? "فشل في تجميد التصنيف" : "فشل في إلغاء التجميد"))
      }

      await fetchTaxClassifications()
      toast({ title: nextStatus === 2 ? "تم التجميد" : "تم إلغاء التجميد", description: nextStatus === 2 ? "تم تجميد التصنيف" : "تم إلغاء تجميد التصنيف" })
    } catch (error) {
      toast({ title: nextStatus === 2 ? "فشل التجميد" : "فشل إلغاء التجميد", description: error instanceof Error ? error.message : "تعذر تنفيذ العملية", variant: "destructive" })
    }
  }

  const handleDeleteTaxClassification = async (itemId: number) => {
    try {
      const response = await fetch(`/api/tax-classifications/${itemId}`, { method: "DELETE" })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حذف التصنيف")
      }

      await fetchTaxClassifications()
      toast({ title: "تم الحذف", description: "تم حذف التصنيف" })
    } catch (error) {
      toast({ title: "فشل الحذف", description: error instanceof Error ? error.message : "تعذر حذف التصنيف", variant: "destructive" })
    }
  }

  const fetchCities = async () => {
    try {
      const response = await fetch("/api/cities")
      if (response.ok) {
        const data = await response.json()
        setCities(data.filter((city: City) => city.status !== 3))
      } else {
        // Fallback to initial data if API fails
        setCities(cities_initial)
      }
    } catch (error) {
      console.error("Error fetching cities:", error)
      // Fallback to initial data if API fails
      setCities(cities_initial)
    }
  }

  const fetchWarehouses = async () => {
    try {
      const response = await fetch("/api/warehouses")
      if (response.ok) {
        const data = await response.json()
        setWarehouses(data)
      } else {
        setWarehouses(warehouses_initial)
      }
    } catch (error) {
      console.error("Error fetching warehouses:", error)
      setWarehouses(warehouses_initial)
    }
  }
  const fetchUnits = async () => {
    try {
      const response = await fetch("/api/units")
      if (response.ok) {
        const data = await response.json()
        console.log("data ", data)
        setUnits(data)
      } else {
        setUnits([])
      }
    } catch (error) {
      console.error("Error fetching units:", error)
      setUnits([])
    }
  }
  const fetchPrices = async () => {
    try {
      const response = await fetch("/api/pricecategory")
      if (response.ok) {
        const data = await response.json()
        console.log("data ", data)
        setPrices(data.filter((price: Price) => price.status !== 3))
      } else {
        setPrices([])
      }
    } catch (error) {
      console.error("Error fetching price categories:", error)
      setPrices([])
    }
  }

  const fetchIncomeStatementItems = async () => {
    try {
      const response = await fetch("/api/income-statement-items")
      if (response.ok) {
        const data = await response.json()
        setIncomeStatementItems(data)
      } else {
        setIncomeStatementItems([])
      }
    } catch (error) {
      console.error("Error fetching income statement items:", error)
      setIncomeStatementItems([])
    }
  }

  const fetchBalanceSheetAssetItems = async () => {
    try {
      const response = await fetch("/api/balance-sheet-assets-items")
      if (response.ok) {
        const data = await response.json()
        setBalanceSheetAssetItems(data)
      } else {
        setBalanceSheetAssetItems([])
      }
    } catch (error) {
      console.error("Error fetching balance sheet asset items:", error)
      setBalanceSheetAssetItems([])
    }
  }

  const fetchBalanceSheetLiabilityItems = async () => {
    try {
      const response = await fetch("/api/balance-sheet-liabilities-items")
      if (response.ok) {
        const data = await response.json()
        setBalanceSheetLiabilityItems(data)
      } else {
        setBalanceSheetLiabilityItems([])
      }
    } catch (error) {
      console.error("Error fetching balance sheet liability items:", error)
      setBalanceSheetLiabilityItems([])
    }
  }

  const fetchCostCenterTypes = async () => {
    try {
      const response = await fetch("/api/cost-center-types")
      if (response.ok) {
        const data = await response.json()
        setCostCenterTypes(data)
      } else {
        setCostCenterTypes([])
      }
    } catch (error) {
      console.error("Error fetching cost center types:", error)
      setCostCenterTypes([])
    }
  }

  const fetchCostCenters = async () => {
    try {
      const response = await fetch("/api/cost-centers")
      if (response.ok) {
        const data = await response.json()
        setCostCenters(data)
      } else {
        setCostCenters([])
      }
    } catch (error) {
      console.error("Error fetching cost centers:", error)
      setCostCenters([])
    }
  }

  const fetchAccountClassificationTypes = async () => {
    try {
      const response = await fetch("/api/account-classification-types")
      if (response.ok) {
        const data = await response.json()
        setAccountClassificationTypes(data)
      } else {
        setAccountClassificationTypes([])
      }
    } catch (error) {
      console.error("Error fetching account classification types:", error)
      setAccountClassificationTypes([])
    }
  }

  const fetchAccountClassifications = async () => {
    try {
      const response = await fetch("/api/account-classifications")
      if (response.ok) {
        const data = await response.json()
        setAccountClassifications(data)
      } else {
        setAccountClassifications([])
      }
    } catch (error) {
      console.error("Error fetching account classifications:", error)
      setAccountClassifications([])
    }
  }

  const fetchCustomerCategories = async () => {
    try {
      const response = await fetch("/api/customer-categories")
      if (response.ok) {
        const data = await response.json()
        console.log("datadatadatadatadatadata data ", data)
        setCustomerCategories(data.categories)
      } else {
        setCustomerCategories(customerCategories_initial)
      }
    } catch (error) {
      console.error("Error fetching customer categories:", error)
      setCustomerCategories(customerCategories_initial)
    }
  }
  const fetchsupplierCategories = async () => {
    try {
      const response = await fetch("/api/supplier-categories")
      if (response.ok) {
        const data = await response.json()
        console.log("TTTTTTTTT ", data)
        setSupplierCategories(data.categories)
      } else {
        setSupplierCategories(supplierCategories_initial)
      }
    } catch (error) {
      console.error("Error fetching supplier categories:", error)
      setSupplierCategories(supplierCategories_initial)
    }
  }

  const fetchProductCategories = async () => {
    try {
      const response = await fetch("/api/product-categories")
      if (response.ok) {
        const data = await response.json()
        setProductCategories(data.categories)
      } else {
        setProductCategories(productCategories_initial)
      }
    } catch (error) {
      console.error("Error fetching product categories:", error)
      setProductCategories(productCategories_initial)
    }
  }
  const fetchTaxClassifications = async () => {
    try {
      const response = await fetch("/api/tax-classifications")
      if (response.ok) {
        const data = await response.json()
        setTaxClassifications(data.categories || [])
      } else {
        setTaxClassifications([])
      }
    } catch (error) {
      console.error("Error fetching tax classifications:", error)
      setTaxClassifications([])
    }
  }
  const fetchBranches = async () => {
    try {
      const response = await fetch("/api/branches")
      if (response.ok) {
        const data = await response.json()
        setBranches(data)
      } else {
        setBranches([])
      }
    } catch (error) {
      console.error("Error fetching branches:", error)
      setBranches([])
    }
  }

  const fetchDepartments = async () => {
    try {
      const response = await fetch("/api/departments")
      if (response.ok) {
        const data = await response.json()
        setDepartments(data)
      } else {
        setDepartments([])
      }
    } catch (error) {
      console.error("Error fetching departments:", error)
      setDepartments([])
    }
  }

  const fetchCurrencies = async () => {
    try {
      const response = await fetch("/api/exchange-rates")
      if (response.ok) {
        const data = await response.json()
        console.log("data ", data)
        setCurrencies(data?.rates || [])
      } else {
        setCurrencies(currencies_initial)
      }
    } catch (error) {
      console.error("Error fetching currencies:", error)
      setCurrencies(currencies_initial)
    }
  }

  const handleAddCity = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!cityForm.name.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال اسم المدينة",
        variant: "destructive",
      });
      return;
    }

    try {
      const isEditing = cityForm.id > 0;
      const url = isEditing ? `/api/cities/${cityForm.id}` : "/api/cities";
      const method = isEditing ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cityForm),
      });

      if (response.ok) {
        toast({
          title: "تم الحفظ بنجاح",
          description: isEditing ? "تم تعديل المدينة بنجاح" : "تم إضافة المدينة بنجاح",
        });
        await fetchCities(); // refresh list
        setCityForm({ id: 0, name: "", status: 1 });
        setShowCityForm(false);
      } else {
        const error = await response.json();
        toast({
          title: "فشل الحفظ",
          description: error.error || "حدث خطأ أثناء حفظ المدينة",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error saving city:", error);
      toast({
        title: "خطأ في الاتصال",
        description: "تعذر الاتصال بالخادم، يرجى المحاولة مرة أخرى",
        variant: "destructive",
      });
    }
  };

  const handleAddCurrency = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!currencyForm.currency_code.trim() || !currencyForm.currency_name.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال رمز واسم العملة",
        variant: "destructive",
      })
      return
    }

    try {
      const response = await fetch("/api/exchange-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currencyForm),
      })

      if (response.ok) {
        toast({
          title: "تم الحفظ بنجاح",
          description: "تم إضافة العملة بنجاح",
        })
        await fetchCurrencies()
        setCurrencyForm({ currency_symbol: "", currency_code: "", currency_name: "", buy_rate: "", sell_rate: "", exchange_rate: "" })
        setShowCurrencyForm(false)
      } else {
        const error = await response.json()
        toast({
          title: "فشل الحفظ",
          description: error.error || "حدث خطأ أثناء حفظ العملة",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error adding warehouse:", error)
      toast({
        title: "خطأ في الاتصال",
        description: "تعذر الاتصال بالخادم، يرجى المحاولة مرة أخرى",
        variant: "destructive",
      })
    }
  }

  const handleAddCustomerCategories = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!customercategoryForm.name.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال اسم التصنيف",
        variant: "destructive",
      })
      return
    }

    try {
      const response = await fetch("/api/customer-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customercategoryForm),
      })

      if (response.ok) {
        toast({
          title: "تم الحفظ بنجاح",
          description: "تم إضافة التصنيف بنجاح",
        })
        await fetchCustomerCategories()
        setCustomercategoryForm({ name: "", discount: 0 })
        setShowCustomerCategoryForm(false)
      } else {
        const error = await response.json()
        toast({
          title: "فشل الحفظ",
          description: error.error || "حدث خطأ أثناء حفظ التصنيف",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error adding warehouse:", error)
      toast({
        title: "خطأ في الاتصال",
        description: "تعذر الاتصال بالخادم، يرجى المحاولة مرة أخرى",
        variant: "destructive",
      })
    }
  }

  const handleAddSupplierCategories = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!suppliercategoryForm.name.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال اسم التصنيف",
        variant: "destructive",
      })
      return
    }

    try {
      const response = await fetch("/api/supplier-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(suppliercategoryForm),
      })

      if (response.ok) {
        toast({
          title: "تم الحفظ بنجاح",
          description: "تم إضافة التصنيف بنجاح",
        })
        await fetchsupplierCategories()
        setSuppliercategoryForm({ name: "", paymentterms: "" })
        setShowSupplierCategoryForm(false)
      } else {
        const error = await response.json()
        toast({
          title: "فشل الحفظ",
          description: error.error || "حدث خطأ أثناء حفظ التصنيف",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error adding warehouse:", error)
      toast({
        title: "خطأ في الاتصال",
        description: "تعذر الاتصال بالخادم، يرجى المحاولة مرة أخرى",
        variant: "destructive",
      })
    }
  }


  const handleAddProductCategories = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!productcategoryForm.name.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال اسم التصنيف",
        variant: "destructive",
      })
      return
    }

    try {
      const response = await fetch("/api/product-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(productcategoryForm),
      })

      if (response.ok) {
        toast({
          title: "تم الحفظ بنجاح",
          description: "تم إضافة التصنيف بنجاح",
        })
        await fetchProductCategories()
        setProductcategoryForm({ name: "" })
        setShowProductCategoryForm(false)
      } else {
        const error = await response.json()
        toast({
          title: "فشل الحفظ",
          description: error.error || "حدث خطأ أثناء حفظ التصنيف",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error adding warehouse:", error)
      toast({
        title: "خطأ في الاتصال",
        description: "تعذر الاتصال بالخادم، يرجى المحاولة مرة أخرى",
        variant: "destructive",
      })
    }
  }

  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const method = editingUnitId ? "PUT" : "POST"
      const url = editingUnitId ? `/api/units/${editingUnitId}` : "/api/units"
      console.log("editingUnitId ", editingUnitId)
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(unitForm),
      })

      const result = await res.json()

      if (!res.ok) {
        alert(result.error || "حدث خطأ")
        return
      }

      if (editingUnitId) {
        // Update local state
        setUnits((prev) =>
          prev.map((u) => (u.id === editingUnitId ? result : u))
        )
      } else {
        setUnits((prev) => [...prev, result])
      }
      toast({
        title: "تم الحفظ بنجاح",
        description: "تم إضافة الوحدة بنجاح",
      })
      // Reset form
      await fetchUnits()
      setUnitForm({ unit_name: "", unit_name_e: "", description: "", status: 1 })
      setShowUnitForm(false)
      setEditingUnitId(null)
      setCurrentUnitIndex(units.length) // select the new unit
    } catch (err) {
      console.error(err)
      alert("فشل حفظ الوحدة")
    }
  }

  // Prefill form for editing
  const handleEditUnit = (unit: Unit) => {
    setUnitForm({
      unit_name: unit.unit_name,
      unit_name_e: unit.unit_name_e,
      description: unit.description || "",
      status: unit.status ?? 1,
    })
    setEditingUnitId(unit.id)
    setShowUnitForm(true)
  }

  const handleFreezeUnit = async (unit: Unit) => {
    const nextStatus = getToggledStatus(unit.status)
    try {
      const response = await fetch(`/api/units/${unit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit_name: unit.unit_name,
          unit_name_en: unit.unit_name_en || "",
          description: unit.description || "",
          status: nextStatus,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في تحديث حالة الوحدة")
      }

      await fetchUnits()
      toast({
        title: nextStatus === 2 ? "تم التجميد" : "تم إلغاء التجميد",
        description: nextStatus === 2 ? "تم تجميد الوحدة" : "تم إلغاء تجميد الوحدة",
      })
    } catch (error) {
      toast({
        title: nextStatus === 2 ? "فشل التجميد" : "فشل إلغاء التجميد",
        description: error instanceof Error ? error.message : "تعذر تحديث حالة الوحدة",
        variant: "destructive",
      })
    }
  }

  const handleDeleteUnit = async (unitId: number) => {
    try {
      const response = await fetch(`/api/units/${unitId}`, { method: "DELETE" })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حذف الوحدة")
      }
      await fetchUnits()
      toast({ title: "تم الحذف", description: "تم حذف الوحدة" })
    } catch (error) {
      toast({
        title: "فشل الحذف",
        description: error instanceof Error ? error.message : "تعذر حذف الوحدة",
        variant: "destructive",
      })
    }
  }

  const handleEditBranch = (branch: any) => {
    setBranchForm({
      id: branch.id,
      branch_code: branch.branch_code || "",
      branch_name: branch.branch_name || "",
      phone: branch.phone || "",
      address: branch.address || "",
      manager: branch.manager || "",
    });

    setEditingBranchId(branch.id);   // تخزين الـ ID لمعرفة أنه تعديل وليس إضافة
    setShowBranchForm(true);         // إظهار نموذج التعديل
  };

  const handleEditDepartment = (dept: Department) => {
    setDepartmentForm({
      id: dept.id,
      department_code: dept.department_code,
      department_name: dept.department_name,
      branch_id: dept.branch_id?.toString() || "",
      manager: dept.manager || "",
    });
    setShowDepartmentForm(true); // show the form for editing
  };

  const handleEditCity = (city: City) => {
    setCityForm({ id: city.id, name: city.name, status: city.status ?? 1 });
    setShowCityForm(true);
  };

  const handleFreezeCity = async (city: City) => {
    const nextStatus = getToggledStatus(city.status)
    try {
      const response = await fetch(`/api/cities/${city.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: city.name, status: nextStatus }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في تحديث حالة المدينة")
      }

      await fetchCities()
      toast({
        title: nextStatus === 2 ? "تم التجميد" : "تم إلغاء التجميد",
        description: nextStatus === 2 ? "تم تجميد المدينة" : "تم إلغاء تجميد المدينة",
      })
    } catch (error) {
      toast({
        title: nextStatus === 2 ? "فشل التجميد" : "فشل إلغاء التجميد",
        description: error instanceof Error ? error.message : "تعذر تحديث حالة المدينة",
        variant: "destructive",
      })
    }
  }

  const handleDeleteCity = async (cityId: number) => {
    try {
      const response = await fetch(`/api/cities/${cityId}`, { method: "DELETE" })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حذف المدينة")
      }
      await fetchCities()
      toast({ title: "تم الحذف", description: "تم حذف المدينة" })
    } catch (error) {
      toast({
        title: "فشل الحذف",
        description: error instanceof Error ? error.message : "تعذر حذف المدينة",
        variant: "destructive",
      })
    }
  }

  const handleEditWarehouse = (warehouse: {
    id: number;
    warehouse_code: string;
    warehouse_name: string;
    location?: string;
    status?: number;
  }) => {
    setWarehouseForm({
      id: warehouse.id,
      warehouse_code: warehouse.warehouse_code,
      warehouse_name: warehouse.warehouse_name,
      location: warehouse.location || "",
      status: warehouse.status ?? 1,
    });
    setShowWarehouseForm(true);
  };

  const handleFreezeWarehouse = async (warehouse: {
    id: number;
    warehouse_code: string;
    warehouse_name: string;
    warehouse_name_en?: string;
    description?: string;
    location?: string;
    status?: number;
  }) => {
    const nextStatus = getToggledStatus(warehouse.status)
    try {
      const response = await fetch(`/api/warehouses/${warehouse.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouse_code: warehouse.warehouse_code,
          warehouse_name: warehouse.warehouse_name,
          warehouse_name_en: warehouse.warehouse_name_en || "",
          description: warehouse.description || "",
          location: warehouse.location || "",
          status: nextStatus,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في تحديث حالة المستودع")
      }

      await fetchWarehouses()
      toast({
        title: nextStatus === 2 ? "تم التجميد" : "تم إلغاء التجميد",
        description: nextStatus === 2 ? "تم تجميد المستودع" : "تم إلغاء تجميد المستودع",
      })
    } catch (error) {
      toast({
        title: nextStatus === 2 ? "فشل التجميد" : "فشل إلغاء التجميد",
        description: error instanceof Error ? error.message : "تعذر تحديث حالة المستودع",
        variant: "destructive",
      })
    }
  }

  const handleDeleteWarehouse = async (warehouseId: number) => {
    try {
      const response = await fetch(`/api/warehouses/${warehouseId}`, { method: "DELETE" })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حذف المستودع")
      }
      await fetchWarehouses()
      toast({ title: "تم الحذف", description: "تم حذف المستودع" })
    } catch (error) {
      toast({
        title: "فشل الحذف",
        description: error instanceof Error ? error.message : "تعذر حذف المستودع",
        variant: "destructive",
      })
    }
  }

  const handleAddPrice = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const method = editingPriceId ? "PUT" : "POST"
      const url = editingPriceId ? `/api/pricecategory/${editingPriceId}` : "/api/pricecategory"
      console.log("editingPriceId ", editingPriceId)
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(priceForm),
      })

      const result = await res.json()

      if (!res.ok) {
        alert(result.error || "حدث خطأ")
        return
      }

      if (editingPriceId) {
        setPrices((prev) => prev.map((u) => (u.id === editingPriceId ? result : u)))
      } else {
        setPrices((prev) => [...prev, result])
      }
      toast({
        title: "تم الحفظ بنجاح",
        description: editingPriceId ? "تم تحديث الفئة بنجاح" : "تم إضافة الفئة بنجاح",
      })
      await fetchPrices()
      setPriceForm({ name: "", name_en: "", description: "", status: 1 })
      setShowPriceForm(false)
      setEditingPriceId(null)
      setCurrentPriceIndex(prices.length)
    } catch (err) {
      console.error(err)
      alert("فشل حفظ فئة السعر")
    }
  }

  const handleFreezePrice = async (price: Price) => {
    const nextStatus = getToggledStatus(price.status)
    try {
      const response = await fetch(`/api/pricecategory/${price.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: price.name,
          name_en: price.name_en || "",
          description: price.description || "",
          status: nextStatus,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في تحديث حالة الفئة")
      }

      await fetchPrices()
      toast({
        title: nextStatus === 2 ? "تم التجميد" : "تم إلغاء التجميد",
        description: nextStatus === 2 ? "تم تجميد الفئة" : "تم إلغاء تجميد الفئة",
      })
    } catch (error) {
      toast({
        title: nextStatus === 2 ? "فشل التجميد" : "فشل إلغاء التجميد",
        description: error instanceof Error ? error.message : "تعذر تحديث حالة الفئة",
        variant: "destructive",
      })
    }
  }

  const handleDeletePrice = async (priceId: number) => {
    try {
      const response = await fetch(`/api/pricecategory/${priceId}`, { method: "DELETE" })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حذف الفئة")
      }
      await fetchPrices()
      toast({ title: "تم الحذف", description: "تم حذف الفئة" })
    } catch (error) {
      toast({
        title: "فشل الحذف",
        description: error instanceof Error ? error.message : "تعذر حذف الفئة",
        variant: "destructive",
      })
    }
  }

  const handleEditPrice = (price: Price) => {
    setPriceForm({
      name: price.name,
      name_en: price.name_en,
      description: price.description || "",
      status: price.status ?? 1,
    })
    setEditingPriceId(price.id)
    setShowPriceForm(true)
  }

  const handleSaveIncomeStatementItem = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!incomeStatementItemForm.name.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال اسم البند",
        variant: "destructive",
      })
      return
    }

    try {
      const isEditing = incomeStatementItemForm.id > 0
      const url = isEditing
        ? `/api/income-statement-items/${incomeStatementItemForm.id}`
        : "/api/income-statement-items"
      const method = isEditing ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: incomeStatementItemForm.name,
          status: incomeStatementItemForm.status,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حفظ البند")
      }

      await fetchIncomeStatementItems()
      setIncomeStatementItemForm({ id: 0, name: "", status: 1 })
      setShowIncomeStatementItemForm(false)
      toast({
        title: "تم الحفظ بنجاح",
        description: isEditing ? "تم تعديل بند قائمة الدخل" : "تم إضافة بند قائمة الدخل",
      })
    } catch (error) {
      toast({
        title: "فشل الحفظ",
        description: error instanceof Error ? error.message : "حدث خطأ أثناء حفظ البند",
        variant: "destructive",
      })
    }
  }

  const handleEditIncomeStatementItem = (item: IncomeStatementItem) => {
    setIncomeStatementItemForm({ id: item.id, name: item.name, status: item.status })
    setShowIncomeStatementItemForm(true)
  }

  const handleStopIncomeStatementItem = async (item: IncomeStatementItem) => {
    const nextStatus = getToggledStatus(item.status)
    try {
      const response = await fetch(`/api/income-statement-items/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: item.name, status: nextStatus }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في تحديث حالة البند")
      }

      await fetchIncomeStatementItems()
      toast({
        title: nextStatus === 2 ? "تم التجميد" : "تم إلغاء التجميد",
        description: nextStatus === 2 ? "تم تجميد بند قائمة الدخل" : "تم إلغاء تجميد بند قائمة الدخل",
      })
    } catch (error) {
      toast({
        title: nextStatus === 2 ? "فشل التجميد" : "فشل إلغاء التجميد",
        description: error instanceof Error ? error.message : "تعذر تحديث حالة البند",
        variant: "destructive",
      })
    }
  }

  const handleDeleteIncomeStatementItem = async (itemId: number) => {
    try {
      const response = await fetch(`/api/income-statement-items/${itemId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حذف البند")
      }

      await fetchIncomeStatementItems()
      toast({
        title: "تم الحذف",
        description: "تم حذف بند قائمة الدخل",
      })
    } catch (error) {
      toast({
        title: "فشل الحذف",
        description: error instanceof Error ? error.message : "تعذر حذف البند",
        variant: "destructive",
      })
    }
  }

  const handleSaveBalanceSheetAssetItem = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!balanceSheetAssetItemForm.name.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال اسم البند",
        variant: "destructive",
      })
      return
    }

    try {
      const isEditing = balanceSheetAssetItemForm.id > 0
      const url = isEditing
        ? `/api/balance-sheet-assets-items/${balanceSheetAssetItemForm.id}`
        : "/api/balance-sheet-assets-items"
      const method = isEditing ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: balanceSheetAssetItemForm.name,
          status: balanceSheetAssetItemForm.status,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حفظ البند")
      }

      await fetchBalanceSheetAssetItems()
      setBalanceSheetAssetItemForm({ id: 0, name: "", status: 1 })
      setShowBalanceSheetAssetItemForm(false)
      toast({
        title: "تم الحفظ بنجاح",
        description: isEditing ? "تم تعديل بند أصول الميزانية" : "تم إضافة بند أصول الميزانية",
      })
    } catch (error) {
      toast({
        title: "فشل الحفظ",
        description: error instanceof Error ? error.message : "حدث خطأ أثناء حفظ البند",
        variant: "destructive",
      })
    }
  }

  const handleEditBalanceSheetAssetItem = (item: BalanceSheetAssetItem) => {
    setBalanceSheetAssetItemForm({ id: item.id, name: item.name, status: item.status })
    setShowBalanceSheetAssetItemForm(true)
  }

  const handleStopBalanceSheetAssetItem = async (item: BalanceSheetAssetItem) => {
    const nextStatus = getToggledStatus(item.status)
    try {
      const response = await fetch(`/api/balance-sheet-assets-items/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: item.name, status: nextStatus }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في تحديث حالة البند")
      }

      await fetchBalanceSheetAssetItems()
      toast({
        title: nextStatus === 2 ? "تم التجميد" : "تم إلغاء التجميد",
        description: nextStatus === 2 ? "تم تجميد بند أصول الميزانية" : "تم إلغاء تجميد بند أصول الميزانية",
      })
    } catch (error) {
      toast({
        title: nextStatus === 2 ? "فشل التجميد" : "فشل إلغاء التجميد",
        description: error instanceof Error ? error.message : "تعذر تحديث حالة البند",
        variant: "destructive",
      })
    }
  }

  const handleDeleteBalanceSheetAssetItem = async (itemId: number) => {
    try {
      const response = await fetch(`/api/balance-sheet-assets-items/${itemId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حذف البند")
      }

      await fetchBalanceSheetAssetItems()
      toast({
        title: "تم الحذف",
        description: "تم حذف بند أصول الميزانية",
      })
    } catch (error) {
      toast({
        title: "فشل الحذف",
        description: error instanceof Error ? error.message : "تعذر حذف البند",
        variant: "destructive",
      })
    }
  }

  const handleSaveBalanceSheetLiabilityItem = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!balanceSheetLiabilityItemForm.name.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال اسم البند",
        variant: "destructive",
      })
      return
    }

    try {
      const isEditing = balanceSheetLiabilityItemForm.id > 0
      const url = isEditing
        ? `/api/balance-sheet-liabilities-items/${balanceSheetLiabilityItemForm.id}`
        : "/api/balance-sheet-liabilities-items"
      const method = isEditing ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: balanceSheetLiabilityItemForm.name,
          status: balanceSheetLiabilityItemForm.status,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حفظ البند")
      }

      await fetchBalanceSheetLiabilityItems()
      setBalanceSheetLiabilityItemForm({ id: 0, name: "", status: 1 })
      setShowBalanceSheetLiabilityItemForm(false)
      toast({
        title: "تم الحفظ بنجاح",
        description: isEditing ? "تم تعديل بند خصوم الميزانية" : "تم إضافة بند خصوم الميزانية",
      })
    } catch (error) {
      toast({
        title: "فشل الحفظ",
        description: error instanceof Error ? error.message : "حدث خطأ أثناء حفظ البند",
        variant: "destructive",
      })
    }
  }

  const handleEditBalanceSheetLiabilityItem = (item: BalanceSheetLiabilityItem) => {
    setBalanceSheetLiabilityItemForm({ id: item.id, name: item.name, status: item.status })
    setShowBalanceSheetLiabilityItemForm(true)
  }

  const handleStopBalanceSheetLiabilityItem = async (item: BalanceSheetLiabilityItem) => {
    const nextStatus = getToggledStatus(item.status)
    try {
      const response = await fetch(`/api/balance-sheet-liabilities-items/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: item.name, status: nextStatus }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في تحديث حالة البند")
      }

      await fetchBalanceSheetLiabilityItems()
      toast({
        title: nextStatus === 2 ? "تم التجميد" : "تم إلغاء التجميد",
        description: nextStatus === 2 ? "تم تجميد بند خصوم الميزانية" : "تم إلغاء تجميد بند خصوم الميزانية",
      })
    } catch (error) {
      toast({
        title: nextStatus === 2 ? "فشل التجميد" : "فشل إلغاء التجميد",
        description: error instanceof Error ? error.message : "تعذر تحديث حالة البند",
        variant: "destructive",
      })
    }
  }

  const handleDeleteBalanceSheetLiabilityItem = async (itemId: number) => {
    try {
      const response = await fetch(`/api/balance-sheet-liabilities-items/${itemId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حذف البند")
      }

      await fetchBalanceSheetLiabilityItems()
      toast({
        title: "تم الحذف",
        description: "تم حذف بند خصوم الميزانية",
      })
    } catch (error) {
      toast({
        title: "فشل الحذف",
        description: error instanceof Error ? error.message : "تعذر حذف البند",
        variant: "destructive",
      })
    }
  }

  const handleSaveCostCenterType = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!costCenterTypeForm.name.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال اسم النوع",
        variant: "destructive",
      })
      return
    }

    try {
      const isEditing = costCenterTypeForm.id > 0
      const url = isEditing ? `/api/cost-center-types/${costCenterTypeForm.id}` : "/api/cost-center-types"
      const method = isEditing ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: costCenterTypeForm.name,
          status: costCenterTypeForm.status,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حفظ النوع")
      }

      await fetchCostCenterTypes()
      setCostCenterTypeForm({ id: 0, name: "", status: 1 })
      setShowCostCenterTypeForm(false)
      toast({
        title: "تم الحفظ بنجاح",
        description: isEditing ? "تم تعديل نوع مركز التكلفة" : "تم إضافة نوع مركز التكلفة",
      })
    } catch (error) {
      toast({
        title: "فشل الحفظ",
        description: error instanceof Error ? error.message : "حدث خطأ أثناء حفظ النوع",
        variant: "destructive",
      })
    }
  }

  const handleEditCostCenterType = (item: CostCenterType) => {
    setCostCenterTypeForm({ id: item.id, name: item.name, status: item.status })
    setShowCostCenterTypeForm(true)
  }

  const handleFreezeCostCenterType = async (item: CostCenterType) => {
    const nextStatus = getToggledStatus(item.status)
    try {
      const response = await fetch(`/api/cost-center-types/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: item.name, status: nextStatus }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في تحديث حالة النوع")
      }

      await fetchCostCenterTypes()
      toast({
        title: nextStatus === 2 ? "تم التجميد" : "تم إلغاء التجميد",
        description: nextStatus === 2 ? "تم تجميد نوع مركز التكلفة" : "تم إلغاء تجميد نوع مركز التكلفة",
      })
    } catch (error) {
      toast({
        title: nextStatus === 2 ? "فشل التجميد" : "فشل إلغاء التجميد",
        description: error instanceof Error ? error.message : "تعذر تحديث حالة النوع",
        variant: "destructive",
      })
    }
  }

  const handleDeleteCostCenterType = async (itemId: number) => {
    try {
      const response = await fetch(`/api/cost-center-types/${itemId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حذف النوع")
      }

      await fetchCostCenterTypes()
      toast({
        title: "تم الحذف",
        description: "تم حذف نوع مركز التكلفة",
      })
    } catch (error) {
      toast({
        title: "فشل الحذف",
        description: error instanceof Error ? error.message : "تعذر حذف النوع",
        variant: "destructive",
      })
    }
  }

  const handleSaveCostCenter = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!costCenterForm.name.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال اسم مركز التكلفة",
        variant: "destructive",
      })
      return
    }

    if (!costCenterForm.cost_type_id) {
      toast({
        title: "خطأ",
        description: "يرجى اختيار نوع مركز التكلفة",
        variant: "destructive",
      })
      return
    }

    try {
      const isEditing = costCenterForm.id > 0
      const url = isEditing ? `/api/cost-centers/${costCenterForm.id}` : "/api/cost-centers"
      const method = isEditing ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: costCenterForm.name,
          cost_type_id: Number.parseInt(costCenterForm.cost_type_id),
          parent_id: costCenterForm.parent_id !== "none" ? Number.parseInt(costCenterForm.parent_id) : null,
          status: costCenterForm.status,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حفظ مركز التكلفة")
      }

      await fetchCostCenters()
      setCostCenterForm({ id: 0, name: "", cost_type_id: "", parent_id: "none", status: 1 })
      setShowCostCenterForm(false)
      toast({
        title: "تم الحفظ بنجاح",
        description: isEditing ? "تم تعديل مركز التكلفة" : "تم إضافة مركز التكلفة",
      })
    } catch (error) {
      toast({
        title: "فشل الحفظ",
        description: error instanceof Error ? error.message : "حدث خطأ أثناء حفظ مركز التكلفة",
        variant: "destructive",
      })
    }
  }

  const handleEditCostCenter = (item: CostCenter) => {
    setCostCenterForm({
      id: item.id,
      name: item.name,
      cost_type_id: item.cost_type_id.toString(),
      parent_id: item.parent_id ? item.parent_id.toString() : "none",
      status: item.status,
    })
    setShowCostCenterForm(true)
  }

  const handleFreezeCostCenter = async (item: CostCenter) => {
    const nextStatus = getToggledStatus(item.status)
    try {
      const response = await fetch(`/api/cost-centers/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: item.name,
          cost_type_id: item.cost_type_id,
          parent_id: item.parent_id ?? null,
          status: nextStatus,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في تحديث حالة مركز التكلفة")
      }

      await fetchCostCenters()
      toast({
        title: nextStatus === 2 ? "تم التجميد" : "تم إلغاء التجميد",
        description: nextStatus === 2 ? "تم تجميد مركز التكلفة" : "تم إلغاء تجميد مركز التكلفة",
      })
    } catch (error) {
      toast({
        title: nextStatus === 2 ? "فشل التجميد" : "فشل إلغاء التجميد",
        description: error instanceof Error ? error.message : "تعذر تحديث حالة مركز التكلفة",
        variant: "destructive",
      })
    }
  }

  const handleDeleteCostCenter = async (itemId: number) => {
    try {
      const response = await fetch(`/api/cost-centers/${itemId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حذف مركز التكلفة")
      }

      await fetchCostCenters()
      toast({
        title: "تم الحذف",
        description: "تم حذف مركز التكلفة",
      })
    } catch (error) {
      toast({
        title: "فشل الحذف",
        description: error instanceof Error ? error.message : "تعذر حذف مركز التكلفة",
        variant: "destructive",
      })
    }
  }

  const handleSaveAccountClassificationType = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!accountClassificationTypeForm.name.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال اسم النوع", variant: "destructive" })
      return
    }

    try {
      const isEditing = accountClassificationTypeForm.id > 0
      const url = isEditing
        ? `/api/account-classification-types/${accountClassificationTypeForm.id}`
        : "/api/account-classification-types"
      const method = isEditing ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: accountClassificationTypeForm.name,
          status: accountClassificationTypeForm.status,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حفظ نوع تصنيف الحساب")
      }

      await fetchAccountClassificationTypes()
      setAccountClassificationTypeForm({ id: 0, name: "", status: 1 })
      setShowAccountClassificationTypeForm(false)
      toast({ title: "تم الحفظ بنجاح", description: isEditing ? "تم تعديل نوع التصنيف" : "تم إضافة نوع التصنيف" })
    } catch (error) {
      toast({
        title: "فشل الحفظ",
        description: error instanceof Error ? error.message : "حدث خطأ أثناء حفظ نوع التصنيف",
        variant: "destructive",
      })
    }
  }

  const handleEditAccountClassificationType = (item: AccountClassificationType) => {
    setAccountClassificationTypeForm({ id: item.id, name: item.name, status: item.status })
    setShowAccountClassificationTypeForm(true)
  }

  const handleFreezeAccountClassificationType = async (item: AccountClassificationType) => {
    const nextStatus = getToggledStatus(item.status)
    try {
      const response = await fetch(`/api/account-classification-types/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: item.name, status: nextStatus }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في تحديث حالة النوع")
      }

      await fetchAccountClassificationTypes()
      toast({
        title: nextStatus === 2 ? "تم التجميد" : "تم إلغاء التجميد",
        description: nextStatus === 2 ? "تم تجميد نوع تصنيف الحساب" : "تم إلغاء تجميد نوع تصنيف الحساب",
      })
    } catch (error) {
      toast({
        title: nextStatus === 2 ? "فشل التجميد" : "فشل إلغاء التجميد",
        description: error instanceof Error ? error.message : "تعذر تحديث حالة النوع",
        variant: "destructive",
      })
    }
  }

  const handleDeleteAccountClassificationType = async (itemId: number) => {
    try {
      const response = await fetch(`/api/account-classification-types/${itemId}`, { method: "DELETE" })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حذف نوع التصنيف")
      }

      await fetchAccountClassificationTypes()
      toast({ title: "تم الحذف", description: "تم حذف نوع تصنيف الحساب" })
    } catch (error) {
      toast({
        title: "فشل الحذف",
        description: error instanceof Error ? error.message : "تعذر حذف نوع تصنيف الحساب",
        variant: "destructive",
      })
    }
  }

  const handleSaveAccountClassification = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!accountClassificationForm.name.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال اسم التصنيف", variant: "destructive" })
      return
    }

    if (!accountClassificationForm.classification_type_id) {
      toast({ title: "خطأ", description: "يرجى اختيار نوع التصنيف", variant: "destructive" })
      return
    }

    try {
      const isEditing = accountClassificationForm.id > 0
      const url = isEditing
        ? `/api/account-classifications/${accountClassificationForm.id}`
        : "/api/account-classifications"
      const method = isEditing ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: accountClassificationForm.name,
          classification_type_id: Number.parseInt(accountClassificationForm.classification_type_id),
          status: accountClassificationForm.status,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حفظ التصنيف")
      }

      await fetchAccountClassifications()
      setAccountClassificationForm({ id: 0, name: "", classification_type_id: "", status: 1 })
      setShowAccountClassificationForm(false)
      toast({ title: "تم الحفظ بنجاح", description: isEditing ? "تم تعديل تصنيف الحساب" : "تم إضافة تصنيف الحساب" })
    } catch (error) {
      toast({
        title: "فشل الحفظ",
        description: error instanceof Error ? error.message : "حدث خطأ أثناء حفظ التصنيف",
        variant: "destructive",
      })
    }
  }

  const handleEditAccountClassification = (item: AccountClassification) => {
    setAccountClassificationForm({
      id: item.id,
      name: item.name,
      classification_type_id: item.classification_type_id.toString(),
      status: item.status,
    })
    setShowAccountClassificationForm(true)
  }

  const handleFreezeAccountClassification = async (item: AccountClassification) => {
    const nextStatus = getToggledStatus(item.status)
    try {
      const response = await fetch(`/api/account-classifications/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: item.name,
          classification_type_id: item.classification_type_id,
          status: nextStatus,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في تحديث حالة التصنيف")
      }

      await fetchAccountClassifications()
      toast({
        title: nextStatus === 2 ? "تم التجميد" : "تم إلغاء التجميد",
        description: nextStatus === 2 ? "تم تجميد تصنيف الحساب" : "تم إلغاء تجميد تصنيف الحساب",
      })
    } catch (error) {
      toast({
        title: nextStatus === 2 ? "فشل التجميد" : "فشل إلغاء التجميد",
        description: error instanceof Error ? error.message : "تعذر تحديث حالة التصنيف",
        variant: "destructive",
      })
    }
  }

  const handleDeleteAccountClassification = async (itemId: number) => {
    try {
      const response = await fetch(`/api/account-classifications/${itemId}`, { method: "DELETE" })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حذف التصنيف")
      }

      await fetchAccountClassifications()
      toast({ title: "تم الحذف", description: "تم حذف تصنيف الحساب" })
    } catch (error) {
      toast({
        title: "فشل الحذف",
        description: error instanceof Error ? error.message : "تعذر حذف تصنيف الحساب",
        variant: "destructive",
      })
    }
  }

  const getIncomeStatementStatusLabel = (status: number) => {
    if (status === 1) return "نشط"
    if (status === 2) return "مجمد"
    return "محذوف"
  }

  const getIncomeStatementStatusVariant = (status: number): "default" | "secondary" | "destructive" => {
    if (status === 1) return "default"
    if (status === 2) return "secondary"
    return "destructive"
  }

  if (loading) {
    return <LoadingCard title="جاري تحميل التعريفات..." description="يرجى الانتظار حتى تكتمل تهيئة الصفحة" />
  }




  const handleAddWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!warehouseForm.warehouse_code.trim() || !warehouseForm.warehouse_name.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال رمز واسم المستودع",
        variant: "destructive",
      });
      return;
    }

    try {
      const isEditing = warehouseForm.id >  0;
      const url = isEditing ? `/api/warehouses/${warehouseForm.id}` : "/api/warehouses";
      const method = isEditing ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(warehouseForm),
      });

      if (response.ok) {
        toast({
          title: "تم الحفظ بنجاح",
          description: isEditing ? "تم تعديل المستودع بنجاح" : "تم إضافة المستودع بنجاح",
        });
        await fetchWarehouses();
        setWarehouseForm({ id: 0, warehouse_code: "", warehouse_name: "", location: "", status: 1 });
        setShowWarehouseForm(false);
      } else {
        const error = await response.json();
        toast({
          title: "فشل الحفظ",
          description: error.error || "حدث خطأ أثناء حفظ المستودع",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error saving warehouse:", error);
      toast({
        title: "خطأ في الاتصال",
        description: "تعذر الاتصال بالخادم، يرجى المحاولة مرة أخرى",
        variant: "destructive",
      });
    }
  };
  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!branchForm.branch_code.trim() || !branchForm.branch_name.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال رمز واسم الفرع",
        variant: "destructive",
      });
      return;
    }

    try {
      const method = editingBranchId ? "PUT" : "POST";
      const url = editingBranchId
        ? `/api/branches/${editingBranchId}`
        : `/api/branches`;

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(branchForm),
      });

      if (response.ok) {
        toast({
          title: editingBranchId ? "تم التعديل بنجاح" : "تم الحفظ بنجاح",
          description: editingBranchId
            ? "تم تحديث بيانات الفرع بنجاح"
            : "تم إضافة الفرع بنجاح",
        });

        await fetchBranches();

        // reset form
        setBranchForm({
          id: 0,
          branch_code: "",
          branch_name: "",
          address: "",
          manager: "",
          phone: "",
        });

        setEditingBranchId(null);
        setShowBranchForm(false);
      } else {
        const error = await response.json();
        toast({
          title: "فشل العملية",
          description: error.error || "حدث خطأ أثناء حفظ الفرع",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error saving branch:", error);
      toast({
        title: "خطأ في الاتصال",
        description: "تعذر الاتصال بالخادم، يرجى المحاولة مرة أخرى",
        variant: "destructive",
      });
    }
  };


  const handleAddDepartment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!departmentForm.department_code.trim() || !departmentForm.department_name.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال رمز واسم القسم",
        variant: "destructive",
      });
      return;
    }

    try {
      const isEditing = departmentForm.id && departmentForm.id > 0;
      const url = isEditing
        ? `/api/departments/${departmentForm.id}`
        : "/api/departments";

      const method = isEditing ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...departmentForm,
          branch_id: departmentForm.branch_id ? Number.parseInt(departmentForm.branch_id) : null,
        }),
      });

      if (response.ok) {
        toast({
          title: "تم الحفظ بنجاح",
          description: isEditing ? "تم تعديل القسم بنجاح" : "تم إضافة القسم بنجاح",
        });
        await fetchDepartments();
        setDepartmentForm({ id: 0, department_code: "", department_name: "", branch_id: "", manager: "" });
        setShowDepartmentForm(false);
      } else {
        const error = await response.json();
        toast({
          title: "فشل الحفظ",
          description: error.error || "حدث خطأ أثناء حفظ القسم",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error saving department:", error);
      toast({
        title: "خطأ في الاتصال",
        description: "تعذر الاتصال بالخادم، يرجى المحاولة مرة أخرى",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-6" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-heading font-bold text-primary">الملفات والتعريفات</h1>
        </div>
        <Badge variant="outline" className="text-sm">
          إدارة شاملة للنظام
        </Badge>
      </div>

      <Tabs defaultValue="definitions" className="w-full" dir="rtl">
        <TabsList className="grid w-full grid-cols-5 mb-6">
          <TabsTrigger value="definitions" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            التعريفات الأساسية
          </TabsTrigger>
          <TabsTrigger value="items" className="flex items-center gap-2">
            <Package2 className="h-4 w-4" />
            الاصناف
          </TabsTrigger>
          <TabsTrigger value="financial-definitions" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            التعريفات المالية
          </TabsTrigger>
          <TabsTrigger value="departments" className="flex items-center gap-2">
            <Building className="h-4 w-4" />
            الأقسام والفروع
          </TabsTrigger>
          <TabsTrigger value="workflow-stages" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            مراحل العمل
          </TabsTrigger>
          <TabsTrigger value="workflow-sequences" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            تسلسلات العمل
          </TabsTrigger>
        </TabsList>

        <TabsContent value="departments" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card dir="rtl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Building className="h-5 w-5 text-primary" />
                    الفروع ({branches.length})
                  </CardTitle>
                  <Button className="erp-btn-primary" size="sm" onClick={() => setShowBranchForm(!showBranchForm)}>
                    <Plus className="h-4 w-4 mr-2" />
                    {editingBranchId ? "تعديل الفرع" : "إضافة فرع جديد"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">


                {showBranchForm && (
                  <div className="bg-muted/30 rounded-lg p-4 border" dir="rtl">
                    <h3 className="font-heading font-semibold mb-4 text-right">إضافة فرع جديد</h3>
                    <form className="space-y-4" onSubmit={handleAddBranch}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="text-right">
                          <Label className="erp-label text-right block">رمز الفرع *</Label>
                          <Input
                            required
                            className="erp-input text-right"
                            placeholder="B001"
                            dir="rtl"
                            maxLength={5}

                            value={branchForm.branch_code}
                            onChange={(e) => {
                              const value = e.target.value
                                .toUpperCase()        // تحويل إلى Capital
                                .replace(/[^A-Z0-9]/g, ""); // السماح فقط بالحروف الإنجليزية والأرقام

                              setBranchForm({ ...branchForm, branch_code: value });
                            }}
                          />
                        </div>
                        <div className="text-right">
                          <Label className="erp-label text-right block">اسم الفرع *</Label>
                          <Input
                            required
                            className="erp-input text-right"
                            placeholder="مثال: فرع رام الله"
                            dir="rtl"
                            maxLength={30}
                            value={branchForm.branch_name}
                            onChange={(e) => setBranchForm({ ...branchForm, branch_name: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <Label className="erp-label text-right block">رقم الهاتف</Label>
                        <Input
                          className="erp-input text-right"
                          placeholder="09-1234567"
                          dir="rtl"
                          value={branchForm.phone}
                          maxLength={12}
                          onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                        />
                      </div>
                      <div className="text-right">
                        <Label className="erp-label text-right block">العنوان</Label>
                        <Input
                          className="erp-input text-right"
                          placeholder="العنوان الكامل للفرع"
                          dir="rtl"
                          maxLength={30}
                          value={branchForm.address}
                          onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                        />
                      </div>
                      <div className="text-right">
                        <Label className="erp-label text-right block">مسؤول الفرع</Label>
                        <Input
                          className="erp-input text-right"
                          placeholder="اسم المسؤول"
                          dir="rtl"
                          maxLength={30}
                          value={branchForm.manager}
                          onChange={(e) => setBranchForm({ ...branchForm, manager: e.target.value })}
                        />
                      </div>
                      <div className="flex justify-start gap-2 pt-2">
                        <Button type="submit" className="erp-btn-primary" size="sm">
                          <Button type="submit" className="erp-btn-primary" size="sm">
                            {editingBranchId ? "تحديث" : "حفظ"}
                          </Button>
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowBranchForm(false)}>
                          إلغاء
                        </Button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="space-y-3">
                  {branches.map((branch, index) => (
                    <div
                      key={branch.id}
                      className={cn(
                        "p-4 rounded-lg border transition-all cursor-pointer",
                        index === currentBranchIndex
                          ? "bg-primary/10 border-primary shadow-sm"
                          : "bg-background hover:bg-muted/50",
                      )}
                      onClick={() => setCurrentBranchIndex(index)}
                      dir="rtl"
                    >
                      <div className="flex items-center justify-between">
                        <div className="space-y-1 text-right">
                          <h4 className="font-heading font-semibold">{branch.branch_name}</h4>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {branch.address || "لا يوجد عنوان"}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>المسؤول: {branch.manager || "غير محدد"}</span>
                            <span>الهاتف: {branch.phone || "غير محدد"}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEditBranch(branch)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Badge variant={branch.is_active ? "default" : "secondary"}>
                            {branch.is_active ? "نشط" : "غير نشط"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card dir="rtl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    الأقسام ({departments.length})
                  </CardTitle>
                  <Button
                    className="erp-btn-primary"
                    size="sm"
                    onClick={() => setShowDepartmentForm(!showDepartmentForm)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    إضافة قسم
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">


                {showDepartmentForm && (
                  <div className="bg-muted/30 rounded-lg p-4 border" dir="rtl">
                    <h3 className="font-heading font-semibold mb-4 text-right">إضافة قسم جديد</h3>
                    <form className="space-y-4" onSubmit={handleAddDepartment}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="text-right">
                          <Label className="erp-label text-right block">رمز القسم *</Label>
                          <Input
                            required
                            className="erp-input text-right"
                            placeholder="D0001"
                            dir="rtl"
                            onChange={(e) => {
                              const value = e.target.value
                                .toUpperCase()        // تحويل إلى Capital
                                .replace(/[^A-Z0-9]/g, ""); // السماح فقط بالحروف الإنجليزية والأرقام

                              setDepartmentForm({ ...departmentForm, department_code: value })
                            }}
                            value={departmentForm.department_code}
                            maxLength={5}
                          />
                        </div>
                        <div className="text-right">
                          <Label className="erp-label text-right block">اسم القسم *</Label>
                          <Input
                            required
                            className="erp-input text-right"
                            placeholder="مثال: المحاسبة"
                            dir="rtl"
                            maxLength={30}
                            value={departmentForm.department_name}
                            onChange={(e) => setDepartmentForm({ ...departmentForm, department_name: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <Label className="erp-label text-right block">تابع لفرع</Label>
                        <Select
                          dir="rtl"
                          value={departmentForm.branch_id}
                          onValueChange={(value) => setDepartmentForm({ ...departmentForm, branch_id: value })}
                        >
                          <SelectTrigger className="erp-input text-right">
                            <SelectValue placeholder="اختر الفرع" />
                          </SelectTrigger>
                          <SelectContent>
                            {branches.map((branch) => (
                              <SelectItem key={branch.id} value={branch.id.toString()}>
                                {branch.branch_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="text-right">
                        <Label className="erp-label text-right block">مسؤول القسم</Label>
                        <Input
                          className="erp-input text-right"
                          placeholder="اسم المسؤول"
                          dir="rtl"
                          maxLength={30}
                          value={departmentForm.manager}
                          onChange={(e) => setDepartmentForm({ ...departmentForm, manager: e.target.value })}
                        />
                      </div>
                      <div className="flex justify-start gap-2 pt-2">
                        <Button type="submit" className="erp-btn-primary" size="sm">
                          حفظ القسم
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowDepartmentForm(false)}>
                          إلغاء
                        </Button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="space-y-3">
                  {departments.map((dept, index) => (
                    <div
                      key={dept.id}
                      className={cn(
                        "p-4 rounded-lg border transition-all cursor-pointer",
                        index === currentDepartmentIndex
                          ? "bg-primary/10 border-primary shadow-sm"
                          : "bg-background hover:bg-muted/50",
                      )}
                      onClick={() => setCurrentDepartmentIndex(index)}
                      dir="rtl"
                    >
                      <div className="flex items-center justify-between">
                        <div className="space-y-1 text-right">
                          <h4 className="font-heading font-semibold">{dept.department_name}</h4>
                          <p className="text-sm text-muted-foreground">الفرع: {dept.branch_name || "غير محدد"}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>المسؤول: {dept.manager || "غير محدد"}</span>
                            <span>الموظفين: {dept.employee_count}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEditDepartment(dept)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Badge variant={dept.is_active ? "default" : "secondary"}>
                            {dept.is_active ? "نشط" : "غير نشط"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

          </div>
        </TabsContent>

        <TabsContent value="items" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Card dir="rtl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Currency className="h-4 w-4 text-primary" />
                    التصنيف الضريبي
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setShowTaxClassificationForm(!showTaxClassificationForm); if (!showTaxClassificationForm) setTaxClassificationForm({ name: '', tax_percent: 0, status: 1 }) }}
                  >
                    <Plus className="h-3 w-3" />
                    اضافة فئة
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {showTaxClassificationForm && (
                  <div className="bg-muted/30 rounded-lg p-3 border" dir="rtl">
                    <form className="space-y-3" onSubmit={handleSaveTaxClassification}>
                      <div className="text-right grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label className="erp-label text-sm text-right block">اسم التصنيف الضريبي</Label>
                          <Input className="erp-input text-right" placeholder="مثال: ضريبة سنوية" dir="rtl"
                            value={taxClassificationForm.name}
                            onChange={(e) => setTaxClassificationForm({ ...taxClassificationForm, name: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="erp-label text-sm text-right block">نسبة الضريبة (%)</Label>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={0.01}
                            className="erp-input text-right"
                            placeholder="0.00"
                            dir="rtl"
                            value={taxClassificationForm.tax_percent ?? 0}
                            onChange={(e) => {
                              const raw = Number(e.target.value)
                              const v = isNaN(raw) ? 0 : Math.max(0, Math.min(100, raw))
                              setTaxClassificationForm({ ...taxClassificationForm, tax_percent: v })
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex justify-start gap-2">
                        <Button type="submit" size="sm" className="erp-btn-primary">
                          حفظ
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowTaxClassificationForm(false)}
                        >
                          إلغاء
                        </Button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {taxClassifications.map((item, index) => (
                    <div key={item.id} className="p-3 rounded-lg border bg-background hover:bg-muted/50 transition-colors" dir="rtl">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: colors[index % colors.length] }} />
                          <div className="text-right min-w-0">
                            <h4 className="font-medium text-sm truncate">{item.name}</h4>
                            <p className="text-xs text-muted-foreground">النسبة: {Number(item.tax_percent ?? 0).toFixed(2)}%</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button variant="outline" size="sm" onClick={() => handleEditTaxClassification(item)} aria-label="تعديل التصنيف" title="تعديل التصنيف">
                            <Edit className="h-3 w-3" />
                          </Button>
                          {item.status !== 3 && (
                            <Button variant="outline" size="sm" onClick={() => handleFreezeTaxClassification(item)}>
                              {getToggleStatusLabel(item.status)}
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openDeleteConfirm("هل أنت متأكد من حذف هذا التصنيف الضريبي؟", () => handleDeleteTaxClassification(item.id))}
                            aria-label="حذف التصنيف"
                            title="حذف التصنيف"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                          <Badge variant={getStatusBadgeVariant(item.status)}>
                            {getStatusLabel(item.status)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card dir="rtl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Package className="h-4 w-4 text-primary" />
                    المستودعات ({warehouses.length})
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowWarehouseForm(!showWarehouseForm)}
                  >
                    <Plus className="h-3 w-3" />
                    إضافة مستودع
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {showWarehouseForm && (
                  <div className="bg-muted/30 rounded-lg p-4 border" dir="rtl">
                    <h3 className="font-heading font-semibold mb-4 text-right">إضافة مستودع جديد</h3>
                    <form className="space-y-4" onSubmit={handleAddWarehouse}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="text-right">
                          <Label className="erp-label text-right block">رمز المستودع *</Label>
                          <Input
                            required
                            className="erp-input text-right"
                            placeholder="MAIN"
                            dir="rtl"
                            value={warehouseForm.warehouse_code}
                            maxLength={8}
                            onChange={(e) => {
                              const value = e.target.value
                                .toUpperCase()
                                .replace(/[^A-Z0-9]/g, "")

                              setWarehouseForm({ ...warehouseForm, warehouse_code: value })
                            }}
                          />
                        </div>
                        <div className="text-right">
                          <Label className="erp-label text-right block">اسم المستودع *</Label>
                          <Input
                            required
                            className="erp-input text-right"
                            placeholder="مثال: مستودع الخليل"
                            dir="rtl"
                            maxLength={30}
                            value={warehouseForm.warehouse_name}
                            onChange={(e) => setWarehouseForm({ ...warehouseForm, warehouse_name: e.target.value })}
                          />
                        </div>
                      </div>
                      {/* الحالة سيتم التحكم بها عبر زر التجميد / إلغاء التجميد في الصف */}
                      <div className="flex justify-start gap-2 pt-2">
                        <Button type="submit" className="erp-btn-primary" size="sm">
                          حفظ المستودع
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowWarehouseForm(false)}>
                          إلغاء
                        </Button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="space-y-3">
                  {warehouses.map((warehouse, index) => (
                    <div
                      key={warehouse.id}
                      className={cn(
                        "p-4 rounded-lg border transition-all cursor-pointer",
                        index === currentWarehouseIndex
                          ? "bg-primary/10 border-primary shadow-sm"
                          : "bg-background hover:bg-muted/50",
                      )}
                      onClick={() => setCurrentWarehouseIndex(index)}
                      dir="rtl"
                    >
                      <div className="flex items-center justify-between">
                        <div className="space-y-1 text-right">
                          <h4 className="font-heading font-semibold">{warehouse.warehouse_name}</h4>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {warehouse.location || "لا يوجد موقع"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEditWarehouse(warehouse)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          {warehouse.status !== 3 && (
                            <Button variant="outline" size="sm" onClick={() => handleFreezeWarehouse(warehouse)}>
                              {getToggleStatusLabel(warehouse.status)}
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openDeleteConfirm("هل أنت متأكد من حذف هذا المستودع؟", () => handleDeleteWarehouse(warehouse.id))}
                            aria-label="حذف المستودع"
                            title="حذف المستودع"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                          <Badge variant={getStatusBadgeVariant(warehouse.status)}>
                            {getStatusLabel(warehouse.status)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card dir="rtl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Package2 className="h-4 w-4 text-primary" />
                    الوحدات ({units.length})
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const show = !showUnitForm
                      setShowUnitForm(show)
                      if (!show) {
                        setUnitForm({ unit_name: "", unit_name_e: "", description: "", status: 1 })
                        setEditingUnitId(null)
                      }
                    }}
                  >
                    <Plus className="h-3 w-3" />
                    إضافة وحدة
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {showUnitForm && (
                  <div className="bg-muted/30 rounded-lg p-4 border" dir="rtl">
                    <h3 className="font-heading font-semibold mb-4 text-right">{editingUnitId ? "تعديل الوحدة" : "إضافة وحدة جديدة"}</h3>
                    <form className="space-y-4" onSubmit={handleAddUnit}>
                      <div className="text-right">
                        <Label className="erp-label text-right block">اسم الوحدة *</Label>
                        <Input
                          required
                          className="erp-input text-right"
                          placeholder="مثال: كرتونة"
                          dir="rtl"
                          value={unitForm.unit_name}
                          onChange={(e) => setUnitForm({ ...unitForm, unit_name: e.target.value })}
                        />
                      </div>
                      <div className="text-right">
                        <Label className="erp-label text-right block">الاسم الإنجليزي للوحدة</Label>
                        <Input
                          className="erp-input text-right"
                          placeholder="Example: Box"
                          dir="rtl"
                          value={unitForm.unit_name_e}
                          onChange={(e) => setUnitForm({ ...unitForm, unit_name_e: e.target.value })}
                        />
                      </div>
                      {/* الحالة سيتم التحكم بها عبر زر التجميد / إلغاء التجميد في الصف */}
                      <div className="flex justify-start gap-2 pt-2">
                        <Button type="submit" className="erp-btn-primary" size="sm">
                          حفظ الوحدة
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => {
                          setShowUnitForm(false)
                          setUnitForm({ unit_name: "", unit_name_e: "", description: "" })
                          setEditingUnitId(null)
                        }}>
                          إلغاء
                        </Button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="space-y-3">
                  {units.map((unit, index) => (
                    <div
                      key={unit.id}
                      className={cn(
                        "p-4 rounded-lg border transition-all cursor-pointer",
                        index === currentUnitIndex
                          ? "bg-primary/10 border-primary shadow-sm"
                          : "bg-background hover:bg-muted/50",
                      )}
                      onClick={() => setCurrentUnitIndex(index)}
                      dir="rtl"
                    >
                      <div className="flex items-center justify-between">
                        <div className="space-y-1 text-right">
                          <h4 className="font-heading font-semibold">{unit.unit_name}</h4>
                          <p className="text-sm text-muted-foreground">{unit.unit_name_e}</p>
                          <p className="text-xs text-muted-foreground">{unit.description || "بدون وصف"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEditUnit(unit)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          {unit.status !== 3 && (
                            <Button variant="outline" size="sm" onClick={() => handleFreezeUnit(unit)}>
                              {getToggleStatusLabel(unit.status)}
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openDeleteConfirm("هل أنت متأكد من حذف هذه الوحدة؟", () => handleDeleteUnit(unit.id))}
                            aria-label="حذف الوحدة"
                            title="حذف الوحدة"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                          <Badge variant={getStatusBadgeVariant(unit.status)}>
                            {getStatusLabel(unit.status)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="definitions" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card dir="rtl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-primary" />
                    المدن ({cities.length})
                  </CardTitle>
                  <Button className="erp-btn-primary" size="sm" onClick={() => setShowCityForm(!showCityForm)}>
                    <Plus className="h-4 w-4 mr-2" />
                    إضافة مدينة
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">


                {showCityForm && (
                  <div className="bg-muted/30 rounded-lg p-4 border" dir="rtl">
                    <h3 className="font-heading font-semibold mb-4 text-right">إضافة مدينة جديدة</h3>
                    <form className="space-y-4" onSubmit={handleAddCity}>
                      <div className="text-right">
                        <Label className="erp-label text-right block">اسم المدينة *</Label>
                        <Input
                          required
                          className="erp-input text-right"
                          placeholder="مثال: طولكرم"
                          dir="rtl"
                          value={cityForm.name}
                          maxLength={30}
                          onChange={(e) => setCityForm({ ...cityForm, name: e.target.value })}
                        />
                      </div>
                      <div className="flex justify-start gap-2 pt-2">
                        <Button type="submit" className="erp-btn-primary" size="sm">
                          حفظ المدينة
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => {
                          setShowCityForm(false)
                          setCityForm({ id: 0, name: "", status: 1 })
                        }}>
                          إلغاء
                        </Button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {cities.map((city, index) => (
                    <div
                      key={city.id}
                      className={cn(
                        "p-3 rounded-lg border transition-all cursor-pointer",
                        index === currentCityIndex ? "bg-primary/10 border-primary" : "bg-background hover:bg-muted/50",
                      )}
                      onClick={() => setCurrentCityIndex(index)}
                      dir="rtl"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-right">
                          <h4 className="font-medium">{city.name}</h4>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEditCity(city)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          {city.status !== 3 && (
                            <Button variant="outline" size="sm" onClick={() => handleFreezeCity(city)}>
                              {getToggleStatusLabel(city.status)}
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openDeleteConfirm("هل أنت متأكد من حذف هذه المدينة؟", () => handleDeleteCity(city.id))}
                            aria-label="حذف المدينة"
                            title="حذف المدينة"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                          <Badge variant={getStatusBadgeVariant(city.status)}>
                            {getStatusLabel(city.status)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card dir="rtl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Package2 className="h-4 w-4 text-primary" />
                    فئات الأسعار
                  </CardTitle>
                  <Button
                    className="erp-btn-primary"
                    size="sm"
                    onClick={() => {
                      const show = !showPriceForm
                      setShowPriceForm(show)
                      if (show) {
                        setPriceForm({ name: "", name_en: "", description: "", status: 1 })
                        setEditingPriceId(null)
                      }
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    اضافة فئة
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">


                {showPriceForm && (
                  <div className="bg-muted/30 rounded-lg p-4 border" dir="rtl">
                    <h3 className="font-heading font-semibold mb-4 text-right">إضافة فئة جديدة</h3>
                    <form className="space-y-4" onSubmit={handleAddPrice}>
                      <div className="grid grid-cols-1 md:grid-cols-1 gap-4">

                        <div className="text-right">
                          <Label className="erp-label text-right block">اسم الفئة *</Label>
                          <Input
                            required
                            className="erp-input text-right"
                            placeholder="مفرق"
                            dir="rtl"
                            value={priceForm.name}
                            onChange={(e) => setPriceForm({ ...priceForm, name: e.target.value })}
                          />
                        </div>
                        <div className="text-right">
                          <Label className="erp-label text-right block">اسم الفئة en</Label>
                          <Input
                            className="erp-input text-right"
                            placeholder=""
                            dir="rtl"
                            value={priceForm.name_en}
                            onChange={(e) => setPriceForm({ ...priceForm, name_en: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="text-right">
                        <Label className="erp-label text-right block">الوصف</Label>
                        <Input
                          className="erp-input text-right"
                          placeholder="وصف الفئة"
                          dir="rtl"
                          value={priceForm.description}
                          onChange={(e) => setPriceForm({ ...priceForm, description: e.target.value })}
                        />
                      </div>

                      <div className="flex justify-start gap-2 pt-2">
                        <Button type="submit" className="erp-btn-primary" size="sm">
                          حفظ الفئة
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => {
                          setShowPriceForm(false);
                          setPriceForm({ name: "", name_en: "", description: "", status: 1 })
                          setShowPriceForm(false)
                          setEditingPriceId(null)
                        }}>
                          إلغاء
                        </Button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="space-y-3">
                  {prices.map((price, index) => (
                    <div
                      key={price.id}
                      className={cn(
                        "p-4 rounded-lg border transition-all cursor-pointer",
                        index === currentPriceIndex
                          ? "bg-primary/10 border-primary shadow-sm"
                          : "bg-background hover:bg-muted/50",
                      )}
                      onClick={() => setCurrentPriceIndex(index)}
                      dir="rtl"
                    >
                      <div className="flex items-center justify-between">
                        <div className="space-y-1 text-right">
                          <h4 className="font-heading font-semibold">{price.name}</h4>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">

                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEditPrice(price)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          {price.status !== 3 && (
                            <Button variant="outline" size="sm" onClick={() => handleFreezePrice(price)}>
                              {getToggleStatusLabel(price.status)}
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openDeleteConfirm("هل أنت متأكد من حذف هذه الفئة؟", () => handleDeletePrice(price.id))}
                            aria-label="حذف الفئة"
                            title="حذف الفئة"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                          <Badge variant={getStatusBadgeVariant(price.status)}>
                            {getStatusLabel(price.status)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>


            <Salesmen
            />

          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Customer Categories */}
            <Card dir="rtl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="h-4 w-4 text-primary" />
                    تصنيفات العملاء
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowCustomerCategoryForm(!showCustomerCategoryForm)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {showCustomerCategoryForm && (
                  <div className="bg-muted/30 rounded-lg p-3 border" dir="rtl">
                    <form className="space-y-3" onSubmit={handleAddCustomerCategories}>
                      <div className="text-right">
                        <Label className="erp-label text-sm text-right block">اسم التصنيف</Label>
                        <Input className="erp-input text-right" placeholder="مثال: العملاء الجملة" dir="rtl"
                          value={customercategoryForm.name}
                          onChange={(e) => setCustomercategoryForm({ ...customercategoryForm, name: e.target.value })}
                        />
                      </div>
                      <div className="text-right">
                        <Label className="erp-label text-sm text-right block">نسبة الخصم (%)</Label>
                        <Input
                          type="number"
                          className="erp-input text-right"
                          placeholder="10"
                          dir="rtl"
                          value={customercategoryForm.discount}
                          onChange={(e) => {
                            let value = Number(e.target.value)
                            if (value > 100) value = 100   // Limit to 100
                            if (value < 0) value = 0       // Optional: prevent negative
                            setCustomercategoryForm({
                              ...customercategoryForm,
                              discount: value
                            })
                          }}
                        />
                      </div>
                      <div className="flex justify-start gap-2">
                        <Button type="submit" size="sm" className="erp-btn-primary">
                          حفظ
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowCustomerCategoryForm(false)}
                        >
                          إلغاء
                        </Button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {customercategories.map((category, index) => (
                    <div
                      key={category.id}
                      className="p-3 rounded-lg border bg-background hover:bg-muted/50 transition-colors"
                      dir="rtl"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                          <div className="text-right">
                            <h4 className="font-medium text-sm">{category.name}</h4>
                            <p className="text-xs text-muted-foreground">خصم {category.discount}%</p>
                          </div>
                        </div>

                      </div>
                      <div className="mt-2">

                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Supplier Categories */}
            <Card dir="rtl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Package className="h-4 w-4 text-primary" />
                    تصنيفات الموردين
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowSupplierCategoryForm(!showSupplierCategoryForm)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {showSupplierCategoryForm && (
                  <div className="bg-muted/30 rounded-lg p-3 border" dir="rtl">
                    <form className="space-y-3" onSubmit={handleAddSupplierCategories}>
                      <div className="text-right">
                        <Label className="erp-label text-sm text-right block">اسم التصنيف</Label>
                        <Input className="erp-input text-right" placeholder="مثال: موردين أوروبيين" dir="rtl"
                          value={suppliercategoryForm.name}
                          onChange={(e) => setSuppliercategoryForm({ ...suppliercategoryForm, name: e.target.value })}
                        />
                      </div>
                      <div className="text-right">
                        <Label className="erp-label text-sm text-right block">شروط الدفع</Label>
                        <Input className="erp-input text-right" placeholder="مثال: 30 يوم" dir="rtl"
                          value={suppliercategoryForm.paymentterms}
                          onChange={(e) => setSuppliercategoryForm({ ...suppliercategoryForm, paymentterms: e.target.value })}
                        />
                      </div>
                      <div className="flex justify-start gap-2">
                        <Button type="submit" size="sm" className="erp-btn-primary">
                          حفظ
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowSupplierCategoryForm(false)}
                        >
                          إلغاء
                        </Button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {suppliercategories.map((category, index) => (
                    <div
                      key={category.id}
                      className="p-3 rounded-lg border bg-background hover:bg-muted/50 transition-colors"
                      dir="rtl"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                          <div className="text-right">
                            <h4 className="font-medium text-sm">{category.name}</h4>
                            <p className="text-xs text-muted-foreground">{category.paymentterms}</p>
                          </div>
                        </div>

                      </div>

                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Product Categories */}
            <Card dir="rtl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Package className="h-4 w-4 text-primary" />
                    تصنيفات الأصناف
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowProductCategoryForm(!showProductCategoryForm)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {showProductCategoryForm && (
                  <div className="bg-muted/30 rounded-lg p-3 border" dir="rtl">
                    <form className="space-y-3" onSubmit={handleAddProductCategories}>
                      <div className="text-right">
                        <Label className="erp-label text-sm text-right block">اسم التصنيف</Label>
                        <Input className="erp-input text-right" placeholder="مثال: مواد غذائية" dir="rtl"
                          value={productcategoryForm.name}
                          onChange={(e) => setProductcategoryForm({ ...productcategoryForm, name: e.target.value })}
                        />
                      </div>

                      <div className="flex justify-start gap-2">
                        <Button type="submit" size="sm" className="erp-btn-primary">
                          حفظ
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowProductCategoryForm(false)}
                        >
                          إلغاء
                        </Button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {productcategories.map((category, index) => (
                    <div
                      key={category.id}
                      className="p-3 rounded-lg border bg-background hover:bg-muted/50 transition-colors"
                      dir="rtl"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                          <div className="text-right">
                            <h4 className="font-medium text-sm">{category.name}</h4>
                          </div>
                        </div>

                      </div>
                      <div className="mt-2">

                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

        </TabsContent>

        <TabsContent value="financial-definitions" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Card dir="rtl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    بنود قائمة الدخل ({incomeStatementItems.length})
                  </CardTitle>
                  <Button
                    className="erp-btn-primary"
                    size="sm"
                    onClick={() => {
                      setIncomeStatementItemForm({ id: 0, name: "", status: 1 })
                      setShowIncomeStatementItemForm(!showIncomeStatementItemForm)
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    إضافة بند
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {showIncomeStatementItemForm && (
                  <div className="bg-muted/30 rounded-lg p-4 border" dir="rtl">
                    <h3 className="font-heading font-semibold mb-4 text-right">
                      {incomeStatementItemForm.id > 0 ? "تعديل بند قائمة الدخل" : "إضافة بند جديد"}
                    </h3>
                    <form className="space-y-4" onSubmit={handleSaveIncomeStatementItem}>
                      <div className="text-right">
                        <Label className="erp-label text-right block">اسم البند *</Label>
                        <Input
                          required
                          className="erp-input text-right"
                          placeholder="مثال: إيرادات المبيعات"
                          dir="rtl"
                          maxLength={100}
                          value={incomeStatementItemForm.name}
                          onChange={(e) => setIncomeStatementItemForm({ ...incomeStatementItemForm, name: e.target.value })}
                        />
                      </div>

                      {/* الحالة يتم التحكم بها من خلال أزرار التجميد/إلغاء التجميد في الصف */}

                      <div className="flex justify-start gap-2 pt-2">
                        <Button type="submit" className="erp-btn-primary" size="sm">
                          حفظ البند
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowIncomeStatementItemForm(false)
                            setIncomeStatementItemForm({ id: 0, name: "", status: 1 })
                          }}
                        >
                          إلغاء
                        </Button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="space-y-3">
                  {incomeStatementItems.map((item, index) => (
                    <div
                      key={item.id}
                      className={cn(
                        "p-4 rounded-lg border transition-all cursor-pointer",
                        index === currentIncomeStatementItemIndex
                          ? "bg-primary/10 border-primary shadow-sm"
                          : "bg-background hover:bg-muted/50",
                      )}
                      onClick={() => setCurrentIncomeStatementItemIndex(index)}
                      dir="rtl"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1 text-right">
                          <h4 className="font-heading font-semibold">{item.name}</h4>
                          <p className="text-xs text-muted-foreground">ID: {item.id}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEditIncomeStatementItem(item)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          {item.status !== 3 && (
                            <Button variant="outline" size="sm" onClick={() => handleStopIncomeStatementItem(item)}>
                              {getToggleStatusLabel(item.status)}
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openDeleteConfirm("هل أنت متأكد من حذف هذا البند من قائمة الدخل؟", () => handleDeleteIncomeStatementItem(item.id))}
                            aria-label="حذف البند"
                            title="حذف البند"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                          <Badge variant={getStatusBadgeVariant(item.status)}>
                            {getStatusLabel(item.status)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card dir="rtl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    بنود أصول الميزانية ({balanceSheetAssetItems.length})
                  </CardTitle>
                  <Button
                    className="erp-btn-primary"
                    size="sm"
                    onClick={() => {
                      setBalanceSheetAssetItemForm({ id: 0, name: "", status: 1 })
                      setShowBalanceSheetAssetItemForm(!showBalanceSheetAssetItemForm)
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    إضافة بند
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {showBalanceSheetAssetItemForm && (
                  <div className="bg-muted/30 rounded-lg p-4 border" dir="rtl">
                    <h3 className="font-heading font-semibold mb-4 text-right">
                      {balanceSheetAssetItemForm.id > 0 ? "تعديل بند أصول الميزانية" : "إضافة بند جديد"}
                    </h3>
                    <form className="space-y-4" onSubmit={handleSaveBalanceSheetAssetItem}>
                      <div className="text-right">
                        <Label className="erp-label text-right block">اسم البند *</Label>
                        <Input
                          required
                          className="erp-input text-right"
                          placeholder="مثال: الصندوق"
                          dir="rtl"
                          maxLength={100}
                          value={balanceSheetAssetItemForm.name}
                          onChange={(e) => setBalanceSheetAssetItemForm({ ...balanceSheetAssetItemForm, name: e.target.value })}
                        />
                      </div>

                      {/* الحالة سيتم التحكم بها عبر زر التجميد / إلغاء التجميد في الصف */}

                      <div className="flex justify-start gap-2 pt-2">
                        <Button type="submit" className="erp-btn-primary" size="sm">
                          حفظ البند
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowBalanceSheetAssetItemForm(false)
                            setBalanceSheetAssetItemForm({ id: 0, name: "", status: 1 })
                          }}
                        >
                          إلغاء
                        </Button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="space-y-3">
                  {balanceSheetAssetItems.map((item, index) => (
                    <div
                      key={item.id}
                      className={cn(
                        "p-4 rounded-lg border transition-all cursor-pointer",
                        index === currentBalanceSheetAssetItemIndex
                          ? "bg-primary/10 border-primary shadow-sm"
                          : "bg-background hover:bg-muted/50",
                      )}
                      onClick={() => setCurrentBalanceSheetAssetItemIndex(index)}
                      dir="rtl"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1 text-right">
                          <h4 className="font-heading font-semibold">{item.name}</h4>
                          <p className="text-xs text-muted-foreground">ID: {item.id}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEditBalanceSheetAssetItem(item)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          {item.status !== 3 && (
                            <Button variant="outline" size="sm" onClick={() => handleStopBalanceSheetAssetItem(item)}>
                              {getToggleStatusLabel(item.status)}
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openDeleteConfirm("هل أنت متأكد من حذف هذا البند من أصول الميزانية؟", () => handleDeleteBalanceSheetAssetItem(item.id))}
                            aria-label="حذف البند"
                            title="حذف البند"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                          <Badge variant={getStatusBadgeVariant(item.status)}>
                            {getStatusLabel(item.status)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card dir="rtl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    بنود خصوم الميزانية ({balanceSheetLiabilityItems.length})
                  </CardTitle>
                  <Button
                    className="erp-btn-primary"
                    size="sm"
                    onClick={() => {
                      setBalanceSheetLiabilityItemForm({ id: 0, name: "", status: 1 })
                      setShowBalanceSheetLiabilityItemForm(!showBalanceSheetLiabilityItemForm)
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    إضافة بند
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {showBalanceSheetLiabilityItemForm && (
                  <div className="bg-muted/30 rounded-lg p-4 border" dir="rtl">
                    <h3 className="font-heading font-semibold mb-4 text-right">
                      {balanceSheetLiabilityItemForm.id > 0 ? "تعديل بند خصوم الميزانية" : "إضافة بند جديد"}
                    </h3>
                    <form className="space-y-4" onSubmit={handleSaveBalanceSheetLiabilityItem}>
                      <div className="text-right">
                        <Label className="erp-label text-right block">اسم البند *</Label>
                        <Input
                          required
                          className="erp-input text-right"
                          placeholder="مثال: ذمم دائنة"
                          dir="rtl"
                          maxLength={100}
                          value={balanceSheetLiabilityItemForm.name}
                          onChange={(e) => setBalanceSheetLiabilityItemForm({ ...balanceSheetLiabilityItemForm, name: e.target.value })}
                        />
                      </div>

                      {/* الحالة سيتم التحكم بها عبر زر التجميد / إلغاء التجميد في الصف */}

                      <div className="flex justify-start gap-2 pt-2">
                        <Button type="submit" className="erp-btn-primary" size="sm">
                          حفظ البند
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowBalanceSheetLiabilityItemForm(false)
                            setBalanceSheetLiabilityItemForm({ id: 0, name: "", status: 1 })
                          }}
                        >
                          إلغاء
                        </Button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="space-y-3">
                  {balanceSheetLiabilityItems.map((item, index) => (
                    <div
                      key={item.id}
                      className={cn(
                        "p-4 rounded-lg border transition-all cursor-pointer",
                        index === currentBalanceSheetLiabilityItemIndex
                          ? "bg-primary/10 border-primary shadow-sm"
                          : "bg-background hover:bg-muted/50",
                      )}
                      onClick={() => setCurrentBalanceSheetLiabilityItemIndex(index)}
                      dir="rtl"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1 text-right">
                          <h4 className="font-heading font-semibold">{item.name}</h4>
                          <p className="text-xs text-muted-foreground">ID: {item.id}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEditBalanceSheetLiabilityItem(item)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          {item.status !== 3 && (
                            <Button variant="outline" size="sm" onClick={() => handleStopBalanceSheetLiabilityItem(item)}>
                              {getToggleStatusLabel(item.status)}
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openDeleteConfirm("هل أنت متأكد من حذف هذا البند من خصوم الميزانية؟", () => handleDeleteBalanceSheetLiabilityItem(item.id))}
                            aria-label="حذف البند"
                            title="حذف البند"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                          <Badge variant={getStatusBadgeVariant(item.status)}>
                            {getStatusLabel(item.status)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="xl:col-span-3 grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card dir="rtl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    أنواع مراكز التكلفة ({costCenterTypes.length})
                  </CardTitle>
                  <Button
                    className="erp-btn-primary"
                    size="sm"
                    onClick={() => {
                      setCostCenterTypeForm({ id: 0, name: "", status: 1 })
                      setShowCostCenterTypeForm(!showCostCenterTypeForm)
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    إضافة نوع
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {showCostCenterTypeForm && (
                  <div className="bg-muted/30 rounded-lg p-4 border" dir="rtl">
                    <h3 className="font-heading font-semibold mb-4 text-right">
                      {costCenterTypeForm.id > 0 ? "تعديل نوع مركز التكلفة" : "إضافة نوع جديد"}
                    </h3>
                    <form className="space-y-4" onSubmit={handleSaveCostCenterType}>
                      <div className="text-right">
                        <Label className="erp-label text-right block">اسم النوع *</Label>
                        <Input
                          required
                          className="erp-input text-right"
                          placeholder="مثال: مركز تكلفة إداري"
                          dir="rtl"
                          maxLength={100}
                          value={costCenterTypeForm.name}
                          onChange={(e) => setCostCenterTypeForm({ ...costCenterTypeForm, name: e.target.value })}
                        />
                      </div>

                      {/* الحالة سيتم التحكم بها عبر زر التجميد / إلغاء التجميد في الصف */}

                      <div className="flex justify-start gap-2 pt-2">
                        <Button type="submit" className="erp-btn-primary" size="sm">
                          حفظ النوع
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowCostCenterTypeForm(false)
                            setCostCenterTypeForm({ id: 0, name: "", status: 1 })
                          }}
                        >
                          إلغاء
                        </Button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="h-[360px] overflow-y-auto space-y-3 pr-1">
                  {costCenterTypes.map((item, index) => (
                    <div
                      key={item.id}
                      className={cn(
                        "p-4 rounded-lg border transition-all cursor-pointer",
                        index === currentCostCenterTypeIndex
                          ? "bg-primary/10 border-primary shadow-sm"
                          : "bg-background hover:bg-muted/50",
                      )}
                      onClick={() => setCurrentCostCenterTypeIndex(index)}
                      dir="rtl"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1 text-right">
                          <h4 className="font-heading font-semibold">{item.name}</h4>
                          <p className="text-xs text-muted-foreground">ID: {item.id}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEditCostCenterType(item)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          {item.status !== 3 && (
                            <Button variant="outline" size="sm" onClick={() => handleFreezeCostCenterType(item)}>
                              {getToggleStatusLabel(item.status)}
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openDeleteConfirm("هل أنت متأكد من حذف هذا النوع؟", () => handleDeleteCostCenterType(item.id))}
                            aria-label="حذف النوع"
                            title="حذف النوع"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                          <Badge variant={getStatusBadgeVariant(item.status)}>
                            {getStatusLabel(item.status)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card dir="rtl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    مراكز التكلفة ({costCenters.length})
                  </CardTitle>
                  <Button
                    className="erp-btn-primary"
                    size="sm"
                    onClick={() => {
                      setCostCenterForm({ id: 0, name: "", cost_type_id: "", parent_id: "none", status: 1 })
                      setShowCostCenterForm(!showCostCenterForm)
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    إضافة مركز
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {showCostCenterForm && (
                  <div className="bg-muted/30 rounded-lg p-4 border" dir="rtl">
                    <h3 className="font-heading font-semibold mb-4 text-right">
                      {costCenterForm.id > 0 ? "تعديل مركز التكلفة" : "إضافة مركز تكلفة جديد"}
                    </h3>
                    <form className="space-y-4" onSubmit={handleSaveCostCenter}>
                      <div className="text-right">
                        <Label className="erp-label text-right block">اسم المركز *</Label>
                        <Input
                          required
                          className="erp-input text-right"
                          placeholder="مثال: إدارة المبيعات"
                          dir="rtl"
                          maxLength={100}
                          value={costCenterForm.name}
                          onChange={(e) => setCostCenterForm({ ...costCenterForm, name: e.target.value })}
                        />
                      </div>

                      <div className="text-right">
                        <Label className="erp-label text-right block">نوع مركز التكلفة *</Label>
                        <Select
                          dir="rtl"
                          value={costCenterForm.cost_type_id}
                          onValueChange={(value) => setCostCenterForm({ ...costCenterForm, cost_type_id: value })}
                        >
                          <SelectTrigger className="erp-input text-right">
                            <SelectValue placeholder="اختر النوع" />
                          </SelectTrigger>
                          <SelectContent>
                            {costCenterTypes.map((type) => (
                              <SelectItem key={type.id} value={type.id.toString()}>
                                {type.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="text-right">
                        <Label className="erp-label text-right block">المركز الأب (اختياري)</Label>
                        <Select
                          dir="rtl"
                          value={costCenterForm.parent_id}
                          onValueChange={(value) => setCostCenterForm({ ...costCenterForm, parent_id: value })}
                        >
                          <SelectTrigger className="erp-input text-right">
                            <SelectValue placeholder="بدون مركز أب" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">بدون مركز أب</SelectItem>
                            {costCenters
                              .filter((center) => center.id !== costCenterForm.id)
                              .map((center) => (
                                <SelectItem key={center.id} value={center.id.toString()}>
                                  {center.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* الحالة سيتم التحكم بها عبر زر التجميد / إلغاء التجميد في الصف */}

                      <div className="flex justify-start gap-2 pt-2">
                        <Button type="submit" className="erp-btn-primary" size="sm">
                          حفظ المركز
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowCostCenterForm(false)
                            setCostCenterForm({ id: 0, name: "", cost_type_id: "", parent_id: "none", status: 1 })
                          }}
                        >
                          إلغاء
                        </Button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="space-y-3 max-h-[330px] overflow-y-auto pr-1">
                  {costCenters.map((item, index) => (
                    <div
                      key={item.id}
                      className={cn(
                        "p-4 rounded-lg border transition-all cursor-pointer",
                        index === currentCostCenterIndex
                          ? "bg-primary/10 border-primary shadow-sm"
                          : "bg-background hover:bg-muted/50",
                      )}
                      onClick={() => setCurrentCostCenterIndex(index)}
                      dir="rtl"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1 text-right">
                          <h4 className="font-heading font-semibold">{item.name}</h4>
                          <p className="text-xs text-muted-foreground">النوع: {item.cost_type_name || "-"}</p>
                          <p className="text-xs text-muted-foreground">الأب: {item.parent_name || "-"}</p>
                          <p className="text-xs text-muted-foreground">المستوى: {item.level}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEditCostCenter(item)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          {item.status !== 3 && (
                            <Button variant="outline" size="sm" onClick={() => handleFreezeCostCenter(item)}>
                              {getToggleStatusLabel(item.status)}
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openDeleteConfirm("هل أنت متأكد من حذف هذا المركز؟", () => handleDeleteCostCenter(item.id))}
                            aria-label="حذف المركز"
                            title="حذف المركز"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                          <Badge variant={getStatusBadgeVariant(item.status)}>
                            {getStatusLabel(item.status)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            </div>

            <div className="xl:col-span-3 grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card dir="rtl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    أنواع تصنيفات الحسابات ({accountClassificationTypes.length})
                  </CardTitle>
                  <Button
                    className="erp-btn-primary"
                    size="sm"
                    onClick={() => {
                      setAccountClassificationTypeForm({ id: 0, name: "", status: 1 })
                      setShowAccountClassificationTypeForm(!showAccountClassificationTypeForm)
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    إضافة نوع
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {showAccountClassificationTypeForm && (
                  <div className="bg-muted/30 rounded-lg p-4 border" dir="rtl">
                    <h3 className="font-heading font-semibold mb-4 text-right">
                      {accountClassificationTypeForm.id > 0 ? "تعديل نوع التصنيف" : "إضافة نوع جديد"}
                    </h3>
                    <form className="space-y-4" onSubmit={handleSaveAccountClassificationType}>
                      <div className="text-right">
                        <Label className="erp-label text-right block">اسم النوع *</Label>
                        <Input
                          required
                          className="erp-input text-right"
                          placeholder="مثال: تصنيف أصول"
                          dir="rtl"
                          maxLength={100}
                          value={accountClassificationTypeForm.name}
                          onChange={(e) => setAccountClassificationTypeForm({ ...accountClassificationTypeForm, name: e.target.value })}
                        />
                      </div>

                      {/* الحالة سيتم التحكم بها عبر زر التجميد / إلغاء التجميد في الصف */}

                      <div className="flex justify-start gap-2 pt-2">
                        <Button type="submit" className="erp-btn-primary" size="sm">
                          حفظ النوع
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowAccountClassificationTypeForm(false)
                            setAccountClassificationTypeForm({ id: 0, name: "", status: 1 })
                          }}
                        >
                          إلغاء
                        </Button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="space-y-3">
                  {accountClassificationTypes.map((item, index) => (
                    <div
                      key={item.id}
                      className={cn(
                        "p-4 rounded-lg border transition-all cursor-pointer",
                        index === currentAccountClassificationTypeIndex
                          ? "bg-primary/10 border-primary shadow-sm"
                          : "bg-background hover:bg-muted/50",
                      )}
                      onClick={() => setCurrentAccountClassificationTypeIndex(index)}
                      dir="rtl"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1 text-right">
                          <h4 className="font-heading font-semibold">{item.name}</h4>
                          <p className="text-xs text-muted-foreground">ID: {item.id}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEditAccountClassificationType(item)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          {item.status !== 3 && (
                            <Button variant="outline" size="sm" onClick={() => handleFreezeAccountClassificationType(item)}>
                              {getToggleStatusLabel(item.status)}
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openDeleteConfirm("هل أنت متأكد من حذف هذا النوع؟", () => handleDeleteAccountClassificationType(item.id))}
                            aria-label="حذف النوع"
                            title="حذف النوع"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                          <Badge variant={getStatusBadgeVariant(item.status)}>
                            {getStatusLabel(item.status)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card dir="rtl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    تصنيفات الحسابات ({accountClassifications.length})
                  </CardTitle>
                  <Button
                    className="erp-btn-primary"
                    size="sm"
                    onClick={() => {
                      setAccountClassificationForm({ id: 0, name: "", classification_type_id: "", status: 1 })
                      setShowAccountClassificationForm(!showAccountClassificationForm)
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    إضافة تصنيف
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {showAccountClassificationForm && (
                  <div className="bg-muted/30 rounded-lg p-4 border" dir="rtl">
                    <h3 className="font-heading font-semibold mb-4 text-right">
                      {accountClassificationForm.id > 0 ? "تعديل تصنيف الحساب" : "إضافة تصنيف جديد"}
                    </h3>
                    <form className="space-y-4" onSubmit={handleSaveAccountClassification}>
                      <div className="text-right">
                        <Label className="erp-label text-right block">اسم التصنيف *</Label>
                        <Input
                          required
                          className="erp-input text-right"
                          placeholder="مثال: حسابات العملاء"
                          dir="rtl"
                          maxLength={100}
                          value={accountClassificationForm.name}
                          onChange={(e) => setAccountClassificationForm({ ...accountClassificationForm, name: e.target.value })}
                        />
                      </div>

                      <div className="text-right">
                        <Label className="erp-label text-right block">نوع التصنيف *</Label>
                        <Select
                          dir="rtl"
                          value={accountClassificationForm.classification_type_id}
                          onValueChange={(value) => setAccountClassificationForm({ ...accountClassificationForm, classification_type_id: value })}
                        >
                          <SelectTrigger className="erp-input text-right">
                            <SelectValue placeholder="اختر النوع" />
                          </SelectTrigger>
                          <SelectContent>
                            {accountClassificationTypes.map((type) => (
                              <SelectItem key={type.id} value={type.id.toString()}>
                                {type.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* الحالة سيتم التحكم بها عبر زر التجميد / إلغاء التجميد في الصف */}

                      <div className="flex justify-start gap-2 pt-2">
                        <Button type="submit" className="erp-btn-primary" size="sm">
                          حفظ التصنيف
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowAccountClassificationForm(false)
                            setAccountClassificationForm({ id: 0, name: "", classification_type_id: "", status: 1 })
                          }}
                        >
                          إلغاء
                        </Button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="space-y-3 max-h-[330px] overflow-y-auto pr-1">
                  {accountClassifications.map((item, index) => (
                    <div
                      key={item.id}
                      className={cn(
                        "p-4 rounded-lg border transition-all cursor-pointer",
                        index === currentAccountClassificationIndex
                          ? "bg-primary/10 border-primary shadow-sm"
                          : "bg-background hover:bg-muted/50",
                      )}
                      onClick={() => setCurrentAccountClassificationIndex(index)}
                      dir="rtl"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1 text-right">
                          <h4 className="font-heading font-semibold">{item.name}</h4>
                          <p className="text-xs text-muted-foreground">النوع: {item.classification_type_name || "-"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEditAccountClassification(item)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          {item.status !== 3 && (
                            <Button variant="outline" size="sm" onClick={() => handleFreezeAccountClassification(item)}>
                              {getToggleStatusLabel(item.status)}
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openDeleteConfirm("هل أنت متأكد من حذف هذا التصنيف؟", () => handleDeleteAccountClassification(item.id))}
                            aria-label="حذف التصنيف"
                            title="حذف التصنيف"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                          <Badge variant={getStatusBadgeVariant(item.status)}>
                            {getStatusLabel(item.status)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            </div>
          </div>
        </TabsContent>

        {/* Workflow Stages Management Tab */}
        <TabsContent value="workflow-stages">
          <WorkflowStagesManagement />
        </TabsContent>

        {/* Workflow Sequences Management Tab */}
        <TabsContent value="workflow-sequences">
          <WorkflowSequencesManagement />
        </TabsContent>
      </Tabs>

      <ConfirmDialogYesNo
        visible={confirmDeleteVisible}
        message={confirmDeleteMessage}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDeleteConfirm}
      />
    </div>
  )
}

export { Definitions }
export default Definitions



