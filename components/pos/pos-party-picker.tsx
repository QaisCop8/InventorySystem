"use client"
import { tr, appDir } from "@/lib/i18n"
import {useEffect,useState} from "react"
import {Dialog,DialogContent,DialogHeader,DialogTitle} from "@/components/ui/dialog"
import {Input} from "@/components/ui/input"
import {UserRound,X} from "lucide-react"

export type PosParty={id:number;name:string;code?:string}
 export function PosPartyButton({kind,selected,onOpen,onClear}:{kind:"customer"|"salesman";selected?:PosParty;onOpen:()=>void;onClear:()=>void}){
 const label=kind==="customer"?tr("العميل"):tr("المندوب")
 return <div className="flex min-w-0 items-center rounded-lg border border-emerald-100 bg-white"><button type="button" className="min-w-0 flex-1" title={selected?.name||label} onClick={onOpen}><UserRound size={19}/><span className="truncate">{selected?.name||tr("اختيار {0}", label)}</span><kbd>{kind==="customer"?"F8":"F9"}</kbd></button>{selected&&<button type="button" aria-label={tr("مسح {0}", label)} onClick={onClear}><X size={17}/></button>}</div>
}
// remoteRows: بحث احتياطي من الخادم حين لا تطابق القائمة المحلية (كتالوج محفوظ قبل تعريف العملاء مثلاً) — يُحمَّل مرة لكل فتح
export function PosPartyPicker({title,rows,onSelect,onClose,remoteRows}:{title:string;rows:PosParty[];onSelect:(id:number,party?:PosParty)=>void;onClose:()=>void;remoteRows?:()=>Promise<PosParty[]>}){
 const [query,setQuery]=useState("")
 const [remote,setRemote]=useState<PosParty[]|null>(null)
 const words=query.trim().toLocaleLowerCase("ar").split(/\s+/)
 const matchOf=(list:PosParty[])=>list.filter(row=>words.every(word=>`${row.code||""} ${row.name}`.toLocaleLowerCase("ar").includes(word)))
 const local=matchOf(rows)
 const needRemote=Boolean(remoteRows)&&!local.length&&(Boolean(query.trim())||!rows.length)
 useEffect(()=>{if(!needRemote||remote||!remoteRows)return;let active=true;remoteRows().then(list=>{if(active)setRemote(list)}).catch(()=>{if(active)setRemote([])});return()=>{active=false}},[needRemote,remote,remoteRows])
 const matches=local.length||!needRemote?local:matchOf((remote||[]).filter(row=>!rows.some(item=>item.id===row.id)))
 return <Dialog open onOpenChange={open=>{if(!open)onClose()}}><DialogContent dir={appDir()} className="max-w-lg"><DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader><Input autoFocus aria-label={tr("بحث بالاسم أو الرقم")} placeholder={tr("ابحث بالاسم أو الرقم…")} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&matches.length===1)onSelect(matches[0].id,matches[0])}}/><div className="max-h-[50vh] space-y-2 overflow-y-auto">{matches.map(row=><button type="button" key={row.id} onClick={()=>onSelect(row.id,row)} className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-start hover:border-emerald-400 hover:bg-emerald-50"><span>{row.name}</span><small className="text-slate-500">{row.code}</small></button>)}{!matches.length&&<p className="p-8 text-center text-slate-500">{needRemote&&!remote?tr("جاري البحث…"):tr("لا توجد نتائج مطابقة")}</p>}</div></DialogContent></Dialog>
}
