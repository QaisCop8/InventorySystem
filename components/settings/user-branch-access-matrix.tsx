"use client"

import { tr, appDir } from "@/lib/i18n"
import { VoucherListHero } from "@/components/common/voucher-list-shell"
import { useEffect, useMemo, useState } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Grid3x3, Save, Search } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface User {
  id: string
  user_id: string
  username: string
  full_name: string
  branch_id?: number | null
}

interface Branch {
  id: number
  branch_code: string
  branch_name: string
  status: number
}

// "user_id:branch_id" لكل عضوية فعلية — بلا أي مفتاح لمستخدم يعني وصولاً غير مقيَّد لكل الفروع
// (السلوك الحالي دون تغيير)، لا وصولاً معدوماً؛ هذا هو نفس اصطلاح جداول product_branches/
// customer_branches/account_branches الوسيطة المستخدَم مسبقاً بهذا المشروع لتقييد الفروع.
function cellKey(userId: string, branchId: number) {
  return `${userId}:${branchId}`
}

export default function UserBranchAccessMatrix() {
  const { toast } = useToast()
  const [users, setUsers] = useState<User[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [initialChecked, setInitialChecked] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [usersRes, branchesRes, matrixRes] = await Promise.all([
          fetch("/api/settings/user"),
          fetch("/api/branches"),
          fetch("/api/settings/user/branch-access-matrix"),
        ])
        if (!usersRes.ok || !branchesRes.ok || !matrixRes.ok) throw new Error(tr("تعذر تحميل بيانات المصفوفة"))
        const [usersData, branchesData, matrixData]: [User[], Branch[], { user_id: string; branch_id: number }[]] = await Promise.all([
          usersRes.json(),
          branchesRes.json(),
          matrixRes.json(),
        ])
        setUsers(usersData)
        setBranches(branchesData)
        const next = new Set(matrixData.map((m) => cellKey(String(m.user_id), Number(m.branch_id))))
        setChecked(next)
        setInitialChecked(new Set(next))
      } catch (error) {
        toast({ title: tr("تعذر فتح المصفوفة"), description: error instanceof Error ? error.message : tr("حدث خطأ"), variant: "destructive" })
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [toast])

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ar")
    if (!term) return users
    return users.filter((u) => [u.full_name, u.username].some((v) => v?.toLocaleLowerCase("ar").includes(term)))
  }, [users, search])

  const dirty = useMemo(() => {
    if (checked.size !== initialChecked.size) return true
    for (const key of checked) if (!initialChecked.has(key)) return true
    return false
  }, [checked, initialChecked])

  const toggleCell = (userId: string, branchId: number) => {
    const key = cellKey(userId, branchId)
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleRow = (userId: string, allChecked: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev)
      for (const b of branches) {
        const key = cellKey(userId, b.id)
        if (allChecked) next.delete(key)
        else next.add(key)
      }
      return next
    })
  }

  const toggleColumn = (branchId: number, allChecked: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev)
      for (const u of filteredUsers) {
        const key = cellKey(String(u.user_id || u.id), branchId)
        if (allChecked) next.delete(key)
        else next.add(key)
      }
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    try {
      const memberships = Array.from(checked).map((key) => {
        const [user_id, branch_id] = key.split(":")
        return { user_id, branch_id: Number(branch_id) }
      })
      const response = await fetch("/api/settings/user/branch-access-matrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberships }),
      })
      if (!response.ok) throw new Error(tr("تعذر حفظ مصفوفة الفروع"))
      setInitialChecked(new Set(checked))
      toast({ title: tr("تم حفظ صلاحيات الفروع") })
    } catch (error) {
      toast({ title: tr("فشل الحفظ"), description: error instanceof Error ? error.message : tr("حدث خطأ"), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex h-64 items-center justify-center text-muted-foreground">{tr("جاري تحميل المصفوفة...")}</div>

  return (
    <div className="w-full space-y-5 p-4 md:p-6" dir={appDir()}>
<VoucherListHero title={tr("صلاحيات المستخدمين على الفروع")} subtitle={tr("حدد الفروع التي يعمل بها كل مستخدم. مستخدم بلا أي فرع محدَّد هنا يصل لكل الفروع دون قيد.")} icon={Grid3x3} category={tr("الإعدادات")} actions={<><Button onClick={() => void save()} disabled={!dirty || saving}>
          <Save className="me-2 h-4 w-4" />
          {saving ? tr("جاري الحفظ...") : tr("حفظ")}
        </Button></>} />

      {branches.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">{tr("لا توجد فروع معرفة. أضف فرعاً من شاشة الفروع أولاً.")}</div>
      ) : (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="relative max-w-sm">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr("بحث عن مستخدم...")} className="ps-9" />
            </div>

            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky start-0 z-10 bg-background text-start">{tr("المستخدم")}</TableHead>
                    {branches.map((b) => {
                      const columnChecked = filteredUsers.length > 0 && filteredUsers.every((u) => checked.has(cellKey(String(u.user_id || u.id), b.id)))
                      return (
                        <TableHead key={b.id} className="text-center whitespace-nowrap">
                          <div className="flex flex-col items-center gap-1.5 py-1">
                            <span>{b.branch_name}</span>
                            <Checkbox checked={columnChecked} onCheckedChange={() => toggleColumn(b.id, columnChecked)} aria-label={tr("تحديد الكل لفرع {0}", b.branch_name)} />
                          </div>
                        </TableHead>
                      )
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => {
                    const userId = String(u.user_id || u.id)
                    const rowChecked = branches.length > 0 && branches.every((b) => checked.has(cellKey(userId, b.id)))
                    const rowHasAny = branches.some((b) => checked.has(cellKey(userId, b.id)))
                    return (
                      <TableRow key={userId}>
                        <TableCell className="sticky start-0 z-10 bg-background">
                          <div className="flex items-center gap-3">
                            <button type="button" onClick={() => toggleRow(userId, rowChecked)} title={tr("تحديد كل الفروع لهذا المستخدم")}>
                              <Avatar className="h-8 w-8">
                                <AvatarFallback>{(u.full_name || u.username || "م").charAt(0)}</AvatarFallback>
                              </Avatar>
                            </button>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold">{u.full_name || u.username}</div>
                              {!rowHasAny && <Badge variant="outline" className="mt-0.5 text-[10px]">{tr("كل الفروع")}</Badge>}
                            </div>
                          </div>
                        </TableCell>
                        {branches.map((b) => (
                          <TableCell key={b.id} className="text-center">
                            <Checkbox
                              checked={checked.has(cellKey(userId, b.id))}
                              onCheckedChange={() => toggleCell(userId, b.id)}
                              aria-label={`${u.full_name || u.username} — ${b.branch_name}`}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
