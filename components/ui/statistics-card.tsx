import { Card, CardContent } from "@/components/ui/card"
import type { LucideIcon } from "lucide-react"

interface StatisticsCardProps {
  title: string
  value: number | string
  color: "blue" | "orange" | "green" | "purple" | "red"
  icon: LucideIcon
  subtitle?: string
}

const colorClasses = {
  blue: "from-blue-50 to-blue-100 border-blue-200",
  orange: "from-orange-50 to-orange-100 border-orange-200",
  green: "from-green-50 to-green-100 border-green-200",
  purple: "from-purple-50 to-purple-100 border-purple-200",
  red: "from-red-50 to-red-100 border-red-200",
}

const iconColors = {
  blue: "text-blue-600",
  orange: "text-orange-600",
  green: "text-green-600",
  purple: "text-purple-600",
  red: "text-red-600",
}

const textColors = {
  blue: "text-blue-700",
  orange: "text-orange-700",
  green: "text-green-700",
  purple: "text-purple-700",
  red: "text-red-700",
}

const valueColors = {
  blue: "text-blue-900",
  orange: "text-orange-900",
  green: "text-green-900",
  purple: "text-purple-900",
  red: "text-red-900",
}

/**
 * Reusable statistics card component
 */
export function StatisticsCard({ title, value, color, icon: Icon, subtitle }: StatisticsCardProps) {
  return (
    <Card className={`bg-gradient-to-br ${colorClasses[color]}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-sm font-medium ${textColors[color]}`}>{title}</p>
            <p className={`text-3xl font-bold ${valueColors[color]}`}>
              {typeof value === "number" ? value.toLocaleString("en-US") : value}
            </p>
            {subtitle && <p className={`text-xs ${textColors[color]} opacity-75 mt-1`}>{subtitle}</p>}
          </div>
          <Icon className={`h-10 w-10 ${iconColors[color]}`} />
        </div>
      </CardContent>
    </Card>
  )
}
