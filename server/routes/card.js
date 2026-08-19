/**
 * Digital Pass & QR Code Management Routes
 * File: server/routes/cards.js
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/db');
const verifyToken = require('../middleware/auth');

// Ensure QR_HMAC_SECRET is defined at server boot
const QR_HMAC_SECRET = process.env.QR_HMAC_SECRET;
if (!QR_HMAC_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('WARNING: QR_HMAC_SECRET environment variable is missing.');
}

/**
 * Helper: Generate formatted, cryptographically secure 16-digit card number
 * Format: PEXI-XXXX-XXXX-XXXX
 */
function generateCardNumber() {
  const bytes = crypto.randomBytes(6);
  const numericString = BigInt(`0x${bytes.toString('hex')}`).toString().slice(0, 12).padStart(12, '0');
  return `PEXI-${numericString.slice(0, 4)}-${numericString.slice(4, 8)}-${numericString.slice(8, 12)}`;
}

/**
 * GET /api/cards/my-card
 * Fetches the logged-in client's active card details and generates a fresh signed QR token
 */
router.get('/my-card', verifyToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    // 1. Query user's active card
    const cardResult = await db.query(
      `SELECT id, card_number, status, expires_at, created_at 
       FROM cards 
       WHERE user_id = $1 AND status = 'active' 
       LIMIT 1`,
      [userId]
    );

    if (cardResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No active Pexideal membership card found.' 
      });
    }

    const card = cardResult.rows[0];
    const timestamp = Math.floor(Date.now() / 1000);

    // 2. Generate Cryptographic HMAC Signature
    const rawData = `${userId}:${card.id}:${timestamp}`;
    const secret = QR_HMAC_SECRET || 'fallback_development_only_secret_key';
    const signature = crypto.createHmac('sha256', secret).update(rawData).digest('hex');

    // 3. Assemble complete QR token payload
    const qrToken = `${rawData}:${signature}`;

    return res.json({
      success: true,
      card: {
        id: card.id,
        cardNumber: card.card_number,
        status: card.status,
        expiresAt: card.expires_at,
        qrToken: qrToken,
        ttlSeconds: 60 // QR code refresh interval for the frontend UI
      }
    });

  } catch (error) {
    console.error('Error fetching card:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error retrieving pass details.' 
    });
  }
});

/**
 * POST /api/cards/issue
 * Issues a new Pexideal card for a client
 */
router.post('/issue', verifyToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    // 1. Check if user already has a card
    const existing = await db.query('SELECT id FROM cards WHERE user_id = $1', [userId]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'User already has an active Pexideal card.' 
      });
    }

    // 2. Generate secure card number
    const cardNumber = generateCardNumber();

    // 3. Atomic Insert with Postgres INTERVAL
    const newCard = await db.query(
      `INSERT INTO cards (user_id, card_number, status, expires_at)
       VALUES ($1, $2, 'active', NOW() + INTERVAL '1 year')
       RETURNING id, card_number, status, expires_at`,
      [userId, cardNumber]
    );

    return res.status(201).json({
      success: true,
      message: 'Pexideal card successfully issued!',
      card: newCard.rows[0]
    });

  } catch (error) {
    // Unique violation error handling for database constraint checks (PostgreSQL code 23505)
    if (error.code === '23505') {
      return res.status(400).json({ 
        success: false, 
        message: 'Card issuance conflict: Active card already exists.' 
      });
    }

    console.error('Card issuance error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error issuing card.' 
    });
  }
});

module.exports = router;