/**
 * JWT Authentication Middleware
 * File: server/middleware/auth.js
 */

const jwt = require('jsonwebtoken');

/**
 * Verifies JWT token attached in Bearer Authorization header
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Expecting "Bearer <TOKEN>"

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Authorization token missing.'
    });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error('FATAL BACKEND ERROR: JWT_SECRET environment variable is missing.');
    return res.status(500).json({
      success: false,
      message: 'Internal server configuration error.'
    });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded; // Attach user payload ({ userId, email, role }) to request
    next();
  } catch (err) {
    console.warn(`JWT Verification Failed [${err.name}]: ${err.message}`);
    
    // Status 401 signals frontend (app.js) to clean expired storage keys & redirect cleanly
    return res.status(401).json({
      success: false,
      message: err.name === 'TokenExpiredError' 
        ? 'Authentication token has expired. Please log in again.' 
        : 'Invalid authentication token.'
    });
  }
}

/**
 * Optional Role Authorization Middleware
 * Usage: router.get('/admin-data', verifyToken, requireRole('admin'), controller)
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. User identity or role missing.'
      });
    }

    const userRole = req.user.role.toLowerCase();
    const hasRole = allowedRoles.some((r) => r.toLowerCase() === userRole);

    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: `Forbidden. Access requires one of the following roles: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
}

module.exports = verifyToken;
module.exports.verifyToken = verifyToken;
module.exports.requireRole = requireRole;