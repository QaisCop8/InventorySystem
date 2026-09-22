const fs = require('fs'), path = require('path'), http = require('http'), { spawn } = require('child_process')
const esbuild = require('esbuild'), sass = require('sass'), WebSocket = require('ws'), assert = require('assert/strict')
const root = process.cwd(), dir = path.join(root, 'tmp/item-report-browser-check')
fs.mkdirSync(dir, { recursive: true })
const entry = `import React from 'react'; import {createRoot} from 'react-dom/client';
import {ItemCardReport} from '@/components/reports/item-card-report';
import {ItemBalancesReport} from '@/components/reports/item-balances-report';
import {ItemValuationReport} from '@/components/reports/item-valuation-report';
import * as wijmo from '@grapecity/wijmo'; window.wijmoTest=wijmo;
const products=[{id:1,product_code:'000001',product_name:'قهوة عربية',type:1},{id:2,product_code:'000002',product_name:'شاي أخضر',type:1}];
window.fetch=async url=>{const p=new URL(url,location.origin);window.requests.push(p.search);let data;
if(p.pathname.includes('item-card')) data=p.searchParams.has('product_id')?{product:{...products[Number(p.searchParams.get('product_id'))-1],main_unit:'قطعة'},opening_balance:1250,closing_balance:1255.5,received_quantity:10.5,issued_quantity:5,rows:[{id:'1-1',voucher_id:1,vch_type:17,vch_code:'P000000001',voucher_type_name:'فاتورة مشتريات',movement_date:'2026-09-01',item_unit:'قطعة',quantity_in:10.5,quantity_out:0,paid_quantity_in:10,paid_quantity_out:0,bonus:0.5,balance:1260.5,price:24.75,amount:247.5,currency_code:'ILS',customer_name:'المورد الأول',account_code:'2001',store_name:'المستودع الرئيسي'},{id:'2--1',voucher_id:2,vch_type:12,vch_code:'S000000002',voucher_type_name:'فاتورة مبيعات',movement_date:'2026-09-02',item_unit:'قطعة',quantity_in:0,quantity_out:5,paid_quantity_in:0,paid_quantity_out:5,bonus:0,balance:1255.5,price:30,amount:150,currency_code:'ILS'}]}:{products,warehouses:[{id:1,name:'المستودع الرئيسي'}],groups:[]};
else data={rows:[{id:1,product_code:'000001',product_name:'قهوة عربية',main_unit:'قطعة',category:'المشروبات',balance:1255.5,received_quantity:1260.5,issued_quantity:5,valuation_price:24.75,valuation_amount:31073.625,last_movement_at:'2026-09-02'}]};return {ok:true,json:async()=>data};};
const Report=location.hash==='#valuation'?ItemValuationReport:location.hash==='#balances'?ItemBalancesReport:ItemCardReport;createRoot(document.getElementById('root')).render(<Report/>);`
fs.writeFileSync(path.join(dir, 'entry.tsx'), entry)
let browser, server
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function main() {
  await esbuild.build({ entryPoints: [path.join(dir, 'entry.tsx')], bundle: true, outfile: path.join(dir, 'bundle.js'), jsx: 'automatic', platform: 'browser', target: 'es2020', loader: { '.js': 'jsx', '.woff': 'file', '.woff2': 'file', '.ttf': 'file', '.svg': 'file', '.eot': 'file' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_WIJMO_LICENSE_KEY': '""' }, plugins: [
    { name: 'dynamic', setup(build) { build.onResolve({filter:/^next\/dynamic$/}, () => ({path:'dynamic',namespace:'shim'})); build.onLoad({filter:/.*/,namespace:'shim'}, () => ({contents:`import React from 'react'; export default function dynamic(loader){const C=React.lazy(loader);return function Dynamic(props){return React.createElement(React.Suspense,{fallback:null},React.createElement(C,props))}}`,resolveDir:root})); } },
    { name: 'sass', setup(build) { build.onLoad({filter:/\.scss$/}, args => ({contents:sass.compile(args.path,{logger:sass.Logger.silent}).css,loader:args.path.endsWith('.module.scss')?'local-css':'css',resolveDir:path.dirname(args.path)})); } },
  ], logLevel:'warning' })
  const css = await require('postcss')([require('@tailwindcss/postcss')()]).process('@import "tailwindcss"; @source "../../components/reports"; @source "../../components/ui";', {from:path.join(dir,'tailwind.css')})
  fs.writeFileSync(path.join(dir,'tailwind.css'),css.css)
  fs.writeFileSync(path.join(dir,'index.html'),`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/tailwind.css"><link rel="stylesheet" href="/bundle.css"><style>body{margin:0;font-family:Arial,sans-serif}#root{min-height:100vh}button{cursor:pointer}</style><div id="root"></div><script>window.requests=[];window.$={strings:{active:'نشط',inactive:'موقوف',postVouchers:{canceled:'محذوف'},globalFilter:'بحث',sigmaOptions:{}},dbName:'preview',dbId:1};</script><script src="/bundle.js"></script></html>`)
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
  await call('Emulation.setDeviceMetricsOverride',{width:1600,height:1050,deviceScaleFactor:1,mobile:false})
  const url='http://127.0.0.1:'+server.address().port
  await call('Page.navigate',{url});await wait('!!document.querySelector("[data-report-apply]") && !document.querySelector("[data-report-apply]").disabled')
  await evaluate('document.querySelector("[data-report-apply]").click()');await wait('document.querySelectorAll(".item-card-movements .wj-cell").length>10')
  assert.equal(await evaluate('/[\u0660-\u0669]/.test(document.querySelector(".report-page").innerText)'),false)
  assert.equal(await evaluate('document.querySelector(".item-card-identity").innerText.includes("قهوة عربية")'),true)
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true)
  fs.writeFileSync(path.join(dir,'desktop.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'))
  await evaluate('document.querySelector("button[aria-label=\"عرض بطاقة شاي أخضر\"]").click()');await wait('document.querySelector(".item-card-identity").innerText.includes("شاي أخضر")')
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(400)
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true)
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".item-card-mobile-picker")).display'), 'flex')
  fs.writeFileSync(path.join(dir,'mobile.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'))
  for(const report of ['balances','valuation']){
    await call('Page.navigate',{url:url+'/#'+report});await call('Page.reload');await wait('!!document.querySelector("[data-report-apply]")')
    await evaluate('document.querySelector("[data-report-apply]").click()');await wait('document.querySelector("tbody").innerText.includes("قهوة عربية")')
    assert.equal(await evaluate('/[\u0660-\u0669]/.test(document.querySelector(".report-page").innerText)'),false)
    if(report==='valuation'){
      await evaluate('document.querySelector(".p-dropdown").click()');await wait('!!document.querySelector(".p-dropdown-item")')
      assert.equal(await evaluate('[...document.querySelectorAll(".p-dropdown-item")].some(e=>e.innerText.includes("الداخل أول"))'),true)
    }
  }
  assert.deepEqual(errors,[])
  console.log('Browser checks passed: three reports, English digits, live DataGrid item selection, desktop/mobile width, FIFO dropdown; no runtime exceptions.')
  ws.close()
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{browser?.kill();server?.close()})
