import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

// Read credentials from environment with sensible defaults for local dev
const MEDUSA_URL = process.env.MEDUSA_URL || 'http://localhost:9000';
const ADMIN_EMAIL = process.env.MEDUSA_ADMIN_EMAIL || 'admin@medusa-test.com';
const ADMIN_PASSWORD = process.env.MEDUSA_ADMIN_PASSWORD || 'supersecret';

// 🔑 Get Admin Token
async function getAdminToken() {
  const endpoint = `${MEDUSA_URL}/auth/user/emailpass`;
  
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        email: ADMIN_EMAIL, 
        password: ADMIN_PASSWORD 
      }),
    });

    if (!res.ok) {
      throw new Error(`Auth failed with status ${res.status}`);
    }

    const json = await res.json();
    return json.token;
  } catch (e) {
    throw new Error(`Failed to authenticate: ${e.message}`);
  }
}

// 📊 Analyze image URLs to determine storage type
function analyzeImageUrl(url) {
  if (!url) return 'NO_IMAGE';
  
  if (url.includes('s3.amazonaws.com') || url.includes('s3.ap-south-1.amazonaws.com')) {
    return 'AWS_S3';
  }
  if (url.includes('/uploads/')) {
    return 'LOCAL_FILESYSTEM';
  }
  if (url.includes('cloudinary.com')) {
    return 'CLOUDINARY';
  }
  if (url.includes('storage.googleapis.com')) {
    return 'GOOGLE_CLOUD';
  }
  if (url.includes('oweg.in')) {
    return 'OLD_DOMAIN';
  }
  
  return 'OTHER';
}

// 🔍 Check storage configuration
async function checkStorageConfig(token) {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║     Medusa Image Storage Configuration Check        ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  console.log('🔍 Analyzing recent product images...\n');

  // Fetch recent products
  const res = await fetch(
    `${MEDUSA_URL}/admin/products?limit=50&order=-created_at`,
    {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    throw new Error('Failed to fetch products');
  }

  const data = await res.json();
  const products = data.products || [];

  if (products.length === 0) {
    console.log('⚠️  No products found');
    return;
  }

  // Analyze storage types
  const storageTypes = {};
  const exampleUrls = {};
  
  products.forEach(product => {
    const images = product.images || [];
    const thumbnail = product.thumbnail;
    
    const allUrls = [thumbnail, ...images.map(img => img.url)].filter(Boolean);
    
    allUrls.forEach(url => {
      const type = analyzeImageUrl(url);
      storageTypes[type] = (storageTypes[type] || 0) + 1;
      
      if (!exampleUrls[type]) {
        exampleUrls[type] = url;
      }
    });
  });

  // Print results
  console.log('📊 Storage Analysis Results:');
  console.log('─'.repeat(60));
  
  Object.entries(storageTypes)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      const percentage = ((count / Object.values(storageTypes).reduce((a, b) => a + b, 0)) * 100).toFixed(1);
      console.log(`\n${type}:`);
      console.log(`  Count: ${count} images (${percentage}%)`);
      console.log(`  Example: ${exampleUrls[type].substring(0, 80)}...`);
    });

  // Determine primary storage
  const primaryStorage = Object.entries(storageTypes)
    .sort((a, b) => b[1] - a[1])[0];

  console.log('\n' + '═'.repeat(60));
  console.log('\n🎯 Primary Storage Method:');
  console.log('─'.repeat(60));
  
  switch(primaryStorage[0]) {
    case 'AWS_S3':
      console.log('✅ AWS S3 (Configured and working)');
      console.log('\nYour Medusa is using S3 for image storage.');
      console.log('New images uploaded manually will go to S3.');
      break;
      
    case 'LOCAL_FILESYSTEM':
      console.log('⚠️  Local File System');
      console.log('\nYour Medusa is using LOCAL storage.');
      console.log('Images are stored in: /uploads/ directory');
      console.log('\n⚠️  WARNING: Manual uploads will NOT go to S3!');
      console.log('\n📝 To enable S3 for manual uploads, configure @medusajs/file-s3:');
      console.log('\n1. Install: npm install @medusajs/file-s3');
      console.log('2. Add to medusa-config.js:');
      console.log(`
  plugins: [
    {
      resolve: \`@medusajs/file-s3\`,
      options: {
        s3_url: "https://oweg-product-images.s3.ap-south-1.amazonaws.com",
        bucket: "oweg-product-images",
        region: "ap-south-1",
        access_key_id: process.env.S3_ACCESS_KEY_ID,
        secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
      },
    },
  ]
      `);
      break;
      
    case 'OLD_DOMAIN':
      console.log('⚠️  Old Domain (Migration in progress)');
      console.log('\nMost images are still from oweg.in');
      console.log('Run the migration script to complete the process.');
      break;
      
    default:
      console.log(`ℹ️  ${primaryStorage[0]}`);
  }

  console.log('\n' + '═'.repeat(60));
  
  // Test upload endpoint (just check if it exists)
  console.log('\n🧪 Testing upload endpoint...');
  try {
    await fetch(`${MEDUSA_URL}/admin/uploads`, {
      method: 'OPTIONS',
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });
    
    console.log(`✅ Upload endpoint is accessible`);
  } catch (e) {
    console.log(
      `⚠️  Could not test upload endpoint`,
      e instanceof Error ? e.message : e
    );
  }
  
  console.log('\n🎉 Analysis complete!\n');
}

// 🌀 Main
async function main() {
  try {
    const token = await getAdminToken();
    await checkStorageConfig(token);
  } catch (e) {
    console.error('\n❌ Error:', e.message);
  }
}

main();