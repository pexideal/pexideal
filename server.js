/**
 * Main Express Application Server
 * File: server.js
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Route Imports
const authRoutes = require('./server/routes/auth');
const verifyRoutes = require('./server/routes/verify');

const app = express();

// Allowed Origins (Supports GitHub Pages & Local Development)
const allowedOrigins = [
  'https://pexideal.onrender.com',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, or Postman) or GitHub Pages (*.github.io)
    if (!origin || origin.includes('github.io') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive during setup
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files from the root directory
app.use(express.static(path.join(__dirname, './')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/v1/discounts', verifyRoutes);

// Healthcheck Route (Crucial for Render Deployment Checks)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'Pexideal API',
    timestamp: new Date().toISOString()
  });
});

// Serve index.html as fallback for root request if static files are requested
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 404 Route Handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found.' });
});

// Global Error Handler to stop server from freezing silently
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.stack);
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

// Start Server bound to 0.0.0.0 for Render compatibility
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Pexideal API Server running on port ${PORT}`);
});