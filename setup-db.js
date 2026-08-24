/**
 * Database Setup & Migration Script
 * File: setup-db.js
 */
const db = require('./server/config/db');

async function createTables() {
  try {
    console.log('🔄 Syncing database tables with Neon PostgreSQL...');

    // 1. Enable UUID extension for cryptographically secure ID generation
    await db.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // 2. Create core tables matching application schema
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        email VARCHAR(255) UNIQUE,
        phone VARCHAR(50) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'client',
        tier VARCHAR(50) DEFAULT 'standard',
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS merchants (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        business_name VARCHAR(255) NOT NULL,
        category VARCHAR(100) DEFAULT 'General',
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(50),
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'affiliate',
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS cards (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        card_number VARCHAR(50) UNIQUE NOT NULL,
        card_code VARCHAR(50),
        tier_name VARCHAR(50) DEFAULT 'standard',
        qr_code_token VARCHAR(255),
        status VARCHAR(20) DEFAULT 'active',
        expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 year'),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS redemptions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        card_id UUID REFERENCES cards(id) ON DELETE CASCADE,
        merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        store_id VARCHAR(100),
        discount_amount NUMERIC(10, 2) DEFAULT 0.00,
        status VARCHAR(20) DEFAULT 'completed',
        redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Safe migrations for existing databases
    await db.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS tier VARCHAR(50) DEFAULT 'standard';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS card_code VARCHAR(50);
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS qr_code_token VARCHAR(255);
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 year');
    `);

    // 4. Create indexes for quick user authentication & card lookups
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
      CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards(user_id);
      CREATE INDEX IF NOT EXISTS idx_cards_card_number ON cards(card_number);
      CREATE INDEX IF NOT EXISTS idx_merchants_email ON merchants(email);
    `);

    console.log('✅ Database schema and table constraints synced successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error updating database schema:', err);
    process.exit(1);
  }
}

createTables();