"use client"
import { tr } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Keyboard } from "lucide-react"
import { ShortcutsHelp } from "@/components/global-shortcuts"

export function ShortcutsIndicator() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Keyboard className="h-4 w-4" />
          <span className="hidden md:inline">{tr("الاختصارات")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tr("اختصارات لوحة المفاتيح")}</DialogTitle>
        </DialogHeader>
        <ShortcutsHelp />
      </DialogContent>
    </Dialog>
  )
}
