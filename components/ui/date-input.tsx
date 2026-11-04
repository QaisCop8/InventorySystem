"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { CalendarIcon } from "lucide-react"
import { formatDateToBritish, parseBritishDate } from "@/lib/date-utils"
import { cn } from "@/lib/utils"

interface DateInputProps {
  value?: string | Date
  onChange?: (date: Date | null) => void
  placeholder?: string
  label?: string
  required?: boolean
  disabled?: boolean
  className?: string
  id?: string
}

export function DateInput({
  value,
  onChange,
  placeholder = "DD/MM/YYYY",
  label,
  required = false,
  disabled = false,
  className,
  id,
}: DateInputProps) {
  const [inputValue, setInputValue] = useState("")
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (value) {
      const dateObj = typeof value === "string" ? new Date(value) : value
      if (!isNaN(dateObj.getTime())) {
        setInputValue(formatDateToBritish(dateObj))
        setSelectedDate(dateObj)
      }
    } else {
      setInputValue("")
      setSelectedDate(undefined)
    }
  }, [value])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)

    // Try to parse the date if it matches DD/MM/YYYY format
    if (newValue.length === 10) {
      const parsedDate = parseBritishDate(newValue)
      if (parsedDate) {
        setSelectedDate(parsedDate)
        onChange?.(parsedDate)
      }
    } else if (newValue === "") {
      setSelectedDate(undefined)
      onChange?.(null)
    }
  }

  const handleCalendarSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date)
      setInputValue(formatDateToBritish(date))
      onChange?.(date)
    }
    setIsOpen(false)
  }

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <Label htmlFor={id}>
          {label}
          {required && <span className="text-red-500 ms-1">*</span>}
        </Label>
      )}
      <div className="flex gap-2">
        <Input
          id={id}
          value={inputValue}
          onChange={handleInputChange}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1"
          dir="ltr"
        />
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" disabled={disabled} className="shrink-0 bg-transparent">
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={selectedDate} onSelect={handleCalendarSelect} initialFocus />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
