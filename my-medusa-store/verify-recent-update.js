import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const MEDUSA_URL = 'http://localhost:9000';
const ADMIN_EMAIL = 'admin@medusa-test.com';
const ADMIN_PASSWORD = 'supersecret';

async function getAdminToken() {
  const endpoint = `${MEDUSA_URL}/auth/user/emailpass`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const json = await res.json();
  return json.token;
}

async function checkRecentUploads() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║     Verify Recent Manual Uploads to S3              ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const token = await getAdminToken();

  // Fetch 5 most recent products
  const res = await fetch(
    `${MEDUSA_URL}/admin/products?limit=5&order=-created_at`,
    {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  const data = await res.json();
  const products = data.products || [];

  if (products.length === 0) {
    console.log('⚠️  No products found');
    return;
  }

  console.log('📦 Last 5 Products:\n');
  console.log('─'.repeat(80));

  products.forEach((product, idx) => {
    const images = product.images || [];
    const thumbnail = product.thumbnail;
    const createdAt = new Date(product.created_at).toLocaleString();
    
    console.log(`\n${idx + 1}. ${product.title}`);
    console.log(`   Created: ${createdAt}`);
    console.log(`   Product ID: ${product.id}`);
    
    if (thumbnail) {
      const isS3 = thumbnail.includes('s3.amazonaws.com') || thumbnail.includes('s3.ap-south-1.amazonaws.com');
      const isLocal = thumbnail.includes('/uploads/');
      
      console.log(`   Thumbnail: ${isS3 ? '✅ S3' : isLocal ? '❌ LOCAL' : '⚠️ OTHER'}`);
      console.log(`   URL: ${thumbnail.substring(0, 70)}...`);
    } else {
      console.log(`   Thumbnail: ⚠️ No thumbnail`);
    }
    
    if (images.length > 0) {
      console.log(`   Additional Images: ${images.length}`);
      images.forEach((img, i) => {
        const isS3 = img.url.includes('s3.amazonaws.com') || img.url.includes('s3.ap-south-1.amazonaws.com');
        const isLocal = img.url.includes('/uploads/');
        console.log(`     ${i + 1}. ${isS3 ? '✅ S3' : isLocal ? '❌ LOCAL' : '⚠️ OTHER'}: ${img.url.substring(0, 60)}...`);
      });
    }
  });

  console.log('\n' + '═'.repeat(80));
  console.log('\n💡 Instructions:');
  console.log('   1. Add a product manually in Medusa Admin');
  console.log('   2. Run this script again to verify the upload location');
  console.log('   3. Look for ✅ S3 markers above\n');
}

checkRecentUploads().catch((e) => console.error('\n❌ Error:', e.message));