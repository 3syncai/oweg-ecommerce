const mysql = require('mysql2/promise');
const https = require('https');
const http = require('http');

/**
 * SIMPLE PRICE MIGRATION - OpenCart to Medusa
 * 
 * Run: node src/scripts/update-prices.js --dry-run
 *      node src/scripts/update-prices.js
 */

const OPENCART = {
  host: '147.93.31.253',
  port: 3306,
  user: 'oweg_user2',
  password: 'Oweg#@123',
  database: 'oweg_db',
};

const MEDUSA_URL = 'http://localhost:9000';

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`\n🔄 Price Migration (${isDryRun ? 'DRY RUN' : 'LIVE'})\n`);

  let conn = null;
  let stats = { total: 0, matched: 0, updated: 0, errors: 0 };

  try {
    // Connect to OpenCart
    console.log('📡 Connecting to OpenCart...');
    conn = await mysql.createConnection(OPENCART);
    console.log('✅ Connected\n');

    // Fetch OpenCart prices
    console.log('📊 Fetching OpenCart prices...');
    const [rows] = await conn.execute(`
      SELECT p.product_id, pd.name, p.price
      FROM oc_product p
      INNER JOIN oc_product_description pd ON p.product_id = pd.product_id
      WHERE pd.language_id = 1 AND p.price > 0
      ORDER BY p.product_id
    `);
    stats.total = rows.length;
    console.log(`✅ Found ${rows.length} products\n`);

    // Fetch Medusa products
    console.log('🔍 Fetching Medusa products...');
    const medusaProducts = await fetchMedusaProducts();
    console.log(`✅ Found ${medusaProducts.length} Medusa products\n`);

    // Match and update
    console.log(`${isDryRun ? '🔍 Preview' : '💾 Updating'} prices...\n`);

    for (const row of rows) {
      const ocId = row.product_id;
      const ocName = row.name;
      const ocPrice = parseFloat(row.price);

      // Find matching Medusa product
      const mp = medusaProducts.find(p => {
        if (p.metadata?.opencart_id == ocId) return true;
        return p.title?.toLowerCase().trim() === ocName.toLowerCase().trim();
      });

      if (!mp?.variants?.[0]) continue;

      stats.matched++;
      const variantId = mp.variants[0].id;
      const priceInCents = Math.round(ocPrice * 100);

      if (isDryRun) {
        if (stats.matched <= 20) {
          console.log(`${ocName.slice(0, 45)} → ₹${ocPrice}`);
        }
        continue;
      }

      // Update price
      try {
        await updatePrice(variantId, priceInCents);
        stats.updated++;
        if (stats.updated % 100 === 0) {
          console.log(`✅ ${stats.updated}/${stats.matched}...`);
        }
      } catch (err) {
        stats.errors++;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log(`Total: ${stats.total} | Matched: ${stats.matched}`);
    if (!isDryRun) {
      console.log(`Updated: ${stats.updated} | Errors: ${stats.errors}`);
    }
    console.log('='.repeat(50) + '\n');

    if (isDryRun) {
      console.log('ℹ️  DRY RUN - Run without --dry-run to apply\n');
    } else {
      console.log('✅ Migration complete!\n');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

async function fetchMedusaProducts() {
  const products = [];
  let offset = 0;
  while (true) {
    const url = `${MEDUSA_URL}/admin/products?limit=100&offset=${offset}&fields=id,title,metadata,variants.id`;
    const data = await httpGet(url);
    if (!data.products?.length) break;
    products.push(...data.products);
    offset += 100;
    if (data.products.length < 100) break;
  }
  return products;
}

async function updatePrice(variantId, amount) {
  const url = `${MEDUSA_URL}/admin/products/variants/${variantId}`;
  await httpPost(url, {
    prices: [{ currency_code: 'inr', amount }]
  });
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

main();
