/**
 * Clear Test Data Script
 * File: clear-db.js
 */
const db = require('./server/config/db');

async function clearTables() {
  try {
    console.log('🔄 Clearing test user data...');
    
    // TRUNCATE empties the tables and resets primary key IDs back to 1
    await db.query(`TRUNCATE users, cards, redemptions RESTART IDENTITY CASCADE;`);

    console.log('✅ Database cleared! You can now reuse your email addresses.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error clearing tables:', err);
    process.exit(1);
  }
}

clearTables();