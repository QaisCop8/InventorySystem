"use client"

import { tr } from "@/lib/i18n"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react"

interface DocumentTypeStatus {
  documentType: string
  documentLabel: string
  hasSettings: boolean
  totalFields: number
  screenFields: number
  printFields: number
  requiredFields: number
  hasBatchSettings: boolean
  batchSettings: any
}

interface VerificationResult {
  success: boolean
  tableExists: boolean
  summary: {
    totalDocumentTypes: number
    configuredDocumentTypes: number
    missingDocumentTypes: number
    completionPercentage: number
  }
  documentTypes: DocumentTypeStatus[]
  missingTypes: Array<{ type: string; label: string }>
}

export default function DocumentSettingsVerification() {
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const runVerification = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/settings/document/verify")
      const data = await response.json()

      if (data.success) {
        setVerificationResult(data)
        toast({
          title: tr("تم التحقق بنجاح"),
          description: tr("تم التحقق من {0} من {1} نوع سند", data.summary.configuredDocumentTypes, data.summary.totalDocumentTypes),
        })
      } else {
        toast({
          title: tr("خطأ في التحقق"),
          description: data.error || tr("فشل في التحقق من إعدادات السندات"),
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error running verification:", error)
      toast({
        title: tr("خطأ"),
        description: tr("فشل في تشغيل عملية التحقق"),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runVerification()
  }, [])

  if (!verificationResult) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="animate-spin me-2" />
            <span>{tr("جاري التحقق من إعدادات السندات...")}</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{tr("حالة إعدادات السندات")}</span>
            <Button onClick={runVerification} disabled={loading} size="sm" variant="outline">
              <RefreshCw className={`me-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {tr("تحديث")}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* ملخص عام */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{verificationResult.summary.totalDocumentTypes}</div>
              <div className="text-sm text-gray-600">{tr("إجمالي أنواع السندات")}</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {verificationResult.summary.configuredDocumentTypes}
              </div>
              <div className="text-sm text-gray-600">{tr("سندات مُعدّة")}</div>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">
                {verificationResult.summary.missingDocumentTypes}
              </div>
              <div className="text-sm text-gray-600">{tr("سندات غير مُعدّة")}</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                {verificationResult.summary.completionPercentage}%
              </div>
              <div className="text-sm text-gray-600">{tr("نسبة الاكتمال")}</div>
            </div>
          </div>

          {/* تفاصيل كل نوع سند */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold mb-3">{tr("تفاصيل أنواع السندات")}</h3>
            {verificationResult.documentTypes.map((docType) => (
              <div
                key={docType.documentType}
                className={`p-4 rounded-lg border-2 ${
                  docType.hasSettings ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {docType.hasSettings ? (
                      <CheckCircle2 className="h-6 w-6 text-green-600" />
                    ) : (
                      <XCircle className="h-6 w-6 text-red-600" />
                    )}
                    <div>
                      <h4 className="font-semibold text-lg">{docType.documentLabel}</h4>
                      <p className="text-sm text-gray-600">{docType.documentType}</p>
                    </div>
                  </div>
                  <div className="flex gap-6 text-sm">
                    <div className="text-center">
                      <div className="font-bold text-lg">{docType.totalFields}</div>
                      <div className="text-gray-600">{tr("إجمالي الحقول")}</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-lg">{docType.screenFields}</div>
                      <div className="text-gray-600">{tr("حقول الشاشة")}</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-lg">{docType.printFields}</div>
                      <div className="text-gray-600">{tr("حقول الطباعة")}</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-lg">{docType.requiredFields}</div>
                      <div className="text-gray-600">{tr("حقول مطلوبة")}</div>
                    </div>
                  </div>
                </div>

                {/* إعدادات الباتش */}
                {docType.hasBatchSettings && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="font-medium">{tr("إعدادات الباتش:")}</span>
                      {docType.batchSettings?.mandatory_batch_selection && (
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">{tr("باتش إجباري")}</span>
                      )}
                      {docType.batchSettings?.auto_select_fifo && (
                        <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">{tr("FIFO تلقائي")}</span>
                      )}
                      {docType.batchSettings?.allow_negative_stock && (
                        <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded">{tr("مخزون سالب مسموح")}</span>
                      )}
                      {docType.batchSettings?.require_expiry_date && (
                        <span className="bg-red-100 text-red-800 px-2 py-1 rounded">{tr("تاريخ صلاحية مطلوب")}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* السندات المفقودة */}
          {verificationResult.missingTypes.length > 0 && (
            <div className="mt-6 p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-6 w-6 text-yellow-600 mt-1" />
                <div>
                  <h4 className="font-semibold text-yellow-800 mb-2">{tr("سندات تحتاج إلى إعداد:")}</h4>
                  <ul className="list-disc list-inside space-y-1">
                    {verificationResult.missingTypes.map((type) => (
                      <li key={type.type} className="text-yellow-700">
                        {type.label} ({type.type})
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-sm text-yellow-700">
                    {tr("يرجى تشغيل السكريبت")}{" "}
                    <code className="bg-yellow-100 px-2 py-1 rounded">24-verify-document-settings.sql</code>{tr(" لإضافة الإعدادات الافتراضية")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* رسالة نجاح */}
          {verificationResult.summary.completionPercentage === 100 && (
            <div className="mt-6 p-4 bg-green-50 border-2 border-green-200 rounded-lg">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
                <div>
                  <h4 className="font-semibold text-green-800">{tr("جميع إعدادات السندات فعالة!")}</h4>
                  <p className="text-sm text-green-700 mt-1">
                    {tr("تم إعداد جميع أنواع السندات بنجاح ويمكن استخدامها في النظام")}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
