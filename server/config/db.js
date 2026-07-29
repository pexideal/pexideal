/**
 * PostgreSQL Database Connection Pool
 * File: server/config/db.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const dbUrl = process.env.DATABASE_URL || '';

// Automatically detect if SSL is needed (Neon, Supabase, Render, or explicit SSL string)
const useSSL = 
  process.env.NODE_ENV === 'production' || 
  dbUrl.includes('neon.tech') || 
  dbUrl.includes('supabase') || 
  dbUrl.includes('sslmode=require');

const pool = new Pool({
  connectionString: dbUrl,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  
  // Connection Pool & Timeout Safeguards
  max: 10,                          // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,         // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000,   // Give server 10s to establish initial connection
  
  // Keep TCP socket alive to prevent cloud DB timeouts
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});

// Handle unexpected errors on idle pool clients without crashing Node process
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle PostgreSQL client:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool
};