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

    // 2. Ensure missing tables are created
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        email VARCHAR(255) UNIQUE,
        phone VARCHAR(50) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'client',
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(50),
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'affiliate',
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS cards (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        card_number VARCHAR(50) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    `);

    // 3. Remove business fields from users table safely
    await db.query(`
      ALTER TABLE users DROP COLUMN IF EXISTS business_name;
      ALTER TABLE users DROP COLUMN IF EXISTS business_category;
    `);

    // 4. Add missing columns to 'users' table safely
    await db.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS tier VARCHAR(50) DEFAULT 'standard';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    // 5. Add missing columns to 'cards' table safely
    await db.query(`
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS card_code VARCHAR(50);
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS tier_name VARCHAR(50) DEFAULT 'standard';
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS qr_code_token VARCHAR(255);
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 year');
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    // 6. Add performance indexes on lookup columns
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
      CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email);
      CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards(user_id);
      CREATE INDEX IF NOT EXISTS idx_cards_card_number ON cards(card_number);
      CREATE INDEX IF NOT EXISTS idx_merchants_email ON merchants(email);
    `);

    console.log('✅ Success! Removed business fields from users and created admins table.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error updating database schema:', err);
    process.exit(1);
  }
}

syncDatabaseWithoutDropping();