"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { X } from "lucide-react"
import type { AccountItem } from "@/components/customer/account-search-dialog"
import SearchCostCenterDialog, { CostCenterItem as SearchCostCenterItem } from "@/components/customer/search-cost-center-dialog"
import DataGridView from "../common/DataGridView"

type CostCenterType = {
  id: number
  name: string
}

type AccountCostCenterRow = {
  id?: number | null
  account_id?: number | null
  cost_center_type_id?: number | null
  required_in_transactions?: number | string | null
  default_cost_center_id?: number | string | null
}

type DisplayRow = {
  id: number
  cost_center_type_id: number
  name: string
  cost_center_name: string
  default_cost_center_id: number | null
  required_in_transactions: number
  required_label: string
}

interface AccountCostCentersProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: AccountItem | null
}

const requiredLabel = (value: number | string | null | undefined) => {
  const normalized = Number(value ?? 0)
  if (normalized === 2) return "اجباري"
  if (normalized === 3) return "ممنوع"
  return "اختياري"
}

export default function AccountCostCenters({ open, onOpenChange, account }: AccountCostCentersProps) {
  const [costCenterTypes, setCostCenterTypes] = useState<CostCenterType[]>([])
  const [costCenters, setCostCenters] = useState<SearchCostCenterItem[]>([])
  const [rows, setRows] = useState<DisplayRow[]>([])
  const [loading, setLoading] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchType, setSearchType] = useState<{ id: number; name: string } | null>(null)
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(-1)

  const buildRows = useCallback(
    (types: CostCenterType[], centers: SearchCostCenterItem[], selectedAccount: AccountItem | null) => {
      const assignedRows = Array.isArray((selectedAccount as any)?.cost_centers)
        ? ((selectedAccount as any).cost_centers as AccountCostCenterRow[])
        : []

      return types
        .slice()
        .sort((left, right) => Number(left.id || 0) - Number(right.id || 0))
        .map((type) => {
          const assignedRow = assignedRows.find((row) => Number(row.cost_center_type_id) === Number(type.id))
          const defaultCenterId = assignedRow?.default_cost_center_id != null ? Number(assignedRow.default_cost_center_id) : null
          const defaultCenterName =
            defaultCenterId != null
              ? centers.find((center) => Number(center.id) === defaultCenterId)?.name || ""
              : ""
          const requiredValue = Number(assignedRow?.required_in_transactions ?? 1)

          return {
            id: type.id,
            cost_center_type_id: type.id,
            name: type.name,
            cost_center_name: defaultCenterName,
            default_cost_center_id: defaultCenterId,
            required_in_transactions: requiredValue,
            required_label: requiredLabel(requiredValue),
          }
        })
    },
    [],
  )

  useEffect(() => {
    if (!open) return

    let cancelled = false

    const loadData = async () => {
      setLoading(true)
      try {
        const [typesResponse, centersResponse] = await Promise.all([
          fetch("/api/cost-center-types"),
          fetch("/api/cost-centers"),
        ])

        const typesData = typesResponse.ok ? await typesResponse.json() : []
        const centersData = centersResponse.ok ? await centersResponse.json() : []

        if (cancelled) return

        setCostCenterTypes(Array.isArray(typesData) ? typesData : [])
        setCostCenters(Array.isArray(centersData) ? centersData : [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadData()

    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    setRows(buildRows(costCenterTypes, costCenters, account))
  }, [account, buildRows, costCenterTypes, costCenters])

  const costCenterScheme = useMemo(
    () => ({
      name: "AccountCostCenterScheme",
      columns: [
        { header: "نوع المركز", name: "name", width: 160, minWidth: 130, isReadOnly: true },
        { header: "مركز التكلفة الافتراضي", name: "cost_center_name", width: '*', minWidth: 130, isReadOnly: true },
        { header: "اجباري", name: "required_label", width: 90, isReadOnly: true },
        {
          name: "btnSearch",
          header: " ",
          width: 55,
          buttonBody: "button",
          align: "center",
          title: "بحث",
          iconType: "search",
          className: "btn-search",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            e.stopPropagation()
            const rowIndex = ctx.row.index
            const row = rows[rowIndex]
            if (!row || !account) return
            setSelectedRowIndex(rowIndex)
            setSearchType({ id: row.cost_center_type_id, name: row.name })
            setSearchOpen(true)
          },
          visible: true,
          visibleInColumnChooser: true,
        },
        {
          name: "btnDelete",
          header: " ",
          width: 55,
          buttonBody: "button",
          align: "center",
          title: "حذف",
          iconType: "delete",
          className: "btn-delete",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            e.stopPropagation()
            const rowIndex = ctx.row.index
            if (!account) return
            setRows((prevRows) =>
              prevRows.map((row, index) =>
                index === rowIndex
                  ? {
                      ...row,
                      default_cost_center_id: null,
                      cost_center_name: "",
                    }
                  : row,
              ),
            )
          },
          visible: true,
          visibleInColumnChooser: true,
        },
      ],
    }),
    [account, rows],
  )

  const handleSelectCostCenter = useCallback(
    (center: any) => {
      if (selectedRowIndex < 0) return

      setRows((prevRows) =>
        prevRows.map((row, index) =>
          index === selectedRowIndex
            ? {
                ...row,
                default_cost_center_id: center.id,
                cost_center_name: center.name || "",
              }
            : row,
        ),
      )
      setSearchOpen(false)
      setSearchType(null)
      setSelectedRowIndex(-1)
    },
    [selectedRowIndex],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton className="w-[88vw] max-w-4xl h-[78vh] max-h-[78vh] overflow-hidden p-3 sm:p-4" dir="rtl">
        <div className="flex h-full flex-col gap-2">
          <div className="flex items-start justify-between gap-3 border-b pb-2">
            <div>
              <h2 className="text-base font-bold text-blue-700">مراكز الكلفة</h2>
              <p className="text-sm text-slate-600">
                {account ? `${account.code} / ${account.name}` : "لا يوجد حساب محدد"}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="h-7 w-7 p-0" title="إغلاق">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="rounded-md border border-slate-300 overflow-hidden flex-1 min-h-0" dir="rtl">
            {rows.length > 0 ? (
              <div className="h-full min-h-0 overflow-auto">
                <DataGridView scheme={costCenterScheme} dataSource={rows} defaultRowHeight={34} />
              </div>
            ) : (
              <div className="h-full min-h-0 flex items-center justify-center bg-slate-50">
                  <p className="text-slate-500 text-sm">{loading ? "جارٍ تحميل مراكز الكلفة..." : "لا توجد بيانات مراكز كلفة"}</p>
              </div>
            )}
          </div>

          <div className="border-t pt-2 flex items-center justify-center gap-2">
            <Button variant="default" size="sm" onClick={() => onOpenChange(false)} className="min-w-20">
              موافق
            </Button>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="min-w-20">
              الغاء
            </Button>
          </div>
        </div>

        {searchOpen && searchType && (
          <SearchCostCenterDialog
            open={searchOpen}
            onOpenChange={setSearchOpen}
            type={searchType}
            costCenters={costCenters as any}
            onSelect={handleSelectCostCenter}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}