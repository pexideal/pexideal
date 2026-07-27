/**
 * JWT Authentication Middleware
 * File: server/middleware/auth.js
 */

const jwt = require('jsonwebtoken');

module.exports = function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Expecting "Bearer <TOKEN>"

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Authorization token missing.'
    });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'fallback_secret_key'
    );
    req.user = decoded; // Attach user payload ({ userId, email, role }) to request
    next();
  } catch (err) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired authentication token.'
    });
  }
};