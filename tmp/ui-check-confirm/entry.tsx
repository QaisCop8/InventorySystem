import React, { useState } from 'react'; import {createRoot} from 'react-dom/client';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import ConfirmDialogYesNo from '@/components/ui/ConfirmDialogYesNo';
import 'primereact/resources/themes/lara-light-indigo/theme.css';
function App(){
  const [confirm,setConfirm]=useState(true); const [result,setResult]=useState('none'); window.__result=result;
  return <Dialog open onOpenChange={()=>{}}><DialogContent onPointerDownOutside={e=>e.preventDefault()}><DialogTitle>عميل</DialogTitle><p id="result">{result}</p></DialogContent>
    <ConfirmDialogYesNo visible={confirm} showBack message="تم تعديل السجل هل تريد الحفظ؟" onConfirm={()=>{setResult('yes');setConfirm(false)}} onCancel={()=>{setResult('no');setConfirm(false)}} onBack={()=>{setResult('back');setConfirm(false)}}/></Dialog>
}
createRoot(document.getElementById('root')).render(<App/>);