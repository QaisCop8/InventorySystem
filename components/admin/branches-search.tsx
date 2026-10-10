"use client"

import { useCallback, useMemo } from "react"
import { Building2 } from "lucide-react"
import CodeNameSearchDialog from "@/components/admin/code-name-search-dialog"

export interface BranchSearchRecord {
  id: number
  branch_code?: string
  branch_name: string
  bank_id: number | null
  status?: number
}

interface BranchesSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  branches: BranchSearchRecord[]
  bankId?: number | null
  onSelect: (record: BranchSearchRecord) => void
}

// بحث فروع البنوك (مُصفّاة على البنك المختار إن وُجد): التركيز على الاسم عند الفتح، Enter كـTab،
// Enter على السطر يختاره (انظر code-name-search-dialog)
export default function BranchesSearch({ open, onOpenChange, branches, bankId, onSelect }: BranchesSearchProps) {
  const records = useMemo(
    () => branches.filter((branch) => branch.status !== 3 && (!bankId || branch.bank_id === bankId)),
    [branches, bankId],
  )
  const toRecord = useCallback((branch: BranchSearchRecord) => ({ id: branch.id, code: branch.branch_code, name: branch.branch_name }), [])
  return (
    <CodeNameSearchDialog
      open={open}
      onOpenChange={onOpenChange}
      title="بحث الفروع"
      icon={<Building2 className="h-4 w-4" />}
      codeLabel="رقم الفرع"
      nameLabel="اسم الفرع"
      records={records}
      toRecord={toRecord}
      onSelect={onSelect}
      notice={!bankId ? "لم يتم اختيار بنك بعد — سيتم عرض جميع الفروع." : undefined}
    />
  )
}
