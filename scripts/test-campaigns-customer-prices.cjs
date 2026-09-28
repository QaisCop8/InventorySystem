const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const ts=require('typescript')
function load(file,mocks={}){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(name=>{if(!(name in mocks))throw Error(name);return mocks[name]},module,module.exports);return module.exports}
const {repricePosCart}=load('lib/pos-customer-prices.ts')
const {campaignAmounts,editCampaignItem}=load('lib/campaign-items.ts')
const {applyPosCampaigns,combinedDiscountPercent}=load('lib/pos-campaigns.ts')
const next={NextResponse:{json:(data,options)=>Response.json(data,options)}}
test('customer repricing preserves quantities, discounts and original units',()=>{
 const cart=[{id:1,unitId:3,price:4,quantity:2,discount:5},{id:1,unitId:8,price:9,quantity:1,discount:0}]
 const products=[{id:1,unitId:3,price:6,barcodeOptions:[],unitPrices:[{unitId:3,price:6},{unitId:8,price:12}]}]
 const result=repricePosCart(cart,products)
 assert.deepEqual(result.map(x=>x.price),[6,12]);assert.equal(result[0].quantity,2);assert.equal(result[0].discount,5);assert.equal(cart[0].price,4)
})
test('zero or missing unit prices reject the entire repricing without partial changes',()=>{
 const cart=[{id:1,unitId:3,price:4},{id:2,unitId:3,price:9}]
 for(const price of [0,-1,NaN]){assert.throws(()=>repricePosCart(cart,[{id:1,unitId:3,price:6,barcodeOptions:[]},{id:2,unitId:3,price,barcodeOptions:[]}]))}
 assert.throws(()=>repricePosCart(cart,[]));assert.deepEqual(cart.map(x=>x.price),[4,9])
})
test('campaign grids synchronize discount amount, percentage and campaign total',()=>{
 const item={price:10,quantity:4,discount:0}
 const percent=editCampaignItem(item,'discount_ratio',25)
 assert.deepEqual(campaignAmounts(percent),{qtyAmount:40,discount_ratio:25,campQtyAmount:30})
 assert.equal(editCampaignItem(item,'campQtyAmount',32).discount,8)
 assert.equal(editCampaignItem(item,'discount',7).discount,7)
 assert.throws(()=>editCampaignItem(item,'discount',41));assert.throws(()=>editCampaignItem(item,'discount_ratio',101));assert.throws(()=>editCampaignItem(item,'quantity',0))
})
test('POS campaigns respect empty/global and selected branch and warehouse scope',()=>{
 const campaign={id:4,type_id:1,start_date:'2026-09-28',end_date:'2026-09-28',time_type:2,from_time:'00:00',to_time:'23:59',price_class:0,max_campaigns:2,branch_ids:[],warehouse_ids:[8],items:[{item_id:2,unit_id:1,quantity:2,discount:3,type:1}]}
 const now=new Date('2026-09-28T12:00:00')
 const cart=[{id:2,unit_id:1,quantity:4,price:10,discount:0}]
 assert.equal(applyPosCampaigns(cart,[campaign],{branchId:3,warehouseId:8,priceClassId:1},now).items[0].campaign_discount,6)
 assert.equal(applyPosCampaigns(cart,[{...campaign,branch_ids:[5]}],{branchId:3,warehouseId:8,priceClassId:1},now).items[0].campaign_discount,0)
 assert.equal(applyPosCampaigns(cart,[campaign],{branchId:3,warehouseId:9,priceClassId:1},now).items[0].campaign_discount,0)
})
test('POS item campaign sets 4.50 price to 1.00 using the campaign total, including a missing campaign unit',()=>{
 const campaign={id:7,type_id:1,start_date:'2026-09-28',end_date:'2026-09-28',time_type:2,from_time:'00:00',to_time:'23:59',price_class:0,max_campaigns:1,branch_ids:[],warehouse_ids:[],items:[{item_id:7,unit_id:null,quantity:1,discount:3.5,type:1}]}
 const result=applyPosCampaigns([{id:7,unit_id:4,quantity:1,price:4.5,discount:0}],[campaign],{branchId:1,warehouseId:1,priceClassId:1},new Date('2026-09-28T12:00:00'))
 assert.equal(result.items[0].campaign_discount,3.5)
 assert.equal(result.items[0].price-result.items[0].campaign_discount,1)
})
test('POS item campaign max applications cap quantity split across multiple cart lines',()=>{
 const campaign={id:8,type_id:1,start_date:'2026-09-28',end_date:'2026-09-28',time_type:2,from_time:'00:00',to_time:'23:59',price_class:0,max_campaigns:1,branch_ids:[],warehouse_ids:[],items:[{item_id:8,unit_id:4,quantity:1,discount:3.5,type:1}]}
 const cart=[{id:8,unit_id:4,quantity:1,price:4.5,discount:0},{id:8,unit_id:4,quantity:1,price:4.5,discount:0}]
 const result=applyPosCampaigns(cart,[campaign],{branchId:1,warehouseId:1,priceClassId:1},new Date('2026-09-28T12:00:00'))
 assert.equal(result.items.reduce((sum,item)=>sum+item.campaign_discount,0),3.5)
 assert.deepEqual(result.items.map(item=>item.campaign_discount),[3.5,0])
})
test('first-quantity campaign discounts only the configured quantity and ignores max_campaigns',()=>{
 const campaign={id:9,type_id:5,start_date:'2026-09-28',end_date:'2026-09-28',time_type:2,from_time:'00:00',to_time:'23:59',price_class:0,max_campaigns:99,branch_ids:[],warehouse_ids:[],items:[{item_id:9,unit_id:4,quantity:100,discount:50,type:1}]}
 const result=applyPosCampaigns([{id:9,unit_id:4,quantity:150,price:10,discount:0}],[campaign],{branchId:1,warehouseId:1,priceClassId:1},new Date('2026-09-28T12:00:00'))
 assert.equal(result.items[0].campaign_discount,50)
 assert.equal(result.items[0].price*result.items[0].quantity-result.items[0].campaign_discount,1450)
})
test('first-quantity campaign applies only to the first matching row when an item is added twice',()=>{
 const campaign={id:10,type_id:5,start_date:'2026-09-28',end_date:'2026-09-28',time_type:2,from_time:'00:00',to_time:'23:59',price_class:0,max_campaigns:1,branch_ids:[],warehouse_ids:[],items:[{item_id:10,unit_id:4,quantity:100,discount:50,type:1}]}
 const cart=[{id:10,unit_id:4,quantity:60,price:10,discount:0},{id:10,unit_id:4,quantity:60,price:10,discount:0}]
 const result=applyPosCampaigns(cart,[campaign],{branchId:1,warehouseId:1,priceClassId:1},new Date('2026-09-28T12:00:00'))
 assert.deepEqual(result.items.map(item=>item.campaign_discount),[30,0])
})
test('combined row discount percent stores regular and campaign discounts without changing the net line amount',()=>{
 const effective=combinedDiscountPercent(1,4.5,0,3.5)
 assert.equal(effective,77.7778)
 assert.equal(Math.round(4.5*(1-effective/100)*10000)/10000,1)
 assert.equal(combinedDiscountPercent(1,4.5,10,3.5),87.7778)
})
test('POS invoice campaign applies its percentage to qualifying net cart value',()=>{
 const campaign={id:5,type_id:3,start_date:'2026-09-28',end_date:'2026-09-28',time_type:2,from_time:'00:00',to_time:'23:59',price_class:0,branch_ids:[],warehouse_ids:[],from_amount:50,to_amount:200,discount_perc:10,items:[]}
 const result=applyPosCampaigns([{id:1,quantity:2,price:50,discount:10}],[campaign],{branchId:1,warehouseId:1,priceClassId:1},new Date('2026-09-28T12:00:00'))
 assert.equal(result.invoiceDiscount,9)
 assert.equal(result.campaignId,5)
})
test('POS bundle campaign applies buy-item discounts and free-item discounts only after quantity conditions',()=>{
 const campaign={id:6,type_id:2,start_date:'2026-09-28',end_date:'2026-09-28',time_type:2,from_time:'00:00',to_time:'23:59',price_class:0,max_campaigns:2,condition_items_opt:1,added_items_option:1,branch_ids:[],warehouse_ids:[],items:[{item_id:1,unit_id:1,quantity:2,discount:4,type:1},{item_id:2,unit_id:1,quantity:1,discount:10,type:2}]}
 const scope={branchId:1,warehouseId:1,priceClassId:1},now=new Date('2026-09-28T12:00:00')
 const applied=applyPosCampaigns([{id:1,unit_id:1,quantity:4,price:20,discount:0},{id:2,unit_id:1,quantity:2,price:10,discount:0}],[campaign],scope,now)
 assert.deepEqual(applied.items.map(item=>item.campaign_discount),[8,20])
 const incomplete=applyPosCampaigns([{id:1,unit_id:1,quantity:1,price:20,discount:0},{id:2,unit_id:1,quantity:1,price:10,discount:0}],[campaign],scope,now)
 assert.deepEqual(incomplete.items.map(item=>item.campaign_discount),[0,0])
})
test('campaign metadata reads product_prices and the requested price category, never selling_price',async()=>{
 let priceQuery=false
 const route=load('app/api/campaigns/route.ts',{'next/server':next,'@/lib/database':{__esModule:true,default:async(parts,...values)=>{const query=parts.join('?');assert.doesNotMatch(query,/selling_price/);if(query.includes('FROM products p')){priceQuery=true;assert.ok(query.includes('product_prices'));assert.deepEqual(values,[3]);return [{id:1,sale_price:15}]};return []},withTenantTransaction:fn=>fn()}})
 const response=await route.GET({nextUrl:new URL('http://localhost/api/campaigns?catalog=1&price_class=3')})
 assert.equal(response.status,200);assert.equal((await response.json()).products[0].sale_price,15);assert.ok(priceQuery)
})
test('POS catalog resolves the selected customer category through the linked account',async()=>{
 const categories=[]
 const route=load('app/api/pos/catalog/route.ts',{'next/server':next,'@/lib/database':async(parts,...values)=>{const query=parts.join('?');if(query.includes('WHERE a.id=')){assert.equal(values[0],50);return [{pricecategory:7}]};if(query.includes('FROM products p')){categories.push(...values.filter(x=>x===7));assert.ok(query.includes('product_prices'));return []};return []},'@/lib/pos-currencies':{getPosCurrencies:async()=>[{currency_id:1,exchange_rate:1}]},'@/app/api/sales-vouchers/_lib':{ensureTables:async()=>{}},'@/app/api/settings/system/route':{loadStoredSettings:async()=>({})},'@/lib/pos-campaign-storage':{getPosCampaigns:async()=>[]},'../_lib':{ensurePosTables:async()=>{},getPosPoint:async()=>({currency_id:1,price_category_id:2,main_warehouse_id:1}),getOpenPosSession:async()=>null,requestUserId:()=> 'user',requestBranchId:()=>1}})
 const response=await route.GET({nextUrl:new URL('http://localhost/api/pos/catalog?point_id=1&customer_id=50')})
 assert.equal(response.status,200);assert.equal(categories.length,5)
})


test('customer selection prompts for existing items, auto-prices an empty cart, and keeps cancellation separate from No',()=>{
 const source=fs.readFileSync('components/pos/pos-cashier.tsx','utf8')
 const start=source.indexOf(' const selectCustomer=')
 const end=source.indexOf(' const [unsavedActionOpen',start)
 const compiled=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
 function setup(cart){
  const state={customer:1,pending:null,repriced:0,products:'unchanged'}
  const customer={id:2,pricecategory:7}
  const api=new Function('pricingBusy','saving','customerId','catalog','point','cart','pendingCustomer','setCustomerId','setCustomerProducts','setPendingCustomer','applyCustomerPrices',compiled+';return {selectCustomer,keepCustomerPrices,cancelCustomerSelection}')(false,false,1,{customers:[customer]},{price_category_id:3},cart,customer,id=>state.customer=id,value=>state.products=value,value=>state.pending=value,()=>state.repriced++)
  return {state,...api}
 }
 const existing=setup([{id:1}]);existing.selectCustomer(2);assert.equal(existing.state.pending.id,2);assert.equal(existing.state.customer,1);assert.equal(existing.state.repriced,0)
 existing.cancelCustomerSelection();assert.equal(existing.state.customer,1);assert.equal(existing.state.pending,null)
 existing.keepCustomerPrices();assert.equal(existing.state.customer,2);assert.equal(existing.state.products,'unchanged');assert.equal(existing.state.repriced,0)
 const empty=setup([]);empty.selectCustomer(2);assert.equal(empty.state.repriced,1);assert.equal(empty.state.pending,null)
})
