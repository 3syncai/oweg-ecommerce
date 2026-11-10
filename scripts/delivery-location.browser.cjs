const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = new URL(process.env.DELIVERY_QA_URL || 'http://127.0.0.1:3000');
assert.ok(['localhost', '127.0.0.1'].includes(base.hostname), 'Use a local storefront');
const customer = { id: 'cus_delivery_qa', first_name: 'QA', email: 'qa@example.test' };
const home = { id: 'home', address_name: 'Home', first_name: 'QA', address_1: '12 Home Road', address_2: 'Flat 8', city: 'Mumbai', province: 'Maharashtra', postal_code: '400001', country_code: 'in', phone: '9999999999', is_default_shipping: true, is_default_billing: true };
const work = { ...home, id: 'work', address_name: 'Work', address_1: '43 Work Road', address_2: undefined, is_default_shipping: false, is_default_billing: false };
const invalid = { ...home, id: 'invalid', address_name: 'Old office', postal_code: '000000', is_default_shipping: false };

async function setup(browser, addresses, { width = 1280, signedIn = false, fail = false, delay, guestPin } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 820 }, serviceWorkers: 'block' });
  if (guestPin) await context.addInitScript(pin => {
    if (!localStorage.getItem('oweg_pincode')) localStorage.setItem('oweg_pincode', pin);
  }, guestPin);
  let loggedIn = signedIn;
  let addressReads = 0;
  const writes = [];
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base.origin) return route.abort();
    const path = url.pathname;
    if (!path.startsWith('/api/')) return route.continue();
    if (path === '/api/medusa/auth/session') return route.fulfill({ json: { customer: loggedIn ? customer : null } });
    if (path === '/api/medusa/auth/login') {
      loggedIn = true;
      return route.fulfill({ json: { customer } });
    }
    if (request.method() !== 'GET') {
      writes.push(path);
      return route.fulfill({ status: 409, json: { error: 'QA intercepted write' } });
    }
    if (path === '/api/medusa/customer-addresses') {
      addressReads++;
      if (delay) await delay;
      if (fail && addressReads === 1) return route.fulfill({ status: 503, json: { error: 'QA unavailable' } });
      return route.fulfill({ json: { addresses } });
    }
    if (path === '/api/medusa/cart') return route.fulfill({ json: { cart: null } });
    if (path.startsWith('/api/pincode/')) return route.fulfill({ json: { place: 'Delhi, Delhi' } });
    return route.fulfill({ json: {} });
  });
  const addressDialog = page.getByRole('dialog', { name: 'Choose a delivery address' });
  const shipping = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Shipping details' }) });
  const shippingLine = shipping.getByRole('textbox', { name: 'Address line 1', exact: true });
  const signIn = async () => {
    await page.locator('#login-identifier').fill(customer.email);
    await page.getByRole('button', { name: /Continue/ }).click();
    await page.getByRole('button', { name: 'Password', exact: true }).click();
    await page.locator('#login-password').fill('mock-only-password');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  };
  const login = async () => {
    await page.goto(new URL('/login?redirect=%2Fcheckout', base).href);
    await signIn();
    await page.waitForURL('**/checkout');
  };
  const close = async ({ allowQuotes = false } = {}) => {
    assert.deepEqual(errors, []);
    const allowed = allowQuotes ? ['/api/checkout/order-summary', '/api/checkout/draft-order'] : [];
    assert.deepEqual(writes.filter(path => !allowed.includes(path) &&
      (path.startsWith('/api/checkout/') || path.startsWith('/api/medusa/customer-addresses') || path === '/api/create-razorpay-order')), []);
    await context.close();
  };
  return { page, login, signIn, addressDialog, shipping, shippingLine, addressReads: () => addressReads, close };
}

async function run() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROME_PATH });
  try {
    const single = await setup(browser, [home], { guestPin: '110001' });
    await single.login();
    await single.page.waitForFunction(() => sessionStorage.getItem('oweg_delivery_address')?.includes('"addressId":"home"'));
    await single.page.waitForFunction(() => document.querySelector('input[placeholder="Address line 1"]')?.value === '12 Home Road');
    assert.equal(await single.addressDialog.count(), 0);
    assert.equal(single.addressReads(), 1);
    await single.close();
    console.log('PASS sole saved address wins over guest PIN and prefills checkout with one address read');

    for (const width of [1280, 390]) {
      const multiple = await setup(browser, [work, invalid, home], { width });
      await multiple.login();
      await multiple.addressDialog.waitFor();
      assert.equal(await multiple.addressDialog.locator('button[aria-pressed]').first().getAttribute('aria-pressed'), 'false');
      assert.match(await multiple.addressDialog.locator('button[aria-pressed]').first().innerText(), /Home\s*Default/);
      assert.ok(await multiple.addressDialog.getByRole('button', { name: /Old office/ }).isDisabled());
      await multiple.addressDialog.getByRole('button', { name: /Work/ }).click();
      await multiple.addressDialog.waitFor({ state: 'hidden' });
      await multiple.page.waitForFunction(() => document.querySelector('input[placeholder="Address line 1"]')?.value === '43 Work Road');
      assert.equal(await multiple.shipping.getByRole('textbox', { name: 'Address line 2', exact: true }).inputValue(), '');
      assert.equal(await multiple.page.getByRole('checkbox', { name: 'Same as shipping' }).isChecked(), false);
      assert.equal(multiple.addressReads(), 1);
      await multiple.page.reload();
      await multiple.page.waitForFunction(() => document.querySelector('input[placeholder="Address line 1"]')?.value === '43 Work Road');
      assert.equal(await multiple.addressDialog.count(), 0);
      await multiple.close();
      console.log(`PASS ${width}px picker, same PIN distinct address, invalid record disabled, billing preserved and no repeat on reload`);
    }

    const empty = await setup(browser, [], { guestPin: '110001' });
    await empty.login();
    await empty.page.waitForFunction(() => document.querySelector('input[placeholder="PIN code"]')?.value === '110001');
    assert.equal(await empty.addressDialog.count(), 0);
    await empty.close();
    console.log('PASS zero saved addresses preserves guest PIN');

    let release;
    const delay = new Promise(resolve => { release = resolve; });
    const slow = await setup(browser, [home], { delay, signedIn: true });
    await slow.page.goto(new URL('/checkout', base).href);
    await slow.shippingLine.fill('Manually entered address');
    release();
    await slow.shipping.getByLabel('Use a saved shipping address').waitFor();
    assert.equal(await slow.shippingLine.inputValue(), 'Manually entered address');
    await slow.shipping.getByLabel('Use a saved shipping address').selectOption('home');
    assert.equal(await slow.shippingLine.inputValue(), home.address_1);
    await slow.close();
    console.log('PASS delayed address result preserves manual input and explicit checkout selection still works');

    const failed = await setup(browser, [home, work], { fail: true });
    await failed.login();
    await failed.page.getByRole('button', { name: /Deliver to.*Select location/ }).click();
    await failed.addressDialog.getByText(/Could not refresh saved addresses/).waitFor();
    await failed.addressDialog.getByRole('button', { name: 'Retry', exact: true }).click();
    await failed.addressDialog.getByRole('button', { name: /Work/ }).waitFor();
    await failed.page.keyboard.press('Escape');
    await failed.addressDialog.waitFor({ state: 'hidden' });
    await failed.page.getByRole('button', { name: /Deliver to.*Select location/ }).click();
    await failed.addressDialog.getByRole('button', { name: 'Enter a pincode instead' }).click();
    const pinDialog = failed.page.getByRole('dialog', { name: 'Update delivery pincode' });
    await pinDialog.getByRole('textbox', { name: 'Pincode' }).fill('110001');
    await pinDialog.getByRole('textbox', { name: 'Pincode' }).press('Enter');
    await pinDialog.waitFor({ state: 'hidden' });
    assert.equal(await failed.page.evaluate(() => localStorage.getItem('oweg_pincode')), '110001');
    await failed.close();
    console.log('PASS failed address fetch can be retried, dismissed, and switched to manual PIN');

    const payment = await setup(browser, [home, work]);
    await payment.page.goto(new URL('/checkout?buyNow=1&variant_id=variant_qa&price=10000', base).href);
    const pay = payment.page.getByRole('button', { name: /^Pay securely/ });
    await pay.click();
    await payment.signIn();
    await payment.addressDialog.waitFor();
    assert.ok(await payment.page.getByRole('button', { name: /^Pay securely/, includeHidden: true }).first().isDisabled());
    await payment.addressDialog.getByRole('button', { name: /Work/ }).click();
    await pay.waitFor();
    assert.equal(await pay.isEnabled(), true);
    await payment.close({ allowQuotes: true });
    console.log('PASS signing in from the payment button requires address review and a new payment confirmation');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
