"use client"

import { useCallback, useMemo } from "react"
import { Landmark } from "lucide-react"
import CodeNameSearchDialog from "@/components/admin/code-name-search-dialog"

export interface BankSearchRecord {
  id: number
  bank_code?: string
  bank_name: string
  status?: number
}

interface BanksSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  banks: BankSearchRecord[]
  onSelect: (record: BankSearchRecord) => void
}

// بحث البنوك: التركيز على الاسم عند الفتح، Enter كـTab، Enter على السطر يختاره (انظر code-name-search-dialog)
export default function BanksSearch({ open, onOpenChange, banks, onSelect }: BanksSearchProps) {
  const records = useMemo(() => banks.filter((bank) => bank.status !== 3), [banks])
  const toRecord = useCallback((bank: BankSearchRecord) => ({ id: bank.id, code: bank.bank_code, name: bank.bank_name }), [])
  return (
    <CodeNameSearchDialog
      open={open}
      onOpenChange={onOpenChange}
      title="بحث البنوك"
      icon={<Landmark className="h-4 w-4" />}
      codeLabel="رقم البنك"
      nameLabel="اسم البنك"
      records={records}
      toRecord={toRecord}
      onSelect={onSelect}
    />
  )
}
