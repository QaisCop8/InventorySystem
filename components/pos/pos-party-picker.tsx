"use client"
import {useState} from "react"
import {Dialog,DialogContent,DialogHeader,DialogTitle} from "@/components/ui/dialog"
import {Input} from "@/components/ui/input"
import {UserRound,X} from "lucide-react"

export type PosParty={id:number;name:string;code?:string}
export function PosPartyButton({kind,selected,onOpen,onClear}:{kind:"customer"|"salesman";selected?:PosParty;onOpen:()=>void;onClear:()=>void}){
 const label=kind==="customer"?"العميل":"المندوب"
 return <div className="flex min-w-0 items-center rounded-lg border border-emerald-100 bg-white"><button type="button" className="min-w-0 flex-1" title={selected?.name||label} onClick={onOpen}><UserRound size={19}/><span className="truncate">{selected?.name||`اختيار ${label}`}</span></button>{selected&&<button type="button" aria-label={`مسح ${label}`} onClick={onClear}><X size={17}/></button>}</div>
}
export function PosPartyPicker({title,rows,onSelect,onClose}:{title:string;rows:PosParty[];onSelect:(id:number)=>void;onClose:()=>void}){
 const [query,setQuery]=useState("")
 const words=query.trim().toLocaleLowerCase("ar").split(/\s+/)
 const matches=rows.filter(row=>words.every(word=>`${row.code||""} ${row.name}`.toLocaleLowerCase("ar").includes(word)))
 return <Dialog open onOpenChange={open=>{if(!open)onClose()}}><DialogContent dir="rtl" className="max-w-lg"><DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader><Input autoFocus aria-label="بحث بالاسم أو الرقم" placeholder="ابحث بالاسم أو الرقم…" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&matches.length===1)onSelect(matches[0].id)}}/><div className="max-h-[50vh] space-y-2 overflow-y-auto">{matches.map(row=><button type="button" key={row.id} onClick={()=>onSelect(row.id)} className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-right hover:border-emerald-400 hover:bg-emerald-50"><span>{row.name}</span><small className="text-slate-500">{row.code}</small></button>)}{!matches.length&&<p className="p-8 text-center text-slate-500">لا توجد نتائج مطابقة</p>}</div></DialogContent></Dialog>
}
