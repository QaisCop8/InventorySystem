"use client"

import { tr, appDir } from "@/lib/i18n"
import type React from "react"

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface EntityFormProps {
  title: string
  children: ReactNode
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  isSubmitting?: boolean
  submitText?: string
  cancelText?: string
}

/**
 * Generic form wrapper component
 */
export function EntityForm({
  title,
  children,
  onSubmit,
  onCancel,
  isSubmitting = false,
  submitText = "حفظ",
  cancelText = "إلغاء",
}: EntityFormProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6" dir={appDir()}>
          {children}

          <div className="flex gap-2 justify-end pt-4">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              {cancelText}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? tr("جاري الحفظ...") : submitText}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
