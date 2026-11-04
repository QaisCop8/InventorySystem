import { appDir } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg"
  className?: string
  text?: string
}

export function LoadingSpinner({ size = "md", className, text }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  }

  return (
    <div className={cn("flex items-center justify-center gap-2", className)} dir={appDir()}>
      <Loader2 className={cn("animate-spin", sizeClasses[size])} />
      {text && <span className="text-sm text-muted-foreground">{text}</span>}
    </div>
  )
}

export function LoadingCard({ title, description }: { title?: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-4" dir={appDir()}>
      <LoadingSpinner size="lg" />
      {title && <h3 className="text-lg font-medium">{title}</h3>}
      {description && <p className="text-sm text-muted-foreground text-center">{description}</p>}
    </div>
  )
}

export function LoadingTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex space-x-4 space-x-reverse">
          {Array.from({ length: columns }).map((_, j) => (
            <div key={j} className="h-4 bg-gray-200 rounded animate-pulse flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}
