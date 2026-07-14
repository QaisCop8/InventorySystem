"use client"

import { useState, useEffect, useRef } from "react"
import { Search, X, FileText, Users, Package, ShoppingCart, Building2, Settings, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useRouter } from "next/navigation"

interface SearchResult {
  id: string
  title: string
  description: string
  type: "customer" | "supplier" | "product" | "sales_order" | "purchase_order" | "setting"
  url: string
  metadata?: Record<string, any>
}

const searchTypeIcons = {
  customer: Users,
  supplier: Building2,
  product: Package,
  sales_order: ShoppingCart,
  purchase_order: FileText,
  setting: Settings,
}

const searchTypeLabels = {
  customer: "عميل",
  supplier: "مورد",
  product: "منتج",
  sales_order: "طلبية مبيعات",
  purchase_order: "طلبية شراء",
  setting: "إعداد",
}

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    console.log("[v0] GlobalSearch component initialized")
  }, [])

  // فتح البحث بالاختصار Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault()
        console.log("[v0] Ctrl+K pressed, opening search")
        setIsOpen(true)
      }
      if (e.key === "Escape") {
        setIsOpen(false)
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  // التركيز على حقل البحث عند فتح النافذة
  useEffect(() => {
    if (isOpen && inputRef.current) {
      console.log("[v0] Search dialog opened, focusing input")
      inputRef.current.focus()
    }
  }, [isOpen])

  // البحث في قاعدة البيانات
  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      return
    }

    console.log("[v0] Performing search for:", searchQuery)
    setIsLoading(true)
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      })

      console.log("[v0] Search API response status:", response.status)

      if (response.ok) {
        const data = await response.json()
        console.log("[v0] Search results received:", data.results?.length || 0)
        setResults(data.results || [])
      } else {
        console.error("[v0] Search API error:", response.status, response.statusText)
        setResults([])
      }
    } catch (error) {
      console.error("[v0] Search fetch error:", error)
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }

  // البحث مع تأخير
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim()) {
        console.log("[v0] Search timer triggered for:", query)
        performSearch(query)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  const handleResultClick = (result: SearchResult) => {
    console.log("[v0] Result clicked:", result.title, result.url)
    router.push(result.url)
    setIsOpen(false)
    setQuery("")
  }

  const handleClose = () => {
    console.log("[v0] Search dialog closed")
    setIsOpen(false)
    setQuery("")
    setResults([])
  }

  const handleSearchButtonClick = () => {
    console.log("[v0] Search button clicked")
    setIsOpen(true)
  }

  return (
    <>
      {/* زر فتح البحث */}
      <Button
        variant="outline"
        className="relative w-full max-w-sm justify-start text-sm text-muted-foreground bg-transparent"
        onClick={handleSearchButtonClick}
      >
        <Search className="mr-2 h-4 w-4" />
        <span>البحث في النظام...</span>
        <kbd className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 select-none items-center gap-1 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium opacity-100 hidden sm:inline-flex">
          <span className="text-xs">Ctrl</span>K
        </kbd>
      </Button>

      {/* نافذة البحث */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl p-0">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              البحث الشامل في النظام
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 py-4">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                placeholder="ابحث في الالعملاء، المنتجات، الطلبيات، الإعدادات..."
                value={query}
                onChange={(e) => {
                  console.log("[v0] Search query changed:", e.target.value)
                  setQuery(e.target.value)
                }}
                className="pr-10 pl-4"
              />
              {query && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute left-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                  onClick={() => setQuery("")}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>

          <ScrollArea className="max-h-96">
            <div className="px-6 pb-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  <span className="mr-2 text-sm text-muted-foreground">جاري البحث...</span>
                </div>
              ) : results.length > 0 ? (
                <div className="space-y-2">
                  {results.map((result) => {
                    const Icon = searchTypeIcons[result.type]
                    return (
                      <div
                        key={result.id}
                        className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => handleResultClick(result)}
                      >
                        <div className="flex-shrink-0">
                          <Icon className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-sm truncate">{result.title}</h4>
                            <Badge variant="secondary" className="text-xs">
                              {searchTypeLabels[result.type]}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{result.description}</p>
                          {result.metadata && (
                            <div className="flex gap-2 mt-1">
                              {Object.entries(result.metadata)
                                .slice(0, 2)
                                .map(([key, value]) => (
                                  <span key={key} className="text-xs text-muted-foreground">
                                    {key}: {value}
                                  </span>
                                ))}
                            </div>
                          )}
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    )
                  })}
                </div>
              ) : query && !isLoading ? (
                <div className="text-center py-8">
                  <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground">لا توجد نتائج للبحث "{query}"</p>
                  <p className="text-xs text-muted-foreground mt-1">جرب البحث بكلمات مختلفة أو تأكد من الإملاء</p>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground">ابدأ بكتابة كلمة البحث</p>
                  <div className="flex flex-wrap justify-center gap-2 mt-4">
                    <Badge variant="outline">الالعملاء</Badge>
                    <Badge variant="outline">المنتجات</Badge>
                    <Badge variant="outline">الطلبيات</Badge>
                    <Badge variant="outline">الموردين</Badge>
                    <Badge variant="outline">الإعدادات</Badge>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
}
