/**
 * Authentication Routes
 * File: server/routes/auth.js
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// Secret Key for JWT Signing (falls back to default during dev)
const JWT_SECRET = process.env.JWT_SECRET || 'pexideal_dev_secret_key_2026';

// Helper: Generate Auth Token
const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};

// ==========================================
// 1. CLIENT / PASSHOLDER AUTHENTICATION
// ==========================================

/**
 * POST /api/auth/client/login
 * Desc: Authenticate client/passholder via phone or email
 */
router.post('/client/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Phone/Email and passcode are required.'
      });
    }

    // TODO: Replace with DB query (e.g. User.findOne({ $or: [{ email }, { phone }] }))
    const mockUser = {
      id: 'client_101',
      identifier: identifier,
      role: 'client',
      name: 'Pexideal Passholder'
    };

    const token = generateToken(mockUser);

    return res.status(200).json({
      success: true,
      message: 'Client authentication successful.',
      token,
      user: mockUser
    });
  } catch (error) {
    console.error('Client Login Error:', error);
    return res.status(500).json({ success: false, message: 'Server authentication error.' });
  }
});

/**
 * POST /api/auth/client/signup
 * Desc: Register a new passholder
 */
router.post('/client/signup', async (req, res) => {
  try {
    const { fullName, email, phone, password } = req.body;

    if (!fullName || (!email && !phone) || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide required registration fields.'
      });
    }

    const newUser = {
      id: `client_${Date.now()}`,
      fullName,
      email,
      phone,
      role: 'client'
    };

    const token = generateToken(newUser);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: newUser
    });
  } catch (error) {
    console.error('Client Signup Error:', error);
    return res.status(500).json({ success: false, message: 'Registration failed.' });
  }
});

// ==========================================
// 2. AFFILIATE / MERCHANT AUTHENTICATION
// ==========================================

/**
 * POST /api/auth/affiliate/login
 * Desc: Authenticate merchant terminal access
 */
router.post('/affiliate/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Business email and password are required.'
      });
    }

    // TODO: Replace with DB lookup for Merchant profile
    const mockMerchant = {
      id: 'merch_501',
      businessEmail: email,
      storeName: 'Pexideal Partner Store',
      role: 'affiliate'
    };

    const token = generateToken(mockMerchant);

    return res.status(200).json({
      success: true,
      message: 'Merchant terminal unlocked.',
      token,
      merchant: mockMerchant
    });
  } catch (error) {
    console.error('Merchant Login Error:', error);
    return res.status(500).json({ success: false, message: 'Merchant authentication error.' });
  }
});

// ==========================================
// 3. ADMIN CONSOLE AUTHENTICATION
// ==========================================

/**
 * POST /api/auth/admin/login
 * Desc: Authenticate system administrators
 */
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Administrator email and security key are required.'
      });
    }

    // TODO: Replace with secure admin credentials check
    const mockAdmin = {
      id: 'admin_001',
      email: email,
      role: 'admin',
      permissions: ['ALL']
    };

    const token = generateToken(mockAdmin);

    return res.status(200).json({
      success: true,
      message: 'Admin session authenticated.',
      token,
      admin: mockAdmin
    });
  } catch (error) {
    console.error('Admin Login Error:', error);
    return res.status(500).json({ success: false, message: 'Admin authentication error.' });
  }
});

// ==========================================
// 4. TOKEN VERIFICATION / SESSION CHECK
// ==========================================

/**
 * GET /api/auth/verify
 * Desc: Validate stored JWT tokens across all portals
 */
router.get('/verify', (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No authorization token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.status(200).json({
      success: true,
      valid: true,
      user: decoded
    });
  } catch (err) {
    return res.status(401).json({
      success: false,
      valid: false,
      message: 'Token expired or invalid.'
    });
  }
});

module.exports = router;