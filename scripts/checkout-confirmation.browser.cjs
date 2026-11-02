// Real React page in Chromium, with all Next/backend boundaries mocked. No orders/payments created.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/jhakr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function main() {
  const root = process.cwd();
  const output = await esbuild.build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Page from './src/app/order/success/page'; createRoot(document.getElementById('root')).render(<Page/>);`, resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'next-boundaries', setup(build) {
      build.onResolve({ filter: /^(react(?:\/.*)?|react-dom(?:\/.*)?|scheduler|lucide-react)$/ }, args => ({ path: require.resolve(args.path) }));
      build.onResolve({ filter: /^(next\/link|next\/navigation|@\/contexts\/CartProvider)$/ }, args => ({ path: args.path, namespace: 'qa' }));
      build.onLoad({ filter: /.*/, namespace: 'qa' }, args => ({ loader: 'jsx', contents: args.path === 'next/link'
        ? `import React from 'react'; export default function Link({href,children,...rest}){return <a href={href} {...rest}>{children}</a>}`
        : args.path === 'next/navigation'
          ? `const router={replace:url=>window.replacements.push(url)};export function useSearchParams(){return new URLSearchParams(location.search)};export function useRouter(){return router}`
          : `const summary={refresh:()=>window.refreshes++};export function useCartSummary(){return summary}` }));
    } }],
  });
  const css = (await require('postcss')([require('@tailwindcss/postcss')()]).process(fs.readFileSync('src/app/globals.css', 'utf8'), { from: path.join(root, 'src/app/globals.css') })).css;
  const browser = await chromium.launch({ executablePath: process.env.QA_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    async function scenario(name, config, verify) {
      const page = await browser.newPage({ viewport: { width: config.mobile ? 360 : 1280, height: 900 } });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }));
      await page.goto('http://confirmation.test/order/success?orderId=order_qa' + (config.query || ''));
      await page.evaluate(config => {
        window.requests = []; window.replacements = []; window.refreshes = 0; window.activeStatus = 0; window.maxActiveStatus = 0;
        if (config.hidden) Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        const timeout = window.setTimeout.bind(window);
        // Accelerate the UI's long retry schedule; mock network delay stays unscaled.
        window.setTimeout = (fn, ms, ...args) => timeout(fn, ms >= 1000 ? ms / 50 : ms, ...args);
        let statuses = 0;
        const base = { id: 'order_qa', display_id: 123, status: 'pending', is_draft_order: true, payment_status: 'captured', currency_code: 'inr', total: 123.45,
          display_totals: { itemsSubtotal: 150.45, shipping: 0, promoDiscount: 27, grandTotal: 123.45 },
          items: [{ id: 'item', title: 'QA product', variant_title: 'Blue / M', quantity: 1, total: 150.45 }],
          shipping_address: { first_name: 'Test', address_1: 'Test address', city: 'Mumbai', postal_code: '400001' }, metadata: { razorpay_payment_status: 'captured' } };
        if (config.cod) { base.payment_status = 'cod'; base.metadata = { payment_method: 'cod', cod_status: 'pending' }; }
        if (config.pending) { base.payment_status = 'awaiting'; base.metadata = {}; }
        if (config.cancelled) base.status = 'canceled';
        if (config.paid) base.is_draft_order = false;
        window.fetch = async (url, init) => {
          const entry = { url: String(url), method: init?.method || 'GET' }; window.requests.push(entry);
          const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
          if (String(url).includes('cart/clear')) return response({ cleared: true });
          if (String(url).includes('reconcile')) return response(config.finalId ? { orderId: config.finalId } : {});
          if (String(url).includes('/cod')) return response({ medusaOrderId: 'order_qa' });
          if (config.unauthorized) return response({}, 401);
          const statusOnly = String(url).includes('confirmation-status');
          if (statusOnly) {
            statuses++;
            window.activeStatus++; window.maxActiveStatus = Math.max(window.maxActiveStatus, window.activeStatus);
            await new Promise(resolve => timeout(resolve, config.slow ? 65 : 5));
            window.activeStatus--;
            if (config.notFound && statuses <= 6) return response({}, 404);
            if (config.transient && statuses <= 2) return response({}, 503);
            if (!config.stayDraft && !config.cancelled && statuses >= (config.notFound ? 7 : 3)) {
              base.is_draft_order = false;
              if (config.cod) base.metadata.cod_status = 'confirmed';
              else { base.payment_status = 'paid'; base.metadata.razorpay_payment_status = 'captured'; }
            }
            return response({ order: { id: base.id, status: base.status, payment_status: base.payment_status, is_draft_order: base.is_draft_order, metadata: base.metadata } });
          }
          return response({ order: base });
        };
      }, config);
      await page.addStyleTag({ content: css });
      await page.addScriptTag({ content: output.outputFiles[0].text });
      try { await verify(page); assert.deepEqual(errors, []); console.log('PASS:', name); }
      finally { await page.close(); }
    }
    const confirmed = page => page.getByRole('heading', { name: 'Thank you for your order!' }).waitFor();
    await scenario('captured draft waits for placement, then loads details and clears only once', { mobile: true }, async page => {
      await page.getByText(/finishing your order confirmation/).waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Thank you for your order!' }).count(), 0);
      await confirmed(page);
      await page.getByText('Blue / M').waitFor();
      assert.equal(await page.getByRole('link', { name: 'View this order' }).getAttribute('href'), '/account/orders/order_qa');
      await page.waitForTimeout(100);
      const counts = await page.evaluate(() => ({ summary: window.requests.filter(r => r.url.includes('order-summary')).length, clear: window.requests.filter(r => r.url.includes('cart/clear')).length, overflow: document.documentElement.scrollWidth > innerWidth }));
      assert.equal(counts.summary, 2); assert.equal(counts.clear, 1); assert.equal(counts.overflow, false);
      assert((await page.locator('body').innerText()).includes('123.45'));
    });
    await scenario('COD only confirms after backend placement and COD confirmation', { cod: true, query: '&cod=1' }, async page => { await confirmed(page); await page.getByText('Amount to pay').waitFor(); });
    await scenario('six temporary missing responses do not declare payment failure', { notFound: true }, confirmed);
    await scenario('slow responses and temporary 503 retry sequentially', { transient: true, slow: true }, async page => {
      await confirmed(page);
      assert.equal(await page.evaluate(() => window.maxActiveStatus), 1);
    });
    await scenario('session expiry requests sign-in and never clears cart', { unauthorized: true }, async page => {
      await page.getByRole('heading', { name: 'Sign in to view your order' }).waitFor();
      assert.equal(await page.evaluate(() => window.requests.some(r => r.url.includes('cart/clear'))), false);
    });
    await scenario('refreshing an already placed order needs no status polls', { paid: true }, async page => {
      await confirmed(page); await page.waitForTimeout(120);
      assert.equal(await page.evaluate(() => window.requests.filter(r => r.url.includes('confirmation-status')).length), 0);
    });
    await scenario('COD query flag cannot override a saved online payment method', { paid: true, query: '&cod=1' }, async page => {
      await confirmed(page); await page.getByText('Paid online', { exact: true }).waitFor();
    });
    await scenario('cancelled captured order never clears cart or announces success', { cancelled: true }, async page => {
      await page.getByText(/This order was cancelled/).waitFor();
      await page.waitForTimeout(100);
      assert.equal(await page.getByRole('heading', { name: 'Thank you for your order!' }).count(), 0);
      assert.equal(await page.evaluate(() => window.requests.some(r => r.url.includes('cart/clear'))), false);
    });
    await scenario('hidden tab suspends status requests and resumes when visible', { hidden: true }, async page => {
      await page.getByText(/finishing your order confirmation/).waitFor(); await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => window.requests.filter(r => r.url.includes('confirmation-status')).length), 0);
      await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }));
      await confirmed(page);
    });
    await scenario('reconcile follows the backend final order ID', { finalId: 'order_final', query: '&confirming=1' }, async page => {
      await page.waitForFunction(() => window.replacements.length > 0);
      assert((await page.evaluate(() => window.replacements[0])).includes('orderId=order_final'));
    });
    await scenario('pending deadline offers recovery, never clears cart or says payment failed', { stayDraft: true, pending: true }, async page => {
      await page.getByRole('heading', { name: 'Let’s check your order' }).waitFor();
      assert.equal(await page.evaluate(() => window.requests.some(r => r.url.includes('cart/clear'))), false);
      await page.getByRole('button', { name: 'Check order status' }).waitFor();
      assert.equal(await page.getByRole('link', { name: 'Contact support' }).getAttribute('href'), '/contact');
    });
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
