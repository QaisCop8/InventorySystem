"use client"

import { useEffect, useRef } from "react"
import { Printer, X } from "lucide-react"
import "./pos-workspace.css"

/** معاينة الفاتورة داخل نفس الصفحة على الجوال (طباعة / إغلاق) — من كاشير نقطة البيع وشاشة المطعم */
export function PosPrintPreview({title,html,onClose,autoPrint=true}:{title:string;html:string;onClose:()=>void;autoPrint?:boolean}){
 const frameRef=useRef<HTMLIFrameElement>(null),autoPrinted=useRef(false)
 const printNow=()=>{try{const target=frameRef.current?.contentWindow;target?.focus();target?.print()}catch{window.print()}}
 // Esc (وزر الرجوع في تطبيق أندرويد — components/native/native-back-button.tsx) يغلق المعاينة
 useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();onClose()}};document.addEventListener("keydown",onKey);return()=>document.removeEventListener("keydown",onKey)},[onClose])
 return <div className="pos-print-preview" role="dialog" aria-modal="true" aria-label={`معاينة ${title}`}>
  <div className="pos-print-preview-bar">
   <button type="button" className="pos-print-preview-close" onClick={onClose}><X size={18}/>إغلاق</button>
   <b>{title}</b>
   <button type="button" className="pos-print-preview-print" onClick={printNow}><Printer size={18}/>طباعة</button>
  </div>
  <iframe ref={frameRef} title={title} srcDoc={html} className="pos-print-preview-frame" onLoad={()=>{if(!autoPrint||autoPrinted.current)return;autoPrinted.current=true;window.setTimeout(printNow,350)}}/>
 </div>
}
