/**
 * Authentication Routes (Neon Database Integrated)
 * File: server/routes/auth.js
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/db');

// Read secrets directly from environment variables
const JWT_SECRET = process.env.JWT_SECRET;
const QR_HMAC_SECRET = process.env.QR_HMAC_SECRET || JWT_SECRET;

if (!JWT_SECRET) {
  console.warn('⚠️ WARNING: JWT_SECRET environment variable is missing from .env!');
}

// Helper: Generate Auth Token
const generateToken = (payload) => {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured on the server.');
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
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
    const identifier = req.body?.identifier || req.body?.email;
    const password = req.body?.password;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Phone/Email and password are required.'
      });
    }

    const cleanIdentifier = String(identifier).trim();

    // 1. Query user from Neon DB (Including status)
    const userResult = await db.query(
      `SELECT id, first_name, last_name, email, phone, password_hash, role, tier, status 
       FROM users 
       WHERE email = $1 OR phone = $1 
       LIMIT 1`,
      [cleanIdentifier]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email/phone or password.'
      });
    }

    const user = userResult.rows[0];

    // Check account status if present
    if (user.status && user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Your account is currently inactive or suspended.'
      });
    }

    // 2. Verify hashed password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email/phone or password.'
      });
    }

    // 3. Query associated digital card if exists
    const cardResult = await db.query(
      `SELECT id, card_number, card_code, tier_name, qr_code_token, status, expires_at 
       FROM cards 
       WHERE user_id = $1 
       LIMIT 1`,
      [user.id]
    );

    const card = cardResult.rows[0] || null;

    // 4. Prepare payload & sanitize response
    const payload = {
      userId: user.id,
      id: user.id,
      email: user.email,
      fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      role: user.role || 'client',
      status: user.status || 'active'
    };

    const token = generateToken(payload);

    return res.status(200).json({
      success: true,
      message: 'Client authentication successful.',
      token,
      user: payload,
      card
    });

  } catch (error) {
    console.error('====================================');
    console.error('❌ CLIENT LOGIN ERROR AT:', new Date().toISOString());
    console.error('Error Message:', error.message);
    console.error('Stack Trace:', error.stack);
    console.error('Request Body:', req.body);
    console.error('====================================');

    return res.status(500).json({ 
      success: false, 
      message: 'Server authentication error: ' + error.message 
    });
  }
};

router.post('/client/login', handleClientLogin);
router.post('/login', handleClientLogin);

/**
 * POST /api/auth/client/signup, /api/auth/register-client, /api/auth/signup
 * Desc: Register a new passholder into Neon DB and automatically issue a dynamic digital pass
 */
const handleClientSignup = async (req, res) => {
  let client;

  try {
    const { firstName, lastName, fullName, email, phone, password, tier, status } = req.body || {};

    if ((!fullName && !firstName) || (!email && !phone) || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide required registration fields.'
      });
    }

    const derivedFirstName = firstName || (fullName ? String(fullName).trim().split(' ')[0] : '');
    const derivedLastName = lastName || (fullName ? String(fullName).trim().split(' ').slice(1).join(' ') : '');
    const userEmail = email ? String(email).toLowerCase().trim() : null;
    const userPhone = phone ? String(phone).trim() : null;
    const userTier = tier || 'standard';
    const userStatus = status || 'active';

    if (typeof db.getClient === 'function') {
      client = await db.getClient();
      await client.query('BEGIN');
    }

    const queryRunner = client || db;

    // 1. Check if user already exists in Neon DB
    const existingUser = await queryRunner.query(
      `SELECT id FROM users WHERE (email IS NOT NULL AND email = $1) OR (phone IS NOT NULL AND phone = $2) LIMIT 1`,
      [userEmail, userPhone]
    );

    if (existingUser.rows.length > 0) {
      if (client) await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'An account with this email or phone number already exists.'
      });
    }

    // 2. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Insert new user into Neon DB (Explicitly writing status column)
    const insertResult = await queryRunner.query(
      `INSERT INTO users (first_name, last_name, email, phone, password_hash, role, tier, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'client', $6, $7, NOW())
       RETURNING id, first_name, last_name, email, phone, role, tier, status`,
      [derivedFirstName, derivedLastName, userEmail, userPhone, hashedPassword, userTier, userStatus]
    );

    const newUser = insertResult.rows[0];

    // 4. Auto-generate digital card details & QR payload using QR_HMAC_SECRET / JWT_SECRET
    const cardNumber = `PEXI-${Math.floor(100000 + Math.random() * 900000)}`;
    const qrToken = jwt.sign(
      { userId: newUser.id, cardNumber, tier: newUser.tier },
      QR_HMAC_SECRET,
      { expiresIn: '365d' }
    );

    // 5. Save generated card into Neon DB
    const cardInsertResult = await queryRunner.query(
      `INSERT INTO cards (user_id, card_number, card_code, tier_name, qr_code_token, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING id, card_number, card_code, tier_name, qr_code_token, status, expires_at`,
      [newUser.id, cardNumber, cardNumber.replace('PEXI-', ''), newUser.tier, qrToken]
    );

    if (client) await client.query('COMMIT');

    const newCard = cardInsertResult.rows[0];

    // 6. Construct token payload
    const payload = {
      userId: newUser.id,
      id: newUser.id,
      email: newUser.email,
      fullName: `${newUser.first_name || ''} ${newUser.last_name || ''}`.trim(),
      role: newUser.role || 'client',
      status: newUser.status || 'active'
    };

    const token = generateToken(payload);

    return res.status(201).json({
      success: true,
      message: 'Account created and digital pass issued successfully!',
      token,
      user: payload,
      card: {
        id: newCard.id,
        cardNumber: newCard.card_number,
        tierName: newCard.tier_name,
        qrCodeToken: newCard.qr_code_token,
        status: newCard.status,
        expiresAt: newCard.expires_at
      }
    });

  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }

    console.error('====================================');
    console.error('❌ CLIENT SIGNUP ERROR AT:', new Date().toISOString());
    console.error('Error Message:', error.message);
    console.error('Stack Trace:', error.stack);
    console.error('Request Body:', req.body);
    console.error('====================================');

    return res.status(500).json({ 
      success: false, 
      message: 'Registration failed: ' + error.message 
    });
  } finally {
    if (client && typeof client.release === 'function') {
      client.release();
    }
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
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Business email and password are required.'
      });
    }

    const cleanEmail = String(email).toLowerCase().trim();

    const merchantResult = await db.query(
      `SELECT id, business_name, email, password_hash, role 
       FROM merchants 
       WHERE email = $1 LIMIT 1`,
      [cleanEmail]
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
    console.error('====================================');
    console.error('❌ MERCHANT LOGIN ERROR AT:', new Date().toISOString());
    console.error('Error Message:', error.message);
    console.error('Stack Trace:', error.stack);
    console.error('Request Body:', req.body);
    console.error('====================================');

    return res.status(500).json({ 
      success: false, 
      message: 'Merchant authentication error: ' + error.message 
    });
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