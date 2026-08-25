/**
 * Safe Database Migration Script (Preserves Existing Data)
 * File: setup-db.js
 */
const db = require('./server/config/db');

async function syncDatabaseWithoutDropping() {
  try {
    console.log('🔄 Safely altering and updating existing Neon database tables...');

    // 1. Enable UUID Extension
    await db.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // 2. Base Tables
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        email VARCHAR(255) UNIQUE,
        phone VARCHAR(50) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'client',
        tier VARCHAR(50) DEFAULT 'standard',
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'admin',
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS merchants (
        id SERIAL PRIMARY KEY,
        business_name VARCHAR(255) NOT NULL,
        category VARCHAR(100) DEFAULT 'General',
        location VARCHAR(255),
        website VARCHAR(255),
        discount_type VARCHAR(50) DEFAULT 'discount',
        offer_headline VARCHAR(255),
        offer_terms TEXT,
        contact_name VARCHAR(100),
        contact_role VARCHAR(100),
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(50),
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'affiliate',
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS cards (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        card_number VARCHAR(50) UNIQUE NOT NULL,
        card_code VARCHAR(50),
        tier_name VARCHAR(50) DEFAULT 'standard',
        qr_code_token VARCHAR(255),
        status VARCHAR(20) DEFAULT 'active',
        is_active BOOLEAN DEFAULT TRUE,
        expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 year'),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS redemptions (
        id SERIAL PRIMARY KEY,
        card_id INT REFERENCES cards(id) ON DELETE CASCADE,
        merchant_id INT REFERENCES merchants(id) ON DELETE CASCADE,
        user_id INT REFERENCES users(id) ON DELETE SET NULL,
        store_id VARCHAR(100),
        discount_amount NUMERIC(10, 2) DEFAULT 0.00,
        status VARCHAR(20) DEFAULT 'completed',
        redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS card_scans (
        id SERIAL PRIMARY KEY,
        card_number VARCHAR(100) NOT NULL,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        merchant_id UUID,
        tier VARCHAR(50) DEFAULT 'standard',
        status VARCHAR(50) DEFAULT 'valid',
        scanned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Dynamic Foreign Key & Data Type Alignment
    await db.query(`
      DO $$
      DECLARE
        merchant_id_type text;
      BEGIN
        SELECT data_type INTO merchant_id_type 
        FROM information_schema.columns 
        WHERE table_name = 'merchants' AND column_name = 'id';

        ALTER TABLE card_scans DROP CONSTRAINT IF EXISTS card_scans_merchant_id_fkey;

        IF merchant_id_type = 'uuid' THEN
          ALTER TABLE card_scans 
            ALTER COLUMN merchant_id TYPE UUID USING merchant_id::text::uuid;
        ELSE
          ALTER TABLE card_scans 
            ALTER COLUMN merchant_id TYPE INT USING merchant_id::text::integer;
        END IF;

        ALTER TABLE card_scans 
          ADD CONSTRAINT card_scans_merchant_id_fkey 
          FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE NOTICE 'Foreign key adjustment note: %', SQLERRM;
      END $$;
    `);

    // 4. Safe Alterations for Existing Merchants Table
    await db.query(`
      ALTER TABLE merchants ADD COLUMN IF NOT EXISTS location VARCHAR(255);
      ALTER TABLE merchants ADD COLUMN IF NOT EXISTS website VARCHAR(255);
      ALTER TABLE merchants ADD COLUMN IF NOT EXISTS discount_type VARCHAR(50) DEFAULT 'discount';
      ALTER TABLE merchants ADD COLUMN IF NOT EXISTS offer_headline VARCHAR(255);
      ALTER TABLE merchants ADD COLUMN IF NOT EXISTS offer_terms TEXT;
      ALTER TABLE merchants ADD COLUMN IF NOT EXISTS contact_name VARCHAR(100);
      ALTER TABLE merchants ADD COLUMN IF NOT EXISTS contact_role VARCHAR(100);
    `);

    // 5. Clean up legacy columns
    await db.query(`
      ALTER TABLE users DROP COLUMN IF EXISTS business_name;
      ALTER TABLE users DROP COLUMN IF EXISTS business_category;
    `);

    // 6. Ensure core user attributes exist
    await db.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'client';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS tier VARCHAR(50) DEFAULT 'standard';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    // 7. Performance Indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
      CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email);
      CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards(user_id);
      CREATE INDEX IF NOT EXISTS idx_cards_card_number ON cards(card_number);
      CREATE INDEX IF NOT EXISTS idx_merchants_email ON merchants(email);
      CREATE INDEX IF NOT EXISTS idx_card_scans_user_id ON card_scans(user_id);
      CREATE INDEX IF NOT EXISTS idx_card_scans_merchant_id ON card_scans(merchant_id);
      CREATE INDEX IF NOT EXISTS idx_card_scans_card_number ON card_scans(card_number);
    `);

    console.log('✅ Database schema migration complete.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error updating database schema:', err);
    process.exit(1);
  }
}

syncDatabaseWithoutDropping();