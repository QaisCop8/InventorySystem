/**
 * Date formatting utilities for consistent British date format (DD/MM/YYYY) across the system
 */

export const formatDateToBritish = (date: Date | string): string => {
  const dateObj = typeof date === "string" ? new Date(date) : date

  if (isNaN(dateObj.getTime())) {
    return ""
  }

  return dateObj.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

export const formatDateTimeToBritish = (date: Date | string): string => {
  const dateObj = typeof date === "string" ? new Date(date) : date

  if (isNaN(dateObj.getTime())) {
    return ""
  }

  return dateObj.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

export const formatStoredUtcDateTimeInHebron = (value: Date | string): string => {
  let date: Date
  if (value instanceof Date) {
    date = value
  } else {
    const rawValue = value.trim()
    const normalizedValue = rawValue.includes("T") ? rawValue : rawValue.replace(" ", "T")
    const hasTimezone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(normalizedValue)
    date = new Date(hasTimezone ? normalizedValue : `${normalizedValue}Z`)
  }

  if (Number.isNaN(date.getTime())) return ""

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hebron",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || ""

  return `${part("year")}/${part("month")}/${part("day")} ${part("hour")}:${part("minute")}`
}

export const formatDateForInput = (date: Date | string): string => {
  const dateObj = typeof date === "string" ? new Date(date) : date

  if (isNaN(dateObj.getTime())) {
    return ""
  }

  // For HTML date inputs (YYYY-MM-DD format)
  return dateObj.toISOString().split("T")[0]
}

export const getCurrentDateForInput = (): string => {
  return formatDateForInput(new Date())
}

export const parseBritishDate = (dateString: string): Date | null => {
  // Parse DD/MM/YYYY format
  const parts = dateString.split("/")
  if (parts.length !== 3) return null

  const day = Number.parseInt(parts[0], 10)
  const month = Number.parseInt(parts[1], 10) - 1 // Month is 0-indexed
  const year = Number.parseInt(parts[2], 10)

  const date = new Date(year, month, day)

  // Validate the date
  if (date.getDate() !== day || date.getMonth() !== month || date.getFullYear() !== year) {
    return null
  }

  return date
}
