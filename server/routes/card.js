/**
 * Digital Pass & QR Code Management Routes
 * File: server/routes/cards.js
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/db');
const verifyToken = require('../middleware/auth');

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
 * Fetches the logged-in client's active card details or auto-provisions one if missing.
 */
router.get('/my-card', verifyToken, async (req, res) => {
  // Support both 'userId' and 'id' from JWT payload
  const userId = req.user?.userId || req.user?.id || req.user?.sub;

  if (!userId) {
    console.error('❌ Authentication payload missing user identifier:', req.user);
    return res.status(400).json({
      success: false,
      message: 'Invalid user token payload: missing user ID.'
    });
  }

  try {
    // 1. Query user's active card in Neon DB
    let cardResult = await db.query(
      `SELECT id, card_number, status, expires_at, created_at 
       FROM cards 
       WHERE user_id = $1 AND status = 'active' 
       LIMIT 1`,
      [userId]
    );

    let card = cardResult.rows[0];

    // 2. Auto-provision card if record does not exist in Neon DB yet
    if (!card) {
      console.warn(`⚠️ No active card found for user ${userId}. Auto-issuing new card...`);
      const newCardNumber = generateCardNumber();

      const insertResult = await db.query(
        `INSERT INTO cards (user_id, card_number, status, expires_at)
         VALUES ($1, $2, 'active', NOW() + INTERVAL '1 year')
         RETURNING id, card_number, status, expires_at, created_at`,
        [userId, newCardNumber]
      );
      card = insertResult.rows[0];
    }

    // 3. Generate Cryptographic HMAC Signature for QR Code
    const timestamp = Math.floor(Date.now() / 1000);
    const rawData = `${userId}:${card.id}:${timestamp}`;
    const secret = process.env.QR_HMAC_SECRET || 'fallback_development_only_secret_key';
    const signature = crypto.createHmac('sha256', secret).update(rawData).digest('hex');

    // 4. Assemble complete QR token payload
    const qrToken = `${rawData}:${signature}`;

    return res.json({
      success: true,
      card: {
        id: card.id,
        cardNumber: card.card_number,
        status: card.status,
        expiresAt: card.expires_at,
        qrToken: qrToken,
        ttlSeconds: 60 // QR code refresh interval for frontend UI
      }
    });

  } catch (error) {
    console.error('❌ Error fetching card details from Neon DB:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error retrieving pass details.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/cards/issue
 * Issues a new Pexideal card for a client
 */
router.post('/issue', verifyToken, async (req, res) => {
  const userId = req.user?.userId || req.user?.id || req.user?.sub;

  if (!userId) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid user token payload: missing user ID.' 
    });
  }

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