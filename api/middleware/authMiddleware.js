const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * @desc    Protect the route by verifying the JWT token
 * @access  Private (Requires Token)
*/
const protect = async (req, res, next) => {
    let token;

    // Check for token in headers (Bearer Token standard)
    if (typeof req.headers.authorization === 'string' && req.headers.authorization.split(' ')[0] === 'Bearer') {
        token = req.headers.authorization.split(' ')[1];
    } else {
        return res.status(401).json({ message: 'Authentication failed: No token provided.' });
    }

    try {
        // Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
        
        // Attach user payload (e.g., ID) to the request object for use in controllers/middleware
        req.user = await User.findById(decoded.id).select('-password'); 

        if (!req.user) {
            return res.status(401).json({ message: 'Authentication failed: User not found.' });
        }
        
        next(); // Proceed to the next middleware/route handler
    } catch (error) {
        console.error("Token Verification Error:", error);
        res.status(401).json({ message: 'Authentication failed: Token invalid or expired.' });
    }
};

/**
 * @desc Middleware to check if the authenticated user has a specific permission
 * @param {string[]} requiredPermissions - e.g., ['READ', 'WRITE']
* @param {'USER'|'GROUP'|'OBJECT'} resourceType 
*/
const authorize = async (requiredPermissions, resourceType) => {
    return async (req, res, next) => {
        try {
            // In a real implementation, we would check the user's groups/roles against 
            // the GroupModel's embedded permissions for this specific object/resource type.
            
            // For now, we simulate success if the token is present and require checking manually later.
             if (!req.user) {
                 return res.status(401).json({ message: 'Authorization required.' });
             }

            console.log(`[AUTH CHECK] User ${req.user.username} checked for ${resourceType}:${requiredPermissions.join(', ')}`);
            
            // Placeholder logic: Assume success if token is valid and the user exists.
            next(); 
        } catch (error) {
            res.status(403).json({ message: `Forbidden: Insufficient permissions for ${resourceType}.` });
        }
    };
};

module.exports = { protect, authorize };