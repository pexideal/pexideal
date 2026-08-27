/**
 * QR Verification & Offline Batch Sync Routes
 * File: server/routes/redemptions.js
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const verifyToken = require('../middleware/auth'); // Protects merchant scanning

const QR_HMAC_SECRET = process.env.QR_HMAC_SECRET || 'pexideal_qr_hmac_secret_key_98765';

/**
 * POST /v1/discounts/verify
 * Validates scanned QR token string ("userId:cardId:timestamp:signature" or "PEXI:<JWT>")
 */
router.post('/verify', verifyToken, async (req, res) => {
  let client;

  try {
    const { token, qrData, storeId, discountAmount } = req.body || {};
    const rawData = token || qrData;
    const merchantId = req.user?.id || req.user?.userId;

    if (!rawData) {
      return res.status(400).json({ success: false, valid: false, message: 'No QR token provided.' });
    }

    let userId, cardId, tier;

    // A. Handle JWT / PEXI-prefixed token format
    if (rawData.startsWith('PEXI:') || rawData.split('.').length === 3) {
      const jwtToken = rawData.startsWith('PEXI:') ? rawData.split('PEXI:')[1] : rawData;
      try {
        const decoded = jwt.verify(jwtToken, QR_HMAC_SECRET);
        userId = decoded.userId || decoded.id;
        cardId = decoded.cardNumber || decoded.cardId;
        tier = decoded.tier;
      } catch (jwtErr) {
        return res.status(400).json({
          success: false,
          valid: false,
          message: jwtErr.name === 'TokenExpiredError' 
            ? 'Pass QR code expired. Please refresh.' 
            : 'Invalid JWT signature.'
        });
      }
    } else {
      // B. Handle raw HMAC string format ("userId:cardId:timestamp:signature")
      const parts = rawData.split(':');
      if (parts.length !== 4) {
        return res.status(400).json({ success: false, valid: false, message: 'Malformed QR token structure.' });
      }

      const [uId, cId, timestampStr, signature] = parts;
      userId = uId;
      cardId = cId;
      const tokenTimestamp = parseInt(timestampStr, 10);
      const currentTimestamp = Math.floor(Date.now() / 1000);

      // Expiration Check (90s window)
      if ((currentTimestamp - tokenTimestamp) > 90) {
        return res.status(400).json({ success: false, valid: false, message: 'Pass QR code expired. Please refresh.' });
      }

      // Cryptographic HMAC Verification
      const expectedData = `${userId}:${cardId}:${timestampStr}`;
      const expectedSignature = crypto.createHmac('sha256', QR_HMAC_SECRET).update(expectedData).digest('hex');

      if (signature !== expectedSignature) {
        return res.status(403).json({ success: false, valid: false, message: 'Invalid token signature. Counterfeit pass detected.' });
      }
    }

    // Acquire DB Client if connection pool available
    if (typeof db.getClient === 'function') {
      client = await db.getClient();
      await client.query('BEGIN');
    }
    const queryRunner = client || db;

    // Database Check: Validate card status & ownership
    const cardCheck = await queryRunner.query(
      `SELECT c.id, c.card_number, c.tier_name, c.status, 
              COALESCE(u.first_name || ' ' || u.last_name, u.email, 'Cardholder') AS full_name
       FROM cards c
       JOIN users u ON c.user_id = u.id
       WHERE (c.id = $1 OR c.card_number = $1 OR c.user_id = $2) AND c.user_id = $2
       LIMIT 1`,
      [cardId, userId]
    );

    if (cardCheck.rows.length === 0) {
      if (client) await client.query('ROLLBACK');
      return res.status(404).json({ success: false, valid: false, message: 'Card record not found in system.' });
    }

    const card = cardCheck.rows[0];
    if (card.status !== 'active') {
      if (client) await client.query('ROLLBACK');
      
      // Log rejected scan
      await db.query(
        `INSERT INTO card_scans (card_number, user_id, merchant_id, tier, status, scanned_at)
         VALUES ($1, $2, $3, $4, 'rejected', NOW())`,
        [card.card_number || cardId, userId, merchantId, tier || card.tier_name || 'standard']
      );

      return res.status(403).json({ success: false, valid: false, message: `Pass is ${card.status}. Redemption rejected.` });
    }

    // Record audit scan record
    await queryRunner.query(
      `INSERT INTO card_scans (card_number, user_id, merchant_id, tier, status, scanned_at)
       VALUES ($1, $2, $3, $4, 'valid', NOW())`,
      [card.card_number || cardId, userId, merchantId, tier || card.tier_name || 'standard']
    );

    // Record redemption in database
    const redemptionResult = await queryRunner.query(
      `INSERT INTO redemptions (user_id, card_id, merchant_id, store_id, discount_amount, status, redeemed_at)
       VALUES ($1, $2, $3, $4, $5, 'completed', NOW())
       RETURNING id, redeemed_at`,
      [userId, card.id, merchantId, storeId || 'store_default', discountAmount || 0.00]
    );

    if (client) await client.query('COMMIT');

    return res.json({
      success: true,
      valid: true,
      message: 'Discount verified and applied!',
      customer: { name: card.full_name, cardId: card.id, cardNumber: card.card_number },
      discount: { title: 'Standard Affiliate Discount', amount: discountAmount || 0.00 },
      redemption: redemptionResult.rows[0]
    });

  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
    console.error('Verification error:', error.message);
    return res.status(500).json({ success: false, valid: false, message: 'Server error during pass verification.' });
  } finally {
    if (client && typeof client.release === 'function') client.release();
  }
});

/**
 * POST /v1/discounts/sync-offline
 * Batch processes offline redemptions queued by cashier terminals
 */
router.post('/sync-offline', verifyToken, async (req, res) => {
  let client;

  try {
    const { batch } = req.body || {};
    const merchantId = req.user?.id || req.user?.userId;

    if (!Array.isArray(batch) || batch.length === 0) {
      return res.status(400).json({ success: false, message: 'Batch array is required.' });
    }

    if (typeof db.getClient === 'function') {
      client = await db.getClient();
      await client.query('BEGIN');
    }
    const queryRunner = client || db;

    let syncedCount = 0;
    const details = [];

    for (const item of batch) {
      const rawToken = item.token || item.qrData;
      const scannedAt = item.scannedAt || item.timestamp ? new Date(item.scannedAt || item.timestamp) : new Date();

      if (!rawToken) {
        details.push({ offlineId: item.offlineId, status: 'failed', error: 'Missing token data.' });
        continue;
      }

      let userId, cardId;

      // Extract details based on token format
      if (rawToken.startsWith('PEXI:') || rawToken.split('.').length === 3) {
        try {
          const jwtToken = rawToken.startsWith('PEXI:') ? rawToken.split('PEXI:')[1] : rawToken;
          const decoded = jwt.verify(jwtToken, QR_HMAC_SECRET, { ignoreExpiration: true });
          userId = decoded.userId || decoded.id;
          cardId = decoded.cardNumber || decoded.cardId;
        } catch (_) {
          details.push({ offlineId: item.offlineId, status: 'failed', error: 'Invalid JWT.' });
          continue;
        }
      } else {
        const parts = rawToken.split(':');
        if (parts.length === 4) {
          [userId, cardId] = parts;
        } else {
          details.push({ offlineId: item.offlineId, status: 'failed', error: 'Malformed token.' });
          continue;
        }
      }

      // Query card ID mapping if necessary
      const cardResult = await queryRunner.query(
        `SELECT id FROM cards WHERE id = $1 OR card_number = $1 OR user_id = $2 LIMIT 1`,
        [cardId, userId]
      );
      const mappedCardId = cardResult.rows[0]?.id || cardId;

      // Insert redemption record with fallback
      await queryRunner.query(
        `INSERT INTO redemptions (user_id, card_id, merchant_id, store_id, discount_amount, status, redeemed_at)
         VALUES ($1, $2, $3, $4, $5, 'completed_offline', $6)
         ON CONFLICT DO NOTHING`,
        [userId, mappedCardId, merchantId, item.storeId || 'store_default', item.discountAmount || 0.00, scannedAt]
      );

      // Log scan audit record
      await queryRunner.query(
        `INSERT INTO card_scans (card_number, user_id, merchant_id, tier, status, scanned_at)
         VALUES ($1, $2, $3, 'standard', 'valid_offline', $4)`,
        [cardId, userId, merchantId, scannedAt]
      );

      syncedCount++;
      details.push({ offlineId: item.offlineId, status: 'synced' });
    }

    if (client) await client.query('COMMIT');

    return res.json({
      success: true,
      message: `Successfully synced ${syncedCount} offline redemptions!`,
      syncedCount,
      details
    });

  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
    console.error('Offline batch sync error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to process offline batch.' });
  } finally {
    if (client && typeof client.release === 'function') client.release();
  }
});

module.exports = router;