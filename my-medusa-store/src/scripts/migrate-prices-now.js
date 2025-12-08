const mysql = require('mysql2/promise');
const http = require('http');

/**
 * FINAL WORKING MIGRATION - OpenCart to Medusa
 * Uses login-based authentication
 * 
 * Run: node src/scripts/migrate-prices-now.js --dry-run
 *      node src/scripts/migrate-prices-now.js
 */

const OPENCART = {
  host: '147.93.31.253',
  port: 3306,
  user: 'oweg_user2',
  password: 'Oweg#@123',
  database: 'oweg_db',
};

const MEDUSA_URL = 'http://localhost:9000';

// Login credentials - you can change these
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@medusa-test.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'supersecret';

let authCookie = '';

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`\n🔄 Price Migration (${isDryRun ? 'DRY RUN' : 'LIVE'})\n`);

  let conn = null;
  let stats = { total: 0, matched: 0, updated: 0, errors: 0, errorDetails: [] };

  try {
    // Login to Medusa Admin
    console.log('🔐 Logging into Medusa Admin...');
    await login();
    console.log('✅ Authenticated\n');

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
      LIMIT 100
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
          console.log(`${ocName.slice(0, 45).padEnd(47)} → ₹${ocPrice}`);
        }
        continue;
      }

      // Update price
      try {
        await updatePrice(variantId, priceInCents);
        stats.updated++;
        if (stats.updated % 10 ===0) {
          console.log(`✅ ${stats.updated}/${stats.matched}...`);
        }
      } catch (err) {
        stats.errors++;
        if (stats.errors <= 3) {
          stats.errorDetails.push(`${ocName}: ${err.message}`);
        }
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log(`Total: ${stats.total} | Matched: ${stats.matched}`);
    if (!isDryRun) {
      console.log(`Updated: ${stats.updated} | Errors: ${stats.errors}`);
      if (stats.errorDetails.length > 0) {
        console.log('\nSample errors:');
        stats.errorDetails.forEach(e => console.log(`  - ${e}`));
      }
    }
    console.log('='.repeat(60) + '\n');

    if (isDryRun) {
      console.log('ℹ️  DRY RUN - Run without --dry-run to apply\n');
    } else {
      console.log('✅ Migration complete!\n');
    }

   } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

async function login() {
  const data = await httpPost(`${MEDUSA_URL}/admin/auth`, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  }, false); // Don't use auth for login

  // Extract cookie from response
  authCookie = data.cookie || '';
  if (!authCookie) {
    throw new Error('Login failed - no cookie received');
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
        'Cookie': authCookie,
      },
    };
    
    http.get(url, options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
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

function httpPost(url, body, useAuth = true) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(body);
    
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    };
    
    if (useAuth) {
      headers['Cookie'] = authCookie;
    }
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers,
    };

    const req = http.request(options, res => {
      let data = '';
      let cookie = '';
      
      // Capture Set-Cookie header
      if (res.headers['set-cookie']) {
        cookie = res.headers['set-cookie'].join('; ');
      }
      
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(data);
            resolve({ ...parsed, cookie });
          } catch (e) {
            resolve({ cookie });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

main();
