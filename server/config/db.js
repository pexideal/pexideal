/**
 * PostgreSQL Database Connection Pool
 * File: server/config/db.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const dbUrl = process.env.DATABASE_URL || '';

// Detect SSL requirements (Neon, Supabase, Render, or sslmode parameters)
const requiresSSL = 
  process.env.NODE_ENV === 'production' || 
  dbUrl.includes('neon.tech') || 
  dbUrl.includes('supabase') || 
  dbUrl.includes('sslmode=');

const pool = new Pool({
  connectionString: dbUrl,
  // Use explicit SSL configuration for cloud databases
  ssl: requiresSSL ? { rejectUnauthorized: false } : false,
  
  // Connection Pool & Timeout Safeguards
  max: 10,                          // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,         // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000,   // Give server 10s to establish connection
  
  // Keep TCP socket alive to prevent cloud DB timeouts
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});

// Test and log initial connection attempt
pool.connect((err, client, release) => {
  if (err) {
    console.error('====================================');
    console.error('❌ POSTGRES DB CONNECTION ERROR:');
    console.error('Message:', err.message);
    console.error('Code:', err.code);
    console.error('====================================');
  } else {
    console.log('✅ Connected successfully to Neon PostgreSQL database.');
    release();
  }
});

// Handle unexpected errors on idle pool clients without crashing process
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle PostgreSQL client:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool
};