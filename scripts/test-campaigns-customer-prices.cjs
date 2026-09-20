const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const ts=require('typescript')
function load(file,mocks={}){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(name=>{if(!(name in mocks))throw Error(name);return mocks[name]},module,module.exports);return module.exports}
const {repricePosCart}=load('lib/pos-customer-prices.ts')
const {campaignAmounts,editCampaignItem}=load('lib/campaign-items.ts')
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
test('campaign metadata reads product_prices and the requested price category, never selling_price',async()=>{
 let priceQuery=false
 const route=load('app/api/campaigns/route.ts',{'next/server':next,'@/lib/database':{__esModule:true,default:async(parts,...values)=>{const query=parts.join('?');assert.doesNotMatch(query,/selling_price/);if(query.includes('FROM products p')){priceQuery=true;assert.ok(query.includes('product_prices'));assert.deepEqual(values,[3]);return [{id:1,sale_price:15}]};return []},withTenantTransaction:fn=>fn()}})
 const response=await route.GET({nextUrl:new URL('http://localhost/api/campaigns?catalog=1&price_class=3')})
 assert.equal(response.status,200);assert.equal((await response.json()).products[0].sale_price,15);assert.ok(priceQuery)
})
test('POS catalog resolves the selected customer category through the linked account',async()=>{
 const categories=[]
 const route=load('app/api/pos/catalog/route.ts',{'next/server':next,'@/lib/database':async(parts,...values)=>{const query=parts.join('?');if(query.includes('WHERE a.id=')){assert.equal(values[0],50);return [{pricecategory:7}]};if(query.includes('FROM products p')){categories.push(...values.filter(x=>x===7));assert.ok(query.includes('product_prices'));return []};return []},'@/lib/pos-currencies':{getPosCurrencies:async()=>[{currency_id:1,exchange_rate:1}]},'@/app/api/sales-vouchers/_lib':{ensureTables:async()=>{}},'../_lib':{ensurePosTables:async()=>{},getPosPoint:async()=>({currency_id:1,price_category_id:2,main_warehouse_id:1}),getOpenPosSession:async()=>null,requestUserId:()=> 'user',requestBranchId:()=>1}})
 const response=await route.GET({nextUrl:new URL('http://localhost/api/pos/catalog?point_id=1&customer_id=50')})
 assert.equal(response.status,200);assert.equal(categories.length,5)
})
