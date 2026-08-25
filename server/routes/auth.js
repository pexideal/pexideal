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
 * Handle client/passholder authentication via phone or email against Neon DB
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
    let cardResult;
    try {
      cardResult = await db.query(
        `SELECT id, card_number, card_code, tier_name, qr_code_token, status, expires_at 
         FROM cards 
         WHERE user_id = $1 
         LIMIT 1`,
        [user.id]
      );
    } catch (_) {
      // Fallback check for digital_cards table
      cardResult = await db.query(
        `SELECT id, card_number, tier AS tier_name, status, created_at AS expires_at 
         FROM digital_cards 
         WHERE user_id = $1 
         LIMIT 1`,
        [user.id]
      );
    }

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

// Client Login Route Aliases
router.post('/client/login', handleClientLogin);
router.post('/login', handleClientLogin);

/**
 * Handle passholder registration into Neon DB and automatically issue a dynamic digital pass
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

    // 3. Insert new user into Neon DB
    const insertResult = await queryRunner.query(
      `INSERT INTO users (first_name, last_name, email, phone, password_hash, role, tier, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'client', $6, $7, NOW())
       RETURNING id, first_name, last_name, email, phone, role, tier, status`,
      [derivedFirstName, derivedLastName, userEmail, userPhone, hashedPassword, userTier, userStatus]
    );

    const newUser = insertResult.rows[0];

    // 4. Auto-generate digital card details & formatted QR payload
    const cardNumber = `PEXI-${Math.floor(100000 + Math.random() * 900000)}`;
    const signedJwt = jwt.sign(
      { userId: newUser.id, cardNumber, tier: newUser.tier },
      QR_HMAC_SECRET,
      { expiresIn: '365d' }
    );
    const qrToken = `PEXI:${signedJwt}`;

    // 5. Save generated card into Neon DB
    let cardInsertResult;
    try {
      cardInsertResult = await queryRunner.query(
        `INSERT INTO cards (user_id, card_number, card_code, tier_name, qr_code_token, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         RETURNING id, card_number, card_code, tier_name, qr_code_token, status, expires_at`,
        [newUser.id, cardNumber, cardNumber.replace('PEXI-', ''), newUser.tier, qrToken]
      );
    } catch (_) {
      cardInsertResult = await queryRunner.query(
        `INSERT INTO digital_cards (user_id, card_number, tier, status)
         VALUES ($1, $2, $3, 'active')
         RETURNING id, card_number, tier AS tier_name, status, created_at AS expires_at`,
        [newUser.id, cardNumber, newUser.tier]
      );
      if (cardInsertResult.rows[0]) {
        cardInsertResult.rows[0].qr_code_token = qrToken;
      }
    }

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
        qrCodeToken: newCard.qr_code_token || qrToken,
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

// Client Signup Route Aliases
router.post('/client/signup', handleClientSignup);
router.post('/register-client', handleClientSignup);
router.post('/signup', handleClientSignup);

// ==========================================
// 2. AFFILIATE / MERCHANT AUTHENTICATION
// ==========================================

/**
 * Handle merchant/partner authentication
 */
const handleMerchantLogin = async (req, res) => {
  try {
    const identifier = req.body?.identifier || req.body?.email;
    const password = req.body?.password;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Store email/ID and password are required.'
      });
    }

    const cleanIdentifier = String(identifier).toLowerCase().trim();

    const merchantResult = await db.query(
      `SELECT id, business_name, email, password_hash, role 
       FROM merchants 
       WHERE email = $1 OR business_name ILIKE $1 
       LIMIT 1`,
      [cleanIdentifier]
    );

    if (merchantResult.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid store credentials or password.' });
    }

    const merchant = merchantResult.rows[0];
    const isMatch = await bcrypt.compare(password, merchant.password_hash);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid store credentials or password.' });
    }

    const payload = {
      userId: merchant.id,
      id: merchant.id,
      email: merchant.email,
      businessName: merchant.business_name,
      role: merchant.role || 'affiliate'
    };

    const token = generateToken(payload);

    return res.status(200).json({
      success: true,
      message: 'Merchant terminal unlocked.',
      token,
      merchant: payload,
      redirectUrl: 'dashboard.html'
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
};

// Merchant Login Route Aliases
router.post('/affiliate/login', handleMerchantLogin);
router.post('/merchant/login', handleMerchantLogin);
router.post('/merchant/auth/login', handleMerchantLogin);

/**
 * Handle new merchant/partner registration in Neon DB
 */
const handleMerchantSignup = async (req, res) => {
  let client;

  try {
    const body = req.body || {};
    
    // Support both nested structure (contact.email) and flat structure (email)
    const businessName = body.businessName || body.business_name;
    const category = body.category || 'General';
    const location = body.location || 'Default Location';
    const website = body.website || null;
    const email = body.contact?.email || body.email;
    const phone = body.contact?.phone || body.phone || '';
    const contactName = body.contact?.fullName || body.contactName || body.full_name || '';
    const contactRole = body.contact?.roleTitle || body.contactRole || body.role_title || '';
    const offerType = body.offer?.type || body.discount_type || 'discount';
    const offerHeadline = body.offer?.headline || body.offer_headline || '';
    const offerTerms = body.offer?.terms || body.offer_terms || '';
    const password = body.password;

    if (!businessName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Business name, email, and password are required.'
      });
    }

    const cleanEmail = String(email).toLowerCase().trim();

    if (typeof db.getClient === 'function') {
      client = await db.getClient();
      await client.query('BEGIN');
    }

    const queryRunner = client || db;

    // Check if merchant already exists
    const existingMerchant = await queryRunner.query(
      `SELECT id FROM merchants WHERE email = $1 LIMIT 1`,
      [cleanEmail]
    );

    if (existingMerchant.rows.length > 0) {
      if (client) await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'A merchant account with this email address already exists.'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert into merchants table
    const insertResult = await queryRunner.query(
      `INSERT INTO merchants (
         business_name, category, location, website, 
         discount_type, offer_headline, offer_terms, 
         contact_name, contact_role, email, phone, 
         password_hash, role, status, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'affiliate', 'active', NOW())
       RETURNING id, business_name, email, role`,
      [
        businessName,
        category,
        location,
        website,
        offerType,
        offerHeadline,
        offerTerms,
        contactName,
        contactRole,
        cleanEmail,
        phone,
        hashedPassword
      ]
    );

    if (client) await client.query('COMMIT');

    const newMerchant = insertResult.rows[0];

    const payload = {
      userId: newMerchant.id,
      id: newMerchant.id,
      email: newMerchant.email,
      businessName: newMerchant.business_name,
      role: newMerchant.role
    };

    const token = generateToken(payload);

    return res.status(201).json({
      success: true,
      message: 'Merchant partner registration completed successfully!',
      token,
      merchant: payload
    });

  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }

    console.error('====================================');
    console.error('❌ MERCHANT SIGNUP ERROR AT:', new Date().toISOString());
    console.error('Error Message:', error.message);
    console.error('Stack Trace:', error.stack);
    console.error('Request Body:', req.body);
    console.error('====================================');

    return res.status(500).json({ 
      success: false, 
      message: 'Merchant registration failed: ' + error.message 
    });
  } finally {
    if (client && typeof client.release === 'function') {
      client.release();
    }
  }
};

// Merchant Signup Route Aliases (Fixes 404 on frontend API calls)
router.post('/merchant/signup', handleMerchantSignup);
router.post('/merchant/auth/signup', handleMerchantSignup);
router.post('/affiliate/signup', handleMerchantSignup);

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