"use client"

import { tr } from "@/lib/i18n"
import { useMemo } from "react"
import { ExcelImportWizard, type ImportConfig, type ImportIssue } from "@/components/import/excel-import-wizard"

type Bank = { id: number; bank_code: string; bank_name: string; swift_code?: string | null; status?: number }
type BankBranch = { id: number; branch_code: string; branch_name: string; bank_id: number | null }
type Ctx = { banks: Bank[]; branches: BankBranch[] }

const padBankCode = (value: unknown) => { const code = String(value ?? "").trim(); return /^\d{1,4}$/.test(code) ? code.padStart(4, "0") : code }
const padBranchCode = (value: unknown) => { const code = String(value ?? "").trim(); return /^\d{1,4}$/.test(code) ? code.padStart(4, "0") : code }
const same = (a: unknown, b: unknown) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase()
const SWIFT = /^[A-Z0-9]{8}([A-Z0-9]{3})?$/

/**
 * استيراد البنوك وفروعها من Excel (سطر لكل فرع، أو سطر للبنك وحده): البنك يُطابَق برقمه — غير الموجود يُنشأ برقمه واسمه
 * ورمز السويفت، والموجود بلا سويفت يُكمَّل رمزه. الفرع (اختياري) يُنشأ تحت البنك ما لم يكن موجوداً برقمه أو اسمه.
 */
export function BanksImportDialog({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (open: boolean) => void; onImported?: () => void }) {
  const config = useMemo<ImportConfig<Ctx>>(() => ({
    title: tr("استيراد البنوك والفروع من Excel"),
    description: tr("سطر لكل فرع (أو سطر للبنك وحده بدون فرع). البنك يُطابَق برقمه وينشأ إن لم يكن موجوداً."),
    templateFileName: "نموذج-البنوك-والفروع",
    importButtonLabel: tr("استيراد البنوك والفروع"),
    fields: [
      { key: "bank_code", label: tr("رقم البنك"), required: true, maxLength: 4, aliases: ["bank_code", "bank code", "رقم البنك", "كود البنك"], example: "0001" },
      { key: "bank_name", label: tr("اسم البنك"), required: true, maxLength: 100, aliases: ["bank_name", "bank", "البنك"], example: tr("بنك فلسطين") },
      { key: "bank_name_en", label: tr("اسم البنك انجليزي"), maxLength: 100, aliases: ["bank_name_en", "bank name en", "english name"], example: "Bank of Palestine" },
      { key: "swift_code", label: tr("رمز السويفت"), maxLength: 11, aliases: ["swift", "swift_code", "swift code", "bic", "سويفت"], example: "PALSPS22" },
      { key: "branch_code", label: tr("رقم الفرع"), maxLength: 4, aliases: ["branch_code", "branch code", "رقم الفرع", "كود الفرع"], example: "0001" },
      { key: "branch_name", label: tr("اسم الفرع"), maxLength: 100, aliases: ["branch_name", "branch", "الفرع"], example: tr("رام الله") },
    ],
    sampleRows: [
      { bank_code: "0001", bank_name: tr("بنك فلسطين"), bank_name_en: "Bank of Palestine", swift_code: "PALSPS22", branch_code: "0001", branch_name: tr("رام الله") },
      { bank_code: "0001", bank_name: tr("بنك فلسطين"), bank_name_en: "Bank of Palestine", swift_code: "PALSPS22", branch_code: "0002", branch_name: tr("نابلس") },
    ],
    prepare: async () => {
      const [banks, branches] = await Promise.all([
        fetch("/api/banks", { cache: "no-store" }).then((response) => (response.ok ? response.json() : [])),
        fetch("/api/branches?kind=bank", { cache: "no-store" }).then((response) => (response.ok ? response.json() : [])),
      ])
      return { banks: Array.isArray(banks) ? banks : [], branches: Array.isArray(branches) ? branches : [] }
    },
    validate: (rows, ctx) => {
      const result = new Map<number, ImportIssue[]>()
      const add = (id: number, issue: ImportIssue) => result.set(id, [...(result.get(id) || []), issue])
      const fileBankNames = new Map<string, string>()
      const fileBranches = new Set<string>()
      for (const row of rows) {
        const code = padBankCode(row.data.bank_code)
        if (code && !/^[A-Za-z0-9]{1,4}$/.test(code)) add(row.id, { field: "bank_code", message: tr("رقم البنك من 1 إلى 4 خانات") })
        const swift = String(row.data.swift_code ?? "").trim().toUpperCase().replace(/\s+/g, "")
        if (swift && !SWIFT.test(swift)) add(row.id, { field: "swift_code", message: tr("رمز السويفت يجب أن يكون 8 أو 11 حرفاً/رقماً") })
        // نفس رقم البنك باسمين مختلفين داخل الملف
        const name = String(row.data.bank_name ?? "").trim()
        if (code && name) {
          const previous = fileBankNames.get(code)
          if (previous && !same(previous, name)) add(row.id, { field: "bank_name", message: tr("رقم البنك {0} ورد باسم آخر في الملف ({1})", code, previous) })
          else fileBankNames.set(code, name)
          const existingByName = ctx.banks.find((bank) => same(bank.bank_name, name) && !same(bank.bank_code, code))
          if (existingByName) add(row.id, { field: "bank_name", message: tr("اسم البنك مستخدم لبنك آخر برقم {0}", existingByName.bank_code) })
        }
        const branchCode = padBranchCode(row.data.branch_code)
        const branchName = String(row.data.branch_name ?? "").trim()
        if (branchCode && !/^\d{1,4}$/.test(branchCode)) add(row.id, { field: "branch_code", message: tr("رقم الفرع من 1 إلى 4 أرقام") })
        if (branchCode && !branchName) add(row.id, { field: "branch_name", message: tr("اسم الفرع مطلوب مع رقم الفرع") })
        if (branchName) {
          const key = `${code}|${branchName.toLowerCase()}`
          if (fileBranches.has(key)) add(row.id, { field: "branch_name", message: tr("الفرع مكرر في الملف") })
          fileBranches.add(key)
        }
      }
      return result
    },
    importRows: async (rows, ctx, report) => {
      const banks = [...ctx.banks]
      const branches = [...ctx.branches]
      // الفرع الموجود يُعرف باسمه داخل نفس البنك فقط — رقم الفرع فريد على مستوى كل الفروع (فروع الشركة والبنوك)، ورقم مستخدم
      // يُستبدل برقم تلقائي قد يساوي رقم سطر آخر في الملف، فالمطابقة بالرقم كانت تتخطّى فروعاً جديدة
      const send = async (method: "POST" | "PUT", url: string, body: unknown) => {
        const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data?.error || tr("تعذر الحفظ"))
        return data
      }
      for (const row of rows) {
        try {
          const code = padBankCode(row.data.bank_code)
          const swift = String(row.data.swift_code ?? "").trim().toUpperCase().replace(/\s+/g, "")
          let bank = banks.find((item) => same(item.bank_code, code))
          if (!bank) {
            bank = await send("POST", "/api/banks", { bank_code: code, bank_name: String(row.data.bank_name).trim(), bank_name_en: String(row.data.bank_name_en ?? "").trim(), swift_code: swift, status: 1 }) as Bank
            banks.push(bank)
          } else if (swift && !bank.swift_code) {
            bank = await send("PUT", "/api/banks", { ...bank, swift_code: swift }) as Bank
            banks.splice(banks.findIndex((item) => item.id === bank!.id), 1, bank)
          }
          let note: string | undefined
          const branchName = String(row.data.branch_name ?? "").trim()
          if (branchName) {
            const branchCode = padBranchCode(row.data.branch_code)
            const exists = branches.find((item) => item.bank_id === bank!.id && same(item.branch_name, branchName))
            if (!exists) {
              const body = { branch_name: branchName, bank_id: bank.id, bank_branch: true, status: 1 }
              // رقم الفرع فريد على مستوى كل الفروع (فروع الشركة والبنوك) — رقم مستخدم ⇐ رقم تلقائي
              const created = await send("POST", "/api/branches", { ...body, branch_code: branchCode, quick: !branchCode })
                .catch((error) => branchCode ? send("POST", "/api/branches", { ...body, branch_code: "", quick: true }) : Promise.reject(error)) as BankBranch
              branches.push(created)
              if (branchCode && !same(created.branch_code, branchCode)) note = tr("رقم الفرع {0} مستخدم لفرع آخر — أُعطي الرقم {1}", branchCode, created.branch_code)
            }
          }
          report(row.id, { ok: true, message: note })
        } catch (error) {
          report(row.id, { ok: false, message: error instanceof Error ? error.message : tr("تعذر الحفظ") })
        }
      }
    },
  }), [])

  return <ExcelImportWizard open={open} onOpenChange={onOpenChange} config={config} onImported={() => onImported?.()} />
}
