/**
 * Create Vendor Tables Script
 * 
 * This script creates vendor and vendor_user tables with all fields
 * matching the signup form exactly
 * 
 * Usage:
 *   npx medusa exec ./src/scripts/create-vendor-tables.ts
 */

import { Client } from "pg"

type ScriptArgs = {
  container: unknown
}

export default async function createVendorTables({ container }: ScriptArgs) {
  void container
  console.log('🔨 Creating vendor tables...\n')
  
  let client: Client | null = null
  
  try {
    // Get database URL from environment
    const databaseUrl = process.env.DATABASE_URL
    
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is not set")
    }
    
    // Create PostgreSQL client
    client = new Client({
      connectionString: databaseUrl,
    })
    
    await client.connect()
    console.log('✅ Connected to database\n')
    
    // Create vendor table with ALL fields from signup form
    console.log('📦 Creating vendor table...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS "vendor" (
        "id" text NOT NULL,
        "name" text NOT NULL,
        "first_name" text NULL,
        "last_name" text NULL,
        "email" text NOT NULL,
        "phone" text NULL,
        "telephone" text NULL,
        "pan_gst" text NULL,
        "gst_no" text NULL,
        "pan_no" text NULL,
        "documents" jsonb NULL,
        "store_name" text NULL,
        "store_phone" text NULL,
        "store_address" text NULL,
        "store_country" text NULL,
        "store_region" text NULL,
        "store_city" text NULL,
        "store_pincode" text NULL,
        "store_logo" text NULL,
        "store_banner" text NULL,
        "shipping_policy" text NULL,
        "return_policy" text NULL,
        "whatsapp_number" text NULL,
        "bank_name" text NULL,
        "account_no" text NULL,
        "ifsc_code" text NULL,
        "cancel_cheque_url" text NULL,
        "is_approved" boolean NOT NULL DEFAULT false,
        "approved_at" timestamptz NULL,
        "approved_by" text NULL,
        "marketplace_seller_id" text NULL,
        "metadata" jsonb NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "vendor_pkey" PRIMARY KEY ("id")
      );
    `)
    
    // Create unique index on email
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_email_unique" 
      ON "vendor" ("email") WHERE deleted_at IS NULL;
    `)
    
    // Create index on deleted_at
    await client.query(`
      CREATE INDEX IF NOT EXISTS "IDX_vendor_deleted_at" 
      ON "vendor" ("deleted_at") WHERE deleted_at IS NULL;
    `)
    
    console.log('✅ vendor table created')
    
    // Create vendor_user table
    console.log('📦 Creating vendor_user table...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS "vendor_user" (
        "id" text NOT NULL,
        "email" text NOT NULL,
        "password_hash" text NOT NULL,
        "last_login_at" timestamptz NULL,
        "must_reset_password" boolean NOT NULL DEFAULT false,
        "metadata" jsonb NULL,
        "vendor_id" text NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "vendor_user_pkey" PRIMARY KEY ("id")
      );
    `)
    
    // Create unique index on email
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_user_email_unique" 
      ON "vendor_user" ("email") WHERE deleted_at IS NULL;
    `)
    
    // Create index on deleted_at
    await client.query(`
      CREATE INDEX IF NOT EXISTS "IDX_vendor_user_deleted_at" 
      ON "vendor_user" ("deleted_at") WHERE deleted_at IS NULL;
    `)
    
    console.log('✅ vendor_user table created')
    
    console.log('\n📋 Tables created with all fields from signup form:')
    console.log('\n   vendor table fields (matching signup form):')
    console.log('     Step 1 - Personal:')
    console.log('       - firstName → first_name')
    console.log('       - lastName → last_name')
    console.log('       - telephone → telephone')
    console.log('       - email → email')
    console.log('     Step 2 - Store:')
    console.log('       - storeName → store_name')
    console.log('       - storePhone → store_phone')
    console.log('       - storeAddress → store_address')
    console.log('       - storeCountry → store_country')
    console.log('       - storeRegion → store_region')
    console.log('       - storeCity → store_city')
    console.log('       - pincode → store_pincode')
    console.log('       - shippingPolicy → shipping_policy')
    console.log('       - returnPolicy → return_policy')
    console.log('       - whatsappNumber → whatsapp_number')
    console.log('       - storeLogo → store_logo (file URL)')
    console.log('       - storeBanner → store_banner (file URL)')
    console.log('     Step 3 - Payment:')
    console.log('       - bankName → bank_name')
    console.log('       - accountNo → account_no')
    console.log('       - ifscCode → ifsc_code')
    console.log('       - gstNo → gst_no')
    console.log('       - panNo → pan_no')
    console.log('       - cancelCheque → cancel_cheque_url (file URL)')
    console.log('       - additionalDocuments → documents (JSONB array)')
    console.log('\n   vendor_user table fields:')
    console.log('       - id, email, password_hash, last_login_at, must_reset_password,')
    console.log('         metadata, vendor_id')
    
    console.log('\n✅ All tables created successfully!')
    
  } catch (error: any) {
    console.error('❌ Error creating tables:', error.message)
    if (error.stack) {
      console.error(error.stack)
    }
  } finally {
    if (client) {
      await client.end()
    }
  }
}

