/**
 * QR Pass Scan & Validation Routes
 * File: server/routes/scan.js
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

const QR_HMAC_SECRET = process.env.QR_HMAC_SECRET || process.env.JWT_SECRET;

/**
 * @route   POST /api/scan/validate
 * @desc    Scan and validate a dynamic digital QR pass (Merchant Terminal)
 * @access  Private (Affiliates/Merchants & Admins)
 */
router.post('/validate', verifyToken, requireRole('affiliate', 'merchant', 'admin'), async (req, res) => {
  let client;

  try {
    const { qrData, storeId, discountAmount } = req.body || {};
    const merchantId = req.user.id || req.user.userId;

    if (!qrData) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: 'QR code data is required for validation.'
      });
    }

    // 1. Extract signed JWT from "PEXI:<JWT_TOKEN>" raw scan string
    let rawJwt = qrData;
    if (qrData.startsWith('PEXI:')) {
      rawJwt = qrData.split('PEXI:')[1];
    }

    // 2. Decode and verify the dynamic QR HMAC token
    let decodedPass;
    try {
      decodedPass = jwt.verify(rawJwt, QR_HMAC_SECRET);
    } catch (err) {
      const isExpired = err.name === 'TokenExpiredError';
      return res.status(400).json({
        success: false,
        valid: false,
        status: isExpired ? 'expired' : 'invalid',
        message: isExpired
          ? 'Pass validation failed: QR code has expired.'
          : 'Pass validation failed: Invalid or altered QR code.'
      });
    }

    const { userId, cardNumber, tier } = decodedPass;

    if (!userId || !cardNumber) {
      return res.status(400).json({
        success: false,
        valid: false,
        status: 'invalid',
        message: 'Pass payload is missing critical identifier attributes.'
      });
    }

    // 3. Acquire DB Client for transactional execution
    if (typeof db.getClient === 'function') {
      client = await db.getClient();
      await client.query('BEGIN');
    }
    const queryRunner = client || db;

    // 4. Validate user account status in database
    const userResult = await queryRunner.query(
      `SELECT id, first_name, last_name, email, phone, status 
       FROM users 
       WHERE id = $1 
       LIMIT 1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      if (client) await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        valid: false,
        status: 'user_not_found',
        message: 'Passholder account not found.'
      });
    }

    const passholder = userResult.rows[0];

    if (passholder.status && passholder.status !== 'active') {
      if (client) await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        valid: false,
        status: passholder.status,
        message: `Passholder account is currently ${passholder.status}.`
      });
    }

    // 5. Query and verify digital card record
    let cardResult;
    try {
      cardResult = await queryRunner.query(
        `SELECT id, card_number, tier_name, status, is_active, expires_at 
         FROM cards 
         WHERE card_number = $1 OR user_id = $2 
         LIMIT 1`,
        [cardNumber, userId]
      );
    } catch (_) {
      cardResult = await queryRunner.query(
        `SELECT id, card_number, tier AS tier_name, status, created_at AS expires_at 
         FROM digital_cards 
         WHERE card_number = $1 OR user_id = $2 
         LIMIT 1`,
        [cardNumber, userId]
      );
    }

    if (cardResult.rows.length === 0) {
      if (client) await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        valid: false,
        status: 'card_not_found',
        message: 'Digital card record not found.'
      });
    }

    const card = cardResult.rows[0];

    // Verify card active status & expiration date
    const now = new Date();
    const isCardExpired = card.expires_at && new Date(card.expires_at) < now;

    if (card.status !== 'active' || (card.is_active === false) || isCardExpired) {
      if (client) await client.query('ROLLBACK');
      
      // Audit log failed scan attempt
      await db.query(
        `INSERT INTO card_scans (card_number, user_id, merchant_id, tier, status, scanned_at)
         VALUES ($1, $2, $3, $4, 'rejected', NOW())`,
        [cardNumber, userId, merchantId, tier || card.tier_name]
      );

      return res.status(400).json({
        success: false,
        valid: false,
        status: isCardExpired ? 'expired' : card.status,
        message: isCardExpired ? 'Digital pass has expired.' : 'Digital pass is inactive or revoked.'
      });
    }

    // 6. Log successful scan attempt into `card_scans`
    await queryRunner.query(
      `INSERT INTO card_scans (card_number, user_id, merchant_id, tier, status, scanned_at)
       VALUES ($1, $2, $3, $4, 'valid', NOW())`,
      [cardNumber, userId, merchantId, tier || card.tier_name]
    );

    // 7. Log discount redemption into `redemptions`
    let redemptionId = null;
    try {
      const redemptionResult = await queryRunner.query(
        `INSERT INTO redemptions (card_id, merchant_id, user_id, store_id, discount_amount, status, redeemed_at)
         VALUES ($1, $2, $3, $4, $5, 'completed', NOW())
         RETURNING id`,
        [card.id, merchantId, userId, storeId || 'DEFAULT', discountAmount || 0.00]
      );
      redemptionId = redemptionResult.rows[0]?.id;
    } catch (redemptionErr) {
      console.warn('Redemption logging notice:', redemptionErr.message);
    }

    if (client) await client.query('COMMIT');

    // 8. Return successful validation response payload
    return res.status(200).json({
      success: true,
      valid: true,
      status: 'valid',
      message: 'Pass validated successfully!',
      passholder: {
        id: passholder.id,
        fullName: `${passholder.first_name || ''} ${passholder.last_name || ''}`.trim(),
        email: passholder.email,
        phone: passholder.phone
      },
      card: {
        id: card.id,
        cardNumber: card.card_number,
        tier: card.tier_name || tier,
        expiresAt: card.expires_at
      },
      redemption: {
        id: redemptionId,
        discountAmount: discountAmount || 0.00,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }

    console.error('====================================');
    console.error('❌ QR VALIDATION ERROR AT:', new Date().toISOString());
    console.error('Error Message:', error.message);
    console.error('Stack Trace:', error.stack);
    console.error('Request Body:', req.body);
    console.error('====================================');

    return res.status(500).json({
      success: false,
      valid: false,
      message: 'Server error during QR validation: ' + error.message
    });
  } finally {
    if (client && typeof client.release === 'function') {
      client.release();
    }
  }
});

/**
 * @route   GET /api/scan/history
 * @desc    Fetch recent scan validation history for logged-in merchant
 * @access  Private (Affiliates/Merchants)
 */
router.get('/history', verifyToken, requireRole('affiliate', 'merchant', 'admin'), async (req, res) => {
  try {
    const merchantId = req.user.id || req.user.userId;

    const scansResult = await db.query(
      `SELECT cs.id, cs.card_number, cs.tier, cs.status, cs.scanned_at,
              u.first_name, u.last_name, u.email
       FROM card_scans cs
       LEFT JOIN users u ON cs.user_id = u.id
       WHERE cs.merchant_id = $1
       ORDER BY cs.scanned_at DESC
       LIMIT 50`,
      [merchantId]
    );

    return res.status(200).json({
      success: true,
      scans: scansResult.rows.map(row => ({
        id: row.id,
        cardNumber: row.card_number,
        tier: row.tier,
        status: row.status,
        scannedAt: row.scanned_at,
        passholderName: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Anonymous'
      }))
    });
  } catch (error) {
    console.error('❌ FETCH SCAN HISTORY ERROR:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve scan history.'
    });
  }
});

module.exports = router;