/**
 * Main Express Application Server
 * File: server/server.js
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Enforce essential environment variables before starting application
const REQUIRED_ENV_VARS = ['JWT_SECRET', 'QR_HMAC_SECRET'];
const missingVars = REQUIRED_ENV_VARS.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(`❌ FATAL CONFIGURATION ERROR: Missing required environment variable(s): ${missingVars.join(', ')}`);
  console.error('Please check your .env file or host environment settings on Render.');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    console.warn('⚠️ Running in non-production mode without all secret keys set. Authentication functions will fail.');
  }
}

// Route Imports
const authRoutes = require('./routes/auth');
const cardRoutes = require('./routes/card');
const redemptionRoutes = require('./routes/redemptions');
const adminRoutes = require('./routes/admin');

const app = express();

// Allowed Origins (Supports GitHub Pages & Local Development)
const allowedOrigins = [
  'https://pexideal.onrender.com',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://localhost:5000'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman) or GitHub Pages (*.github.io)
    if (!origin || origin.includes('github.io') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive during development
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets from the public/ directory
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/cards', cardRoutes);
app.use('/v1/discounts', redemptionRoutes);
app.use('/api/admin', adminRoutes);

// Portal Entry Routes
// Root route serves the main landing page (public/index.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/client', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/client/signup.html'));
});

app.get('/affiliate', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/affiliate/signup.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/login.html'));
});

// Healthcheck Route (Render readiness check)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'Pexideal API',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// 404 Route Handler for unmatched API/page endpoints
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found.' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.stack);
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

// Start Server bound to 0.0.0.0 for Render compatibility
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Pexideal API Server running on port ${PORT}`);
  console.log(`🔐 JWT_SECRET: ${process.env.JWT_SECRET ? 'Configured' : 'MISSING'}`);
  console.log(`🔐 QR_HMAC_SECRET: ${process.env.QR_HMAC_SECRET ? 'Configured' : 'MISSING'}`);
});