"use client"

import { CompactProductForm } from "./compact-product-form"

interface CompactServiceFormProps {
  visible?: any
  editingProduct?: any
  onHideDialog: (e: any) => void
  onSuccess?: () => void
  isSubmitting?: boolean
}

export function CompactServiceForm({
  visible,
  editingProduct,
  onHideDialog,
  onSuccess,
  isSubmitting,
}: CompactServiceFormProps) {
  return (
    <CompactProductForm
      visible={visible}
      editingProduct={editingProduct}
      onHideDialog={onHideDialog}
      onSuccess={onSuccess}
      isSubmitting={isSubmitting}
      entityType="services"
    />
  )
}
