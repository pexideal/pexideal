/**
 * System Admin Management Routes
 * File: server/routes/admin.js
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const verifyToken = require('../middleware/auth');

/**
 * Admin Role Check Middleware
 * Ensures only users with role === 'admin' can access these endpoints
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: 'Forbidden: Admin credentials required.' 
    });
  }
  next();
};

// Apply JWT verification and Admin role check to ALL routes in this file
router.use(verifyToken, requireAdmin);

/**
 * GET /api/admin/overview
 * System-wide metrics (Total Users, Active Cards, Total Redemptions, Active Merchants)
 */
router.get('/overview', async (req, res) => {
  try {
    const totalUsers = await db.query(`SELECT COUNT(*) FROM users WHERE role = 'client'`);
    const activeCards = await db.query(`SELECT COUNT(*) FROM cards WHERE status = 'active'`);
    const totalMerchants = await db.query(`SELECT COUNT(*) FROM users WHERE role = 'merchant'`);
    const totalRedemptions = await db.query(`SELECT COUNT(*) FROM redemptions`);

    // Recent 10 redemptions for live feed
    const recentActivity = await db.query(
      `SELECT r.id, r.store_id, r.redeemed_at, u.full_name 
       FROM redemptions r
       JOIN users u ON r.user_id = u.id
       ORDER BY r.redeemed_at DESC 
       LIMIT 10`
    );

    return res.json({
      success: true,
      stats: {
        totalUsers: parseInt(totalUsers.rows[0].count, 10),
        activeCards: parseInt(activeCards.rows[0].count, 10),
        totalMerchants: parseInt(totalMerchants.rows[0].count, 10),
        totalRedemptions: parseInt(totalRedemptions.rows[0].count, 10)
      },
      recentActivity: recentActivity.rows
    });

  } catch (error) {
    console.error('Admin overview error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch admin overview.' });
  }
});

/**
 * GET /api/admin/users
 * Retrieve list of all registered clients & merchants
 */
router.get('/users', async (req, res) => {
  try {
    const users = await db.query(
      `SELECT id, full_name, email, role, created_at 
       FROM users 
       ORDER BY created_at DESC`
    );

    return res.json({
      success: true,
      users: users.rows
    });
  } catch (error) {
    console.error('Admin fetch users error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch user list.' });
  }
});

/**
 * PATCH /api/admin/cards/:id/status
 * Activate, suspend, or revoke a client's Pexideal card
 */
router.patch('/cards/:id/status', async (req, res) => {
  const cardId = req.params.id;
  const { status } = req.body; // e.g., 'active', 'suspended', 'revoked'

  const validStatuses = ['active', 'suspended', 'revoked'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid status. Must be active, suspended, or revoked.' 
    });
  }

  try {
    const updatedCard = await db.query(
      `UPDATE cards 
       SET status = $1 
       WHERE id = $2 
       RETURNING id, user_id, status`,
      [status, cardId]
    );

    if (updatedCard.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Card not found.' });
    }

    return res.json({
      success: true,
      message: `Card status updated to ${status}.`,
      card: updatedCard.rows[0]
    });

  } catch (error) {
    console.error('Admin update card error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update card status.' });
  }
});

/**
 * GET /api/admin/redemptions
 * View detailed logs of all merchant discount redemptions
 */
router.get('/redemptions', async (req, res) => {
  try {
    const redemptions = await db.query(
      `SELECT r.id, r.user_id, r.card_id, r.store_id, r.redeemed_at, u.full_name as client_name
       FROM redemptions r
       JOIN users u ON r.user_id = u.id
       ORDER BY r.redeemed_at DESC
       LIMIT 100`
    );

    return res.json({
      success: true,
      redemptions: redemptions.rows
    });
  } catch (error) {
    console.error('Admin fetch redemptions error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch redemption logs.' });
  }
});

module.exports = router;