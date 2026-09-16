"use client"

import {useEffect,useRef} from "react"
import Messages from "@/components/common/Messages"

export function PosDialogMessages({error,open}:{error?:string;open:boolean}){
 const messages=useRef<any>(null)
 useEffect(()=>{
  messages.current?.clear?.()
  if(open&&error)messages.current?.show?.([{severity:"error",summary:"",detail:error,sticky:true}])
 },[error,open])
 return <div aria-live="assertive" className="px-4 sm:px-6"><Messages innerRef={messages}/></div>
}
