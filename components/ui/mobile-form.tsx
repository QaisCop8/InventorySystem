"use client"

import { appDir } from "@/lib/i18n"
import type React from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChevronDown, ChevronUp } from "lucide-react"
import { useState } from "react"

interface FormSection {
  title: string
  children: React.ReactNode
  defaultExpanded?: boolean
}

interface MobileFormProps {
  title?: string
  sections: FormSection[]
  actions?: React.ReactNode
}

export function MobileForm({ title, sections, actions }: MobileFormProps) {
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    new Set(sections.map((_, index) => (sections[index].defaultExpanded ? index : -1)).filter((i) => i >= 0)),
  )

  const toggleSection = (index: number) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedSections(newExpanded)
  }

  return (
    <div className="space-y-4" dir={appDir()}>
      {title && <h2 className="text-xl font-bold text-center mb-6">{title}</h2>}

      {sections.map((section, index) => (
        <Card key={index}>
          <CardHeader className="pb-3 cursor-pointer" onClick={() => toggleSection(index)}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{section.title}</CardTitle>
              {expandedSections.has(index) ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
          </CardHeader>

          {expandedSections.has(index) && <CardContent className="space-y-4">{section.children}</CardContent>}
        </Card>
      ))}

      {actions && <div className="sticky bottom-4 bg-background p-4 border-t">{actions}</div>}
    </div>
  )
}
