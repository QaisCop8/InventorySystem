"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MessageSquare, Send, FileText, Users, CheckCircle, Search, RefreshCw } from "lucide-react"

interface WhatsAppMessage {
  id: number
  recipient_phone: string
  recipient_name?: string
  message_type: string
  message_content: string
  status: string
  sent_at: string
  delivered_at?: string
  read_at?: string
  error_message?: string
}

interface WhatsAppTemplate {
  id: number
  template_name: string
  template_code: string
  category: string
  language: string
  content: string
  variables?: string[]
  status: string
}

interface CustomerInquiry {
  id: number
  customer_phone: string
  customer_name?: string
  message: string
  inquiry_type: string
  status: string
  assigned_to?: string
  created_at: string
  resolved_at?: string
}

export function WhatsAppDashboard() {
  const [activeTab, setActiveTab] = useState("messages")
  const [messages, setMessages] = useState<WhatsAppMessage[]>([])
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [inquiries, setInquiries] = useState<CustomerInquiry[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [showSendDialog, setShowSendDialog] = useState(false)
  const [showTemplateDialog, setShowTemplateDialog] = useState(false)

  // Send message form state
  const [sendForm, setSendForm] = useState({
    phone: "",
    message: "",
    template_code: "",
    variables: {} as Record<string, string>,
  })

  // Template form state
  const [templateForm, setTemplateForm] = useState({
    template_name: "",
    template_code: "",
    category: "marketing",
    language: "ar",
    content: "",
  })

  useEffect(() => {
    fetchMessages()
    fetchTemplates()
    fetchInquiries()
  }, [])

  const fetchMessages = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/whatsapp/messages")
      if (response.ok) {
        const data = await response.json()
        setMessages(data)
      }
    } catch (error) {
      console.error("Error fetching messages:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchTemplates = async () => {
    try {
      const response = await fetch("/api/whatsapp/templates")
      if (response.ok) {
        const data = await response.json()
        setTemplates(data)
      }
    } catch (error) {
      console.error("Error fetching templates:", error)
    }
  }

  const fetchInquiries = async () => {
    try {
      const response = await fetch("/api/whatsapp/inquiries")
      if (response.ok) {
        const data = await response.json()
        setInquiries(data)
      }
    } catch (error) {
      console.error("Error fetching inquiries:", error)
    }
  }

  const handleSendMessage = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: sendForm.phone,
          message: sendForm.message,
          template_code: sendForm.template_code || undefined,
          variables: Object.keys(sendForm.variables).length > 0 ? sendForm.variables : undefined,
        }),
      })

      if (response.ok) {
        alert("تم إرسال الرسالة بنجاح")
        setShowSendDialog(false)
        setSendForm({ phone: "", message: "", template_code: "", variables: {} })
        fetchMessages()
      } else {
        const error = await response.json()
        alert(`فشل إرسال الرسالة: ${error.error}`)
      }
    } catch (error) {
      console.error("Error sending message:", error)
      alert("حدث خطأ أثناء إرسال الرسالة")
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTemplate = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/whatsapp/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templateForm),
      })

      if (response.ok) {
        alert("تم إنشاء النموذج بنجاح")
        setShowTemplateDialog(false)
        setTemplateForm({
          template_name: "",
          template_code: "",
          category: "marketing",
          language: "ar",
          content: "",
        })
        fetchTemplates()
      } else {
        const error = await response.json()
        alert(`فشل إنشاء النموذج: ${error.error}`)
      }
    } catch (error) {
      console.error("Error creating template:", error)
      alert("حدث خطأ أثناء إنشاء النموذج")
    } finally {
      setLoading(false)
    }
  }

  const handleResolveInquiry = async (inquiryId: number) => {
    try {
      const response = await fetch("/api/whatsapp/inquiries", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inquiry_id: inquiryId, status: "resolved" }),
      })

      if (response.ok) {
        alert("تم حل الاستفسار بنجاح")
        fetchInquiries()
      }
    } catch (error) {
      console.error("Error resolving inquiry:", error)
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<
      string,
      { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
    > = {
      sent: { label: "مرسل", variant: "default" },
      delivered: { label: "تم التسليم", variant: "secondary" },
      read: { label: "مقروء", variant: "outline" },
      failed: { label: "فشل", variant: "destructive" },
      pending: { label: "قيد الانتظار", variant: "outline" },
      resolved: { label: "محلول", variant: "secondary" },
    }

    const config = statusConfig[status] || { label: status, variant: "default" as const }
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  const filteredMessages = messages.filter((msg) => {
    const matchesSearch =
      msg.recipient_phone.includes(searchTerm) ||
      msg.recipient_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      msg.message_content.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "all" || msg.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const filteredInquiries = inquiries.filter((inq) => {
    const matchesSearch =
      inq.customer_phone.includes(searchTerm) ||
      inq.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inq.message.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "all" || inq.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">إدارة الواتساب</h1>
          <p className="text-muted-foreground">إدارة الرسائل والنماذج واستفسارات العملاء</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowSendDialog(true)}>
            <Send className="ml-2 h-4 w-4" />
            إرسال رسالة
          </Button>
          <Button variant="outline" onClick={() => setShowTemplateDialog(true)}>
            <FileText className="ml-2 h-4 w-4" />
            نموذج جديد
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الرسائل</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{messages.length}</div>
            <p className="text-xs text-muted-foreground">جميع الرسائل المرسلة</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">رسائل مقروءة</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{messages.filter((m) => m.status === "read").length}</div>
            <p className="text-xs text-muted-foreground">تم قراءتها من قبل العملاء</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">استفسارات جديدة</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inquiries.filter((i) => i.status === "pending").length}</div>
            <p className="text-xs text-muted-foreground">بانتظار الرد</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">النماذج النشطة</CardTitle>
            <FileText className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{templates.filter((t) => t.status === "active").length}</div>
            <p className="text-xs text-muted-foreground">نماذج جاهزة للاستخدام</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="messages">الرسائل</TabsTrigger>
          <TabsTrigger value="templates">النماذج</TabsTrigger>
          <TabsTrigger value="inquiries">الاستفسارات</TabsTrigger>
        </TabsList>

        {/* Messages Tab */}
        <TabsContent value="messages" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>سجل الرسائل</CardTitle>
                  <CardDescription>جميع رسائل الواتساب المرسلة</CardDescription>
                </div>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="بحث..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pr-10 w-64"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع الحالات</SelectItem>
                      <SelectItem value="sent">مرسل</SelectItem>
                      <SelectItem value="delivered">تم التسليم</SelectItem>
                      <SelectItem value="read">مقروء</SelectItem>
                      <SelectItem value="failed">فشل</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" onClick={fetchMessages}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">المستلم</TableHead>
                    <TableHead className="text-right">الرسالة</TableHead>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMessages.map((message) => (
                    <TableRow key={message.id}>
                      <TableCell>{new Date(message.sent_at).toLocaleString("ar-SA")}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{message.recipient_name || "غير معروف"}</div>
                          <div className="text-sm text-muted-foreground">{message.recipient_phone}</div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-md truncate">{message.message_content}</TableCell>
                      <TableCell>{message.message_type}</TableCell>
                      <TableCell>{getStatusBadge(message.status)}</TableCell>
                    </TableRow>
                  ))}
                  {filteredMessages.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        لا توجد رسائل
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>نماذج الرسائل</CardTitle>
              <CardDescription>نماذج جاهزة لإرسال رسائل سريعة</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((template) => (
                  <Card key={template.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{template.template_name}</CardTitle>
                        {getStatusBadge(template.status)}
                      </div>
                      <CardDescription>
                        <Badge variant="outline">{template.category}</Badge>
                        <span className="mx-2">•</span>
                        <span className="text-xs">{template.template_code}</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-3">{template.content}</p>
                      {template.variables && template.variables.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium">المتغيرات:</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {template.variables.map((variable, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {variable}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
                {templates.length === 0 && (
                  <div className="col-span-full text-center text-muted-foreground py-8">لا توجد نماذج</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inquiries Tab */}
        <TabsContent value="inquiries" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>استفسارات العملاء</CardTitle>
                  <CardDescription>رسائل واستفسارات واردة من العملاء</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع الحالات</SelectItem>
                      <SelectItem value="pending">قيد الانتظار</SelectItem>
                      <SelectItem value="resolved">محلول</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" onClick={fetchInquiries}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">العميل</TableHead>
                    <TableHead className="text-right">الرسالة</TableHead>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInquiries.map((inquiry) => (
                    <TableRow key={inquiry.id}>
                      <TableCell>{new Date(inquiry.created_at).toLocaleString("ar-SA")}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{inquiry.customer_name || "غير معروف"}</div>
                          <div className="text-sm text-muted-foreground">{inquiry.customer_phone}</div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-md">{inquiry.message}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{inquiry.inquiry_type}</Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(inquiry.status)}</TableCell>
                      <TableCell>
                        {inquiry.status === "pending" && (
                          <Button size="sm" variant="outline" onClick={() => handleResolveInquiry(inquiry.id)}>
                            حل
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredInquiries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        لا توجد استفسارات
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Send Message Dialog */}
      <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>إرسال رسالة واتساب</DialogTitle>
            <DialogDescription>أرسل رسالة نصية أو استخدم نموذج جاهز</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>رقم الهاتف</Label>
              <Input
                placeholder="966xxxxxxxxx"
                value={sendForm.phone}
                onChange={(e) => setSendForm({ ...sendForm, phone: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>النموذج (اختياري)</Label>
              <Select
                value={sendForm.template_code}
                onValueChange={(value) => setSendForm({ ...sendForm, template_code: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر نموذج..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون نموذج</SelectItem>
                  {templates
                    .filter((t) => t.status === "active")
                    .map((template) => (
                      <SelectItem key={template.id} value={template.template_code}>
                        {template.template_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>الرسالة</Label>
              <Textarea
                placeholder="اكتب رسالتك هنا..."
                value={sendForm.message}
                onChange={(e) => setSendForm({ ...sendForm, message: e.target.value })}
                rows={5}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSendDialog(false)}>
                إلغاء
              </Button>
              <Button onClick={handleSendMessage} disabled={loading || !sendForm.phone || !sendForm.message}>
                <Send className="ml-2 h-4 w-4" />
                إرسال
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>إنشاء نموذج جديد</DialogTitle>
            <DialogDescription>أنشئ نموذج رسالة قابل لإعادة الاستخدام</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>اسم النموذج</Label>
                <Input
                  placeholder="مثال: ترحيب بالعملاء"
                  value={templateForm.template_name}
                  onChange={(e) => setTemplateForm({ ...templateForm, template_name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>كود النموذج</Label>
                <Input
                  placeholder="welcome_customer"
                  value={templateForm.template_code}
                  onChange={(e) => setTemplateForm({ ...templateForm, template_code: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الفئة</Label>
                <Select
                  value={templateForm.category}
                  onValueChange={(value) => setTemplateForm({ ...templateForm, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="marketing">تسويق</SelectItem>
                    <SelectItem value="transactional">معاملات</SelectItem>
                    <SelectItem value="notification">إشعارات</SelectItem>
                    <SelectItem value="support">دعم فني</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>اللغة</Label>
                <Select
                  value={templateForm.language}
                  onValueChange={(value) => setTemplateForm({ ...templateForm, language: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar">العربية</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>محتوى النموذج</Label>
              <Textarea
                placeholder="مرحباً {{customer_name}}، شكراً لتعاملك معنا..."
                value={templateForm.content}
                onChange={(e) => setTemplateForm({ ...templateForm, content: e.target.value })}
                rows={6}
              />
              <p className="text-xs text-muted-foreground">
                استخدم {"{{"} متغير {"}}"} لإضافة متغيرات ديناميكية
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>
                إلغاء
              </Button>
              <Button
                onClick={handleCreateTemplate}
                disabled={
                  loading || !templateForm.template_name || !templateForm.template_code || !templateForm.content
                }
              >
                <FileText className="ml-2 h-4 w-4" />
                إنشاء النموذج
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
