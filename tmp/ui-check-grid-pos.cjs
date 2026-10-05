// Visual check: DataGridView action buttons + compact POS cashier header (headless Chrome via CDP).
const fs = require('fs'), path = require('path'), http = require('http'), { spawn } = require('child_process')
const esbuild = require('esbuild'), sass = require('sass'), WebSocket = require('ws')
const root = process.cwd(), dir = path.join(root, 'tmp/ui-check-grid-pos')
fs.mkdirSync(dir, { recursive: true })
const entry = `import React from 'react'; import {createRoot} from 'react-dom/client';
import DataGridView from '@/components/common/DataGridView';
import PrimeDropdown from '@/components/common/FocusDropdown';
import '@/components/pos/pos-workspace.css';
import {CreditCard,Bookmark,FolderOpen,HandCoins,History,Plus,RefreshCw,ShoppingBag,UserRound,WalletCards,Warehouse,Wifi} from 'lucide-react';
const rows=[{id:1,code:'10025',name:'أرز بسمتي 5 كغم',qty:10,price:42},{id:2,code:'10031',name:'زيت زيتون 1 لتر',qty:6,price:38.5},{id:3,code:'20110',name:'سكر أبيض 1 كغم',qty:24,price:4.25}];
const scheme={name:'ui-check-buttons',sortable:false,columns:[
 {name:'code',header:'الرمز',width:90,isReadOnly:true},{name:'name',header:'الصنف',width:'*',isReadOnly:true},
 {name:'qty',header:'الكمية',width:80,dataType:'Number'},{name:'price',header:'السعر',width:90,dataType:'Number',format:'n2'},
 {name:'b_view',header:'عرض',width:60,buttonBody:'button',iconType:'view',isReadOnly:true,onClick:()=>{}},
 {name:'b_edit',header:'تعديل',width:60,buttonBody:'button',iconType:'edit',isReadOnly:true,onClick:()=>{}},
 {name:'b_add',header:'إضافة',width:60,buttonBody:'button',iconType:'add',isReadOnly:true,onClick:()=>{}},
 {name:'b_cal',header:'تاريخ',width:60,buttonBody:'button',iconType:'calendar',isReadOnly:true,onClick:()=>{}},
 {name:'b_money',header:'مبلغ',width:60,buttonBody:'button',iconType:'money',isReadOnly:true,onClick:()=>{}},
 {name:'b_label',header:'تفاصيل',width:110,buttonBody:'button',iconType:'search',buttonLabel:'تفاصيل',isReadOnly:true,onClick:()=>{}},
 {name:'b_del',header:'حذف',width:60,buttonBody:'button',iconType:'delete',className:'danger',isReadOnly:true,onClick:()=>{}},
]};
function Header(){return <div dir="rtl" className="pos-workspace pos-cashier" style={{minHeight:0,height:'auto'}}>
 <div className="pos-topbar">
  <header className="pos-toolbar">
   <div className="pos-identity"><span className="pos-brand"><ShoppingBag size={25}/></span><div><span className="pos-eyebrow">مساحة البيع</span><h1>الكاشير</h1></div></div>
   <nav className="pos-toolbar-actions">
    <button type="button"><Plus size={16}/>جديد</button>
    <button type="button" className="pos-primary-tool"><CreditCard size={16}/>الدفع والحفظ <kbd>F3</kbd></button>
    <button type="button"><History size={16}/>الفواتير <kbd>F4</kbd></button>
    <button type="button" disabled><Bookmark size={16}/>حفظ كمسودة</button>
    <button type="button"><FolderOpen size={16}/>بحث المسودات</button>
    <button type="button"><HandCoins size={16}/>العهدة <kbd>F2</kbd></button>
    <button type="button"><RefreshCw size={16}/>مزامنة<span className="pos-badge">3</span></button>
   </nav>
   <span className="pos-connection" role="status" title="متصل"><Wifi size={15}/> متصل</span>
  </header>
  <section className="pos-overview">
   <div className="pos-context"><label htmlFor="pos-point">نقطة البيع الحالية</label>
    <PrimeDropdown inputId="pos-point" value={15} options={[{label:'15 — نقطة بيع رام الله',value:15}]} optionLabel="label" optionValue="value" className="pos-point-dropdown w-full" onChange={()=>{}}/></div>
   <div className="pos-shift"><div><UserRound size={15}/><b>Qais sabbah</b><time>2026-10-05</time></div><div><Warehouse size={15}/><span>الرئيسي</span><span className="pos-shift-state"><span/>العهدة مفتوحة</span></div></div>
   <div className="pos-net"><span className="pos-net-icon"><WalletCards size={25}/></span><div><span>الصافي للدفع</span><strong><bdi>1,248.50</bdi> <small>ILS</small></strong></div></div>
  </section>
 </div></div>}
function App(){return <div dir="rtl" style={{padding:16,display:'grid',gap:16,background:'#eef1f5'}}>
 <div id="header-old-height" style={{display:'none'}}/>
 <Header/>
 <div style={{height:230,background:'#fff',borderRadius:12,overflow:'hidden'}}><DataGridView scheme={scheme} dataSource={rows} defaultRowHeight={42} dontConvertToCards containerStyle={{height:'100%'}} style={{height:'100%'}}/></div>
</div>}
createRoot(document.getElementById('root')).render(<App/>);`
fs.writeFileSync(path.join(dir, 'entry.tsx'), entry)
let browser, server
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function main() {
  await esbuild.build({ entryPoints: [path.join(dir, 'entry.tsx')], bundle: true, outfile: path.join(dir, 'bundle.js'), jsx: 'automatic', platform: 'browser', target: 'es2020', alias: { '@': root }, loader: { '.js': 'jsx', '.woff': 'file', '.woff2': 'file', '.ttf': 'file', '.svg': 'file', '.eot': 'file' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_WIJMO_LICENSE_KEY': '""' }, plugins: [
    { name: 'dynamic', setup(build) { build.onResolve({filter:/^next\/dynamic$/}, () => ({path:'dynamic',namespace:'shim'})); build.onLoad({filter:/.*/,namespace:'shim'}, () => ({contents:`import React from 'react'; export default function dynamic(loader){const C=React.lazy(loader);return function Dynamic(props){return React.createElement(React.Suspense,{fallback:null},React.createElement(C,props))}}`,resolveDir:root})); } },
    { name: 'sass', setup(build) { build.onLoad({filter:/\.scss$/}, args => ({contents:sass.compile(args.path,{logger:sass.Logger.silent}).css,loader:args.path.endsWith('.module.scss')?'local-css':'css',resolveDir:path.dirname(args.path)})); } },
  ], logLevel:'error' })
  const css = await require('postcss')([require('@tailwindcss/postcss')()]).process('@import "tailwindcss"; @source "../../components/common"; @source "../../components/pos";', {from:path.join(dir,'tailwind.css')})
  fs.writeFileSync(path.join(dir,'tailwind.css'),css.css)
  fs.writeFileSync(path.join(dir,'index.html'),`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><link rel="stylesheet" href="/tailwind.css"><link rel="stylesheet" href="/bundle.css"><style>body{margin:0;font-family:Arial,sans-serif}</style><div id="root"></div><script>window.$={strings:{active:'نشط',inactive:'موقوف',postVouchers:{canceled:'محذوف'},globalFilter:'بحث',sigmaOptions:{}},dbName:'preview',dbId:1};</script><script src="/bundle.js"></script></html>`)
  server=http.createServer((req,res)=>{const file=path.join(dir,req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);if(!fs.existsSync(file)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file))}).listen(0,'127.0.0.1')
  await new Promise(resolve=>server.once('listening',resolve))
  browser=spawn('C:/Users/USER/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',['--headless','--no-sandbox','--disable-gpu','--remote-debugging-port=0','--user-data-dir='+path.join(dir,'profile'),'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']})
  const endpoint=await new Promise((resolve,reject)=>{let text='';browser.stderr.on('data',data=>{text+=data;const m=text.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1])});browser.on('error',reject)})
  const ws=new WebSocket(endpoint);await new Promise(resolve=>ws.once('open',resolve));let next=0;const pending=new Map(),errors=[]
  ws.on('message',data=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text)})
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}))})
  const {targetInfos}=await send('Target.getTargets');const {sessionId}=await send('Target.attachToTarget',{targetId:targetInfos.find(t=>t.type==='page').targetId,flatten:true})
  const call=(method,params)=>send(method,params,sessionId)
  await call('Runtime.enable'); await call('Page.enable')
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description);return result.result.value}
  const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(100)}throw Error('Timed out: '+expression+' Errors: '+errors.join('\n'))}
  const shot=async name=>fs.writeFileSync(path.join(dir,name),Buffer.from((await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'))
  const url='http://127.0.0.1:'+server.address().port
  for (const [width, name] of [[1600,'desktop.png'],[1150,'medium.png']]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:520,deviceScaleFactor:1,mobile:false})
    await call('Page.navigate',{url}); await wait('document.querySelectorAll("button.dgv-action").length>=21'); await delay(400)
    console.log(width, 'header height:', await evaluate('Math.round(document.querySelector(".pos-topbar").getBoundingClientRect().height)'),
      '| button:', await evaluate('(()=>{const b=document.querySelector("button.dgv-action-edit");const s=getComputedStyle(b);return [Math.round(b.getBoundingClientRect().width),s.backgroundColor,s.color].join(" ")})()'))
    await shot(name)
  }
  const box = await evaluate('(()=>{const r=document.querySelector("button.dgv-action-delete").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:box.x,y:box.y}); await delay(250)
  console.log('hover delete:', await evaluate('getComputedStyle(document.querySelector("button.dgv-action-delete")).backgroundColor'))
  await shot('hover.png')
  if (errors.length) console.log('runtime errors:', errors)
  ws.close()
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{browser?.kill();server?.close()})
