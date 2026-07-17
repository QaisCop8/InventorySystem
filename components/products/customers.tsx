"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import ProgressSpinner from "../ProgressSpinner/ProgressSpinner"
import { Toast } from 'primereact/toast';
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import {
  Plus,
  Search,
  FileText,
  Edit,
  Trash2,
  Save,
  X,
  CheckCircle,
  Upload,
  Globe,
  Key,
  Shield,
  UserPlus,
  Bell,
  MessageSquare,
  Phone,
} from "lucide-react"
import { ExcelImport } from "@/components/ui/excel-import"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "../auth/auth-context"
import CustomerSearchPopup from "./CustomerSearchPopup"
import ConfirmDialogYesNo from "../ui/ConfirmDialogYesNo"
import DataGrid from "../common/DataGrid"
import * as wjGrid from "@grapecity/wijmo.grid";
import DataGridView from "../common/DataGridView"
import Util from "../common/Util"
import UnifiedCustomers from "./unified-customers"
interface CustomersProps {
  isSupplier?: boolean;
}
interface Customer {
  id: number
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
  classification?: string
  registration_date?: string
  web_username: string
  web_password: string
  transaction_notes?: string
  general_notes: string
  // Added for new fields
  tax_number?: string
  commercial_registration?: string
  credit_limit?: string
  payment_terms?: string
  discount_percentage?: string,
  type?: number
  account_id?: number | null
}

interface Classification {
  id: number
  name: string
}

interface priceCategory {
  id: number
  name: string
}


interface Salesman {
  id: number
  name: string
  department?: string
  is_active: boolean
}
interface VoucherItem {
  ser: number;
  type_id: number;
  type_name: string;
  book_id: number;
  book_name: string;
  [key: string]: any;
}

interface CustomerFormData {
  id: number,
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
  tax_number: string
  commercial_registration: string
  credit_limit: string
  payment_terms: string
  discount_percentage: string,
  pricecategory: number,
  account_id?: number | null,
  father_id?: string,
  finanical_list_id?: string,
  currency_id?: string,
  allow_trans_with_diff_curr?: string,
  iscalc_curr_diff_rates?: boolean,
  cost_centers?: Array<{ id: number; name: string; state_status: string; required_in_transactions: number; cost_center_name?: string; default_cost_center_id?: number | null }>,
  stop_transactions?: Array<{ voucher_types_id: number; voucher_type_name: string; is_stopped: boolean; stop_date: string }>,
  voucherType?: VoucherItem[],
}

interface CustomerUser {
  id: number
  username: string
  email: string | null
  is_active: boolean
  last_login: string | null
  can_view_orders: boolean
  can_create_orders: boolean
  can_view_balance: boolean
  can_view_products: boolean
  can_view_prices: boolean
  can_view_stock: boolean
}

interface NotificationSettings {
  id?: number
  customer_id: number
  notification_method: "sms" | "whatsapp" | "both"
  preferred_phone: string
  notify_on_received: boolean
  notify_on_preparing: boolean
  notify_on_quality_check: boolean
  notify_on_ready_to_ship: boolean
  notify_on_shipped: boolean
  notify_on_delivered: boolean
  notify_on_cancelled: boolean
  is_active: boolean
  send_daily_summary: boolean
  daily_summary_time: string
}

export default function Customers({ isSupplier }: CustomersProps) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isloading, setIsLoading] = useState(false)
  const toast = useRef<Toast | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showCustomerDialog, setShowCustomerDialog] = useState(false)
  const [showNewCustomerDialog, setShowNewCustomerDialog] = useState(false)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false) // Added import dialog state
  const [showPortalDialog, setShowPortalDialog] = useState(false)
  const [selectedCustomerForPortal, setSelectedCustomerForPortal] = useState<Customer | null>(null)
  const [portalUsers, setPortalUsers] = useState<CustomerUser[]>([])
  const [loadingPortalUsers, setLoadingPortalUsers] = useState(false)
  const [showAddUserDialog, setShowAddUserDialog] = useState(false)
  const [showEditPermissionsDialog, setShowEditPermissionsDialog] = useState(false)
  const [selectedUser, setSelectedUser] = useState<CustomerUser | null>(null)
  const customer_name = useRef<HTMLInputElement>(null);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const bookGridRef = useRef<wjGrid.FlexGrid>(null);
  const [newUserData, setNewUserData] = useState({
    username: "",
    password: "",
    email: "",
  })
  const [userPermissions, setUserPermissions] = useState({
    can_view_orders: true,
    can_create_orders: true,
    can_view_balance: true,
    can_view_products: true,
    can_view_prices: true,
    can_view_stock: true,
  })

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(null)
  const [loadingNotificationSettings, setLoadingNotificationSettings] = useState(false)
  const [savingNotificationSettings, setSavingNotificationSettings] = useState(false)

  const [classifications, setClassifications] = useState<Classification[]>([])
  const [pricecategory, setPriceCategory] = useState<priceCategory[]>([])
  const [customerAccountClassifications, setCustomerAccountClassifications] = useState<Array<{ id: number; name: string; classification_id: number | null; classification_name: string }>>([])

  const [salesmen, setSalesmen] = useState<Salesman[]>([])

  const [formData, setFormData] = useState<CustomerFormData>({
    id: 0,
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
    tax_number: "",
    commercial_registration: "",
    credit_limit: "",
    payment_terms: "نقدي",
    discount_percentage: "",
    pricecategory: 0,
    account_id: null,
    cost_centers: [],
    stop_transactions: [],
    voucherType: []
  })

  const [searchFilters, setSearchFilters] = useState({
    name: "",
    city: "__all__",
    status: "__all__",
    salesman: "__all__",
  })

  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [generatingNumber, setGeneratingNumber] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(false)
  const editingCustomerRef = useRef(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)

  const filteredCustomers = useMemo(() => {
    const cityFilter = searchFilters.city === "__all__" ? "" : searchFilters.city
    const statusFilter = searchFilters.status === "__all__" ? "" : searchFilters.status
    const salesmanFilter = searchFilters.salesman === "__all__" ? "" : searchFilters.salesman

    return customers.filter((customer) => {
      return (
        (!searchFilters.name || customer.name?.toLowerCase().includes(searchFilters.name.toLowerCase())) &&
        (!cityFilter || customer.city === cityFilter) &&
        (!statusFilter || customer.status === statusFilter) &&
        (!salesmanFilter || customer.salesman === salesmanFilter)
      )
    })
  }, [customers, searchFilters])

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize))
  const pageStart = filteredCustomers.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = Math.min(currentPage * pageSize, filteredCustomers.length)

  const pagedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredCustomers.slice(start, start + pageSize)
  }, [filteredCustomers, currentPage, pageSize])

  useEffect(() => {
    setCurrentPage(1)
  }, [filteredCustomers, pageSize])

  const currentCustomer = useMemo(() => {
    console.log("customers[currentIndex] ", customers[currentIndex])
    return customers[currentIndex] || null
  }, [customers, currentIndex])

  const handleAddRow = () => {
    setFormData(prev => {
      const voucherTypes = prev.voucherType || [];
      const maxSer = voucherTypes.reduce((max, row) => (row.ser > max ? row.ser : max), 0);

      const firstType = definitionsRef.current.voucher_types[0] || { type_id: 0, type_name: "" }; // fallback
      const firstBook = definitionsRef.current.voucher_books[0] || { book_id: 0, book_name: "" };
      const newType: VoucherItem = {
        type_id: firstType.id,                       // temporary unique id
        type_name: firstType.name,              // default value
        book_id: firstBook.id,                       // temporary unique id
        book_name: firstBook.name,
        ser: maxSer + 1,

      };
      console.log("newType ", newType)
      return {
        ...prev,
        voucherType: [...voucherTypes, newType],
      };
    });
  };
  const handleDeleteRow = (index: number) => {
    setFormData((prev) => {
      const rows = [...(prev.voucherType ?? [])];
      if (index >= 0 && index < rows.length) {
        rows.splice(index, 1);
      }
      return { ...prev, voucherType: rows };
    });
  };
  const getScheme = () => {
    let scheme = {
      name: 'UnitsScheme_Table',
      filter: false,
      showFooter: false,
      sortable: true,
      allowGrouping: false,
      responsiveColumnIndex: 2,
      columns: [
        {
          header: "##", name: "ser", width: 65, visible: true
        },

        { header: "id", name: "id", width: 150, visible: false },

        {
          header: "نوع السند",
          name: "type_name",
          width: "*",
          minWidth: 150,

          editor: (cell: any) => (
            <select
              value={cell.row.dataItem.type_id ?? 0}
              onChange={(e) => {
                const typeId = Number(e.target.value);

                const selectedType = definitions.voucher_types.find(
                  (t: any) => t.id === typeId
                );

                // ✅ Update React state
                setFormData(prev => {
                  const rows = [...(prev.voucherType ?? [])];
                  const rowIndex = cell.row.index;

                  rows[rowIndex] = {
                    ...rows[rowIndex],
                    type_id: typeId,
                    type_name: selectedType?.name || "",
                  };

                  return { ...prev, voucherType: rows };
                });

                // ✅ Update grid row immediately
                cell.row.dataItem.type_id = typeId;
                cell.row.dataItem.type_name = selectedType?.name || "";
              }}
              className="px-2 py-1 w-full"
            >
              {(definitions.voucher_types ?? []).map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          ),
        },

        { header: "type_id", name: "type_id", width: 150, visible: false },
        {
          header: "دفتر السندات",
          name: "book_name",
          width: 250,
          visible: true,

          editor: (cell: any) => (
            <select
              value={cell.row.dataItem.book_id ?? 0} // use book_id for value
              onChange={(e) => {
                const bookId = Number(e.target.value);

                // Find the selected book from definitions
                const selectedBook = definitions.voucher_books.find(
                  (b: any) => b.id === bookId
                );

                // ✅ Update formData.voucherType state
                setFormData((prev) => {
                  const rows = [...(prev.voucherType ?? [])];
                  const rowIndex = cell.row.index;

                  rows[rowIndex] = {
                    ...rows[rowIndex],
                    book_id: bookId,
                    book_name: selectedBook?.name || "",
                  };

                  return { ...prev, voucherType: rows };
                });

                // ✅ Update grid row immediately
                cell.row.dataItem.book_id = bookId;
                cell.row.dataItem.book_name = selectedBook?.name || "";
              }}
              className="px-2 py-1 w-full"
            >
              {(definitions.voucher_books ?? []).map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          ),
        },

        { header: "book_id", name: "book_id", width: 150, visible: false },
        {
          header: " ",
          name: "delete",
          width: 80,
          buttonBody: "button",
          iconType: "trash",
          onClick: (item: { ser: number }) => handleDeleteRow(item.ser - 1)
        }
      ],
    }
    return scheme;
  }

  const fetchPortalUsers = useCallback(async (customerId: number) => {
    try {
      console.log("[v0] ========== START fetchPortalUsers ==========")
      console.log("[v0] fetchPortalUsers called with customerId:", customerId)
      setLoadingPortalUsers(true)
      setError(null) // إضافة reset للخطأ

      const url = `/api/admin/customer-users?customerId=${customerId}`

      const response = await fetch(url)

      if (response.ok) {
        const data = await response.json()

        setPortalUsers(data.users || [])
      } else {
        const errorData = await response.json()
        console.error("[v0] Error response:", errorData)
        setError(errorData.error || "فشل في تحميل المستخدمين")
      }
    } catch (error) {

      setError("حدث خطأ في تحميل المستخدمين")
    } finally {
      setLoadingPortalUsers(false)
      console.log("[v0] Loading state set to false")
    }
  }, [])
  const doHotKeys = useRef(true)
  const popupHasCalled = () => {
    doHotKeys.current = false
  };
  const popupHasClosed = () => {
    doHotKeys.current = true

  };

  const fetchNotificationSettings = useCallback(async (customerId: number) => {
    try {
      console.log("[v0] Fetching notification settings for customer:", customerId)
      setLoadingNotificationSettings(true)

      const response = await fetch(`/api/customer-notifications/settings?customerId=${customerId}`)

      if (response.ok) {
        const data = await response.json()
        console.log("[v0] Notification settings loaded:", data)
        setNotificationSettings(data.settings)
      } else {
        console.error("[v0] Failed to load notification settings")
        // إنشاء إعدادات افتراضية
        setNotificationSettings({
          customer_id: customerId,
          notification_method: "sms",
          preferred_phone: "",
          notify_on_received: true,
          notify_on_preparing: true,
          notify_on_quality_check: true,
          notify_on_ready_to_ship: true,
          notify_on_shipped: true,
          notify_on_delivered: false,
          notify_on_cancelled: true,
          is_active: true,
          send_daily_summary: false,
          daily_summary_time: "09:00:00",
        })
      }
    } catch (error) {
      console.error("[v0] Error fetching notification settings:", error)
    } finally {
      setLoadingNotificationSettings(false)
    }
  }, [])

  const handleAddPortalUser = useCallback(async () => {
    if (!selectedCustomerForPortal || !newUserData.username || !newUserData.password) {
      setError("اسم المستخدم وكلمة المرور مطلوبان")
      return
    }

    try {
      console.log("[v0] ========== START handleAddPortalUser ==========")
      console.log("[v0] Adding portal user:", {
        customerId: selectedCustomerForPortal.id,
        username: newUserData.username,
        email: newUserData.email,
        permissions: userPermissions,
      })

      const response = await fetch("/api/admin/customer-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomerForPortal.id,
          username: newUserData.username,
          password: newUserData.password,
          email: newUserData.email || null,
          permissions: userPermissions,
        }),
      })

      console.log("[v0] Add user response status:", response.status)

      if (response.ok) {
        const data = await response.json()
        console.log("[v0] User added successfully:", data)
        setShowAddUserDialog(false)
        setNewUserData({ username: "", password: "", email: "" })
        setUserPermissions({
          can_view_orders: true,
          can_create_orders: true,
          can_view_balance: true,
          can_view_products: true,
          can_view_prices: true,
          can_view_stock: true,
        })
        setError(null) // إضافة reset للخطأ
        await fetchPortalUsers(selectedCustomerForPortal.id)
        console.log("[v0] ========== END handleAddPortalUser (SUCCESS) ==========")
      } else {
        const data = await response.json()
        console.error("[v0] Error adding user:", data)
        setError(data.error || "فشل في إضافة المستخدم")
      }
    } catch (error) {
      console.error("[v0] ========== ERROR in handleAddPortalUser ==========")
      console.error("[v0] Error adding portal user:", error)
      setError("حدث خطأ في إضافة المستخدم")
    }
  }, [selectedCustomerForPortal, newUserData, userPermissions, fetchPortalUsers])

  const handleUpdatePermissions = useCallback(async () => {
    if (!selectedUser) return

    try {
      const response = await fetch(`/api/admin/customer-users/${selectedUser.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userPermissions),
      })

      if (response.ok) {
        setShowEditPermissionsDialog(false)
        if (selectedCustomerForPortal) {
          fetchPortalUsers(selectedCustomerForPortal.id)
        }
      } else {
        const data = await response.json()
        setError(data.error || "فشل في تحديث الصلاحيات")
      }
    } catch (error) {
      console.error("Error updating permissions:", error)
      setError("حدث خطأ في تحديث الصلاحيات")
    }
  }, [selectedUser, userPermissions, selectedCustomerForPortal, fetchPortalUsers])

  const handleToggleUserStatus = useCallback(
    async (userId: number) => {
      try {
        const response = await fetch(`/api/admin/customer-users/${userId}/toggle`, {
          method: "PUT",
        })

        if (response.ok && selectedCustomerForPortal) {
          fetchPortalUsers(selectedCustomerForPortal.id)
        }
      } catch (error) {
        console.error("Error toggling user status:", error)
      }
    },
    [selectedCustomerForPortal, fetchPortalUsers],
  )

  const handleResetPassword = useCallback(async (userId: number) => {
    const newPassword = prompt("أدخل كلمة المرور الجديدة:")
    if (!newPassword) return

    try {
      const response = await fetch(`/api/admin/customer-users/${userId}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      })

      if (response.ok) {
        alert("تم تغيير كلمة المرور بنجاح")
      } else {
        const data = await response.json()
        setError(data.error || "فشل في تغيير كلمة المرور")
      }
    } catch (error) {
      console.error("Error resetting password:", error)
      setError("حدث خطأ في تغيير كلمة المرور")
    }
  }, [])

  const handleSaveNotificationSettings = useCallback(async () => {
    if (!notificationSettings || !selectedCustomerForPortal) return

    try {
      console.log("[v0] Saving notification settings:", notificationSettings)
      setSavingNotificationSettings(true)
      setError(null)

      const response = await fetch("/api/customer-notifications/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notificationSettings),
      })

      if (response.ok) {
        const data = await response.json()
        console.log("[v0] Notification settings saved successfully:", data)
        setNotificationSettings(data.settings)
        alert("تم حفظ إعدادات الإشعارات بنجاح")
      } else {
        const errorData = await response.json()
        console.error("[v0] Error saving notification settings:", errorData)
        setError(errorData.error || "فشل في حفظ إعدادات الإشعارات")
      }
    } catch (error) {
      console.error("[v0] Error saving notification settings:", error)
      setError("حدث خطأ في حفظ إعدادات الإشعارات")
    } finally {
      setSavingNotificationSettings(false)
    }
  }, [notificationSettings, selectedCustomerForPortal])

  const formatDate = (date: string | null) => {
    if (!date) return "لم يسجل دخول بعد"
    return new Date(date).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const updateFormData = useCallback((customer: Customer | null) => {
    if (!customer) {
      const emptyCustomer: CustomerFormData = {
        id: 0,
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
        tax_number: "",
        commercial_registration: "",
        credit_limit: "",
        payment_terms: "نقدي",
        discount_percentage: "",
        pricecategory: pricecategory?.[0]?.id || 0,
        account_id: null,
        cost_centers: [],
        stop_transactions: [],
        voucherType: []
      }

      setFormData(emptyCustomer)
      return
    }


    setFormData({
      id: customer.id || 0,
      customer_code: customer.customer_code || "",
      name: customer.name || "",
      mobile1: customer.mobile1 || "",
      mobile2: customer.mobile2 || "",
      whatsapp1: customer.whatsapp1 || "",
      whatsapp2: customer.whatsapp2 || "",
      city: customer.city || "",
      address: customer.address || "",
      email: customer.email || "",
      status: customer.status || "نشط",
      business_nature: customer.business_nature || "",
      salesman: customer.salesman || "",
      classification: customer.classification || "",
      registration_date: customer.registration_date || new Date().toISOString().split("T")[0],
      web_username: customer.web_username || "",
      web_password: customer.web_password || "",
      transaction_notes: customer.transaction_notes || "",
      general_notes: customer.general_notes || "",
      tax_number: (customer as any).tax_number || "",
      commercial_registration: (customer as any).commercial_registration || "",
      credit_limit: (customer as any).credit_limit || "",
      payment_terms: (customer as any).payment_terms || "نقدي",
      discount_percentage: (customer as any).discount_percentage || "",
      pricecategory: (customer as any).pricecategory || 0,
      account_id: (customer as any).account_id || null,
      cost_centers: Array.isArray((customer as any).cost_centers) ? (customer as any).cost_centers : [],
      stop_transactions: Array.isArray((customer as any).stop_transactions) ? (customer as any).stop_transactions : [],
      voucherType: Array.isArray((customer as any).voucherType) ? (customer as any).voucherType : [],
    })
  }, [])
  const [definitions, setDefinitions] = useState({
    voucher_types: [] as Array<{ id: number; name: string }>,
    voucher_books: [] as Array<{ id: number; name: string }>,

  })
  const definitionsRef = useRef({
    voucher_types: [] as Array<{ id: number; name: string }>,
    voucher_books: [] as Array<{ id: number; name: string; }>,

  });
  const [currentCustomerId, setCurrentCustomerId] = useState<number>(0);
  const unifiedCustomerLoadDataRef = useRef<((navigationType: "first" | "previous" | "next" | "last" | "ById" | "ByIdEdit", customerId?: number, isSupplier?: boolean, checkUnsaved?: boolean) => Promise<void>) | null>(null);

  const handleFirst = useCallback(() => {
    if (customers.length > 0) {
      setCurrentIndex(0)
      setEditingCustomer(true)
      editingCustomerRef.current = true
    }
  }, [customers])

  const handleLast = useCallback(() => {
    if (customers.length > 0) {
      console.log("handleLast ")
      const lastIndex = customers.length - 1
      console.log("lastIndex ", lastIndex)
      setCurrentIndex(lastIndex)
      setEditingCustomer(true)
      editingCustomerRef.current = true
    }
  }, [customers])

  const handleNext = useCallback(() => {
    if (customers.length > 0 && currentIndex >= 0) {
      const newIndex = currentIndex + 1
      console.log("newIndex ", newIndex)
      setCurrentIndex(newIndex)
      setEditingCustomer(true)
      editingCustomerRef.current = true
    }
  }, [customers, currentIndex])

  const handlePrevious = useCallback(() => {

    if (customers.length > 0 && currentIndex <= customers.length - 1) {
      let newIndex = currentIndex - 1
      console.log("currentCustomer ", editingCustomer)
      if (!editingCustomerRef.current) {
        handleLast();
        return
      }
      console.log("newIndex ", newIndex)
      setCurrentIndex(newIndex)
      setEditingCustomer(true)
      editingCustomerRef.current = true
    }
  }, [customers, currentIndex])



  const updateField = useCallback(
    <K extends keyof CustomerFormData>(field: K, value: CustomerFormData[K]) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      if (validationErrors[field]) {
        setValidationErrors((prev) => ({ ...prev, [field]: "" }));
      }
    },
    [validationErrors],
  );


  const validateForm = useCallback(() => {
    const errors: Record<string, string> = {}

    if (!formData.name.trim()) {
      errors.customer_name = "اسم العميل مطلوب"
    }

    /*if (!formData.mobile1.trim()) {
      errors.mobile1 = "رقم الجوال مطلوب"
    } else if (!/^\d{10}$/.test(formData.mobile1.replace(/\s/g, ""))) {
      errors.mobile1 = "رقم الجوال يجب أن يكون 10 أرقام"
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = "البريد الإلكتروني غير صحيح"
    }*/

    const typeSet = new Set<number>();
    (formData.voucherType ?? []).forEach((v, index) => {
      if (typeSet.has(v.type_id)) {

        Util.showErrorToast(toast.current, 'لا يمكن تكرار نفس نوع السند في دفاتر السندات الافتراضية للعميل');
        errors.vocherType = "ا يمكن تكرار نفس نوع السند في دفاتر السندات الافتراضية للعميل"
      } else {
        typeSet.add(v.type_id);
      }
    });

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }, [formData])

  const fetchCustomers = useCallback(
    async () => {
      try {
        setIsLoading(true);
        setError(null);

        const url = `/api/customers?type=${isSupplier ? 2 : 1}`;
        const response = await fetch(url);

        if (response.ok) {
          const data = await response.json();
          const allRecords = Array.isArray(data) ? data : data.customers || [];
          const filteredRecords = allRecords.filter((record: { type: number }) =>
            isSupplier ? record.type === 2 : record.type === 1
          );
          filteredRecords.sort((a: Customer, b: Customer) => a.id - b.id);
          setCustomers(filteredRecords);

          if (filteredRecords.length > 0) {
            setCurrentIndex((prevIndex) => (prevIndex >= filteredRecords.length ? 0 : prevIndex));
          }
        } else {
          setError(isSupplier ? "فشل في تحميل بيانات الموردين" : "فشل في تحميل بيانات العملاء");
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        setError(isSupplier ? "حدث خطأ في تحميل الموردين" : "حدث خطأ في تحميل العملاء");
      } finally {
        setIsLoading(false);
      }
    },
    [isSupplier]
  );


  const fetchClassifications = useCallback(async () => {
    try {
      let response;
      console.log("isSupplier ", isSupplier)
      if (!isSupplier) response = await fetch("/api/customer-categories")
      else response = await fetch("/api/supplier-categories")
      if (response.ok) {
        const data = await response.json()

        setClassifications(data.categories)
      }
    } catch (error) {
      console.error("Error fetching classifications:", error)
    }
  }, [])

  const fetchPriceClass = useCallback(async () => {
    try {
      const response = await fetch("/api/pricecategory")
      if (response.ok) {
        const data = await response.json()
        console.log("data ", data)
        setPriceCategory(data)
      }
    } catch (error) {
      console.error("Error fetching priceCategory:", error)
    }
  }, [])

  const fetchSalesmen = useCallback(async () => {
    try {
      const response = await fetch("/api/salesmen")

      if (!response.ok) {
        throw new Error("Failed to load salesmen")
      }

      const data = await response.json()
      const definedSalesmen = Array.isArray(data.data) ? data.data : []

      setSalesmen(
        definedSalesmen
          .filter((item: Salesman) => item.is_active !== false)
          .sort((a: Salesman, b: Salesman) => a.id - b.id)
      )
    } catch (error) {
      console.error("Error fetching salesmen:", error)
      setSalesmen([])
    }
  }, [])

  const generateCustomerNumber = useCallback(
    async () => {
      try {
        setGeneratingNumber(true);
        console.log("[v0] Generating number...", isSupplier ? "Supplier" : "Customer");

        // Pass isSupplier as query param
        const response = await fetch(`/api/customers/generate-number?isSupplier=${isSupplier}`);
        if (response.ok) {
          const contentType = response.headers.get("content-type");

          if (contentType && contentType.includes("application/json")) {
            const data = await response.json();
            updateField("customer_code", data.customerNumber);
          } else {
            const text = await response.text();
            setError("خطأ في الخادم - تم إرجاع صفحة HTML بدلاً من JSON");
          }
        } else {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errorData = await response.json();
            setError(errorData.message || "فشل في توليد الرقم");
          } else {
            const text = await response.text();
            setError("خطأ في الخادم - لا يمكن توليد الرقم");
          }
        }
      } catch (error) {
        console.error("Error generating number:", error);
        if (error instanceof SyntaxError && error.message.includes("JSON")) {
          setError("خطأ في تحليل استجابة الخادم - يرجى المحاولة مرة أخرى");
        } else {
          setError("خطأ في الاتصال بالخادم");
        }
      } finally {
        setGeneratingNumber(false);
      }
    },
    [updateField]
  );

  const adjustCode = (code: string, codeLen: number = 8): string => {
    if (!code || !code.trim()) return '';

    code = code.trim().toUpperCase();

    // Separate prefix (letters) and numeric part
    const match = code.match(/^([A-Z]*)(\d*)$/);
    if (!match) return code; // invalid pattern (contains symbols)

    let [, prefix, numPart] = match;
    const padLen = Math.max(codeLen - prefix.length, 0);
    const paddedNum = numPart.padStart(padLen, '0');

    return `${prefix}${paddedNum}`;
  };


  const handleCustomerBlur = async (value: string) => {
    if (!value) return;

    const adjustedCode = adjustCode(value);
    if (adjustedCode !== formData.customer_code) {
      updateField("customer_code", adjustedCode);
    }

    // Search for customer by code
    try {
      const response = await fetch(`/api/customers/by-code/${encodeURIComponent(adjustedCode)}`);
      const data = await response.json();
      console.log("Search by code response:", data);
      if (data.found) {
        // Load the customer data
        if(isSupplier && data.customer.type !== 2) {
          await reset_fields();
          Util.showErrorToast(toast.current, "الرقم المدخل  لعميل وليس مورد")
          return
        }
        else if(!isSupplier && data.customer.type !== 1) {  
          await reset_fields();
          Util.showErrorToast(toast.current, "الرقم المدخل  لمورد وليس عميل")
          return
        }
        setFormData((prev) => ({
          ...prev,
          id: Number(data.customer.id), // use customer.id
        }));
        await unifiedCustomerLoadDataRef.current?.("ById", data.customer.id, isSupplier);

      } else {
        // Reset the form since customer not found
        await reset_fields(1, adjustedCode);
      }
    } catch (error) {
      console.error("Error searching customer by code:", error);
      // Optionally show error message
      setError("حدث خطأ في البحث عن العميل");
    }
  }

  const handleSaveCustomer = async (
    customerData: CustomerFormData,
    accountClassifications = customerAccountClassifications,
  ) => {
    if (!validateForm()) return false;

    if (savingRef.current) return false;

    savingRef.current = true;
    setSaving(true);
    setError(null);

    try {
      const url = currentCustomerId > 0 ? `/api/customers/${currentCustomerId}` : "/api/customers";
      const method = currentCustomerId > 0 ? "PUT" : "POST";

      const voucher = (customerData.voucherType ?? []).map((v) => ({
        type_id: v.type_id,
        book_id: v.book_id,
        ser: v.ser,
      }));

      const costCenters = Array.isArray(customerData.cost_centers)
        ? customerData.cost_centers
            .map((row: any) => {
              const defaultCostCenterId = row?.default_cost_center_id != null && row.default_cost_center_id !== ""
                ? Number(row.default_cost_center_id)
                : null;

              if (defaultCostCenterId == null || Number.isNaN(defaultCostCenterId)) return null;

              return {
                cost_center_type_id: row.id || null,
                cost_center_id: defaultCostCenterId,
                required_in_transactions: row.required_in_transactions ?? 1,
                default_cost_center_id: defaultCostCenterId,
              };
            })
            .filter(Boolean)
        : [];

      const dataToSend = {
        id: customerData.id,
        customer_code: customerData.customer_code,
        customer_name: customerData.name,
        mobile1: customerData.mobile1,
        mobile2: customerData.mobile2,
        whatsapp1: customerData.whatsapp1,
        whatsapp2: customerData.whatsapp2,
        city: customerData.city,
        address: customerData.address,
        email: customerData.email,
        status: customerData.status,
        business_nature: customerData.business_nature,
        salesman: customerData.salesman,
        classifications: customerData.classification,
        account_opening_date: customerData.registration_date,
        movement_notes: customerData.transaction_notes,
        general_notes: customerData.general_notes,
        tax_number: customerData.tax_number,
        commercial_registration: customerData.commercial_registration,
        credit_limit: customerData.credit_limit,
        payment_terms: customerData.payment_terms,
        discount_percentage: customerData.discount_percentage,
        type: isSupplier ? 2 : 1,
        pricecategory: customerData.pricecategory,
        account_id: customerData.account_id,
        cost_centers: costCenters,
        stop_transactions: customerData.stop_transactions || [],
        currency_id: customerData.currency_id,
        allow_trans_with_diff_curr: customerData.allow_trans_with_diff_curr,
        iscalc_curr_diff_rates: customerData.iscalc_curr_diff_rates,
        father_id: customerData.father_id,
        level_no: customerData.father_id ? undefined : 1,
        account_classifications: accountClassifications.filter((row) => row.classification_id != null),
        voucher,
      };

      console.log("[v0] Sending customer data:", dataToSend);

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dataToSend),
      });

      if (!response.ok) {
        let errorMessage = response.statusText;
        try {
          const errorData = await response.json();
          if (errorData?.message) errorMessage = errorData.message;
        } catch (err) {
          // ignore
        }

        toast.current?.show({
          severity: "error",
          summary: "",
          detail: errorMessage,
          life: 3000,
        });

        throw new Error(errorMessage);
      }

      const savedCustomer = await response.json();

      if (savedCustomer?.success === false) {
        const message = savedCustomer?.message || "حدث خطأ أثناء حفظ بيانات العميل";
        throw new Error(message);
      }

      console.log("[v0] Customer saved successfully:", savedCustomer);

      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);

      setEditingCustomer(false);
      editingCustomerRef.current = false;

      if (savedCustomer?.data?.id) {
        setCurrentCustomerId(Number(savedCustomer.data.id));
        await unifiedCustomerLoadDataRef.current?.("ById", savedCustomer.data.id, isSupplier);
      } else {
        reset_fields();
      }

      return true;
    } catch (errorDataOrError) {
      if (typeof errorDataOrError === "object" && errorDataOrError !== null && "message" in errorDataOrError) {
        toast.current?.show({
          severity: "error",
          summary: "",
          detail: (errorDataOrError as Error).message,
          life: 3000,
        });
      } else {
        toast.current?.show({
          severity: "error",
          summary: "",
          detail: "حدث خطأ أثناء حفظ بيانات العميل",
          life: 3000,
        });
      }

      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleDeleteClick = (checkPermission = true) => {
    if (checkPermission && !hasPermission("products-edit")) {
      toast.current?.show({
        severity: "error",
        summary: "",
        detail: "لا يوجد لديك صلاحية حذف عميل",
        life: 3000,
      });
      return;
    }

    setShowConfirm(true);
    popupHasCalled();
  };

  const confirmDelete = async () => {
    setShowConfirm(false);
    popupHasClosed();
    await handleDeleteCustomer();
  };

  const handleDeleteCustomer = async () => {
    setIsLoading(true)
    if (!formData.id) {
      toast.current?.show({
        severity: 'warn',
        summary: 'تنبيه',
        detail: 'لا يوجد سجل لحذفه',
        life: 3000
      });
      return;
    }

    try {
      const response = await fetch(`/api/customers/${formData.id}`, {
        method: "DELETE",
      })

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "فشل في حذف السجل");
      }

      toast.current?.show({
        severity: 'success',
        summary: 'نجاح',
        detail: 'تم حذف السجل بنجاح ✅',
        life: 3000
      });

      reset_fields(); // clear form

    } catch (err) {
      console.error("Error deleting customer:", err);
      toast.current?.show({
        severity: 'error',
        summary: 'خطأ',
        detail: 'فشلت العملية ❌',
        life: 5000
      });
    } finally {
      setIsLoading(false)
    }
  };




  const handleNewCustomer = useCallback((openDialog = true) => {
    console.log("AAAAa")
    setEditingCustomer(false)
    editingCustomerRef.current = false
    setValidationErrors({})
    if (openDialog) {
      setShowNewCustomerDialog(true)
    }
    updateFormData(null)
    generateCustomerNumber()
    customer_name.current?.focus()
  }, [updateFormData, generateCustomerNumber])

  const reset_fields = async (from_code = 0, code = "", showLoading = true) => {
    if (showLoading) setIsLoading(true)
    updateFormData(null)
    setEditingCustomer(false)
    editingCustomerRef.current = false
    setValidationErrors({})
    setShowNewCustomerDialog(true)
    if (from_code == 0) {
      await generateCustomerNumber()
    }
    else updateField("customer_code", code);
    if (showLoading) setIsLoading(false)



    setTimeout(() => {
      customer_name.current?.focus();
    }, 200);
    setCurrentCustomerId(0)
  }

  const fetch_Definitions = async () => {
    try {
      const definitionsObj: any = {}

      const voucherTypesResponse = await fetch("/api/vouchers/voucher-types");
      console.log("voucherTypesResponse ", voucherTypesResponse)
      if (voucherTypesResponse.ok) {
        const voucherTypesData = await voucherTypesResponse.json();
        definitionsObj.voucherTypes = voucherTypesData;
        definitionsRef.current.voucher_types = voucherTypesData;
        setDefinitions(prev => ({ ...prev, voucher_types: voucherTypesData }));
      }

      const voucherBooksResponse = await fetch("/api/vouchers/voucher-books");
      console.log("voucherBooksResponse ", voucherBooksResponse)
      if (voucherBooksResponse.ok) {
        const voucherBooksData = await voucherBooksResponse.json();
        definitionsObj.voucherBooks = voucherBooksData;
        definitionsRef.current.voucher_books = voucherBooksData;
        setDefinitions(prev => ({ ...prev, voucher_books: voucherBooksData }));
      }

      return definitionsObj
    } catch (error) {
      console.error("Error fetching definitions:", error)
      return {}
    }
  }
  useEffect(() => {
    if (!showNewCustomerDialog) return;
    const load = async () => {
      // Wait for the input to mount
      setTimeout(() => {
        customer_name.current?.focus();
      }, 100);
    };

    load();
  }, [showNewCustomerDialog]);


  const handleEditCustomer = useCallback(
    (customer: Customer) => {
      updateFormData(customer)
      setCurrentCustomerId(customer.id)
      setEditingCustomer(true)
      editingCustomerRef.current = true
      setValidationErrors({})
      setShowNewCustomerDialog(true)
      console.log("customer customer ", customer)
      setTimeout(() => {
        void unifiedCustomerLoadDataRef.current?.("ByIdEdit", customer.id, isSupplier)
      }, 200);

    },
    [updateFormData, isSupplier],
  )

  const handleManagePortal = useCallback(
    (customer: Customer) => {
      console.log("[v0] ========== START handleManagePortal ==========")
      console.log("[v0] handleManagePortal called for customer:", {
        id: customer.id,
        name: customer.name,
        code: customer.customer_code,
      })
      setSelectedCustomerForPortal(customer)
      setPortalUsers([]) // إضافة reset للمستخدمين السابقين
      setError(null) // إضافة reset للخطأ
      setNotificationSettings(null)
      setShowPortalDialog(true)
      console.log("[v0] Dialog opened, fetching users and notification settings...")
      fetchPortalUsers(customer.id)
      fetchNotificationSettings(customer.id)
    },
    [fetchPortalUsers, fetchNotificationSettings],
  )

  const openEditPermissionsDialog = useCallback((user: CustomerUser) => {
    setSelectedUser(user)
    setUserPermissions({
      can_view_orders: user.can_view_orders,
      can_create_orders: user.can_create_orders,
      can_view_balance: user.can_view_balance,
      can_view_products: user.can_view_products,
      can_view_prices: user.can_view_prices,
      can_view_stock: user.can_view_stock,
    })
    setShowEditPermissionsDialog(true)
  }, [])

  const statistics = useMemo(() => {
    const totalCustomers = customers.length
    const activeCustomers = customers.filter((c) => c.status === "نشط").length
    const inactiveCustomers = customers.filter((c) => c.status === "غير نشط").length
    const vipCustomers = customers.filter((c) => c.classification === "VIP").length

    return {
      total: totalCustomers,
      active: activeCustomers,
      inactive: inactiveCustomers,
      vip: vipCustomers,
    }
  }, [customers])

  useEffect(() => {
    fetchCustomers()
    fetchClassifications()
    fetchSalesmen()
    fetchPriceClass()
  }, [fetchCustomers, fetchClassifications, fetchSalesmen, fetchPriceClass])

  useEffect(() => {
    console.log("[v0] Current customer changed:", currentCustomer)
    if (currentCustomer) {
      updateFormData(currentCustomer)
    }
  }, [currentCustomer, updateFormData])
  const { isAuthenticated, hasPermission } = useAuth()
  if (isloading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">{isSupplier ? "جاري تحميل الموردين..." : "جاري تحميل العملاء..."}</p>
        </div>
      </div>
    )
  }

  /*if (!hasPermission("customers-view")) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2 text-red-600">لا يوجد صلاحية</h2>
          <p className="text-muted-foreground">ليس لديك صلاحية للوصول إلى العملاء</p>
        </div>
      </div>
    )
  }*/
  if ((!isSupplier && !Util.checkUserAccess(15)) || (isSupplier && !Util.checkUserAccess(16))) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2 text-red-600">لا يوجد صلاحية</h2>
          <p className="text-muted-foreground">ليس لديك صلاحية للوصول إلى هذه الصفحة</p>
        </div>
      </div>
    )
  }
  return (

    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      {/* Success Message */}
      <ConfirmDialogYesNo
        visible={showConfirm}
        onConfirm={confirmDelete}
        onCancel={() => { setShowConfirm(false); popupHasClosed() }}
        message="هل تريد حذف هذا السجل؟"
      />

      {showSuccessMessage && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50">
          <CheckCircle className="h-4 w-4" />
          تم حفظ البيانات بنجاح
        </div>
      )}
      <ProgressSpinner loading={isloading} />
      <Toast ref={toast} position={'top-left'} style={{ top: 100, whiteSpace: 'pre-line' }} />
      {/* Error Message */}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>}

      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">{isSupplier ? "إدارة الموردين" : "إدارة العملاء"} </h1>
        <div className="flex gap-2">
          <Button onClick={() => handleNewCustomer(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            {isSupplier ? "مورد جديد" : "عميل جديد"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowImportDialog(true)}
            className="flex items-center gap-2 bg-transparent"
          >
            <Upload className="h-4 w-4" />
            استيراد من Excel
          </Button>
          <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2 bg-transparent">
                <FileText className="h-4 w-4" />
                التقارير
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>تقارير العملاء</DialogTitle>
              </DialogHeader>
              <div className="p-4">
                <p>سيتم إضافة التقارير هنا</p>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-700">{isSupplier ? "إجمالي الموردين" : "إجمالي العملاء"}</p>
                <p className="text-3xl font-bold text-blue-900">{statistics.total}</p>
              </div>
              <div className="h-10 w-10 bg-blue-200 rounded-full flex items-center justify-center">
                <span className="text-blue-700 text-lg font-bold">{statistics.total}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-700"> {isSupplier ? "الموردين النشطين" : "العملاء النشطين"}</p>
                <p className="text-3xl font-bold text-green-900">{statistics.active}</p>
              </div>
              <div className="h-10 w-10 bg-green-200 rounded-full flex items-center justify-center">
                <span className="text-green-700 text-lg font-bold">{statistics.active}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-700">{isSupplier ? "الموردين غير النشطين" : "العملاء غير النشطين"}</p>
                <p className="text-3xl font-bold text-red-900">{statistics.inactive}</p>
              </div>
              <div className="h-10 w-10 bg-red-200 rounded-full flex items-center justify-center">
                <span className="text-red-700 text-lg font-bold">{statistics.inactive}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-700">{isSupplier ? "مورّدين VIP" : "العملاء VIP"}</p>
                <p className="text-3xl font-bold text-purple-900">{statistics.vip}</p>
              </div>
              <div className="h-10 w-10 bg-purple-200 rounded-full flex items-center justify-center">
                <span className="text-purple-700 text-lg font-bold">{statistics.vip}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Advanced Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            البحث المتقدم
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="search-name"> {isSupplier ? "اسم المورد" : "اسم العميل"}</Label>
              <Input
                id="search-name"
                value={searchFilters.name}
                onChange={(e) => setSearchFilters((prev) => ({ ...prev, name: e.target.value }))}
                className="text-right"
                placeholder="ابحث بالاسم..."
              />
            </div>
            <div>
              <Label htmlFor="search-city">المدينة</Label>
              <Select
                value={searchFilters.city}
                onValueChange={(value) => setSearchFilters((prev) => ({ ...prev, city: value }))}
              >
                <SelectTrigger className="text-right">
                  <SelectValue placeholder="اختر المدينة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">جميع المدن</SelectItem>
                  <SelectItem value="الرياض">الرياض</SelectItem>
                  <SelectItem value="جدة">جدة</SelectItem>
                  <SelectItem value="الدمام">الدمام</SelectItem>
                  <SelectItem value="مكة المكرمة">مكة المكرمة</SelectItem>
                  <SelectItem value="المدينة المنورة">المدينة المنورة</SelectItem>
                  <SelectItem value="الطائف">الطائف</SelectItem>
                  <SelectItem value="تبوك">تبوك</SelectItem>
                  <SelectItem value="بريدة">بريدة</SelectItem>
                  <SelectItem value="خميس مشيط">خميس مشيط</SelectItem>
                  <SelectItem value="حائل">حائل</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="search-status">الحالة</Label>
              <Select
                value={searchFilters.status}
                onValueChange={(value) =>
                  setSearchFilters((prev) => ({ ...prev, status: value }))
                }
              >
                <SelectTrigger className="text-right">
                  <SelectValue placeholder="اختر الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">جميع الحالات</SelectItem>
                  <SelectItem value="نشط">نشط</SelectItem>
                  <SelectItem value="غير نشط">غير نشط</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="search-salesman">المندوب</Label>
              <Select
                value={searchFilters.salesman}
                onValueChange={(value) =>
                  setSearchFilters((prev) => ({ ...prev, salesman: value }))
                }
              >
                <SelectTrigger className="text-right">
                  <SelectValue placeholder="اختر المندوب" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">جميع المندوبين</SelectItem>
                  {salesmen.map((salesman) => (
                    <SelectItem key={salesman.id} value={salesman.name}>
                      {salesman.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customers List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {isSupplier ? `قائمة الموردين (${filteredCustomers.length})` : `قائمة العملاء (${filteredCustomers.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 px-4 py-2 text-right">
                    {isSupplier ? "رقم المورد" : "رقم العميل"}
                  </th>
                  <th className="border border-gray-300 px-4 py-2 text-right">
                    {isSupplier ? "اسم المورد" : "اسم العميل"}
                  </th>
                  <th className="border border-gray-300 px-4 py-2 text-right">الجوال</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">المدينة</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">الحالة</th>
                  <th className="border border-gray-300 px-4 py-2 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {pagedCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-4 py-2">{customer.customer_code}</td>
                    <td className="border border-gray-300 px-4 py-2">{customer.name}</td>
                    <td className="border border-gray-300 px-4 py-2">{customer.mobile1}</td>
                    <td className="border border-gray-300 px-4 py-2">{customer.city}</td>
                    <td className="border border-gray-300 px-4 py-2">
                      <Badge variant={customer.status === "نشط" ? "default" : "secondary"}>{customer.status}</Badge>
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-center">
                      <div className="flex justify-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleManagePortal(customer)}
                          title="إدارة بوابة العميل"
                        >
                          <Globe className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleEditCustomer(customer)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => confirmDelete}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                عرض {pageStart} إلى {pageEnd} من {filteredCustomers.length}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                >
                  السابق
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                >
                  التالي
                </Button>
                <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                  <SelectTrigger className="h-10 w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50, 100].map((size) => (
                      <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customer Form Dialog */}
      <Dialog
        open={showNewCustomerDialog}
        onOpenChange={setShowNewCustomerDialog}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-[90vw] md:max-w-[80vw] lg:max-w-[70vw] max-h-[95vh] overflow-hidden p-0" dir="rtl"
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          
          <UnifiedCustomers
            open={showNewCustomerDialog}
            onOpenChange={(nextOpen: boolean) => {
              setShowNewCustomerDialog(nextOpen)
            }}
            isSupplier={!!isSupplier}
            showCustomerSearch={showCustomerSearch}
            setShowCustomerSearch={setShowCustomerSearch}
            formData={formData}
            updateField={updateField as any}
            validationErrors={validationErrors}
            classifications={classifications}
            pricecategory={pricecategory}
            salesmen={salesmen}
            currentCustomerId={currentCustomerId}
            currentIndex={currentIndex}
            totalRecords={customers.length}
            isSaving={saving}
            loadDataRef={unifiedCustomerLoadDataRef}
            onNew={() => handleNewCustomer(true)}
            onSave={async () => {
              await fetchCustomers()
            }}
            onDelete={fetchCustomers}
            onReport={() => console.log("Generate customer report")}
            onExportExcel={() => console.log("Export to Excel")}
            onPrint={() => console.log("Print customer")}
            customerNameRef={customer_name}
            customers={customers}
            setCurrentIndex={setCurrentIndex}
            setCurrentCustomerId={setCurrentCustomerId}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showPortalDialog} onOpenChange={setShowPortalDialog}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Globe className="h-6 w-6 text-primary" />
              إدارة بوابة العميل - {selectedCustomerForPortal?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="overflow-y-auto max-h-[calc(90vh-120px)] p-4 space-y-4">
            <Card className="border-2 border-primary/20">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Bell className="h-5 w-5 text-primary" />
                  إعدادات الإشعارات التلقائية
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  إرسال إشعارات تلقائية للعميل عن حالة طلبياته عبر SMS أو واتساب
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {loadingNotificationSettings ? (
                  <div className="flex items-center justify-center min-h-[160px]" dir="rtl">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-3"></div>
                      <p className="text-muted-foreground">{isSupplier ? "جاري تحميل الموردين..." : "جاري تحميل العملاء..."}</p>
                    </div>
                  </div>
                ) : notificationSettings ? (
                  <>
                    {/* طريقة الإرسال ورقم الهاتف */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="notification_method" className="flex items-center gap-2 mb-2">
                          <MessageSquare className="h-4 w-4" />
                          طريقة الإرسال
                        </Label>
                        <Select
                          value={notificationSettings.notification_method}
                          onValueChange={(value: "sms" | "whatsapp" | "both") =>
                            setNotificationSettings({ ...notificationSettings, notification_method: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sms">SMS فقط</SelectItem>
                            <SelectItem value="whatsapp">واتساب فقط</SelectItem>
                            <SelectItem value="both">SMS و واتساب</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="preferred_phone" className="flex items-center gap-2 mb-2">
                          <Phone className="h-4 w-4" />
                          رقم الهاتف المفضل
                        </Label>
                        <Input
                          id="preferred_phone"
                          value={notificationSettings.preferred_phone}
                          onChange={(e) =>
                            setNotificationSettings({ ...notificationSettings, preferred_phone: e.target.value })
                          }
                          placeholder="05xxxxxxxx"
                          className="text-right"
                        />
                      </div>

                      <div className="flex items-center justify-between pt-6">
                        <Label htmlFor="is_active">تفعيل الإشعارات</Label>
                        <Switch
                          id="is_active"
                          checked={notificationSettings.is_active}
                          onCheckedChange={(checked) =>
                            setNotificationSettings({ ...notificationSettings, is_active: checked })
                          }
                        />
                      </div>
                    </div>

                    {/* إعدادات الإشعارات لكل حالة */}
                    <div>
                      <h4 className="font-semibold mb-3 text-sm">اختر الإشعارات التي تريد إرسالها تلقائياً:</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                          <div>
                            <Label htmlFor="notify_received" className="font-medium cursor-pointer">
                              استلام الطلبية
                            </Label>
                            <p className="text-xs text-muted-foreground">عند استلام الطلبية من العميل</p>
                          </div>
                          <Switch
                            id="notify_received"
                            checked={notificationSettings.notify_on_received}
                            onCheckedChange={(checked) =>
                              setNotificationSettings({ ...notificationSettings, notify_on_received: checked })
                            }
                          />
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                          <div>
                            <Label htmlFor="notify_preparing" className="font-medium cursor-pointer">
                              تحضير الطلبية
                            </Label>
                            <p className="text-xs text-muted-foreground">عند البدء في تحضير الطلبية</p>
                          </div>
                          <Switch
                            id="notify_preparing"
                            checked={notificationSettings.notify_on_preparing}
                            onCheckedChange={(checked) =>
                              setNotificationSettings({ ...notificationSettings, notify_on_preparing: checked })
                            }
                          />
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                          <div>
                            <Label htmlFor="notify_quality" className="font-medium cursor-pointer">
                              التدقيق والمراجعة
                            </Label>
                            <p className="text-xs text-muted-foreground">عند مراجعة وتدقيق الطلبية</p>
                          </div>
                          <Switch
                            id="notify_quality"
                            checked={notificationSettings.notify_on_quality_check}
                            onCheckedChange={(checked) =>
                              setNotificationSettings({ ...notificationSettings, notify_on_quality_check: checked })
                            }
                          />
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                          <div>
                            <Label htmlFor="notify_ready" className="font-medium cursor-pointer">
                              جاهز للشحن
                            </Label>
                            <p className="text-xs text-muted-foreground">عند جاهزية الطلبية للشحن</p>
                          </div>
                          <Switch
                            id="notify_ready"
                            checked={notificationSettings.notify_on_ready_to_ship}
                            onCheckedChange={(checked) =>
                              setNotificationSettings({ ...notificationSettings, notify_on_ready_to_ship: checked })
                            }
                          />
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                          <div>
                            <Label htmlFor="notify_shipped" className="font-medium cursor-pointer">
                              تم الشحن
                            </Label>
                            <p className="text-xs text-muted-foreground">عند شحن الطلبية</p>
                          </div>
                          <Switch
                            id="notify_shipped"
                            checked={notificationSettings.notify_on_shipped}
                            onCheckedChange={(checked) =>
                              setNotificationSettings({ ...notificationSettings, notify_on_shipped: checked })
                            }
                          />
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                          <div>
                            <Label htmlFor="notify_delivered" className="font-medium cursor-pointer">
                              تم التسليم
                            </Label>
                            <p className="text-xs text-muted-foreground">عند تسليم الطلبية للعميل</p>
                          </div>
                          <Switch
                            id="notify_delivered"
                            checked={notificationSettings.notify_on_delivered}
                            onCheckedChange={(checked) =>
                              setNotificationSettings({ ...notificationSettings, notify_on_delivered: checked })
                            }
                          />
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card border-red-200">
                          <div>
                            <Label htmlFor="notify_cancelled" className="font-medium cursor-pointer text-red-700">
                              إلغاء الطلبية
                            </Label>
                            <p className="text-xs text-muted-foreground">عند إلغاء الطلبية</p>
                          </div>
                          <Switch
                            id="notify_cancelled"
                            checked={notificationSettings.notify_on_cancelled}
                            onCheckedChange={(checked) =>
                              setNotificationSettings({ ...notificationSettings, notify_on_cancelled: checked })
                            }
                          />
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                          <div>
                            <Label htmlFor="daily_summary" className="font-medium cursor-pointer">
                              ملخص يومي
                            </Label>
                            <p className="text-xs text-muted-foreground">إرسال ملخص يومي بجميع الطلبيات</p>
                          </div>
                          <Switch
                            id="daily_summary"
                            checked={notificationSettings.send_daily_summary}
                            onCheckedChange={(checked) =>
                              setNotificationSettings({ ...notificationSettings, send_daily_summary: checked })
                            }
                          />
                        </div>
                      </div>
                    </div>

                    {/* زر الحفظ */}
                    <div className="flex justify-end pt-4 border-t">
                      <Button
                        onClick={handleSaveNotificationSettings}
                        disabled={savingNotificationSettings}
                        className="gap-2"
                      >
                        <Save className="h-4 w-4" />
                        {savingNotificationSettings ? "جاري الحفظ..." : "حفظ إعدادات الإشعارات"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">لا توجد إعدادات</div>
                )}
              </CardContent>
            </Card>

            {/* Header with Add User Button */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">حسابات الدخول</h3>
                <p className="text-sm text-muted-foreground">إدارة المستخدمين والصلاحيات</p>
              </div>
              <Button onClick={() => setShowAddUserDialog(true)} className="gap-2">
                <UserPlus className="h-4 w-4" />
                إضافة مستخدم
              </Button>
            </div>

            {/* Users Table */}
            {loadingPortalUsers ? (
              <div className="flex items-center justify-center min-h-[240px]" dir="rtl">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-3"></div>
                  <p className="text-muted-foreground">{isSupplier ? "جاري تحميل الموردين..." : "جاري تحميل العملاء..."}</p>
                </div>
              </div>
            ) : portalUsers.length === 0 ? (
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-6 text-center">
                  <Globe className="h-12 w-12 text-blue-400 mx-auto mb-3" />
                  <h3 className="font-semibold text-blue-900 mb-2">لا يوجد مستخدمون</h3>
                  <p className="text-blue-700 text-sm mb-4">قم بإضافة أول مستخدم للعميل للوصول إلى البوابة</p>
                  <Button onClick={() => setShowAddUserDialog(true)} className="gap-2">
                    <UserPlus className="h-4 w-4" />
                    إضافة أول مستخدم
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">اسم المستخدم</TableHead>
                      <TableHead className="text-right">البريد الإلكتروني</TableHead>
                      <TableHead className="text-right">آخر تسجيل دخول</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">الصلاحيات</TableHead>
                      <TableHead className="text-right">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {portalUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.username}</TableCell>
                        <TableCell className="text-sm">{user.email || "-"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(user.last_login)}</TableCell>
                        <TableCell>
                          <Badge variant={user.is_active ? "default" : "secondary"}>
                            {user.is_active ? "مفعل" : "معطل"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.can_view_orders && (
                              <Badge variant="outline" className="text-xs">
                                طلبيات
                              </Badge>
                            )}
                            {user.can_create_orders && (
                              <Badge variant="outline" className="text-xs">
                                إنشاء
                              </Badge>
                            )}
                            {user.can_view_balance && (
                              <Badge variant="outline" className="text-xs">
                                رصيد
                              </Badge>
                            )}
                            {user.can_view_products && (
                              <Badge variant="outline" className="text-xs">
                                أصناف
                              </Badge>
                            )}
                            {user.can_view_prices && (
                              <Badge variant="outline" className="text-xs">
                                أسعار
                              </Badge>
                            )}
                            {user.can_view_stock && (
                              <Badge variant="outline" className="text-xs">
                                مخزون
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditPermissionsDialog(user)}
                              title="تعديل الصلاحيات"
                            >
                              <Shield className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleResetPassword(user.id)}
                              title="تغيير كلمة المرور"
                            >
                              <Key className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleToggleUserStatus(user.id)}
                              title={user.is_active ? "تعطيل" : "تفعيل"}
                            >
                              {user.is_active ? (
                                <X className="h-4 w-4 text-red-600" />
                              ) : (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Info Card */}
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4">
                <h4 className="font-semibold text-blue-900 mb-2">معلومات مهمة</h4>
                <ul className="text-blue-800 text-sm space-y-1">
                  <li>• يمكن للعميل تسجيل الدخول من خلال صفحة بوابة العملاء</li>
                  <li>• كل مستخدم له صلاحيات مستقلة يمكن تخصيصها</li>
                  <li>• يتم تسجيل جميع عمليات الدخول لأغراض الأمان</li>
                  <li>• يمكن تعطيل المستخدم مؤقتاً دون حذف حسابه</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddUserDialog} onOpenChange={setShowAddUserDialog}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              إضافة مستخدم جديد
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 p-4">
            {/* User Info */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="new_username">اسم المستخدم *</Label>
                <Input
                  id="new_username"
                  value={newUserData.username}
                  onChange={(e) => setNewUserData({ ...newUserData, username: e.target.value })}
                  placeholder="أدخل اسم المستخدم"
                  className="text-right"
                />
              </div>

              <div>
                <Label htmlFor="new_password">كلمة المرور *</Label>
                <Input
                  id="new_password"
                  type="password"
                  value={newUserData.password}
                  onChange={(e) => setNewUserData({ ...newUserData, password: e.target.value })}
                  placeholder="أدخل كلمة المرور"
                  className="text-right"
                />
              </div>

              <div>
                <Label htmlFor="new_email">البريد الإلكتروني</Label>
                <Input
                  id="new_email"
                  type="email"
                  value={newUserData.email}
                  onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
                  placeholder="أدخل البريد الإلكتروني (اختياري)"
                  className="text-right"
                />
              </div>
            </div>

            {/* Permissions */}
            <div className="space-y-4">
              <h3 className="font-semibold">الصلاحيات</h3>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="perm_view_orders">عرض الطلبيات</Label>
                  <Switch
                    id="perm_view_orders"
                    checked={userPermissions.can_view_orders}
                    onCheckedChange={(checked) => setUserPermissions({ ...userPermissions, can_view_orders: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="perm_create_orders">إنشاء طلبيات</Label>
                  <Switch
                    id="perm_create_orders"
                    checked={userPermissions.can_create_orders}
                    onCheckedChange={(checked) =>
                      setUserPermissions({ ...userPermissions, can_create_orders: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="perm_view_balance">عرض الرصيد</Label>
                  <Switch
                    id="perm_view_balance"
                    checked={userPermissions.can_view_balance}
                    onCheckedChange={(checked) => setUserPermissions({ ...userPermissions, can_view_balance: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="perm_view_products">عرض الأصناف</Label>
                  <Switch
                    id="perm_view_products"
                    checked={userPermissions.can_view_products}
                    onCheckedChange={(checked) =>
                      setUserPermissions({ ...userPermissions, can_view_products: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="perm_view_prices">عرض الأسعار</Label>
                  <Switch
                    id="perm_view_prices"
                    checked={userPermissions.can_view_prices}
                    onCheckedChange={(checked) => setUserPermissions({ ...userPermissions, can_view_prices: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="perm_view_stock">عرض المخزون</Label>
                  <Switch
                    id="perm_view_stock"
                    checked={userPermissions.can_view_stock}
                    onCheckedChange={(checked) => setUserPermissions({ ...userPermissions, can_view_stock: checked })}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button variant="outline" onClick={() => setShowAddUserDialog(false)}>
                إلغاء
              </Button>
              <Button onClick={handleAddPortalUser}>إضافة المستخدم</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditPermissionsDialog} onOpenChange={setShowEditPermissionsDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              تعديل الصلاحيات - {selectedUser?.username}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 p-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="edit_view_orders">عرض الطلبيات</Label>
              <Switch
                id="edit_view_orders"
                checked={userPermissions.can_view_orders}
                onCheckedChange={(checked) => setUserPermissions({ ...userPermissions, can_view_orders: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="edit_create_orders">إنشاء طلبيات</Label>
              <Switch
                id="edit_create_orders"
                checked={userPermissions.can_create_orders}
                onCheckedChange={(checked) => setUserPermissions({ ...userPermissions, can_create_orders: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="edit_view_balance">عرض الرصيد</Label>
              <Switch
                id="edit_view_balance"
                checked={userPermissions.can_view_balance}
                onCheckedChange={(checked) => setUserPermissions({ ...userPermissions, can_view_balance: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="edit_view_products">عرض الأصناف</Label>
              <Switch
                id="edit_view_products"
                checked={userPermissions.can_view_products}
                onCheckedChange={(checked) => setUserPermissions({ ...userPermissions, can_view_products: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="edit_view_prices">عرض الأسعار</Label>
              <Switch
                id="edit_view_prices"
                checked={userPermissions.can_view_prices}
                onCheckedChange={(checked) => setUserPermissions({ ...userPermissions, can_view_prices: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="edit_view_stock">عرض المخزون</Label>
              <Switch
                id="edit_view_stock"
                checked={userPermissions.can_view_stock}
                onCheckedChange={(checked) => setUserPermissions({ ...userPermissions, can_view_stock: checked })}
              />
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button variant="outline" onClick={() => setShowEditPermissionsDialog(false)}>
                إلغاء
              </Button>
              <Button onClick={handleUpdatePermissions}>حفظ التغييرات</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ExcelImport
        entityType={isSupplier ? "suppliers" : "customers"}
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImportComplete={() => {
          fetchCustomers()
          setShowImportDialog(false)
        }}
      />
    </div>
  )
}



