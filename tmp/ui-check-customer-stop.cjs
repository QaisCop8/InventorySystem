// Visual check: DataGridView action buttons + compact POS cashier header (headless Chrome via CDP).
const fs = require('fs'), path = require('path'), http = require('http'), { spawn } = require('child_process')
const esbuild = require('esbuild'), sass = require('sass'), WebSocket = require('ws')
const root = process.cwd(), dir = path.join(root, 'tmp/ui-check-customer-stop')
fs.mkdirSync(dir, { recursive: true })
const entry = "import React, { useCallback, useRef, useState } from 'react'; import {createRoot} from 'react-dom/client';\nimport UnifiedCustomers from '@/components/products/unified-customers';\nimport { ThemeSettingsProvider } from '@/contexts/theme-context';\nconst responses = { '/api/vouchers/voucher-types': [{id:4,name:'سند قبض'},{id:5,name:'سند صرف'},{id:12,name:'فاتورة مبيعات'}] };\nwindow.fetch = async (url) => { const path = new URL(String(url), location.origin).pathname; window.__fetches=(window.__fetches||0)+1; return { ok: true, status: 200, json: async () => responses[path] ?? [], text: async () => '[]' } };\nwindow.__renders = 0;\nfunction Parent(){\n  const [formData,setFormData]=useState({ id: 0, name: 'عميل تجربة', stop_transactions: [] });\n  window.__renders++; window.__stop = formData.stop_transactions;\n  const updateField=useCallback((field,value)=>setFormData(prev=>({...prev,[field]:value})),[]);\n  return <UnifiedCustomers open formData={formData} updateField={updateField} onStopTransactionRowsChange={(rows)=>setFormData(prev=>({...prev,stop_transactions:rows}))} />\n}\ncreateRoot(document.getElementById('root')).render(<ThemeSettingsProvider><Parent/></ThemeSettingsProvider>);"
fs.writeFileSync(path.join(dir, 'entry.tsx'), entry)
let browser, server
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function main() {
  await esbuild.build({ entryPoints: [path.join(dir, 'entry.tsx')], bundle: true, outfile: path.join(dir, 'bundle.js'), jsx: 'automatic', platform: 'browser', target: 'es2020', alias: { '@/components/auth/auth-context': path.join(dir,'stubs/auth.tsx'), '@': root }, loader: { '.js': 'jsx', '.woff': 'file', '.woff2': 'file', '.ttf': 'file', '.svg': 'file', '.eot': 'file' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_WIJMO_LICENSE_KEY': '""' }, plugins: [
    { name: 'dynamic', setup(build) { build.onResolve({filter:/^next\/dynamic$/}, () => ({path:'dynamic',namespace:'shim'})); build.onLoad({filter:/.*/,namespace:'shim'}, () => ({contents:`import React from 'react'; export default function dynamic(loader){const C=React.lazy(loader);return function Dynamic(props){return React.createElement(React.Suspense,{fallback:null},React.createElement(C,props))}}`,resolveDir:root})); } },
    { name: 'sass', setup(build) { build.onLoad({filter:/\.scss$/}, args => ({contents:sass.compile(args.path,{logger:sass.Logger.silent}).css,loader:args.path.endsWith('.module.scss')?'local-css':'css',resolveDir:path.dirname(args.path)})); } },
  ], logLevel:'error' })
  const css = await require('postcss')([require('@tailwindcss/postcss')()]).process('@import "tailwindcss"; @source "../../components/ui"; @source "../../components/products";', {from:path.join(dir,'tailwind.css')})
  fs.writeFileSync(path.join(dir,'tailwind.css'),css.css)
  fs.writeFileSync(path.join(dir,'index.html'),`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><link rel="stylesheet" href="/tailwind.css"><link rel="stylesheet" href="/bundle.css"><style>body{margin:0;font-family:Arial,sans-serif}</style><div id="root"></div><script>window.$={strings:{active:'نشط',inactive:'موقوف',postVouchers:{canceled:'محذوف'},globalFilter:'بحث',sigmaOptions:{}},dbName:'preview',dbId:1};</script><script src="/bundle.js"></script></html>`)
  server=http.createServer((req,res)=>{const file=path.join(dir,req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);if(!fs.existsSync(file)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file))}).listen(0,'127.0.0.1')
  await new Promise(resolve=>server.once('listening',resolve))
  browser=spawn('C:/Users/USER/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',['--headless','--no-sandbox','--disable-gpu','--remote-debugging-port=0','--user-data-dir='+path.join(dir,'profile'),'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']})
  const endpoint=await new Promise((resolve,reject)=>{let text='';browser.stderr.on('data',data=>{text+=data;const m=text.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1])});browser.on('error',reject)})
  const ws=new WebSocket(endpoint);await new Promise(resolve=>ws.once('open',resolve));let next=0;const pending=new Map(),errors=[]
  ws.on('message',data=>{const m=JSON.parse(data);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push('console.error: '+m.params.args.map(x=>x.value||x.description).join(' ').slice(0,400));if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text)})
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}))})
  const {targetInfos}=await send('Target.getTargets');const {sessionId}=await send('Target.attachToTarget',{targetId:targetInfos.find(t=>t.type==='page').targetId,flatten:true})
  const call=(method,params)=>send(method,params,sessionId)
  await call('Runtime.enable'); await call('Page.enable')
  const evaluate=async expression=>{const result=await Promise.race([call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}),delay(15000).then(()=>{throw Error('PAGE FROZEN (main thread busy) evaluating: '+expression.slice(0,80))})]);if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description);return result.result.value}
  const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(100)}throw Error('Timed out: '+expression+' Errors: '+errors.join('\n'))}
  const shot=async name=>fs.writeFileSync(path.join(dir,name),Buffer.from((await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'))
  const url='http://127.0.0.1:'+server.address().port
  await call('Emulation.setDeviceMetricsOverride',{width:1400,height:900,deviceScaleFactor:1,mobile:false})
  console.log('build ok, navigating'); await call('Page.navigate',{url}); console.log('navigated'); await wait('[...document.querySelectorAll("[role=tab]")].some(t=>t.innerText.includes("إيقاف الحركات"))'); await delay(800)
  const tab=await evaluate('(()=>{const t=[...document.querySelectorAll("[role=tab]")].find(t=>t.innerText.includes("إيقاف الحركات"));const r=t.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
  await call('Input.dispatchMouseEvent',{type:'mousePressed',x:tab.x,y:tab.y,button:'left',clickCount:1}); await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:tab.x,y:tab.y,button:'left',clickCount:1})
  await wait('document.querySelectorAll("[role=tabpanel] button[role=checkbox]").length>=2'); await delay(500)
  console.log('tab opened'); const before=await evaluate('window.__renders')
  const box=await evaluate('(()=>{const b=document.querySelectorAll("[role=tabpanel] button[role=checkbox]")[2];const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
  await call('Input.dispatchMouseEvent',{type:'mousePressed',x:box.x,y:box.y,button:'left',clickCount:1}); await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x,y:box.y,button:'left',clickCount:1}); await delay(1500)
  const after=await evaluate('window.__renders')
  console.log('parent renders caused by one click:', after-before)
  console.log('stopped rows in parent formData:', await evaluate('JSON.stringify((window.__stop||[]).filter(r=>r.is_stopped).map(r=>r.voucher_types_id+":"+r.stop_date))'))
  console.log('checkbox states:', await evaluate('[...document.querySelectorAll("[role=tabpanel] button[role=checkbox]")].map(b=>b.dataset.state).join(",")'))
  console.log('errors:', errors.length ? errors.map(e=>e.slice(0,200)).slice(0,3) : 'none')
  ws.close()
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{browser?.kill();server?.close()})
