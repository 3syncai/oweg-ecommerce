/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * OpenCart to Medusa Migration Script
 * 
 * This script migrates products from OpenCart MySQL database to Medusa PostgreSQL
 * 
 * Usage:
 *   node scripts/migrate-opencart-to-medusa.js
 * 
 * Environment Variables Required:
 *   - DATABASE_URL: Medusa PostgreSQL connection
 *   - OPENCART_DB_HOST: OpenCart MySQL host
 *   - OPENCART_DB_USER: OpenCart MySQL user
 *   - OPENCART_DB_PASSWORD: OpenCart MySQL password
 *   - OPENCART_DB_NAME: OpenCart MySQL database name
 */

const mysql = require('mysql2/promise');
const { createProductsWorkflow } = require('@medusajs/medusa/core-flows');
const { Modules, ProductStatus } = require('@medusajs/framework/utils');

// OpenCart database configuration
const openCartConfig = {
  host: process.env.OPENCART_DB_HOST || '147.93.31.253',
  port: parseInt(process.env.OPENCART_DB_PORT || '3306', 10),
  user: process.env.OPENCART_DB_USER || 'oweg_user2',
  password: process.env.OPENCART_DB_PASSWORD || 'Oweg#@123',
  database: process.env.OPENCART_DB_NAME || 'oweg_db',
};

// Migration configuration
const BATCH_SIZE = 50; // Products per batch
const LANGUAGE_ID = 1; // English language ID in OpenCart

/**
 * Connect to OpenCart MySQL database
 */
async function connectOpenCart() {
  console.log('Connecting to OpenCart database...');
  return await mysql.createConnection(openCartConfig);
}

/**
 * Fetch OpenCart products with all related data
 */
async function fetchOpenCartProducts(connection, limit, offset) {
  const query = `
    SELECT 
      p.product_id,
      p.model,
      p.sku,
      p.upc,
      p.ean,
      p.jan,
      p.isbn,
      p.mpn,
      p.location,
      p.quantity,
      p.stock_status_id,
      p.image as main_image,
      p.manufacturer_id,
      p.shipping,
      p.price,
      p.points,
      p.tax_class_id,
      p.date_available,
      p.weight,
      p.weight_class_id,
      p.length,
      p.width,
      p.height,
      p.length_class_id,
      p.subtract,
      p.minimum,
      p.sort_order,
      p.status,
      p.viewed,
      p.date_added,
      p.date_modified,
      pd.name,
      pd.description,
      pd.tag,
      pd.meta_title,
      pd.meta_description,
      pd.meta_keyword
    FROM oc_product p
    LEFT JOIN oc_product_description pd 
      ON p.product_id = pd.product_id 
      AND pd.language_id = ?
    WHERE p.status = 1
    ORDER BY p.product_id ASC
    LIMIT ? OFFSET ?
  `;

  const [products] = await connection.execute(query, [LANGUAGE_ID, limit, offset]);
  return products;
}

/**
 * Fetch product images from OpenCart
 */
async function fetchProductImages(connection, productId) {
  const query = `
    SELECT image, sort_order
    FROM oc_product_image
    WHERE product_id = ?
    ORDER BY sort_order ASC
  `;
  
  const [images] = await connection.execute(query, [productId]);
  return images;
}

/**
 * Fetch product categories from OpenCart
 */
async function fetchProductCategories(connection, productId) {
  const query = `
    SELECT c.category_id, cd.name
    FROM oc_product_to_category ptc
    LEFT JOIN oc_category c ON ptc.category_id = c.category_id
    LEFT JOIN oc_category_description cd 
      ON c.category_id = cd.category_id 
      AND cd.language_id = ?
    WHERE ptc.product_id = ?
  `;
  
  const [categories] = await connection.execute(query, [LANGUAGE_ID, productId]);
  return categories;
}

/**
 * Fetch or create Medusa category
 */
async function getOrCreateMedusaCategory(container, categoryName) {
  const productModuleService = container.resolve(Modules.PRODUCT);
  
  try {
    // Try to find existing category
    const categories = await productModuleService.listProductCategories({
      name: categoryName,
    });
    
    if (categories.length > 0) {
      return categories[0].id;
    }
    
    // Create new category
    const newCategory = await productModuleService.createProductCategories({
      name: categoryName,
      is_active: true,
    });
    
    return newCategory[0].id;
  } catch (error) {
    console.error(`Error creating category ${categoryName}:`, error.message);
    return null;
  }
}

/**
 * Map OpenCart image URL to Medusa format
 */
function mapImageUrl(openCartImage) {
  if (!openCartImage) return null;
  
  // If already full URL, return as is
  if (openCartImage.startsWith('http')) {
    return openCartImage;
  }
  
  // Construct full URL (adjust based on your OpenCart setup)
  const baseUrl = process.env.OPENCART_IMAGE_BASE_URL || 'https://www.oweg.in/image/';
  return `${baseUrl}${openCartImage}`;
}

/**
 * Convert OpenCart product to Medusa format
 */
async function convertToMedusaProduct(ocProduct, images, categories, container) {
  const categoryIds = [];
  
  // Map categories
  for (const cat of categories) {
    if (cat.name) {
      const categoryId = await getOrCreateMedusaCategory(container, cat.name);
      if (categoryId) {
        categoryIds.push(categoryId);
      }
    }
  }
  
  // Map images
  const medusaImages = [];
  
  // Add main image
  if (ocProduct.main_image) {
    medusaImages.push({
      url: mapImageUrl(ocProduct.main_image),
    });
  }
  
  // Add additional images
  for (const img of images) {
    if (img.image) {
      medusaImages.push({
        url: mapImageUrl(img.image),
      });
    }
  }
  
  // Create product handle from name
  const handle = (ocProduct.name || ocProduct.model || `product-${ocProduct.product_id}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
  
  return {
    title: ocProduct.name || ocProduct.model || `Product ${ocProduct.product_id}`,
    subtitle: ocProduct.meta_title || null,
    description: ocProduct.description || '',
    handle: `${handle}-${ocProduct.product_id}`,
    is_giftcard: false,
    status: ocProduct.status === 1 ? ProductStatus.PUBLISHED : ProductStatus.DRAFT,
    weight: parseFloat(ocProduct.weight) || 0,
    length: parseFloat(ocProduct.length) || null,
    width: parseFloat(ocProduct.width) || null,
    height: parseFloat(ocProduct.height) || null,
    origin_country: null,
    hs_code: null,
    mid_code: null,
    material: null,
    images: medusaImages.length > 0 ? medusaImages : undefined,
    category_ids: categoryIds.length > 0 ? categoryIds : undefined,
    tags: ocProduct.tag ? ocProduct.tag.split(',').map(t => ({ value: t.trim() })) : undefined,
    variants: [
      {
        title: 'Default',
        sku: ocProduct.sku || ocProduct.model || `SKU-${ocProduct.product_id}`,
        ean: ocProduct.ean || null,
        upc: ocProduct.upc || null,
        barcode: ocProduct.isbn || ocProduct.mpn || null,
        inventory_quantity: parseInt(ocProduct.quantity) || 0,
        manage_inventory: ocProduct.subtract === 1,
        allow_backorder: false,
        prices: [
          {
            amount: Math.round(parseFloat(ocProduct.price) * 100), // Convert to cents
            currency_code: 'inr',
          },
        ],
      },
    ],
    metadata: {
      opencart_id: ocProduct.product_id,
      opencart_model: ocProduct.model,
      viewed: ocProduct.viewed || 0,
      date_added: ocProduct.date_added,
      migrated_at: new Date().toISOString(),
    },
  };
}

/**
 * Main migration function
 */
async function migrateProducts(container) {
  const ocConnection = await connectOpenCart();
  
  try {
    // Get total count
    const [countResult] = await ocConnection.execute(
      'SELECT COUNT(*) as total FROM oc_product WHERE status = 1'
    );
    const totalProducts = countResult[0].total;
    
    console.log(`\n📦 Found ${totalProducts} products to migrate\n`);
    
    let offset = 0;
    let migrated = 0;
    let failed = 0;
    
    while (offset < totalProducts) {
      console.log(`\n--- Processing batch: ${offset + 1} to ${Math.min(offset + BATCH_SIZE, totalProducts)} ---`);
      
      // Fetch batch of products
      const products = await fetchOpenCartProducts(ocConnection, BATCH_SIZE, offset);
      
      for (const ocProduct of products) {
        try {
          console.log(`Migrating: ${ocProduct.name} (ID: ${ocProduct.product_id})`);
          
          // Fetch related data
          const images = await fetchProductImages(ocConnection, ocProduct.product_id);
          const categories = await fetchProductCategories(ocConnection, ocProduct.product_id);
          
          // Convert to Medusa format
          const medusaProduct = await convertToMedusaProduct(
            ocProduct,
            images,
            categories,
            container
          );
          
          // Create product in Medusa
          await createProductsWorkflow(container).run({
            input: {
              products: [medusaProduct],
            },
          });
          
          migrated++;
          console.log(`✅ Success: ${ocProduct.name}`);
          
        } catch (error) {
          failed++;
          console.error(`❌ Failed to migrate ${ocProduct.name}:`, error.message);
        }
      }
      
      offset += BATCH_SIZE;
      
      // Progress update
      console.log(`\n📊 Progress: ${migrated} migrated, ${failed} failed, ${totalProducts - offset} remaining\n`);
    }
    
    console.log(`\n✅ Migration Complete!`);
    console.log(`   - Total: ${totalProducts}`);
    console.log(`   - Migrated: ${migrated}`);
    console.log(`   - Failed: ${failed}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await ocConnection.end();
  }
}

/**
 * Script entry point
 */
async function main() {
  console.log('🚀 Starting OpenCart to Medusa Migration...\n');
  
  // This would be called from Medusa exec context
  // For now, show instructions
  console.log(`
⚠️  This script needs to be run via Medusa exec:

cd my-medusa-store
npx medusa exec ./scripts/migrate-opencart-to-medusa.js

Make sure these environment variables are set in .env:
- DATABASE_URL (Medusa PostgreSQL)
- OPENCART_DB_HOST
- OPENCART_DB_USER  
- OPENCART_DB_PASSWORD
- OPENCART_DB_NAME
  `);
}

// If run directly
if (require.main === module) {
  main().catch(console.error);
}

// Export for Medusa exec
module.exports = migrateProducts;

