/**
 * Authentication Routes (Neon Database Integrated)
 * File: server/routes/auth.js
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/db');

// Secret Key for JWT Signing
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('⚠️ WARNING: JWT_SECRET environment variable is missing.');
}

// Helper: Generate Auth Token
const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET || 'pexideal_dev_secret_key_2026', { expiresIn: '7d' });
};

// ==========================================
// 1. CLIENT / PASSHOLDER AUTHENTICATION
// ==========================================

/**
 * POST /api/auth/client/login & /api/auth/login
 * Desc: Authenticate client/passholder via phone or email against Neon DB
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

    // 1. Query user from Neon DB
    const userResult = await db.query(
      `SELECT id, first_name, last_name, email, phone, password_hash, role, tier 
       FROM users 
       WHERE email = $1 OR phone = $1 
       LIMIT 1`,
      [identifier]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email/phone or password.'
      });
    }

    const user = userResult.rows[0];

    // 2. Verify hashed password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email/phone or password.'
      });
    }

    // 3. Prepare payload & sanitize response
    const payload = {
      userId: user.id,
      id: user.id,
      email: user.email,
      fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      role: user.role || 'client'
    };

    const token = generateToken(payload);

    return res.status(200).json({
      success: true,
      message: 'Client authentication successful.',
      token,
      user: payload
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
 * Desc: Register a new passholder directly into Neon DB
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

    const derivedFirstName = firstName || (fullName ? fullName.split(' ')[0] : '');
    const derivedLastName = lastName || (fullName ? fullName.split(' ').slice(1).join(' ') : '');
    const userEmail = email ? email.toLowerCase().trim() : null;
    const userPhone = phone ? phone.trim() : null;

    // 1. Check if user already exists in Neon DB
    const existingUser = await db.query(
      `SELECT id FROM users WHERE (email IS NOT NULL AND email = $1) OR (phone IS NOT NULL AND phone = $2) LIMIT 1`,
      [userEmail, userPhone]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email or phone number already exists.'
      });
    }

    // 2. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Insert new user into Neon DB
    const insertResult = await db.query(
      `INSERT INTO users (first_name, last_name, email, phone, password_hash, role, tier, created_at)
       VALUES ($1, $2, $3, $4, $5, 'client', $6, NOW())
       RETURNING id, first_name, last_name, email, phone, role, tier`,
      [derivedFirstName, derivedLastName, userEmail, userPhone, hashedPassword, tier || 'standard']
    );

    const newUser = insertResult.rows[0];

    // 4. Construct token payload
    const payload = {
      userId: newUser.id,
      id: newUser.id,
      email: newUser.email,
      fullName: `${newUser.first_name || ''} ${newUser.last_name || ''}`.trim(),
      role: newUser.role
    };

    const token = generateToken(payload);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: payload
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

router.post('/affiliate/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Business email and password are required.'
      });
    }

    const merchantResult = await db.query(
      `SELECT id, business_name, email, password_hash, role 
       FROM merchants 
       WHERE email = $1 LIMIT 1`,
      [email]
    );

    if (merchantResult.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const merchant = merchantResult.rows[0];
    const isMatch = await bcrypt.compare(password, merchant.password_hash);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const payload = {
      userId: merchant.id,
      id: merchant.id,
      email: merchant.email,
      businessName: merchant.business_name,
      role: 'affiliate'
    };

    const token = generateToken(payload);

    return res.status(200).json({
      success: true,
      message: 'Merchant terminal unlocked.',
      token,
      user: payload
    });

  } catch (error) {
    console.error('Merchant Login Error:', error);
    return res.status(500).json({ success: false, message: 'Merchant authentication error.' });
  }
});

// ==========================================
// 3. TOKEN VERIFICATION / SESSION CHECK
// ==========================================

router.get('/verify', (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No authorization token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET || 'pexideal_dev_secret_key_2026');
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