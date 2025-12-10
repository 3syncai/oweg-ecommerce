 
/**
 * OpenCart to Medusa Order Migration - Extract & Transform
 * 
 * Extracts orders from OpenCart MySQL and transforms to Medusa format
 * Limits to 50 orders for initial testing
 * 
 * Usage:
 *   node extract.js
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// OpenCart database configuration
const openCartConfig = {
  host: process.env.OPENCART_DB_HOST,
  port: parseInt(process.env.OPENCART_DB_PORT || '3306', 10),
  user: process.env.OPENCART_DB_USER,
  password: process.env.OPENCART_DB_PASSWORD,
  database: process.env.OPENCART_DB_NAME,
};

// Validate required environment variables
if (!openCartConfig.host || !openCartConfig.user || !openCartConfig.password || !openCartConfig.database) {
  throw new Error('Missing required OpenCart database environment variables (OPENCART_DB_HOST, OPENCART_DB_USER, OPENCART_DB_PASSWORD, OPENCART_DB_NAME)');
}

const ORDER_LIMIT = 50; // Initial limit for testing
const LANGUAGE_ID = 1; // English

/**
 * Map OpenCart status to Medusa status
 */
function mapStatusToMedusa(ocStatusName) {
  const name = (ocStatusName || '').toLowerCase();
  
  if (name.includes('cancel')) {
    return {
      status: 'canceled',
      payment_status: 'canceled',
      fulfillment_status: 'canceled',
    };
  }
  
  if (name.includes('refund')) {
    return {
      status: 'completed',
      payment_status: 'refunded',
      fulfillment_status: 'returned',
    };
  }
  
  if (name.includes('complete') || name.includes('completed')) {
    return {
      status: 'completed',
      payment_status: 'captured',
      fulfillment_status: 'fulfilled',
    };
  }
  
  if (name.includes('ship')) {
    return {
      status: 'completed',
      payment_status: 'captured',
      fulfillment_status: 'shipped',
    };
  }
  
  if (name.includes('processing') || name.includes('processed')) {
    return {
      status: 'pending',
      payment_status: 'captured',
      fulfillment_status: 'not_fulfilled',
    };
  }
  
  // default: pending
  return {
    status: 'pending',
    payment_status: 'awaiting',
    fulfillment_status: 'not_fulfilled',
  };
}

/**
 * Connect to OpenCart MySQL database
 */
async function connectOpenCart() {
  console.log('🔌 Connecting to OpenCart database...');
  return await mysql.createConnection(openCartConfig);
}

/**
 * Load lookup tables (status, country, zone)
 */
async function loadLookups(connection) {
  console.log('📚 Loading lookup tables...');
  
  const [statusRows] = await connection.query(
    'SELECT order_status_id, name FROM oc_order_status WHERE language_id = ?',
    [LANGUAGE_ID]
  );
  
  const [countryRows] = await connection.query(
    'SELECT country_id, iso_code_2 FROM oc_country'
  );
  
  const [zoneRows] = await connection.query(
    'SELECT zone_id, name FROM oc_zone'
  );
  
  const statusMap = new Map();
  statusRows.forEach((s) => statusMap.set(s.order_status_id, s.name));
  
  const countryMap = new Map();
  countryRows.forEach((c) => countryMap.set(c.country_id, c.iso_code_2));
  
  const zoneMap = new Map();
  zoneRows.forEach((z) => zoneMap.set(z.zone_id, z.name));
  
  console.log(`✅ Loaded ${statusMap.size} statuses, ${countryMap.size} countries, ${zoneMap.size} zones\n`);
  
  return { statusMap, countryMap, zoneMap };
}

/**
 * Transform single OpenCart order to Medusa format
 */
function transformOrder(
  ocOrder,
  orderProducts,
  orderTotals,
  orderOptions,
  orderHistory,
  lookups
) {
  const { statusMap, countryMap, zoneMap } = lookups;
  
  // Extract totals from oc_order_total
  let subtotal = 0;
  let shippingTotal = 0;
  let taxTotal = 0;
  let discountTotal = 0;
  let grandTotalFromTotals = 0;
  
  for (const t of orderTotals) {
    const code = t.code;
    const value = parseFloat(t.value) || 0;
    
    switch (code) {
      case 'sub_total':
        subtotal += value;
        break;
      case 'shipping':
        shippingTotal += value;
        break;
      case 'tax':
        taxTotal += value;
        break;
      case 'total':
        grandTotalFromTotals = value;
        break;
      case 'coupon':
      case 'discount':
      case 'reward':
        discountTotal += Math.abs(value);
        break;
    }
  }
  
  const ocTotal = parseFloat(ocOrder.total) || 0;
  const total = grandTotalFromTotals > 0 ? grandTotalFromTotals : ocTotal;
  
  // Transform line items
  const items = orderProducts.map((p) => {
    const itemOptions = orderOptions
      .filter((opt) => opt.order_product_id === p.order_product_id)
      .map((opt) => ({
        name: opt.name || '',
        value: opt.value || '',
      }));
    
    const quantity = parseInt(p.quantity) || 1;
    const unitPrice = parseFloat(p.price) || 0;
    const itemSubtotal = parseFloat(p.total) || 0;
    const tax = parseFloat(p.tax) || 0;
    
    return {
      product_id: parseInt(p.product_id),
      variant_id: null, // Will be mapped in loader script
      title: p.name || 'Unknown Product',
      model: p.model || undefined,
      quantity,
      unit_price: unitPrice,
      subtotal: itemSubtotal,
      tax,
      options: itemOptions,
    };
  });
  
  // Transform billing address
  const billingAddress = {
    first_name: ocOrder.payment_firstname || '',
    last_name: ocOrder.payment_lastname || '',
    company: ocOrder.payment_company || undefined,
    address_1: ocOrder.payment_address_1 || '',
    address_2: ocOrder.payment_address_2 || undefined,
    city: ocOrder.payment_city || '',
    postal_code: ocOrder.payment_postcode || '',
    province: ocOrder.payment_zone_id
      ? (zoneMap.get(ocOrder.payment_zone_id) || '')
      : '',
    country_code: ocOrder.payment_country_id
      ? ((countryMap.get(ocOrder.payment_country_id) || '').toLowerCase())
      : 'in',
    phone: ocOrder.telephone || undefined,
  };
  
  // Transform shipping address (fallback to billing if missing)
  const shippingAddress = {
    first_name: ocOrder.shipping_firstname || ocOrder.payment_firstname || '',
    last_name: ocOrder.shipping_lastname || ocOrder.payment_lastname || '',
    company: ocOrder.shipping_company || undefined,
    address_1: ocOrder.shipping_address_1 || ocOrder.payment_address_1 || '',
    address_2: ocOrder.shipping_address_2 || undefined,
    city: ocOrder.shipping_city || ocOrder.payment_city || '',
    postal_code: ocOrder.shipping_postcode || ocOrder.payment_postcode || '',
    province: ocOrder.shipping_zone_id
      ? (zoneMap.get(ocOrder.shipping_zone_id) || '')
      : billingAddress.province,
    country_code: ocOrder.shipping_country_id
      ? ((countryMap.get(ocOrder.shipping_country_id) || '').toLowerCase())
      : billingAddress.country_code,
    phone: ocOrder.telephone || undefined,
  };
  
  // Map status
  const ocStatusId = parseInt(ocOrder.order_status_id);
  const ocStatusName = statusMap.get(ocStatusId) || 'Unknown';
  const statusMapping = mapStatusToMedusa(ocStatusName);
  
  // Customer
  const firstName = ocOrder.firstname || ocOrder.payment_firstname || '';
  const lastName = ocOrder.lastname || ocOrder.payment_lastname || '';
  
  const customer = {
    email: ocOrder.email || '',
    first_name: firstName,
    last_name: lastName,
    phone: ocOrder.telephone || undefined,
  };
  
  // Metadata - preserve all OpenCart data
  const metadata = {
    opencart: {
      order_id: parseInt(ocOrder.order_id),
      status_id: ocStatusId,
      status_name: ocStatusName,
      store_id: ocOrder.store_id,
      store_name: ocOrder.store_name,
      store_url: ocOrder.store_url,
      ip: ocOrder.ip,
      forwarded_ip: ocOrder.forwarded_ip,
      user_agent: ocOrder.user_agent,
      accept_language: ocOrder.accept_language,
      affiliate_id: ocOrder.affiliate_id,
      affiliate: ocOrder.affiliate,
      commission: ocOrder.commission,
      marketing_id: ocOrder.marketing_id,
      tracking: ocOrder.tracking,
      comment: ocOrder.comment,
      history: orderHistory.map((h) => ({
        order_status_id: h.order_status_id,
        comment: h.comment,
        date_added: h.date_added,
      })),
    },
    source: 'opencart_migration',
    migrated_at: new Date().toISOString(),
  };
  
  // Format dates
  const formatDate = (dateValue) => {
    if (!dateValue) return new Date().toISOString();
    if (dateValue instanceof Date) return dateValue.toISOString();
    return new Date(dateValue).toISOString();
  };
  
  const order = {
    display_id: parseInt(ocOrder.order_id),
    currency_code: (ocOrder.currency_code || 'INR').toLowerCase(),
    email: ocOrder.email || '',
    customer,
    billing_address: billingAddress,
    shipping_address: shippingAddress,
    items,
    totals: {
      subtotal,
      shipping_total: shippingTotal,
      tax_total: taxTotal,
      discount_total: discountTotal,
      total,
    },
    status: statusMapping.status,
    payment_status: statusMapping.payment_status,
    fulfillment_status: statusMapping.fulfillment_status,
    shipping_method: {
      name: ocOrder.shipping_method || '',
      code: ocOrder.shipping_code || '',
      amount: shippingTotal,
    },
    payment: {
      method: ocOrder.payment_method || '',
      code: ocOrder.payment_code || '',
      amount: total,
    },
    created_at: formatDate(ocOrder.date_added),
    updated_at: formatDate(ocOrder.date_modified),
    metadata,
  };
  
  return order;
}

/**
 * Main extraction function
 */
async function extractOrders() {
  const connection = await connectOpenCart();
  
  try {
    // Load lookups
    const lookups = await loadLookups(connection);
    
    // Get total count
    const [countResult] = await connection.query(
      'SELECT COUNT(*) as total FROM oc_order'
    );
    const totalOrders = countResult[0].total;
    
    console.log(`📦 Found ${totalOrders} total orders in OpenCart`);
    console.log(`📝 Extracting first ${ORDER_LIMIT} orders for testing\n`);
    
    // Fetch limited orders
    const [orders] = await connection.query(
      'SELECT * FROM oc_order ORDER BY order_id ASC LIMIT ?',
      [ORDER_LIMIT]
    );
    
    console.log(`⏳ Processing ${orders.length} orders...\n`);
    
    const transformedOrders = [];
    
    for (let i = 0; i < orders.length; i++) {
      const ocOrder = orders[i];
      const orderId = ocOrder.order_id;
      
      console.log(`[${i + 1}/${orders.length}] Processing order #${orderId}...`);
      
      // Fetch related data
      const [orderProducts] = await connection.query(
        'SELECT * FROM oc_order_product WHERE order_id = ?',
        [orderId]
      );
      
      const [orderTotals] = await connection.query(
        'SELECT * FROM oc_order_total WHERE order_id = ?',
        [orderId]
      );
      
      const [orderOptions] = await connection.query(
        'SELECT * FROM oc_order_option WHERE order_id = ?',
        [orderId]
      );
      
      const [orderHistory] = await connection.query(
        'SELECT * FROM oc_order_history WHERE order_id = ? ORDER BY date_added',
        [orderId]
      );
      
      // Transform
      const transformed = transformOrder(
        ocOrder,
        orderProducts,
        orderTotals,
        orderOptions,
        orderHistory,
        lookups
      );
      
      transformedOrders.push(transformed);
      console.log(`   ✅ Order #${orderId}: ${orderProducts.length} items, ₹${transformed.totals.total.toFixed(2)}\n`);
    }
    
    // Write to JSON
    const outDir = path.join(__dirname, 'exports');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    
    const outFile = path.join(outDir, `medusa-orders-${ORDER_LIMIT}.json`);
    fs.writeFileSync(outFile, JSON.stringify(transformedOrders, null, 2), 'utf-8');
    
    console.log(`\n✅ Extraction Complete!`);
    console.log(`   - Orders extracted: ${transformedOrders.length}`);
    console.log(`   - Output file: ${outFile}`);
    console.log(`   - File size: ${(fs.statSync(outFile).size / 1024).toFixed(2)} KB\n`);
    console.log(`📊 Summary:`);
    console.log(`   - Total items: ${transformedOrders.reduce((sum, o) => sum + o.items.length, 0)}`);
    console.log(`   - Total value: ₹${transformedOrders.reduce((sum, o) => sum + o.totals.total, 0).toFixed(2)}`);
    console.log(`\n🎉 Ready to load! Run: cd my-medusa-store && npx medusa exec ./src/scripts/load-opencart-orders.ts\n`);
    
  } catch (error) {
    console.error('❌ Extraction failed:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

// Run if called directly
if (require.main === module) {
  extractOrders()
    .then(() => {
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = extractOrders;

