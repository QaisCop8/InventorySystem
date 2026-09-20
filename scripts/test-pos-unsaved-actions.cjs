const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const source = fs.readFileSync('components/pos/pos-cashier.tsx', 'utf8')
function setup({ dirty = true, saving = false, draftSaving = false } = {}) {
  const state = { prompt: false, checkout: false, resets: 0, actions: 0 }
  const pendingActionRef = { current: null }
  const start = source.indexOf(' const requestTransactionAction=')
  const end = source.indexOf(' const openCheckout=', start)
  const compiled = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
  const api = new Function('saving','draftSaving','pricingBusy','hasUnsavedChanges','pendingActionRef','setUnsavedActionOpen','resetTransaction','openCheckout', compiled + '; return {requestTransactionAction,cancelTransactionAction,resumeTransactionAction,discardAndContinue,saveAndContinue}')(
    saving, draftSaving, false, dirty, pendingActionRef, value => state.prompt = value, () => state.resets++, () => state.checkout = true,
  )
  return { ...api, state, action: () => state.actions++ }
}
test('unchanged transaction executes immediately; dirty transaction waits', () => {
  for (const dirty of [false, true]) {
    const h = setup({ dirty }); h.requestTransactionAction(h.action)
    assert.equal(h.state.actions, dirty ? 0 : 1)
    assert.equal(h.state.prompt, dirty)
  }
})
test('cancel preserves changes and removes the pending action', () => {
  const h = setup(); h.requestTransactionAction(h.action); h.cancelTransactionAction(); h.resumeTransactionAction()
  assert.equal(h.state.actions, 0); assert.equal(h.state.resets, 0); assert.equal(h.state.prompt, false)
})
test('discard clears the transaction and executes the requested action once', () => {
  const h = setup(); h.requestTransactionAction(h.action); h.discardAndContinue(); h.resumeTransactionAction()
  assert.equal(h.state.resets, 1); assert.equal(h.state.actions, 1)
})
test('save opens checkout without executing the action until successful completion', () => {
  const h = setup(); h.requestTransactionAction(h.action); h.saveAndContinue()
  assert.equal(h.state.checkout, true); assert.equal(h.state.actions, 0); assert.equal(h.state.resets, 0)
  h.resumeTransactionAction(); h.resumeTransactionAction(); assert.equal(h.state.actions, 1)
})
test('actions cannot interrupt an ongoing save', () => {
  for (const flags of [{ saving: true }, { draftSaving: true }]) {
    const h = setup(flags); h.requestTransactionAction(h.action)
    assert.equal(h.state.prompt, false); assert.equal(h.state.actions, 0)
  }
})
