/**
 * Database Setup & Migration Script
 * File: setup-db.js
 */
const db = require('./server/config/db');

async function createTables() {
  try {
    console.log('🔄 Syncing database tables...');

    // 1. Create tables with status columns included
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        business_name VARCHAR(150),
        business_category VARCHAR(100),
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(50),
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'client',
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS cards (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        card_number VARCHAR(50) UNIQUE NOT NULL,
        card_code VARCHAR(50),
        tier_name VARCHAR(50) DEFAULT 'standard',
        qr_code_token VARCHAR(255) NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS redemptions (
        id SERIAL PRIMARY KEY,
        user_id INT,
        card_id INT,
        store_id VARCHAR(100),
        redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Add status columns to existing tables in case they already exist
    await db.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS card_code VARCHAR(50);
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS qr_code_token VARCHAR(255);
    `);

    console.log('✅ Database schema updated with status column successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error updating database schema:', err);
    process.exit(1);
  }
}

createTables();