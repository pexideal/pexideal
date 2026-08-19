/**
 * Authentication & Card Routes
 * File: server/routes/auth.js
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Secret Key for JWT Signing
const JWT_SECRET = process.env.JWT_SECRET || 'pexideal_dev_secret_key_2026';

// Temporary In-Memory Store for Testing (Replace with DB model in production)
const USERS_DB = [];

// Helper: Generate Auth Token
const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};

// Middleware: Authenticate JWT Token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Unauthorized: Invalid or expired token' });
  }
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

    // 1. Look up existing user in DB/Array
    let user = USERS_DB.find(u => u.email === identifier || u.phone === identifier);

    // 2. If user exists, verify password
    if (user) {
      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email/phone or password.'
        });
      }
    } else {
      // DEV ONLY FALLBACK: Reject if password isn't "password123" for test accounts
      if (password !== 'password123') {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials. (For testing, use password: password123)'
        });
      }

      user = {
        id: 'client_101',
        firstName: 'Pexideal',
        lastName: 'Passholder',
        fullName: 'Pexideal Passholder',
        email: identifier.includes('@') ? identifier : 'passholder@pexideal.com',
        phone: !identifier.includes('@') ? identifier : '',
        role: 'client',
        tier: 'standard'
      };
    }

    // Sanitize user object (omit password hash)
    const { passwordHash, ...sanitizedUser } = user;
    const token = generateToken(sanitizedUser);

    return res.status(200).json({
      success: true,
      message: 'Client authentication successful.',
      token,
      user: sanitizedUser
    });
  } catch (error) {
    console.error('Client Login Error:', error);
    return res.status(500).json({ success: false, message: 'Server authentication error.' });
  }
};

router.post('/client/login', handleClientLogin);
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

    // Hash password for security
    const hashedPassword = await bcrypt.hash(password, 10);
    const derivedFullName = fullName || `${firstName || ''} ${lastName || ''}`.trim();

    const newUser = {
      id: `client_${Date.now()}`,
      firstName: firstName || derivedFullName.split(' ')[0],
      lastName: lastName || derivedFullName.split(' ').slice(1).join(' '),
      fullName: derivedFullName,
      email: email || '',
      phone: phone || '',
      passwordHash: hashedPassword,
      role: 'client',
      tier: tier || 'standard',
      createdAt: new Date().toISOString()
    };

    // Save to test array
    USERS_DB.push(newUser);

    const { passwordHash, ...sanitizedUser } = newUser;
    const token = generateToken(sanitizedUser);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: sanitizedUser,
      card: {
        cardNumber: `DC-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        qrCodeToken: sanitizedUser.id
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
// 2. CARD / PASSHOLDER DATA ENDPOINT
// ==========================================

/**
 * GET /api/cards/my-card
 * Desc: Returns current pass details to prevent 404 / 401 redirect loops on dashboard
 */
router.get('/cards/my-card', authenticateToken, (req, res) => {
  return res.status(200).json({
    success: true,
    card: {
      cardNumber: `PEXI-${Math.floor(1000 + Math.random() * 9000)}-2026`,
      holderName: req.user.fullName || 'Pexideal Passholder',
      status: 'ACTIVE',
      expiresAt: '2026-12-31',
      qrToken: `PEXIDEAL:${req.user.id}:${Date.now()}`
    }
  });
});

// ==========================================
// 3. AFFILIATE / MERCHANT AUTHENTICATION
// ==========================================

router.post('/affiliate/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Business email and password are required.'
      });
    }

    if (password !== 'password123') {
      return res.status(401).json({
        success: false,
        message: 'Invalid merchant password. (Use password123)'
      });
    }

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
      merchant: mockMerchant
    });
  } catch (error) {
    console.error('Merchant Login Error:', error);
    return res.status(500).json({ success: false, message: 'Merchant authentication error.' });
  }
});

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
      passwordHash: hashedPassword,
      role: 'affiliate',
      createdAt: new Date().toISOString()
    };

    const { passwordHash, ...sanitizedMerchant } = newMerchant;
    const token = generateToken(sanitizedMerchant);

    return res.status(201).json({
      success: true,
      message: 'Merchant registered successfully!',
      token,
      user: sanitizedMerchant,
      merchant: sanitizedMerchant
    });
  } catch (error) {
    console.error('Merchant Signup Error:', error);
    return res.status(500).json({ success: false, message: 'Merchant registration failed.' });
  }
};

router.post('/affiliate/signup', handleMerchantSignup);
router.post('/register-merchant', handleMerchantSignup);

// ==========================================
// 4. ADMIN CONSOLE AUTHENTICATION
// ==========================================

router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Administrator email and security key are required.'
      });
    }

    if (password !== 'admin123') {
      return res.status(401).json({
        success: false,
        message: 'Invalid security key.'
      });
    }

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
      admin: mockAdmin
    });
  } catch (error) {
    console.error('Admin Login Error:', error);
    return res.status(500).json({ success: false, message: 'Admin authentication error.' });
  }
});

// ==========================================
// 5. TOKEN VERIFICATION / SESSION CHECK
// ==========================================

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