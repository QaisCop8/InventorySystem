"use client"

import { useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "@/hooks/use-toast"

export function GlobalShortcuts() {
  const router = useRouter()

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // تجاهل الاختصارات إذا كان المستخدم يكتب في حقل إدخال
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (event.target as HTMLElement)?.contentEditable === "true"
      ) {
        return
      }

      const { ctrlKey, altKey, key } = event

      if (ctrlKey && !altKey) {
        switch (key.toLowerCase()) {
          case "k":
            event.preventDefault()
            // Trigger global search modal
            const searchEvent = new CustomEvent("openGlobalSearch")
            window.dispatchEvent(searchEvent)
            break
          case "o":
            event.preventDefault()
            router.push("/sales-orders")
            toast({
              title: "طلبية المبيعات",
              description: "تم فتح شاشة طلبيات المبيعات",
            })
            break
          case "t":
            event.preventDefault()
            router.push("/purchase-orders")
            toast({
              title: "طلبية المشتريات",
              description: "تم فتح شاشة طلبيات المشتريات",
            })
            break
          case "s":
            event.preventDefault()
            router.push("/products")
            toast({
              title: "الأصناف",
              description: "تم فتح شاشة الأصناف",
            })
            break
        }
      } else if (altKey && !ctrlKey) {
        switch (key.toLowerCase()) {
          case "t":
            event.preventDefault()
            const customerSupplierEvent = new CustomEvent("openCustomerSupplierSearch")
            window.dispatchEvent(customerSupplierEvent)
            toast({
              title: "البحث عن الالعملاء والموردين",
              description: "تم فتح شاشة البحث",
            })
            break
          case "s":
            event.preventDefault()
            const productEvent = new CustomEvent("openProductSearch")
            window.dispatchEvent(productEvent)
            toast({
              title: "البحث عن الأصناف",
              description: "تم فتح شاشة البحث",
            })
            break
        }
      }
    },
    [router],
  )

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleKeyDown])

  return null
}

// مكون لعرض الاختصارات المتاحة
export function ShortcutsHelp() {
  const shortcuts = [
    { key: "Ctrl + K", description: "البحث الشامل في النظام" },
    { key: "Ctrl + O", description: "طلبية المبيعات" },
    { key: "Ctrl + T", description: "طلبية المشتريات" },
    { key: "Ctrl + S", description: "شاشة الأصناف" },
    { key: "Alt + T", description: "البحث عن الالعملاء والموردين" },
    { key: "Alt + S", description: "البحث عن الأصناف" },
  ]

  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="font-semibold mb-3 text-card-foreground">الاختصارات المتاحة</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {shortcuts.map((shortcut, index) => (
          <div key={index} className="flex justify-between items-center py-1">
            <span className="text-sm text-muted-foreground">{shortcut.description}</span>
            <kbd className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs font-mono">{shortcut.key}</kbd>
          </div>
        ))}
      </div>
    </div>
  )
}
