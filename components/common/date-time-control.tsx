"use client"

import { forwardRef, useImperativeHandle, useRef, useState } from "react"
import { CalendarDays } from "lucide-react"

export const DATE_TIME_CONTROL_DEFAULT_MIN_YEAR = 1900
export const DATE_TIME_CONTROL_DEFAULT_MAX_YEAR = 2199

interface DateTimeControlProps {
  id?: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  showTime?: boolean
  minYear?: number
  maxYear?: number
  disabled?: boolean
  required?: boolean
  className?: string
  onValidationChange?: (error: string | null) => void
}

// حقل تاريخ/وقت موحّد بتصميم متسق مع بقية عناصر النموذج (نفس لغة invoice-currency-dropdown:
// حدود متدرّجة، توهّج عند التركيز، حالة خطأ حمراء)، مع أيقونة لفتح منتقي المتصفح الأصلي،
// وتحقق من أن السنة المُدخلة ضمن مدى معقول بدل قبول أي تاريخ (مثال: سنة 5 أرقام بالخطأ).
const DateTimeControl = forwardRef<HTMLInputElement, DateTimeControlProps>(
  (
    {
      id,
      value,
      onChange,
      onBlur,
      showTime = false,
      minYear = DATE_TIME_CONTROL_DEFAULT_MIN_YEAR,
      maxYear = DATE_TIME_CONTROL_DEFAULT_MAX_YEAR,
      disabled = false,
      required = false,
      className = "",
      onValidationChange,
    },
    forwardedRef,
  ) => {
    const inputRef = useRef<HTMLInputElement | null>(null)
    const [error, setError] = useState<string | null>(null)

    useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement)

    const min = showTime ? `${minYear}-01-01T00:00` : `${minYear}-01-01`
    const max = showTime ? `${maxYear}-12-31T23:59` : `${maxYear}-12-31`

    const validate = (raw: string): string | null => {
      if (!raw) return null
      const year = Number(raw.slice(0, 4))
      if (!Number.isFinite(year) || year < minYear || year > maxYear) {
        return `السنة يجب أن تكون بين ${minYear} و ${maxYear}`
      }
      return null
    }

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(event.target.value)
      if (error) setError(null)
    }

    const handleBlur = () => {
      const validationError = validate(value)
      setError(validationError)
      onValidationChange?.(validationError)
      onBlur?.()
    }

    const openPicker = () => {
      if (disabled) return
      const el = inputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null
      if (el?.showPicker) {
        try {
          el.showPicker()
          return
        } catch {
          // fall through to focus below
        }
      }
      inputRef.current?.focus()
    }

    return (
      <div className={className}>
        <div
          className={`date-time-control ${error ? "date-time-control-error" : ""} ${disabled ? "date-time-control-disabled" : ""}`}
        >
          <button
            type="button"
            className="date-time-control-icon"
            onClick={openPicker}
            tabIndex={-1}
            disabled={disabled}
            aria-label="فتح التقويم"
          >
            <CalendarDays className="h-4 w-4" />
          </button>
          <input
            ref={inputRef}
            id={id}
            type={showTime ? "datetime-local" : "date"}
            value={value || ""}
            min={min}
            max={max}
            disabled={disabled}
            required={required}
            onChange={handleChange}
            onBlur={handleBlur}
            className="date-time-control-input"
          />
        </div>
        {error && <p className="date-time-control-error-text">{error}</p>}
      </div>
    )
  },
)

DateTimeControl.displayName = "DateTimeControl"

export default DateTimeControl
