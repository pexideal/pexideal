/**
 * Authentication Routes (Register & Login)
 * File: server/routes/auth.js
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Helper: Generate JWT
function generateToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'fallback_secret_key',
    { expiresIn: '30d' }
  );
}

/**
 * POST /api/auth/register-client
 * Registers a standard cardholder user
 */
router.post('/register-client', async (req, res) => {
  const { firstName, lastName, email, password } = req.body;

  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  try {
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email is already registered.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert user
    const newUser = await db.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'client')
       RETURNING id, first_name, last_name, email, role, created_at`,
      [firstName, lastName, email, passwordHash]
    );

    const user = newUser.rows[0];

    // Issue a digital discount card for the new user
    const cardCode = `PEX-${Math.floor(100000 + Math.random() * 900000)}`;
    await db.query(
      `INSERT INTO cards (user_id, card_code, status) VALUES ($1, $2, 'active')`,
      [user.id, cardCode]
    );

    const token = generateToken(user);

    return res.status(201).json({
      success: true,
      message: 'Client registered successfully!',
      token,
      user: { ...user, cardCode }
    });

  } catch (error) {
    console.error('Client registration error:', error);
    return res.status(500).json({ success: false, message: 'Server error during client signup.' });
  }
});

/**
 * POST /api/auth/register-merchant
 * Registers a business owner / affiliate merchant
 */
router.post('/register-merchant', async (req, res) => {
  const { businessName, category, email, password } = req.body;

  if (!businessName || !category || !email || !password) {
    return res.status(400).json({ success: false, message: 'All business details are required.' });
  }

  try {
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email is already registered.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await db.query(
      `INSERT INTO users (first_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'merchant')
       RETURNING id, first_name AS business_name, email, role`,
      [businessName, email, passwordHash]
    );

    const user = newUser.rows[0];
    const token = generateToken(user);

    return res.status(201).json({
      success: true,
      message: 'Merchant onboarded successfully!',
      token,
      user
    });

  } catch (error) {
    console.error('Merchant registration error:', error);
    return res.status(500).json({ success: false, message: 'Server error during merchant signup.' });
  }
});

/**
 * POST /api/auth/login
 * Universal login endpoint for clients & merchants
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  try {
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const user = userResult.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = generateToken(user);

    return res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

module.exports = router;