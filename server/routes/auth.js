/**
 * Authentication Routes
 * File: server/routes/auth.js
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Secret Key for JWT Signing
const JWT_SECRET = process.env.JWT_SECRET || 'pexideal_dev_secret_key_2026';

// Helper: Generate Auth Token
const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};

// ==========================================
// 1. CLIENT / PASSHOLDER AUTHENTICATION
// ==========================================

/**
 * POST /api/auth/client/login & /api/auth/login
 * Desc: Authenticate client/passholder via phone or email
 */
const handleClientLogin = async (req, res) => {
  try {
    const identifier = req.body.identifier || req.body.email;
    const { password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Phone/Email and password are required.'
      });
    }

    // TODO: Replace mock user retrieval with DB lookup
    // const user = await User.findOne({ $or: [{ email: identifier }, { phone: identifier }] });
    const mockUser = {
      id: 'client_101',
      firstName: 'Pexideal',
      lastName: 'Passholder',
      fullName: 'Pexideal Passholder',
      email: identifier.includes('@') ? identifier : 'passholder@pexideal.com',
      phone: !identifier.includes('@') ? identifier : '',
      role: 'client',
      tier: 'standard'
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
};

router.post('/login', handleClientLogin);
router.post('/login', handleClientLogin);

/**
 * POST /api/auth/client/signup, /api/auth/register-client, /api/auth/signup
 * Desc: Register a new passholder
 */
const handleClientSignup = async (req, res) => {
  try {
    const { firstName, lastName, fullName, email, phone, password, tier } = req.body;

    if ((!fullName && !firstName) || (!email && !phone) || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide required registration fields.'
      });
    }

    // Hash password for security before DB save
    const hashedPassword = await bcrypt.hash(password, 10);

    const derivedFullName = fullName || `${firstName || ''} ${lastName || ''}`.trim();
    const newUser = {
      id: `client_${Date.now()}`,
      firstName: firstName || derivedFullName.split(' ')[0],
      lastName: lastName || derivedFullName.split(' ').slice(1).join(' '),
      fullName: derivedFullName,
      email,
      phone: phone || '',
      role: 'client',
      tier: tier || 'standard',
      createdAt: new Date().toISOString()
    };

    const token = generateToken(newUser);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: newUser,
      card: {
        cardNumber: `DC-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        qrCodeToken: newUser.id
      }
    });
  } catch (error) {
    console.error('Client Signup Error:', error);
    return res.status(500).json({ success: false, message: 'Registration failed.' });
  }
};

router.post('/client/signup', handleClientSignup);
router.post('/register-client', handleClientSignup);
router.post('/signup', handleClientSignup);

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
      email: email,
      businessName: 'Pexideal Partner Store',
      role: 'affiliate'
    };

    const token = generateToken(mockMerchant);

    return res.status(200).json({
      success: true,
      message: 'Merchant terminal unlocked.',
      token,
      user: mockMerchant,
      merchant: mockMerchant // Preserved for backwards compatibility
    });
  } catch (error) {
    console.error('Merchant Login Error:', error);
    return res.status(500).json({ success: false, message: 'Merchant authentication error.' });
  }
});

/**
 * POST /api/auth/affiliate/signup & /api/auth/register-merchant
 * Desc: Onboard a new merchant or affiliate partner
 */
const handleMerchantSignup = async (req, res) => {
  try {
    const { businessName, category, email, password } = req.body;

    if (!businessName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Business name, email, and password are required.'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newMerchant = {
      id: `merch_${Date.now()}`,
      businessName,
      category: category || 'General',
      email,
      role: 'affiliate',
      createdAt: new Date().toISOString()
    };

    const token = generateToken(newMerchant);

    return res.status(201).json({
      success: true,
      message: 'Merchant registered successfully!',
      token,
      user: newMerchant,
      merchant: newMerchant
    });
  } catch (error) {
    console.error('Merchant Signup Error:', error);
    return res.status(500).json({ success: false, message: 'Merchant registration failed.' });
  }
};

router.post('/affiliate/signup', handleMerchantSignup);
router.post('/register-merchant', handleMerchantSignup);

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

    // TODO: Replace with secure admin DB check
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
      user: mockAdmin,
      admin: mockAdmin // Preserved for backwards compatibility
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