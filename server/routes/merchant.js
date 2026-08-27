/**
 * Merchant Dashboard & Analytics Routes
 * File: server/routes/merchant.js
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

/**
 * @route   GET /api/merchant/dashboard/stats
 * @desc    Get key performance indicators and aggregate metrics for merchant dashboard
 * @access  Private (Affiliates, Merchants, Admins)
 */
router.get('/dashboard/stats', verifyToken, requireRole('affiliate', 'merchant', 'admin'), async (req, res) => {
  try {
    const merchantId = req.user.id || req.user.userId;

    // 1. Total & Today's Scans
    const scanStats = await db.query(
      `SELECT 
         COUNT(*)::INT AS total_scans,
         COUNT(CASE WHEN scanned_at >= CURRENT_DATE THEN 1 END)::INT AS today_scans,
         COUNT(CASE WHEN status = 'valid' THEN 1 END)::INT AS valid_scans,
         COUNT(CASE WHEN status = 'rejected' THEN 1 END)::INT AS rejected_scans
       FROM card_scans 
       WHERE merchant_id = $1`,
      [merchantId]
    );

    // 2. Financial Metrics (Total Discounts Given)
    let financialStats = { total_discount_given: 0, today_discount_given: 0 };
    try {
      const discountResult = await db.query(
        `SELECT 
           COALESCE(SUM(discount_amount), 0)::NUMERIC AS total_discount_given,
           COALESCE(SUM(CASE WHEN redeemed_at >= CURRENT_DATE THEN discount_amount ELSE 0 END), 0)::NUMERIC AS today_discount_given
         FROM redemptions 
         WHERE merchant_id = $1 AND status = 'completed'`,
        [merchantId]
      );
      if (discountResult.rows.length > 0) {
        financialStats = discountResult.rows[0];
      }
    } catch (_) {
      // Table fallback if redemptions table is unavailable
    }

    // 3. Daily Activity Chart Data (Last 7 Days)
    const weeklyTrend = await db.query(
      `SELECT 
         TO_CHAR(DATE(scanned_at), 'YYYY-MM-DD') AS date,
         COUNT(*)::INT AS scan_count
       FROM card_scans
       WHERE merchant_id = $1 AND scanned_at >= NOW() - INTERVAL '7 days'
       GROUP BY DATE(scanned_at)
       ORDER BY DATE(scanned_at) ASC`,
      [merchantId]
    );

    // 4. Breakdown by Pass Tier
    const tierBreakdown = await db.query(
      `SELECT 
         COALESCE(tier, 'standard') AS tier, 
         COUNT(*)::INT AS count
       FROM card_scans
       WHERE merchant_id = $1
       GROUP BY tier`,
      [merchantId]
    );

    return res.status(200).json({
      success: true,
      stats: {
        totalScans: scanStats.rows[0]?.total_scans || 0,
        todayScans: scanStats.rows[0]?.today_scans || 0,
        validScans: scanStats.rows[0]?.valid_scans || 0,
        rejectedScans: scanStats.rows[0]?.rejected_scans || 0,
        totalDiscountGiven: parseFloat(financialStats.total_discount_given || 0),
        todayDiscountGiven: parseFloat(financialStats.today_discount_given || 0)
      },
      charts: {
        weeklyTrend: weeklyTrend.rows,
        tierBreakdown: tierBreakdown.rows
      }
    });

  } catch (error) {
    console.error('❌ MERCHANT STATS ERROR:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve dashboard statistics: ' + error.message
    });
  }
});

/**
 * @route   GET /api/merchant/redemptions
 * @desc    Fetch paginated redemption logs with optional status/date filters
 * @access  Private (Affiliates, Merchants, Admins)
 */
router.get('/redemptions', verifyToken, requireRole('affiliate', 'merchant', 'admin'), async (req, res) => {
  try {
    const merchantId = req.user.id || req.user.userId;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status ? String(req.query.status).toLowerCase() : null;

    let query = `
      SELECT 
        r.id,
        r.card_id,
        r.store_id,
        r.discount_amount,
        r.status,
        r.redeemed_at,
        u.first_name,
        u.last_name,
        u.email,
        c.card_number
      FROM redemptions r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN cards c ON r.card_id = c.id
      WHERE r.merchant_id = $1
    `;

    const queryParams = [merchantId];

    if (statusFilter) {
      queryParams.push(statusFilter);
      query += ` AND r.status = $${queryParams.length}`;
    }

    // Pagination
    queryParams.push(limit, offset);
    query += ` ORDER BY r.redeemed_at DESC LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`;

    const logsResult = await db.query(query, queryParams);

    // Total Count Query
    let countQuery = `SELECT COUNT(*)::INT FROM redemptions WHERE merchant_id = $1`;
    const countParams = [merchantId];
    if (statusFilter) {
      countParams.push(statusFilter);
      countQuery += ` AND status = $2`;
    }

    const totalResult = await db.query(countQuery, countParams);
    const totalLogs = totalResult.rows[0]?.count || 0;

    return res.status(200).json({
      success: true,
      pagination: {
        totalItems: totalLogs,
        currentPage: page,
        totalPages: Math.ceil(totalLogs / limit),
        pageSize: limit
      },
      redemptions: logsResult.rows.map(row => ({
        id: row.id,
        cardNumber: row.card_number || 'N/A',
        passholderName: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Anonymous',
        email: row.email,
        storeId: row.store_id,
        discountAmount: parseFloat(row.discount_amount || 0),
        status: row.status,
        redeemedAt: row.redeemed_at
      }))
    });

  } catch (error) {
    console.error('❌ REDEMPTION LOGS ERROR:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve redemption logs: ' + error.message
    });
  }
});

/**
 * @route   GET /api/merchant/stores
 * @desc    Fetch store location performance breakdown
 * @access  Private (Affiliates, Merchants, Admins)
 */
router.get('/stores', verifyToken, requireRole('affiliate', 'merchant', 'admin'), async (req, res) => {
  try {
    const merchantId = req.user.id || req.user.userId;

    const storePerformance = await db.query(
      `SELECT 
         COALESCE(store_id, 'DEFAULT') AS store_id,
         COUNT(*)::INT AS total_redemptions,
         COALESCE(SUM(discount_amount), 0)::NUMERIC AS total_discount
       FROM redemptions
       WHERE merchant_id = $1
       GROUP BY store_id
       ORDER BY total_redemptions DESC`,
      [merchantId]
    );

    return res.status(200).json({
      success: true,
      stores: storePerformance.rows.map(s => ({
        storeId: s.store_id,
        totalRedemptions: s.total_redemptions,
        totalDiscount: parseFloat(s.total_discount)
      }))
    });
  } catch (error) {
    console.error('❌ MERCHANT STORES ERROR:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve store analytics.'
    });
  }
});

module.exports = router;