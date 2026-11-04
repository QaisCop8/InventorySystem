"use client"

import { tr } from "@/lib/i18n"
import { useState, useCallback } from "react"
import { ApiService } from "@/lib/api-service"

/**
 * Generic CRUD hook for entity management
 */
export function useEntityCRUD<T extends { id?: number | string }>(endpoint: string) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Fetch all entities
   */
  const fetchData = useCallback(
    async (params?: Record<string, string>) => {
      try {
        setLoading(true)
        setError(null)
        const result = await ApiService.get<T[]>(endpoint, params)
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : tr("حدث خطأ غير متوقع"))
      } finally {
        setLoading(false)
      }
    },
    [endpoint],
  )

  /**
   * Create new entity
   */
  const create = useCallback(
    async (item: Omit<T, "id">) => {
      try {
        setLoading(true)
        setError(null)
        const newItem = await ApiService.post<T>(endpoint, item)
        setData((prev) => [...prev, newItem])
        return newItem
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : tr("حدث خطأ أثناء الإنشاء")
        setError(errorMessage)
        throw new Error(errorMessage)
      } finally {
        setLoading(false)
      }
    },
    [endpoint],
  )

  /**
   * Update existing entity
   */
  const update = useCallback(
    async (id: string | number, item: Partial<T>) => {
      try {
        setLoading(true)
        setError(null)
        const updatedItem = await ApiService.put<T>(`${endpoint}/${id}`, item)
        setData((prev) => prev.map((existing) => (existing.id === id ? updatedItem : existing)))
        return updatedItem
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : tr("حدث خطأ أثناء التحديث")
        setError(errorMessage)
        throw new Error(errorMessage)
      } finally {
        setLoading(false)
      }
    },
    [endpoint],
  )

  /**
   * Delete entity
   */
  const remove = useCallback(
    async (id: string | number) => {
      try {
        setLoading(true)
        setError(null)
        await ApiService.delete(`${endpoint}/${id}`)
        setData((prev) => prev.filter((item) => item.id !== id))
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : tr("حدث خطأ أثناء الحذف")
        setError(errorMessage)
        throw new Error(errorMessage)
      } finally {
        setLoading(false)
      }
    },
    [endpoint],
  )

  return {
    data,
    loading,
    error,
    fetchData,
    create,
    update,
    remove,
    setData,
    setError,
  }
}
