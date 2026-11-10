const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = new URL(process.env.STOREFRONT_QA_URL || 'http://localhost:3000');
assert.ok(['localhost', '127.0.0.1'].includes(base.hostname), 'QA must target localhost');
const owner = { id: 'cus_qa_owner', first_name: 'Fixture', email: 'qa-owner@example.test' };
const another = { id: 'cus_qa_other', first_name: 'Other', email: 'qa-other@example.test' };

async function fixture(browser, width = 1280, options = {}) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, serviceWorkers: 'block', ...options.browser });
  let customer = owner;
  let loginCustomer = owner;
  let logoutCount = 0;
  let draftCount = 0;
  let searchCount = 0;
  let ordersCount = 0;
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base.origin) return route.abort();
    const pathname = url.pathname;
    if (!pathname.startsWith('/api/')) return route.continue();
    if (pathname === '/api/medusa/auth/session') return route.fulfill({ json: { customer } });
    if (pathname === '/api/medusa/auth/login') {
      customer = loginCustomer;
      return route.fulfill({ json: { customer } });
    }
    if (pathname === '/api/medusa/auth/logout') {
      logoutCount++;
      if (logoutCount === 1) return route.fulfill({ status: 503, json: {} });
      customer = null;
      return route.fulfill({ json: { success: true } });
    }
    if (pathname === '/api/checkout/draft-order') {
      draftCount++;
      customer = null;
      return route.fulfill({ status: 401, json: { error: 'Sign in first' } });
    }
    if (pathname === '/api/search') {
      searchCount++;
      if (searchCount === 1) {
        await new Promise(resolve => setTimeout(resolve, 3500));
        return route.fulfill({ status: 503, json: {} }).catch(() => {});
      }
      return route.fulfill({ json: { products: [], count: 0 } });
    }
    if (pathname === '/api/medusa/cart') return route.fulfill({ json: { cart: null } });
    if (pathname === '/api/medusa/orders') {
      ordersCount++;
      await new Promise(resolve => setTimeout(resolve, 600));
      const orders = options.orders || [];
      return route.fulfill({ json: { orders, count: orders.length } });
    }
    if (pathname.startsWith('/api/medusa/orders/') && options.orders) {
      const order = options.orders.find(value => value.id === pathname.split('/').at(-1));
      if (order) return route.fulfill({ json: { order } });
    }
    if (pathname === '/api/medusa/customer-addresses') return route.fulfill({ json: { addresses: [] } });
    if (pathname === '/api/checkout/order-summary') {
      await options.holdTotals;
      return route.fulfill({ json: {} });
    }
    if (route.request().method() !== 'GET') return route.fulfill({ status: 409, json: {} });
    return route.fulfill({ json: {} });
  });
  return {
    context, page, errors, go: pathname => page.goto(new URL(pathname, base).href),
    logoutCount: () => logoutCount,
    draftCount: () => draftCount,
    ordersCount: () => ordersCount,
    setLoginCustomer: next => { loginCustomer = next; },
  };
}

async function checkOrderScreens(browser) {
  const order = {
    id: 'order_qa', display_id: 123, created_at: new Date().toISOString(),
    status: 'pending', fulfillment_status: 'delivered', payment_status: 'captured',
    total: 682, currency_code: 'inr',
    metadata: { shiprocket_status: 'delivered', shiprocket_awb: 'REF-123', shiprocket_delivered_at: new Date().toISOString() },
    items: [{ id: 'line_qa', title: 'Fixture USB hub', product_id: 'prod_qa', product_handle: 'fixture-hub', variant_id: 'variant_qa', thumbnail: '/oweg_logo.png', quantity: 1, unit_price: 682 }],
  };
  for (const width of [320, 390, 1280]) {
    const qa = await fixture(browser, width, { orders: [order] });
    await qa.go('/account');
    await qa.page.getByRole('heading', { name: 'Your account', exact: true }).waitFor();
    const signout = qa.page.getByRole('region', { name: 'Account session' }).getByRole('button', { name: 'Sign out', exact: true });
    await signout.click();
    const dialog = qa.page.getByRole('dialog', { name: 'Sign out of OWEG?' });
    await dialog.getByRole('button', { name: 'Stay signed in' }).click();
    assert.equal(qa.logoutCount(), 0);

    await qa.go('/account/orders');
    const product = qa.page.getByRole('link', { name: 'Fixture USB hub' });
    await product.waitFor();
    assert.equal(await product.getAttribute('href'), '/productDetail/prod_qa');
    assert.equal(await product.locator('img').count(), 1);
    const trigger = qa.page.getByRole('button', { name: 'More actions' });
    const card = qa.page.locator('article').filter({ has: trigger });
    const before = await card.boundingBox();
    await trigger.click();
    const track = card.getByRole('link', { name: 'Track order' });
    await track.waitFor();
    const menu = await track.boundingBox();
    assert.ok(menu.x >= 0 && menu.x + menu.width <= width);
    assert.equal((await card.boundingBox()).height, before.height);
    await track.focus();
    await qa.page.keyboard.press('Escape');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
    await trigger.click();
    await qa.page.getByText('Fixture USB hub').click({ trial: true });
    await qa.page.getByText('Most recent first').click();
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');

    await qa.go('/account/orders/order_qa?orderNo=123');
    const detailsProduct = qa.page.getByRole('link', { name: /Fixture USB hub/ });
    await detailsProduct.waitFor().catch(async error => {
      const headings = await qa.page.getByRole('heading').allTextContents();
      throw new Error(`Order detail at ${width}px: ${qa.page.url()}; headings=${headings.join('|')}; page errors=${qa.errors.join('|')}`, { cause: error });
    });
    assert.equal(await detailsProduct.getAttribute('href'), '/productDetail/prod_qa');
    assert.equal(await detailsProduct.locator('img').count(), 1);
    assert.equal(await qa.page.getByText('Safe & Secure', { exact: true }).count(), 0);
    assert.equal(await qa.page.getByText('Shiprocket', { exact: true }).count(), 0);
    const manage = qa.page.getByRole('region', { name: 'Manage this order' });
    assert.equal(await manage.getByRole('button', { name: /Cancel order/ }).isDisabled(), true);
    assert.equal(await manage.getByRole('button', { name: 'Download invoice' }).isEnabled(), true);
    const tracking = qa.page.getByRole('link', { name: 'View tracking', exact: true });
    assert.equal(await tracking.getAttribute('href'), '/account/orders/order_qa/track?orderNo=123');
    await tracking.click();
    await qa.page.getByText('REF-123', { exact: true }).waitFor();
    assert.equal(await qa.page.getByText('Shiprocket', { exact: true }).count(), 0);
    assert.equal(await qa.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.deepEqual(qa.errors, []);
    await qa.context.close();
    console.log('PASS account, order actions, product links and native tracking at ' + width + 'px');
  }
}

async function checkLoadingFeedback(browser) {
  const orders = await fixture(browser, 390, { browser: { hasTouch: true, isMobile: true } });
  await orders.go('/orders');
  const refresh = orders.page.getByRole('button', { name: 'Refresh orders' });
  await orders.page.getByText('You have no orders yet.').waitFor();
  await refresh.scrollIntoViewIfNeeded();
  const box = await refresh.boundingBox();
  const cdp = await orders.context.newCDPSession(orders.page);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  await touch('touchStart', [point]);
  await touch('touchMove', [{ ...point, y: point.y + 65 }]);
  await refresh.getByText('Release to refresh').waitFor();
  await touch('touchEnd', []);
  await refresh.getByText('Refreshing…').waitFor();
  await refresh.getByText('Pull or tap to refresh').waitFor();
  assert.equal(orders.ordersCount(), 2, 'pull should request one refresh');
  await touch('touchStart', [point]);
  await touch('touchMove', [{ ...point, y: point.y + 22 }]);
  await touch('touchEnd', []);
  await refresh.press('Enter');
  await refresh.getByText('Refreshing…').waitFor();
  await refresh.getByText('Pull or tap to refresh').waitFor();
  assert.equal(orders.ordersCount(), 3, 'short drags should not refresh; keyboard activation still works');
  assert.deepEqual(orders.errors, []);
  await orders.context.close();

  let releaseTotals;
  const holdTotals = new Promise(resolve => { releaseTotals = resolve; });
  const checkout = await fixture(browser, 390, { holdTotals, browser: { reducedMotion: 'reduce' } });
  try {
    await checkout.go('/checkout?buyNow=1&variant_id=variant_fixture&price=10000');
    const progress = checkout.page.getByRole('progressbar', { name: 'Updating order totals' });
    await progress.waitFor();
    assert.equal(await progress.getAttribute('aria-valuenow'), null);
    assert.equal(await progress.locator('span').evaluate(bar => getComputedStyle(bar).animationName), 'none');
    releaseTotals();
    await progress.waitFor({ state: 'hidden' });
    assert.equal(checkout.draftCount(), 0);
    assert.deepEqual(checkout.errors, []);
  } finally {
    releaseTotals();
    await checkout.context.close();
  }
  console.log('PASS mobile pull threshold, keyboard refresh, and reduced-motion checkout progress');
}

async function checkoutExpiry(browser, nextCustomer) {
  const qa = await fixture(browser);
  qa.setLoginCustomer(nextCustomer);
  const page = qa.page;
  await qa.go('/checkout?buyNow=1&variant_id=variant_fixture&price=10000');
  const shipping = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Shipping details' }) });
  await shipping.getByLabel('First name', { exact: true }).fill('Fixture buyer');
  const pay = page.getByRole('button', { name: /^Pay securely/ });
  await pay.click();
  await page.locator('#checkout-form').getByText(/^Phone — /).waitFor({ timeout: 10000 });
  assert.equal(qa.draftCount(), 0);
  await shipping.getByLabel('Phone', { exact: true }).fill('9999999999');
  await shipping.getByLabel('Address line 1', { exact: true }).fill('Private fixture address');
  await shipping.getByLabel('City', { exact: true }).fill('Mumbai');
  await shipping.getByLabel('State', { exact: true }).fill('Maharashtra');
  await shipping.getByLabel('PIN code', { exact: true }).fill('400001');
  await pay.click();
  await page.getByRole('heading', { name: 'Your session expired' }).waitFor();
  assert.equal(await shipping.count(), 0);
  await page.getByRole('button', { name: 'Sign in again' }).click();
  await page.locator('#login-identifier').fill(nextCustomer.email);
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: 'Password', exact: true }).click();
  await page.locator('#login-password').fill('mock-only-password');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  const address = shipping.getByLabel('Address line 1', { exact: true });
  await address.waitFor();
  assert.equal(await address.inputValue(), nextCustomer.id === owner.id ? 'Private fixture address' : '');
  assert.equal(qa.draftCount(), 1);
  assert.deepEqual(qa.errors, []);
  await qa.context.close();
  console.log('PASS checkout validation and expiry recovery for ' + (nextCustomer.id === owner.id ? 'same account' : 'different account'));
}

async function run() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROME_PATH });
  try {
    await checkOrderScreens(browser);
    if (process.env.ORDERS_ONLY === '1') return;
    for (const width of [1280, 390]) {
      const qa = await fixture(browser, width);
      await qa.go('/search');
      const account = qa.page.getByRole('button', { name: width === 390 ? 'Account' : 'Account menu', exact: true });
      await account.click();
      const signOut = qa.page.getByRole('button', { name: /^Sign out$/i }).first();
      await signOut.click();
      const dialog = qa.page.getByRole('dialog', { name: 'Sign out of OWEG?' });
      const stay = dialog.getByRole('button', { name: 'Stay signed in' });
      await stay.waitFor();
      assert.equal(await stay.evaluate(button => document.activeElement === button), true);
      await qa.page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(qa.logoutCount(), 0);
      if (width !== 390) await account.click();
      await signOut.click();
      await dialog.getByRole('button', { name: 'Sign out', exact: true }).click();
      await dialog.getByRole('alert').waitFor();
      await dialog.getByRole('button', { name: 'Retry sign-out' }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(qa.logoutCount(), 2);
      assert.deepEqual(qa.errors, []);
      await qa.context.close();
      console.log('PASS sign-out cancel, focus, failure and retry at ' + width + 'px');
    }

    const search = await fixture(browser, 390);
    await search.go('/search?q=fixture');
    await search.page.getByText('Looking for products…').waitFor();
    await search.page.getByText('Search is taking longer than usual…').waitFor();
    await search.page.getByRole('heading', { name: 'Search is temporarily unavailable' }).waitFor();
    await search.page.getByRole('button', { name: 'Retry search' }).click();
    await search.page.getByRole('heading', { name: 'No matching products' }).waitFor();
    await search.context.setOffline(true);
    await search.page.getByRole('heading', { name: 'Search is offline' }).waitFor();
    await search.context.setOffline(false);
    await search.page.getByRole('heading', { name: 'No matching products' }).waitFor();
    await search.go('/search');
    await search.page.getByRole('heading', { name: 'What are you looking for?' }).waitFor();
    assert.deepEqual(search.errors, []);
    await search.context.close();
    console.log('PASS search loading, slow, service error, retry, no results, offline and reconnect');

    const push = await fixture(browser, 390);
    await push.context.addInitScript(() => {
      const match = window.matchMedia.bind(window);
      window.matchMedia = query => query === '(display-mode: standalone)' ? { matches: true } : match(query);
      Object.defineProperty(Notification, 'permission', { value: 'denied' });
      Notification.requestPermission = () => { throw new Error('Unexpected permission prompt'); };
    });
    await push.go('/account/notifications');
    await push.page.getByText('Notifications are blocked on this device').waitFor();
    assert.equal(await push.page.getByRole('radio', { name: 'Allow product updates' }).count(), 0);
    assert.deepEqual(push.errors, []);
    await push.context.close();
    console.log('PASS denied notification permission explains recovery without a second prompt');

    await checkLoadingFeedback(browser);
    await checkoutExpiry(browser, owner);
    await checkoutExpiry(browser, another);
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
