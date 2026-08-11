"use client"

import useSWR from "swr"
import { useCallback } from "react"

// Generic fetcher function
const fetcher = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }
  return response.json()
}

// Custom SWR hooks for different data types
export function useDashboardStats() {
  const { data, error, isLoading, mutate } = useSWR("/api/dashboard/stats", fetcher, {
    refreshInterval: 30000, // Refresh every 30 seconds
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  })

  return {
    stats: data,
    isLoading,
    isError: error,
    refresh: mutate,
  }
}

export function useCustomers() {
  const { data, error, isLoading, mutate } = useSWR("/api/customers", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
  })

  const addCustomer = useCallback(
    async (customerData: any) => {
      // Optimistic update
      mutate(
        (currentData: any) => ({
          ...currentData,
          customers: [...(currentData?.customers || []), { ...customerData, id: Date.now() }],
        }),
        false,
      )

      try {
        const response = await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(customerData),
        })

        if (!response.ok) throw new Error("Failed to add customer")

        // Revalidate to get the actual data from server
        mutate()
        return await response.json()
      } catch (error) {
        // Revert optimistic update on error
        mutate()
        throw error
      }
    },
    [mutate],
  )

  const updateCustomer = useCallback(
    async (id: number, customerData: any) => {
      // Optimistic update
      mutate(
        (currentData: any) => ({
          ...currentData,
          customers:
            currentData?.customers?.map((customer: any) =>
              customer.id === id ? { ...customer, ...customerData } : customer,
            ) || [],
        }),
        false,
      )

      try {
        const response = await fetch(`/api/customers/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(customerData),
        })

        if (!response.ok) throw new Error("Failed to update customer")

        mutate()
        return await response.json()
      } catch (error) {
        mutate()
        throw error
      }
    },
    [mutate],
  )

  return {
    customers: data?.customers || [],
    isLoading,
    isError: error,
    refresh: mutate,
    addCustomer,
    updateCustomer,
  }
}

export function useExchangeRates() {
  const { data, error, isLoading, mutate } = useSWR("/api/exchange-rates", fetcher, {
    refreshInterval: 60000, // Refresh every minute for exchange rates
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  })

  const updateRate = useCallback(
    async (id: number, rateData: any) => {
      // Optimistic update
      mutate(
        (currentData: any) => ({
          ...currentData,
          rates:
            currentData?.rates?.map((rate: any) =>
              rate.id === id ? { ...rate, ...rateData, updated_at: new Date().toISOString() } : rate,
            ) || [],
        }),
        false,
      )

      try {
        const response = await fetch("/api/exchange-rates", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...rateData }),
        })

        if (!response.ok) throw new Error("Failed to update exchange rate")

        mutate()
        return await response.json()
      } catch (error) {
        mutate()
        throw error
      }
    },
    [mutate],
  )


  return {
    rates: data?.rates || data || [],
    isLoading,
    isError: error,
    refresh: mutate,
    updateRate,
  }
}



export function useWorkflowStats(department = "all") {
  const params = department !== "all" ? `?department=${department}` : ""
  const { data, error, isLoading, mutate } = useSWR(`/api/workflow/statistics${params}`, fetcher, {
    refreshInterval: 15000, // Refresh every 15 seconds for workflow
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  })

  return {
    statistics: data?.data || [],
    isLoading,
    isError: error,
    refresh: mutate,
  }
}

export function useStageOrders(stageId: number | null, department = "all") {
  const params = department !== "all" ? `?department=${department}` : ""
  const { data, error, isLoading, mutate } = useSWR(
    stageId ? `/api/workflow/stages/${stageId}/orders${params}` : null,
    fetcher,
    {
      refreshInterval: 10000, // Refresh every 10 seconds for stage orders
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    },
  )

  return {
    orders: data?.data || [],
    isLoading,
    isError: error,
    refresh: mutate,
  }
}

export function useProductsWithStock() {
  const { data, error, isLoading, mutate } = useSWR("/api/inventory/products", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
  })

  return {
    products: data?.products || [],
    isLoading,
    isError: error,
    refresh: mutate,
  }
}
