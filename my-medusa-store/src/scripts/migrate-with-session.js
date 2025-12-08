const mysql = require('mysql2/promise');
const http = require('http');

/**
 * AUTHENTICATED PRICE MIGRATION
 * Uses your actual logged-in session from Medusa Admin
 * 
 * Run: node src/scripts/migrate-with-session.js --dry-run
 *      node src/scripts/migrate-with-session.js
 */

const OPENCART = {
  host: '147.93.31.253',
  port: 3306,
  user: 'oweg_user2',
  password: 'Oweg#@123',
  database: 'oweg_db',
};

const MEDUSA_URL = 'http://localhost:9000';
const SESSION_COOKIE = 'connect.sid=s%3AZCmj6r_S4wS41vTWWwfS0ZoCK33qbIHu.H76X90LRFdcKOyqmdrGS%2BZyGrNizJr49cb%2BEq6cIiAM';

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`\n🔄 Price Migration (${isDryRun ? 'DRY RUN' : 'LIVE RUN'})\n`);

  let conn = null;
  let stats = { total: 0, matched: 0, updated: 0, errors: 0, errorList: [] };

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
    console.log(`${isDryRun ? '🔍 Previewing' : '💾 Updating'} prices...\n`);

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
          console.log(`${ocName.slice(0, 45).padEnd(47)} → ₹${ocPrice}`);
        }
        continue;
      }

      // Update price
      try {
        await updatePrice(variantId, priceInCents);
        stats.updated++;
        if (stats.updated % 50 === 0) {
          console.log(`✅ ${stats.updated}/${stats.matched}...`);
        }
      } catch (err) {
        stats.errors++;
        if (stats.errors <= 5) {
          stats.errorList.push(`${ocName.slice(0, 30)}: ${err.message.slice(0, 50)}`);
        }
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 Migration Summary');
    console.log('='.repeat(60));
    console.log(`Total OpenCart products: ${stats.total}`);
    console.log(`Matched with Medusa:     ${stats.matched}`);
    if (!isDryRun) {
      console.log(`Successfully updated:    ${stats.updated}`);
      console.log(`Errors:                  ${stats.errors}`);
      if (stats.errorList.length > 0) {
        console.log('\nFirst few errors:');
        stats.errorList.forEach(e => console.log(`  ❌ ${e}`));
      }
    }
    console.log('='.repeat(60) + '\n');

    if (isDryRun) {
      console.log('ℹ️  DRY RUN - No changes made. Run without --dry-run to apply.\n');
    } else {
      console.log('✅ Migration complete!\n');
      console.log('💡 Refresh Medusa Admin to see updated prices.\n');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
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
    const options = {
      headers: {
        'Cookie': SESSION_COOKIE,
      },
    };
    
    http.get(url, options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 100)}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(body);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Cookie': SESSION_COOKIE,
      },
    };

    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 100)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

main();
