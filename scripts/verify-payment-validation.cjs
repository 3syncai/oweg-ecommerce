const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/payment-capture-validation.ts','utf8'), { compilerOptions: { module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022 } }).outputText, { exports: exportsObject });
const { assertCaptureFacts } = exportsObject;
const valid = { payment:{id:'pay_test',order_id:'order_gateway',amount:10001,currency:'INR',status:'captured'},paymentId:'pay_test',gatewayOrderId:'order_gateway',expectedGatewayOrderId:'order_gateway',expectedAmountMinor:10001,expectedCurrency:'inr' };
assert.equal(assertCaptureFacts(valid).amountMinor,10001);
const cases = [
  ['wrong payment ID',{paymentId:'pay_other'}], ['wrong checkout binding',{expectedGatewayOrderId:'order_other'}],
  ['gateway order mismatch',{gatewayOrderId:'order_other'}], ['tampered amount',{claimedAmountMinor:1}],
  ['tampered currency',{claimedCurrency:'usd'}], ['incorrect server amount',{expectedAmountMinor:10000}],
  ['incorrect server currency',{expectedCurrency:'usd'}],
  ...['authorized','failed','created','refunded','paid'].map(status=>[status+' is not captured',{payment:{...valid.payment,status}}]),
  ...[0,-1,100.5,NaN,Infinity].map(amount=>['invalid minor-unit amount '+amount,{payment:{...valid.payment,amount}}]),
];
for(const [name,patch] of cases) { assert.throws(()=>assertCaptureFacts({...valid,...patch})); console.log('PASS:',name); }
console.log('PASS: captured payment with exact paise amount and case-normalized currency');
