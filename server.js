/**
 * Main Express Application Server
 * File: server.js
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./server/routes/auth');
const verifyRoutes = require('./server/routes/verify');

const app = express();

// Middleware
app.use(cors({
  origin: '*', // Adjust to your frontend domain in production
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files in production if needed
app.use(express.static('.'));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/v1/discounts', verifyRoutes);

// Healthcheck Route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'Pexideal Pexideal API',
    timestamp: new Date().toISOString()
  });
});

// 404 Route Handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found.' });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Pexideal API Server running on port ${PORT}`);
});