import React, { useEffect } from 'react'; import {createRoot} from 'react-dom/client';
import { AuthProvider } from '@/components/auth/auth-context';
import { useBranchReloadKey } from '@/components/auth/use-branch-reload-key';
window.__mounts=0;
function Page(){ useEffect(()=>{ window.__mounts++ },[]); return <p>page</p> }
function Shell(){ const key=useBranchReloadKey(); return <div key={'branch-'+key}><Page/></div> }
createRoot(document.getElementById('root')).render(<AuthProvider><Shell/></AuthProvider>);