"use client"

import { useEffect, useMemo, useState } from "react"
import { menuItems, type MenuItem } from "@/components/sidebar"
import { useAuth } from "@/components/auth/auth-context"
import { Button } from "@/components/ui/button"
import { Check, Grid3X3, Pencil, Search, Star, X } from "lucide-react"

interface ApplicationMenuProps {
  onNavigate: (section: string) => void
}

type Favorite = { id: number; favorite_component: string }

function actionableItems(item: MenuItem): MenuItem[] {
  if (!item.submenu?.length) return item.section ? [item] : []
  return item.submenu.flatMap(actionableItems)
}

export function ApplicationMenu({ onNavigate }: ApplicationMenuProps) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState("")
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-user-id": String(user?.id || "") }), [user?.id])

  const loadFavorites = async () => {
    if (!user?.id) return
    const response = await fetch("/api/user-favorites", { headers })
    if (response.ok) setFavorites((await response.json()).favorites || [])
  }

  useEffect(() => { if (open) void loadFavorites() }, [open, user?.id])

  const favoriteSections = new Set(favorites.map((favorite) => favorite.favorite_component))
  const allLeaves = menuItems.flatMap(actionableItems)
  const favoriteLeaves = allLeaves.filter((item) => item.section && favoriteSections.has(item.section))
  const visibleGroups = menuItems.map((group) => ({
    ...group,
    submenu: actionableItems(group).filter((item) => !query || item.title.toLowerCase().includes(query.toLowerCase())),
  })).filter((group) => !query || group.title.toLowerCase().includes(query.toLowerCase()) || group.submenu.length)

  const toggleFavorite = async (item: MenuItem) => {
    if (!item.section || !user?.id) return
    const existing = favorites.find((favorite) => favorite.favorite_component === item.section)
    const response = existing
      ? await fetch(`/api/user-favorites?id=${existing.id}`, { method: "DELETE", headers })
      : await fetch("/api/user-favorites", { method: "POST", headers, body: JSON.stringify({ favorite_type: "screen", favorite_name: item.section, favorite_title: item.title, favorite_icon: "Grid3X3", favorite_component: item.section, favorite_color: "bg-emerald-500" }) })
    if (response.ok) await loadFavorites()
  }

  const navigate = (section?: string) => {
    if (!section || editing) return
    onNavigate(section)
    setOpen(false)
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="relative flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700" aria-label="قائمة التطبيقات">
      <Grid3X3 className="h-5 w-5"/><span className="hidden sm:inline">التطبيقات</span>
    </button>
    {open && <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/45 backdrop-blur-sm" dir="rtl" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
      <div className="mx-auto mt-14 min-h-[70vh] w-[min(96vw,1400px)] rounded-2xl border bg-background shadow-2xl">
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-background/95 p-4 backdrop-blur">
          <div className="flex items-center gap-2 text-lg font-bold"><Grid3X3 className="h-5 w-5 text-emerald-600"/>قائمة التطبيقات</div>
          <div className="relative min-w-[220px] flex-1"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث عن شاشة..." className="h-10 w-full rounded-xl border bg-muted/30 pr-10 pl-3 outline-none focus:border-emerald-500"/></div>
          <Button variant={editing ? "default" : "outline"} onClick={() => setEditing(!editing)}>{editing ? <Check className="ml-2 h-4 w-4"/> : <Pencil className="ml-2 h-4 w-4"/>}{editing ? "تم الحفظ" : "تخصيص قائمتي"}</Button>
          <Button size="icon" variant="ghost" onClick={() => setOpen(false)}><X className="h-5 w-5"/></Button>
        </div>

        {favoriteLeaves.length > 0 && !query && <div className="border-b bg-emerald-50/50 p-5 dark:bg-emerald-950/20"><h2 className="mb-3 font-bold text-emerald-800 dark:text-emerald-300">قائمتي</h2><div className="flex flex-wrap gap-2">{favoriteLeaves.map(item => <button key={item.section} onClick={() => navigate(item.section)} className="flex items-center gap-2 rounded-xl border bg-background px-4 py-2 text-sm shadow-sm hover:border-emerald-400"><Star className="h-4 w-4 fill-amber-400 text-amber-400"/>{item.title}</button>)}</div></div>}

        <div className="grid gap-x-10 gap-y-8 p-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleGroups.map(group => <section key={group.id || group.title}>
            <div className="mb-3 flex items-center gap-2 border-b pb-2 text-base font-bold text-emerald-700"><group.icon className="h-5 w-5"/>{group.title}</div>
            <div className="space-y-1">{group.submenu.map(item => <button key={`${group.id}-${item.section}`} onClick={() => editing ? toggleFavorite(item) : navigate(item.section)} className="group flex w-full items-center justify-between rounded-lg px-2 py-2 text-right text-sm transition hover:bg-muted">
              <span className="flex items-center gap-2"><item.icon className="h-4 w-4 text-muted-foreground group-hover:text-emerald-600"/>{item.title}</span>
              {(editing || favoriteSections.has(item.section || "")) && <Star className={`h-4 w-4 ${favoriteSections.has(item.section || "") ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}/>} 
            </button>)}</div>
          </section>)}
        </div>
      </div>
    </div>}
  </>
}
