// Visual check: DataGridView action buttons + compact POS cashier header (headless Chrome via CDP).
const fs = require('fs'), path = require('path'), http = require('http'), { spawn } = require('child_process')
const esbuild = require('esbuild'), sass = require('sass'), WebSocket = require('ws')
const root = process.cwd(), dir = path.join(root, 'tmp/ui-check-internal')
fs.mkdirSync(dir, { recursive: true })
let browser, server
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function main() {
  await esbuild.build({ entryPoints: [path.join(dir, 'entry.tsx')], bundle: true, outfile: path.join(dir, 'bundle.js'), jsx: 'automatic', platform: 'browser', target: 'es2020', alias: { '@/components/auth/auth-context': path.join(dir,'stubs/auth.tsx'), '@/hooks/use-toast': path.join(dir,'stubs/toast.ts'), '@': root }, loader: { '.js': 'jsx', '.woff': 'file', '.woff2': 'file', '.ttf': 'file', '.svg': 'file', '.eot': 'file' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_WIJMO_LICENSE_KEY': '""' }, plugins: [ { name: 'auth-stub', setup(build) { build.onResolve({filter:/auth-context$/}, () => ({path:path.join(dir,'stubs/auth.tsx')})) } },
    { name: 'dynamic', setup(build) { build.onResolve({filter:/^next\/dynamic$/}, () => ({path:'dynamic',namespace:'shim'})); build.onLoad({filter:/.*/,namespace:'shim'}, () => ({contents:`import React from 'react'; export default function dynamic(loader){const C=React.lazy(loader);return function Dynamic(props){return React.createElement(React.Suspense,{fallback:null},React.createElement(C,props))}}`,resolveDir:root})); } },
    { name: 'sass', setup(build) { build.onLoad({filter:/\.scss$/}, args => ({contents:sass.compile(args.path,{logger:sass.Logger.silent}).css,loader:args.path.endsWith('.module.scss')?'local-css':'css',resolveDir:path.dirname(args.path)})); } },
  ], logLevel:'error' })
  const css = await require('postcss')([require('@tailwindcss/postcss')()]).process('@import "tailwindcss"; @source "../../components/ui"; @source "../../components/manufacturing";', {from:path.join(dir,'tailwind.css')})
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
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description);return result.result.value}
  const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(100)}throw Error('Timed out: '+expression+' Errors: '+errors.join('\n'))}
  const shot=async name=>fs.writeFileSync(path.join(dir,name),Buffer.from((await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'))
  const url='http://127.0.0.1:'+server.address().port
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
  await call('Page.navigate',{url}); await wait('document.body?.innerText?.includes("IM26000011")'); await delay(500)
  await shot('stage.png')
  console.log('stage cards:', await evaluate('document.querySelectorAll(".grid button.text-right").length'), 'overdue chip:', await evaluate('document.body?.innerText?.includes("منذ 2 أيام") || document.body?.innerText?.includes("منذ يومين")'))
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="تجهيز الطلب").click()'); await wait('!!document.querySelector("[role=dialog] input[aria-label]")'); await delay(400)
  console.log('focused input:', await evaluate('document.activeElement?.getAttribute("aria-label")'), 'value', await evaluate('document.activeElement?.value'))
  await shot('dialog.png')
  // empty one quantity -> validation message
  await evaluate('(()=>{const i=document.querySelectorAll("[role=dialog] input[aria-label]")[1];const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;set.call(i,"");i.dispatchEvent(new Event("input",{bubbles:true}))})()')
  await evaluate('[...document.querySelectorAll("[role=dialog] button")].find(b=>b.textContent.includes("تجهيز الطلب")).click()'); await delay(400)
  console.log('validation shown:', await evaluate('document.querySelector("[role=dialog]").innerText.includes("بين 0 و100000")'), 'focus moved to:', await evaluate('[...document.querySelectorAll("[role=dialog] input[aria-label]")].indexOf(document.activeElement)'))
  await shot('dialog-error.png')
  await call('Page.navigate',{url:url+'?page=dashboard'}); await wait('document.body?.innerText?.includes("نسبة تلبية")'); await delay(800)
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1500,deviceScaleFactor:1,mobile:false}); await delay(300)
  await shot('dashboard.png')
  await call('Page.navigate',{url:url+'?page=settings'}); await wait('document.body?.innerText?.includes("مراحل") || document.body?.innerText?.includes("إعدادات طلب")'); await delay(500)
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false})
  await shot('settings.png')
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true})
  await call('Page.navigate',{url}); await wait('document.body?.innerText?.includes("IM26000011")'); await delay(500)
  console.log('mobile horizontal overflow:', await evaluate('document.documentElement.scrollWidth > innerWidth'))
  await shot('stage-mobile.png')
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false})
  await call('Page.navigate',{url:url+'?noperm=1'}); await wait('document.body?.innerText?.includes("لا توجد صلاحية")'); await delay(300)
  console.log('locked text:', await evaluate('document.body?.innerText?.includes("فرع رام الله")'))
  await shot('stage-locked.png')
  console.log('errors:', errors.length ? errors : 'none')
  ws.close()
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{browser?.kill();server?.close()})
