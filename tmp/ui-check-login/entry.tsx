import React from 'react'; import {createRoot} from 'react-dom/client';
import {ManagementLogin} from '@/components/auth/management-login';
createRoot(document.getElementById('root')).render(<ManagementLogin onLogin={async()=>{throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة')}} footer={<a href="#" className="font-bold text-emerald-700">إنشاء حساب</a>}/>);