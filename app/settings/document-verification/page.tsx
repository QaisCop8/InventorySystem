"use client"
import { tr } from "@/lib/i18n"
import DocumentSettingsVerification from "@/components/settings/document-settings-verification"

export default function DocumentVerificationPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{tr("التحقق من إعدادات السندات")}</h1>
        <p className="text-gray-600">
          {tr("هذه الصفحة تعرض حالة جميع إعدادات السندات في النظام وتتأكد من أن كل نوع سند مُعد بشكل صحيح")}
        </p>
      </div>
      <DocumentSettingsVerification />
    </div>
  )
}
