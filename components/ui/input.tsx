"use client"

import * as React from "react"

import DateTimeControl from "@/components/common/date-time-control"
import { cn } from "@/lib/utils"
import { useReliableTextChange } from "./use-reliable-text-change"

const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "tel", "url", "password"])
const LTR_INPUT_TYPES = new Set(["tel", "number", "email", "url"])
// حقول هاتف/جوال/واتساب كثيرة معرّفة كنص عادي: تُعرف من id/name
const PHONE_FIELD_PATTERN = /phone|mobile|whatsapp|fax|tel(?!l)/i

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, value, defaultValue, onChange, onBlur, onInput, onCompositionEnd, min, max, ...props }, ref) => {
    const [uncontrolledDateValue, setUncontrolledDateValue] = React.useState(() =>
      typeof defaultValue === "string" ? defaultValue : "",
    )
    // حقول النص فقط (لا checkbox/radio/number/file...): نص من طرق الإدخال (العربية/الاقتراحات) لا يضيع
    const handlers = useReliableTextChange<HTMLInputElement>(value, onChange, onInput, onCompositionEnd, TEXT_INPUT_TYPES.has(type || "text"))

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

    // الأرقام والهواتف تُكتب LTR (المؤشر يتقدّم يميناً) مع بقاء المحاذاة يميناً؛ dir صريح من المستدعي يغلب
    const isPhoneField = type === "tel" || ((type || "text") === "text" && PHONE_FIELD_PATTERN.test(`${props.id || ""} ${props.name || ""}`))
    const ltr = props.dir === undefined && (LTR_INPUT_TYPES.has(type || "") || isPhoneField)

    return (
      <input
        type={type}
        dir={ltr ? "ltr" : undefined}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          ltr && (type === "number" || isPhoneField) && "text-start",
          className,
        )}
        ref={ref}
        value={value}
        defaultValue={defaultValue}
        {...handlers}
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
