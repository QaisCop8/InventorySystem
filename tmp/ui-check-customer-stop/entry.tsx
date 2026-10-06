import React, { useCallback, useRef, useState } from 'react'; import {createRoot} from 'react-dom/client';
import UnifiedCustomers from '@/components/products/unified-customers';
import { ThemeSettingsProvider } from '@/contexts/theme-context';
const responses = { '/api/vouchers/voucher-types': [{id:4,name:'سند قبض'},{id:5,name:'سند صرف'},{id:12,name:'فاتورة مبيعات'}] };
window.fetch = async (url) => { const path = new URL(String(url), location.origin).pathname; window.__fetches=(window.__fetches||0)+1; return { ok: true, status: 200, json: async () => responses[path] ?? [], text: async () => '[]' } };
window.__renders = 0;
function Parent(){
  const [formData,setFormData]=useState({ id: 0, name: 'عميل تجربة', stop_transactions: [] });
  window.__renders++; window.__stop = formData.stop_transactions;
  const updateField=useCallback((field,value)=>setFormData(prev=>({...prev,[field]:value})),[]);
  return <UnifiedCustomers open formData={formData} updateField={updateField} onStopTransactionRowsChange={(rows)=>setFormData(prev=>({...prev,stop_transactions:rows}))} />
}
createRoot(document.getElementById('root')).render(<ThemeSettingsProvider><Parent/></ThemeSettingsProvider>);