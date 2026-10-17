"use client"

import { confirmYesNo } from "@/components/ui/confirm-host"
import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Plus, Trash2, TestTube, Save, Database } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface PervasiveConnection {
  id?: number
  connection_name: string
  connection_type: "odbc" | "api"
  api_url?: string
  database_name: string
  username: string
  password?: string
  odbc_driver?: string
  odbc_dsn?: string
  connection_string?: string
  is_active: boolean
  is_default: boolean
  timeout_seconds: number
  max_retries: number
  last_test_at?: string
  last_test_status?: string
  last_test_message?: string
}

export default function PervasiveSettingsPage() {
  const [connections, setConnections] = useState<PervasiveConnection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState<number | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<PervasiveConnection | null>(null)
  const { toast } = useToast()

  const emptyConnection: PervasiveConnection = {
    connection_name: "",
    connection_type: "odbc",
    database_name: "",
    username: "",
    password: "",
    odbc_driver: "Pervasive ODBC Engine Interface",
    is_active: true,
    is_default: false,
    timeout_seconds: 30,
    max_retries: 3,
  }

  useEffect(() => {
    fetchConnections()
  }, [])

  const fetchConnections = async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/settings/pervasive")
      if (!response.ok) throw new Error("Failed to fetch connections")
      const data = await response.json()
      setConnections(data)
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل في تحميل الاتصالات",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async (connection: PervasiveConnection) => {
    try {
      setIsSaving(true)
      const method = connection.id ? "PUT" : "POST"
      const response = await fetch("/api/settings/pervasive", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connection),
      })

      if (!response.ok) throw new Error("Failed to save connection")

      toast({
        title: "نجح",
        description: connection.id ? "تم تحديث الاتصال بنجاح" : "تم إنشاء الاتصال بنجاح",
      })

      setIsDialogOpen(false)
      setEditingConnection(null)
      fetchConnections()
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل في حفظ الاتصال",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleTest = async (connectionId: number) => {
    try {
      setIsTesting(connectionId)
      const response = await fetch("/api/settings/pervasive/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: connectionId }),
      })

      const result = await response.json()

      toast({
        title: result.success ? "نجح الاختبار" : "فشل الاختبار",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      })

      fetchConnections()
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل في اختبار الاتصال",
        variant: "destructive",
      })
    } finally {
      setIsTesting(null)
    }
  }

  const handleDelete = async (connectionId: number) => {
    if (!(await confirmYesNo("هل أنت متأكد من حذف هذا الاتصال؟"))) return

    try {
      const response = await fetch(`/api/settings/pervasive?id=${connectionId}`, {
        method: "DELETE",
      })

      if (!response.ok) throw new Error("Failed to delete connection")

      toast({
        title: "نجح",
        description: "تم حذف الاتصال بنجاح",
      })

      fetchConnections()
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل في حذف الاتصال",
        variant: "destructive",
      })
    }
  }

  const openEditDialog = (connection?: PervasiveConnection) => {
    setEditingConnection(connection || emptyConnection)
    setIsDialogOpen(true)
  }

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">إعدادات Pervasive Database</h1>
          <p className="text-muted-foreground mt-2">إدارة اتصالات قاعدة بيانات Pervasive عبر ODBC أو API</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => openEditDialog()}>
              <Plus className="ml-2 h-4 w-4" />
              اتصال جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingConnection?.id ? "تعديل الاتصال" : "اتصال جديد"}</DialogTitle>
              <DialogDescription>أدخل معلومات الاتصال بقاعدة بيانات Pervasive</DialogDescription>
            </DialogHeader>
            {editingConnection && (
              <ConnectionForm
                connection={editingConnection}
                onSave={handleSave}
                onCancel={() => {
                  setIsDialogOpen(false)
                  setEditingConnection(null)
                }}
                isSaving={isSaving}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            الاتصالات المحفوظة
          </CardTitle>
          <CardDescription>قائمة بجميع اتصالات Pervasive المكونة</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : connections.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              لا توجد اتصالات محفوظة. أنشئ اتصالاً جديداً للبدء.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>اسم الاتصال</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>قاعدة البيانات</TableHead>
                  <TableHead>المستخدم</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>آخر اختبار</TableHead>
                  <TableHead>الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connections.map((conn) => (
                  <TableRow key={conn.id}>
                    <TableCell className="font-medium">
                      {conn.connection_name}
                      {conn.is_default && (
                        <span className="mr-2 text-xs bg-primary/10 text-primary px-2 py-1 rounded">افتراضي</span>
                      )}
                    </TableCell>
                    <TableCell>{conn.connection_type.toUpperCase()}</TableCell>
                    <TableCell>{conn.database_name}</TableCell>
                    <TableCell>{conn.username}</TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          conn.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {conn.is_active ? "نشط" : "غير نشط"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {conn.last_test_status && (
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            conn.last_test_status === "success"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {conn.last_test_status === "success" ? "نجح" : "فشل"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTest(conn.id!)}
                          disabled={isTesting === conn.id}
                        >
                          {isTesting === conn.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <TestTube className="h-4 w-4" />
                          )}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(conn)}>
                          تعديل
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(conn.id!)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ConnectionForm({
  connection,
  onSave,
  onCancel,
  isSaving,
}: {
  connection: PervasiveConnection
  onSave: (connection: PervasiveConnection) => void
  onCancel: () => void
  isSaving: boolean
}) {
  const [formData, setFormData] = useState(connection)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" dir="rtl">
      <div className="space-y-2">
        <Label htmlFor="connection_name">اسم الاتصال *</Label>
        <Input
          id="connection_name"
          value={formData.connection_name}
          onChange={(e) => setFormData({ ...formData, connection_name: e.target.value })}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="connection_type">نوع الاتصال *</Label>
        <Select
          value={formData.connection_type}
          onValueChange={(value: "odbc" | "api") => setFormData({ ...formData, connection_type: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="odbc">ODBC</SelectItem>
            <SelectItem value="api">API</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {formData.connection_type === "api" && (
        <div className="space-y-2">
          <Label htmlFor="api_url">API URL *</Label>
          <Input
            id="api_url"
            type="url"
            value={formData.api_url || ""}
            onChange={(e) => setFormData({ ...formData, api_url: e.target.value })}
            placeholder="https://api.example.com"
            required={formData.connection_type === "api"}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="database_name">اسم قاعدة البيانات *</Label>
        <Input
          id="database_name"
          value={formData.database_name}
          onChange={(e) => setFormData({ ...formData, database_name: e.target.value })}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="username">اسم المستخدم *</Label>
          <Input
            id="username"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">كلمة المرور</Label>
          <Input
            id="password"
            type="password"
            value={formData.password || ""}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            placeholder={formData.id ? "********" : ""}
          />
        </div>
      </div>

      {formData.connection_type === "odbc" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="odbc_driver">ODBC Driver</Label>
            <Input
              id="odbc_driver"
              value={formData.odbc_driver || ""}
              onChange={(e) => setFormData({ ...formData, odbc_driver: e.target.value })}
              placeholder="Pervasive ODBC Engine Interface"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="odbc_dsn">DSN (اختياري)</Label>
            <Input
              id="odbc_dsn"
              value={formData.odbc_dsn || ""}
              onChange={(e) => setFormData({ ...formData, odbc_dsn: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="connection_string">Connection String (اختياري)</Label>
            <Input
              id="connection_string"
              value={formData.connection_string || ""}
              onChange={(e) => setFormData({ ...formData, connection_string: e.target.value })}
              placeholder="DRIVER={...};ServerName=...;DBQ=...;"
            />
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="timeout_seconds">المهلة (ثواني)</Label>
          <Input
            id="timeout_seconds"
            type="number"
            value={formData.timeout_seconds}
            onChange={(e) => setFormData({ ...formData, timeout_seconds: Number.parseInt(e.target.value) })}
            min={1}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="max_retries">عدد المحاولات</Label>
          <Input
            id="max_retries"
            type="number"
            value={formData.max_retries}
            onChange={(e) => setFormData({ ...formData, max_retries: Number.parseInt(e.target.value) })}
            min={0}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            id="is_active"
            checked={formData.is_active}
            onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
          />
          <Label htmlFor="is_active">نشط</Label>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="is_default"
            checked={formData.is_default}
            onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
          />
          <Label htmlFor="is_default">افتراضي</Label>
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          إلغاء
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              جاري الحفظ...
            </>
          ) : (
            <>
              <Save className="ml-2 h-4 w-4" />
              حفظ
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
