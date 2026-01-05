// scripts/clean-descriptions.cjs
// Bulk clean all product descriptions - decode HTML entities and sanitize

const fetch = (...a) => import('node-fetch').then(({default: f}) => f(...a));
const he = require('he');
const sanitizeHtml = require('sanitize-html');
require('dotenv').config();

const BASE = process.env.MEDUSA_URL || 'http://localhost:9000';
const H    = { Authorization: `Basic ${process.env.MEDUSA_ADMIN_BASIC}` };

const allowedTags = ['p','ul','ol','li','br','strong','em','b','i','h2','h3'];
const allowedAttributes = { a: ['href','title','target','rel'] };

function decodeMulti(s) {
  if (!s) return '';
  let prev = s, next = he.decode(prev), i = 0;
  while (next !== prev && i < 2) { prev = next; next = he.decode(prev); i++; }
  return prev;
}

function cleanHtml(raw) {
  const decoded = decodeMulti(raw)
    .replace(/ style="[^"]*"/gi, '')
    .replace(/ class="[^"]*"/gi, '')
    .replace(/<\/?span[^>]*>/gi, '');
  return sanitizeHtml(decoded, { allowedTags, allowedAttributes }).trim();
}

async function listProducts(limit=100, offset=0) {
  const r = await fetch(`${BASE}/admin/products?limit=${limit}&offset=${offset}`, { headers: H });
  if (!r.ok) throw new Error(`List failed: ${r.status}`);
  return r.json();
}

async function saveProduct(id, description) {
  const r = await fetch(`${BASE}/admin/products/${id}`, {
    method: 'POST',
    headers: { ...H, 'content-type': 'application/json' },
    body: JSON.stringify({ description })
  });
  if (!r.ok) throw new Error(`Save ${id} failed: ${await r.text()}`);
}

(async () => {
  console.log('\n========================================');
  console.log('CLEANING PRODUCT DESCRIPTIONS');
  console.log('========================================\n');
  
  let offset = 0, changed = 0, seen = 0;
  for (;;) {
    const page = await listProducts(100, offset);
    const items = page.products || [];
    if (!items.length) break;
    
    for (const p of items) {
      seen++;
      const raw = p.description || '';
      const cleaned = cleanHtml(raw);
      if (cleaned && cleaned !== raw) {
        await saveProduct(p.id, cleaned);
        console.log(`✔ cleaned ${p.id} | ${p.title}`);
        changed++;
      } else {
        console.log(`— skipped ${p.id} | ${p.title}`);
      }
    }
    
    if (items.length < 100) break;
    offset += 100;
  }
  
  console.log(`\n========================================`);
  console.log(`Done. Changed ${changed}/${seen}.`);
  console.log(`========================================\n`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });

