const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),ts=require('typescript')
const moduleUnderTest={exports:{}}
const code=ts.transpileModule(fs.readFileSync('app/api/cheques/_lib.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
new Function('require','module','exports',code)(()=>({}),moduleUnderTest,moduleUnderTest.exports)
const {isChequeDue,isChequeOperationAllowed,CHEQUE_OPERATIONS}=moduleUnderTest.exports
const operation=CHEQUE_OPERATIONS.find(row=>row.code==='clear_outgoing')
test('due date comparison handles Date objects and date strings on or before business date',()=>{
 for(const due_date of ['2026-09-19','2026-09-20',new Date('2026-09-20T00:00:00Z')]){
  const row={due_date,status_id:2,cheq_type:2,has_operations:false}
  assert.equal(isChequeDue(row,'2026-09-20'),true)
  assert.equal(isChequeOperationAllowed(operation,row,'2026-09-20'),true)
 }
})
test('future cheques remain blocked, regardless of stored due status',()=>{
 for(const due_date of ['2026-09-21',new Date('2026-09-21T00:00:00Z')]){
  const row={due_date,status_id:1,cheq_type:2}
  assert.equal(isChequeDue(row,'2026-09-20'),false)
  assert.equal(isChequeOperationAllowed(operation,row,'2026-09-20'),false)
 }
})
test('maturity does not bypass a subsequent cheque operation',()=>{
 assert.equal(isChequeOperationAllowed(operation,{due_date:'2026-09-19',status_id:4,cheq_type:2,has_operations:true},'2026-09-20'),false)
})
