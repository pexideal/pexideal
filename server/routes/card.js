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
    const hmacSecret = process.env.QR_HMAC_SECRET || 'pexideal_qr_hmac_secret_key_98765';
    const signature = crypto.createHmac('sha256', hmacSecret).update(rawData).digest('hex');

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
        ttlSeconds: 60 // QR code should refresh every 60s on frontend
      }
    });

  } catch (error) {
    console.error('Error fetching card:', error);
    return res.status(500).json({ success: false, message: 'Server error retrieving pass details.' });
  }
});

/**
 * POST /api/cards/issue
 * Issues a new Pexideal card for a client
 */
router.post('/issue', verifyToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    // Check if user already has a card
    const existing = await db.query('SELECT id FROM cards WHERE user_id = $1', [userId]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'User already has an active Pexideal card.' });
    }

    // Generate a unique 16-digit card number (e.g., PEXI-XXXX-XXXX-XXXX)
    const randomDigits = Math.floor(100000000000 + Math.random() * 900000000000);
    const cardNumber = `PEXI-${randomDigits}`;

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
    console.error('Card issuance error:', error);
    return res.status(500).json({ success: false, message: 'Server error issuing card.' });
  }
});

module.exports = router;