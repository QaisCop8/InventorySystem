// Visual check: DataGridView action buttons + compact POS cashier header (headless Chrome via CDP).
const fs = require('fs'), path = require('path'), http = require('http'), { spawn } = require('child_process')
const esbuild = require('esbuild'), sass = require('sass'), WebSocket = require('ws')
const root = process.cwd(), dir = path.join(root, 'tmp/ui-check-profit')
fs.mkdirSync(dir, { recursive: true })
let browser, server
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function main() {
  await esbuild.build({ entryPoints: [path.join(dir, 'entry.tsx')], bundle: true, outfile: path.join(dir, 'bundle.js'), jsx: 'automatic', platform: 'browser', target: 'es2020', alias: { '@/components/auth/auth-context': path.join(dir,'stubs/auth.tsx'), '@/hooks/use-toast': path.join(dir,'stubs/toast.ts'), '@': root }, loader: { '.js': 'jsx', '.woff': 'file', '.woff2': 'file', '.ttf': 'file', '.svg': 'file', '.eot': 'file' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_WIJMO_LICENSE_KEY': '""' }, plugins: [ { name: 'auth-stub', setup(build) { build.onResolve({filter:/auth-context$/}, () => ({path:path.join(dir,'stubs/auth.tsx')})) } },
    { name: 'dynamic', setup(build) { build.onResolve({filter:/^next\/dynamic$/}, () => ({path:'dynamic',namespace:'shim'})); build.onLoad({filter:/.*/,namespace:'shim'}, () => ({contents:`import React from 'react'; export default function dynamic(loader){const C=React.lazy(loader);return function Dynamic(props){return React.createElement(React.Suspense,{fallback:null},React.createElement(C,props))}}`,resolveDir:root})); } },
    { name: 'sass', setup(build) { build.onLoad({filter:/\.scss$/}, args => ({contents:sass.compile(args.path,{logger:sass.Logger.silent}).css,loader:args.path.endsWith('.module.scss')?'local-css':'css',resolveDir:path.dirname(args.path)})); } },
  ], logLevel:'error' })
  const css = await require('postcss')([require('@tailwindcss/postcss')()]).process('@import "tailwindcss"; @source "../../components/ui"; @source "../../components/reports";', {from:path.join(dir,'tailwind.css')})
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
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false})
  await call('Page.navigate',{url}); await wait('!!document.querySelector("[data-report-apply]") && !document.body.innerText.includes("جاري تحميل")'); await delay(400)
  await evaluate('document.querySelector("[data-report-apply]").click()'); await wait('document.body?.innerText?.includes("زيت ذرة")'); await delay(400)
  await shot('items.png')
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("تنفيذ تسعير")).click()'); await wait('document.body?.innerText?.includes("تم تسعير")'); await delay(300)
  console.log('notice:', await evaluate('document.body.innerText.includes("تم تسعير 21 سطر")'), 'warning:', await evaluate('document.body.innerText.includes("2 من 23 سطر")'))
  await shot('priced.png')
  console.log('errors:', errors.length ? errors : 'none')
  ws.close()
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{browser?.kill();server?.close()})
