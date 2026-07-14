"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Search, User, Phone, Mail } from "lucide-react"
import { cn } from "@/lib/utils"

interface Customer {
  id: number
  customer_code: string
  customer_name: string
  customer_email: string
  customer_mobile: string
  customer_address: string
}

interface InlineCustomerSearchProps {
  value: string
  onSelect: (customer: Customer) => void
  placeholder?: string
  className?: string
}

export function InlineCustomerSearch({
  value,
  onSelect,
  placeholder = "ابحث عن العميل...",
  className,
}: InlineCustomerSearchProps) {
  const [searchTerm, setSearchTerm] = useState(value)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Mock data - replace with actual API call
  const mockCustomers: Customer[] = [
    {
      id: 1,
      customer_code: "C0000001",
      customer_name: "شركة الأحمد للتجارة",
      customer_email: "ahmad@company.com",
      customer_mobile: "0501234567",
      customer_address: "الرياض، المملكة العربية السعودية",
    },
    {
      id: 2,
      customer_code: "C0000002",
      customer_name: "مؤسسة النور التجارية",
      customer_email: "noor@trading.com",
      customer_mobile: "0507654321",
      customer_address: "جدة، المملكة العربية السعودية",
    },
    {
      id: 3,
      customer_code: "C0000003",
      customer_name: "متجر الفهد الإلكتروني",
      customer_email: "fahad@store.com",
      customer_mobile: "0551234567",
      customer_address: "الدمام، المملكة العربية السعودية",
    },
  ]

  useEffect(() => {
    setCustomers(mockCustomers)
  }, [])

  useEffect(() => {
    if (searchTerm.length >= 2) {
      const filtered = customers.filter(
        (customer) =>
          customer.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          customer.customer_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
          customer.customer_mobile.includes(searchTerm),
      )
      setFilteredCustomers(filtered)
      setIsOpen(true)
    } else {
      setFilteredCustomers([])
      setIsOpen(false)
    }
  }, [searchTerm, customers])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleCustomerSelect = (customer: Customer) => {
    setSearchTerm(customer.customer_code)
    setIsOpen(false)
    onSelect(customer)
  }

  const formatCustomerCode = (code: string) => {
    const cleanCode = code.replace(/[^0-9]/g, "")
    if (cleanCode.length > 0) {
      return `C${cleanCode.padStart(7, "0")}`
    }
    return code.startsWith("C") ? code : `C${code}`
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value

    // If user is typing a number, auto-format it
    if (/^\d+$/.test(inputValue)) {
      inputValue = formatCustomerCode(inputValue)
    }

    setSearchTerm(inputValue)
  }

  return (
    <div ref={searchRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          value={searchTerm}
          onChange={handleInputChange}
          placeholder={placeholder}
          className="pr-10"
          onFocus={() => {
            if (searchTerm.length >= 2) setIsOpen(true)
          }}
        />
        <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      </div>

      {isOpen && filteredCustomers.length > 0 && (
        <Card className="absolute top-full left-0 right-0 z-50 mt-1 max-h-80 overflow-auto shadow-lg">
          <CardContent className="p-0">
            {filteredCustomers.map((customer) => (
              <Button
                key={customer.id}
                variant="ghost"
                className="w-full justify-start p-4 h-auto text-right hover:bg-muted"
                onClick={() => handleCustomerSelect(customer)}
              >
                <div className="flex items-start gap-3 w-full">
                  <User className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                  <div className="flex-1 text-right space-y-1">
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-foreground">{customer.customer_name}</span>
                      <span className="text-sm text-primary font-mono">{customer.customer_code}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {customer.customer_mobile}
                      </div>
                      <div className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {customer.customer_email}
                      </div>
                    </div>
                  </div>
                </div>
              </Button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
