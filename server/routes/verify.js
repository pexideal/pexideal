/**
 * QR Verification & Offline Batch Sync Routes
 * File: server/routes/verify.js
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/db');

/**
 * POST /v1/discounts/verify
 * Validates scanned QR token string ("userId:cardId:timestamp:signature")
 */
router.post('/verify', async (req, res) => {
  const { token, storeId } = req.body;

  if (!token) {
    return res.status(400).json({ success: false, message: 'No QR token provided.' });
  }

  const parts = token.split(':');
  if (parts.length !== 4) {
    return res.status(400).json({ success: false, message: 'Malformed QR token structure.' });
  }

  const [userId, cardId, timestampStr, signature] = parts;
  const tokenTimestamp = parseInt(timestampStr, 10);
  const currentTimestamp = Math.floor(Date.now() / 1000);

  // 1. Expiration Check (60 second TTL + 30s grace)
  if ((currentTimestamp - tokenTimestamp) > 90) {
    return res.status(400).json({ success: false, message: 'Pass QR code expired. Please refresh.' });
  }

  // 2. Cryptographic HMAC Verification
  const expectedData = `${userId}:${cardId}:${timestampStr}`;
  const hmacSecret = process.env.QR_HMAC_SECRET || 'pexideal_qr_hmac_secret_key_98765';
  const expectedSignature = crypto.createHmac('sha256', hmacSecret).update(expectedData).digest('hex');

  if (signature !== expectedSignature) {
    return res.status(403).json({ success: false, message: 'Invalid token signature. Counterfeit pass detected.' });
  }

  try {
    // 3. Record redemption in database
    await db.query(
      `INSERT INTO redemptions (user_id, card_id, store_id, redeemed_at)
       VALUES ($1, $2, $3, NOW())`,
      [userId, cardId, storeId || 'store_default']
    );

    return res.json({
      success: true,
      message: 'Discount verified and applied!',
      customer: { name: 'Verified Cardholder', cardId: cardId },
      discount: { title: 'Standard Affiliate Discount' }
    });

  } catch (error) {
    console.error('Verification error:', error);
    return res.status(500).json({ success: false, message: 'Server error during pass verification.' });
  }
});

/**
 * POST /v1/discounts/sync-offline
 * Batch processes offline redemptions queued by cashier terminals
 */
router.post('/sync-offline', async (req, res) => {
  const { batch } = req.body;

  if (!Array.isArray(batch) || batch.length === 0) {
    return res.status(400).json({ success: false, message: 'Batch array is required.' });
  }

  try {
    let syncedCount = 0;

    for (const item of batch) {
      const parts = item.token.split(':');
      if (parts.length === 4) {
        const [userId, cardId] = parts;
        await db.query(
          `INSERT INTO redemptions (user_id, card_id, store_id, redeemed_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [userId, cardId, item.storeId || 'store_default', item.scannedAt || new Date()]
        );
        syncedCount++;
      }
    }

    return res.json({
      success: true,
      message: `Successfully synced ${syncedCount} offline redemptions!`,
      syncedCount
    });

  } catch (error) {
    console.error('Offline batch sync error:', error);
    return res.status(500).json({ success: false, message: 'Failed to process offline batch.' });
  }
});

module.exports = router;