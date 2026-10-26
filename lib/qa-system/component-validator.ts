interface ComponentIssue {
  type: "error" | "warning" | "suggestion"
  message: string
  line?: number
  file: string
  fix?: string
}

interface ComponentValidationResult {
  isValid: boolean
  issues: ComponentIssue[]
  suggestions: string[]
}

export class ComponentValidator {
  private commonIssues = [
    {
      pattern: /\.toLocaleString$$$$/g,
      message: "toLocaleString() called without null check",
      fix: "Use (value || 0).toLocaleString('en-US') or value?.toLocaleString?.()",
      type: "error" as const,
    },
    {
      pattern: /onSave\s*\(/g,
      message: "onSave function called - ensure prop is passed",
      fix: "Check if onSave prop is defined in component interface",
      type: "warning" as const,
    },
    {
      pattern: /phone1|phone2/g,
      message: "Using phone1/phone2 instead of mobile1/mobile2",
      fix: "Replace with mobile1/mobile2 to match database schema",
      type: "error" as const,
    },
    {
      pattern: /name\s*:/g,
      message: 'Generic "name" field - should be specific (customer_name, product_name, etc.)',
      fix: "Use specific field names that match database schema",
      type: "warning" as const,
    },
    {
      pattern: /useState$$\s*null\s*$$/g,
      message: "useState initialized with null - may cause runtime errors",
      fix: "Initialize with appropriate default value or add null checks",
      type: "warning" as const,
    },
    {
      pattern: /fetch$$[^)]*$$\.then/g,
      message: "Unhandled fetch promise - missing error handling",
      fix: "Add .catch() or use try-catch with async/await",
      type: "warning" as const,
    },
    {
      pattern: /console\.log\(/g,
      message: "Console.log found - remove before production",
      fix: "Remove console.log statements",
      type: "suggestion" as const,
    },
  ]

  validateComponent(filePath: string, content: string): ComponentValidationResult {
    const result: ComponentValidationResult = {
      isValid: true,
      issues: [],
      suggestions: [],
    }

    const lines = content.split("\n")

    // Check for common issues
    for (const issue of this.commonIssues) {
      const matches = content.matchAll(issue.pattern)
      for (const match of matches) {
        const lineNumber = this.getLineNumber(content, match.index || 0)

        result.issues.push({
          type: issue.type,
          message: issue.message,
          line: lineNumber,
          file: filePath,
          fix: issue.fix,
        })

        if (issue.type === "error") {
          result.isValid = false
        }
      }
    }

    // Check for missing props validation
    if (content.includes("interface") && content.includes("Props")) {
      const propsMatch = content.match(/interface\s+\w*Props\s*{([^}]*)}/s)
      if (propsMatch) {
        const propsContent = propsMatch[1]
        const requiredProps = propsContent.match(/^\s*(\w+)(?!\?)/gm)

        if (requiredProps) {
          for (const prop of requiredProps) {
            const propName = prop.trim()
            if (!content.includes(`${propName} &&`) && !content.includes(`${propName}?`)) {
              result.issues.push({
                type: "warning",
                message: `Required prop '${propName}' not validated before use`,
                file: filePath,
                fix: `Add null check: ${propName} && ${propName}.someMethod()`,
              })
            }
          }
        }
      }
    }

    // Check for proper error handling in API calls
    const apiCallPattern = /fetch\s*\(\s*['"`]\/api\/([^'"`]*)/g
    const apiMatches = content.matchAll(apiCallPattern)
    for (const match of apiMatches) {
      const lineNumber = this.getLineNumber(content, match.index || 0)
      const apiEndpoint = match[1]

      // Check if there's error handling nearby
      const surroundingCode = this.getSurroundingCode(content, match.index || 0, 200)
      if (!surroundingCode.includes("catch") && !surroundingCode.includes("error")) {
        result.issues.push({
          type: "warning",
          message: `API call to /api/${apiEndpoint} missing error handling`,
          line: lineNumber,
          file: filePath,
          fix: "Add try-catch block or .catch() handler",
        })
      }
    }

    return result
  }

  validateApiRoute(filePath: string, content: string): ComponentValidationResult {
    const result: ComponentValidationResult = {
      isValid: true,
      issues: [],
      suggestions: [],
    }

    // Check for proper error handling
    if (!content.includes("try") || !content.includes("catch")) {
      result.issues.push({
        type: "error",
        message: "API route missing try-catch error handling",
        file: filePath,
        fix: "Wrap main logic in try-catch block",
      })
      result.isValid = false
    }

    // Check for proper HTTP status codes
    if (!content.includes("NextResponse.json") && !content.includes("Response.json")) {
      result.issues.push({
        type: "warning",
        message: "API route not returning proper JSON response",
        file: filePath,
        fix: "Use NextResponse.json() for responses",
      })
    }

    // Check for SQL injection protection
    const sqlPattern = /sql`[^`]*\$\{[^}]*\}/g
    const sqlMatches = content.matchAll(sqlPattern)
    for (const match of sqlMatches) {
      const lineNumber = this.getLineNumber(content, match.index || 0)
      result.issues.push({
        type: "warning",
        message: "Potential SQL injection - ensure parameters are properly sanitized",
        line: lineNumber,
        file: filePath,
        fix: "Use parameterized queries or validate input",
      })
    }

    // Check for missing request validation
    if (content.includes("request.json()") && !content.includes("validate")) {
      result.issues.push({
        type: "warning",
        message: "Request body not validated",
        file: filePath,
        fix: "Add input validation before processing request",
      })
    }

    return result
  }

  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split("\n").length
  }

  private getSurroundingCode(content: string, index: number, radius: number): string {
    const start = Math.max(0, index - radius)
    const end = Math.min(content.length, index + radius)
    return content.substring(start, end)
  }

  generateFixSuggestions(issues: ComponentIssue[]): string[] {
    const suggestions: string[] = []
    const errorCount = issues.filter((i) => i.type === "error").length
    const warningCount = issues.filter((i) => i.type === "warning").length

    if (errorCount > 0) {
      suggestions.push(`🚨 ${errorCount} critical errors found that need immediate attention`)
    }

    if (warningCount > 0) {
      suggestions.push(`⚠️ ${warningCount} warnings found that should be addressed`)
    }

    // Group similar issues
    const groupedIssues = new Map<string, ComponentIssue[]>()
    for (const issue of issues) {
      const key = issue.message.split(" ")[0] // Group by first word
      if (!groupedIssues.has(key)) {
        groupedIssues.set(key, [])
      }
      groupedIssues.get(key)!.push(issue)
    }

    // Prioritize fixes
    const priorities = ["toLocaleString", "onSave", "phone1", "fetch", "SQL"]
    for (const priority of priorities) {
      if (groupedIssues.has(priority)) {
        const count = groupedIssues.get(priority)!.length
        suggestions.push(`🔧 Fix ${count} ${priority}-related issues first`)
      }
    }

    return suggestions
  }
}
