const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Protect routes by verifying the JWT Bearer token.
 */
const protect = async (req, res, next) => {
    let token;

    if (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.slice(7);
    } else {
        return res.status(401).json({ message: 'Authentication failed: No token provided.' });
    }

    try {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            console.error('JWT_SECRET is not configured.');
            return res.status(500).json({ message: 'Server authentication is misconfigured.' });
        }

        const decoded = jwt.verify(token, secret);
        req.user = await User.findById(decoded.id).select('-password');

        if (!req.user) {
            return res.status(401).json({ message: 'Authentication failed: User not found.' });
        }

        next();
    } catch (error) {
        console.error('Token Verification Error:', error.message);
        return res.status(401).json({ message: 'Authentication failed: Token invalid or expired.' });
    }
};

/**
 * Authorize by permission string, e.g. "GROUP:READ".
 * Placeholder until full RBAC evaluation is wired to Group.permissions.
 */
const authorize = (permission) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({ message: 'Authorization required.' });
            }

            if (!permission || typeof permission !== 'string') {
                return res.status(500).json({ message: 'Authorization is misconfigured.' });
            }

            // Placeholder: authenticated users pass. Replace with Group.permissions checks.
            next();
        } catch (error) {
            return res.status(403).json({ message: `Forbidden: Insufficient permissions for ${permission}.` });
        }
    };
};

module.exports = { protect, authorize };
