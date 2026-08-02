"use client"

import * as React from "react"

import DateTimeControl from "@/components/common/date-time-control"
import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, value, defaultValue, onChange, onBlur, min, max, ...props }, ref) => {
    const [uncontrolledDateValue, setUncontrolledDateValue] = React.useState(() =>
      typeof defaultValue === "string" ? defaultValue : "",
    )

    if (type === "date" || type === "datetime-local") {
      const isControlled = value !== undefined
      const dateValue = isControlled
        ? typeof value === "string"
          ? value
          : String(value ?? "")
        : uncontrolledDateValue

      return (
        <DateTimeControl
          {...props}
          ref={ref}
          value={dateValue}
          showTime={type === "datetime-local"}
          min={typeof min === "string" ? min : undefined}
          max={typeof max === "string" ? max : undefined}
          className={cn("w-full", className)}
          onChange={(nextValue) => {
            if (!isControlled) setUncontrolledDateValue(nextValue)
          }}
          onNativeChange={onChange}
          onBlur={onBlur}
        />
      )
    }

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        onBlur={onBlur}
        min={min}
        max={max}
        {...props}
      />
    )
  },
)
Input.displayName = "Input"

export { Input }
