"use client"

import { useEffect, useRef, useState } from "react"
import { Printer, X } from "lucide-react"
import "./pos-workspace.css"

/** معاينة الفاتورة داخل نفس الصفحة على الجوال (طباعة / إغلاق) — من كاشير نقطة البيع وشاشة المطعم */
export function PosPrintPreview({title,html,onClose,autoPrint=true,nativePrint=false}:{title:string;html:string;onClose:()=>void;autoPrint?:boolean;nativePrint?:boolean}){
 const frameRef=useRef<HTMLIFrameElement>(null),autoPrinted=useRef(false)
 const [printError,setPrintError]=useState("")
 const printNow=async()=>{
  setPrintError("")
  const capacitor=(window as any).Capacitor
  const printer=capacitor?.Plugins?.NativePrint
  const isAndroidApp=capacitor?.isNativePlatform?.()&&capacitor?.getPlatform?.()==="android"
  if(nativePrint||printer?.printHtml||isAndroidApp){
   try{
    if(!printer?.printHtml)throw new Error("يرجى تثبيت أحدث إصدار من تطبيق أندرويد لتفعيل الطباعة")
    await printer.printHtml({html,title,baseUrl:window.location.origin})
   }catch(error){setPrintError(error instanceof Error?error.message:"تعذر فتح شاشة الطباعة")}
   return
  }
  try{const target=frameRef.current?.contentWindow;target?.focus();target?.print()}catch{window.print()}
 }
 // Esc (وزر الرجوع في تطبيق أندرويد — components/native/native-back-button.tsx) يغلق المعاينة
 useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();onClose()}};document.addEventListener("keydown",onKey);return()=>document.removeEventListener("keydown",onKey)},[onClose])
 return <div className="pos-print-preview" role="dialog" aria-modal="true" aria-label={`معاينة ${title}`}>
  <div className="pos-print-preview-bar">
   <button type="button" className="pos-print-preview-close" onClick={onClose}><X size={18}/>إغلاق</button>
   <b>{title}</b>
   <button type="button" className="pos-print-preview-print" onClick={()=>void printNow()}><Printer size={18}/>طباعة</button>
  </div>
  {printError&&<div role="alert" className="bg-red-50 px-3 py-2 text-center text-sm font-semibold text-red-700">{printError}</div>}
  <iframe ref={frameRef} title={title} srcDoc={html} className="pos-print-preview-frame" onLoad={()=>{if(!autoPrint||autoPrinted.current)return;autoPrinted.current=true;window.setTimeout(printNow,350)}}/>
 </div>
}
