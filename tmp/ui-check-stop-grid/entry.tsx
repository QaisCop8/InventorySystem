import React, { useMemo, useState } from 'react'; import {createRoot} from 'react-dom/client';
import DataGridView from '@/components/common/DataGridView';
import { Checkbox } from '@/components/ui/checkbox';
function App(){
  const [rows,setRows]=useState([{voucher_types_id:4,voucher_type_name:'سند قبض',is_stopped:false,stop_date:''},{voucher_types_id:5,voucher_type_name:'سند صرف',is_stopped:false,stop_date:''}]);
  const scheme=useMemo(()=>({name:'StopTransactionSchemeTest',columns:[
    {header:'إيقاف',name:'is_stopped',width:120,isReadOnly:true,body:(cell)=> <div className="flex h-full items-center justify-center"><Checkbox checked={Boolean(cell.row.dataItem.is_stopped)} onCheckedChange={(checked)=>setRows(prev=>prev.map(r=>r.voucher_types_id===cell.row.dataItem.voucher_types_id?{...r,is_stopped:Boolean(checked)}:r))}/></div>},
    {header:'النوع',name:'voucher_type_name',width:'*',isReadOnly:true},
  ]}),[]);
  window.__rows=rows;
  return <div style={{height:200}}><DataGridView scheme={scheme} dataSource={rows} defaultRowHeight={40} dontConvertToCards containerStyle={{height:'100%'}} style={{height:'100%'}}/></div>
}
createRoot(document.getElementById('root')).render(<App/>);