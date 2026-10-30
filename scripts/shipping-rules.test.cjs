const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports });
  return module.exports;
}
const rules = load('src/lib/shipping-rules.ts');
const { orderCustomerShipping } = load('my-medusa-store/src/lib/order-customer-shipping.ts');
test('Rs999 is the shared free shipping boundary, with Rs50 below it', () => {
  assert.equal(rules.FREE_SHIPPING_THRESHOLD_RUPEES, 999);
  for (const subtotal of [1, 499, 500, 700, 998, 998.99]) assert.equal(rules.calculateStatewiseShipping(subtotal), 50);
  for (const subtotal of [999, 999.01, 1000, 2000]) assert.equal(rules.calculateStatewiseShipping(subtotal), 0);
  for (const subtotal of [0, -1, NaN, Infinity]) assert.equal(rules.calculateStatewiseShipping(subtotal), 0);
});
test('shipping has the same boundary for all states and ignores location aliases', () => {
  for (const state of ['Maharashtra', 'Bihar', null]) {
    assert.equal(rules.calculateStatewiseShipping(998.99, state), 50);
    assert.equal(rules.calculateStatewiseShipping(999, state), 0);
  }
});
test('vendor previews use frozen shipping for both old and new orders', () => {
  assert.equal(orderCustomerShipping({ expected_shipping_price: 0 }, 700), 0);
  assert.equal(orderCustomerShipping({ expected_shipping_price: 50 }, 700), 50);
  assert.equal(orderCustomerShipping({ expected_shipping_price: '50' }, 700), 50);
  assert.equal(orderCustomerShipping({ expected_shipping_price: 0 }, 1200), 0);
  assert.equal(orderCustomerShipping(null, 700), 0);
  assert.equal(orderCustomerShipping({}, 400), 50);
  for (const invalid of [null, '', 'invalid', -5, Infinity]) assert.equal(orderCustomerShipping({expected_shipping_price: invalid}, 700), 0);
});
