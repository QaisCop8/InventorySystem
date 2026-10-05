import React from 'react'; import {createRoot} from 'react-dom/client';
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
createRoot(document.getElementById('root')).render(<App/>);