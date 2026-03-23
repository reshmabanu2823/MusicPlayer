const jwt = require("jsonwebtoken");

const SECRET_KEY = process.env.JWT_SECRET || "secretkey";

/*
========================================
JWT Authentication Middleware
Purpose: Protect routes by verifying token
========================================
*/

const authenticateToken = (req, res, next) => {

    try {

        // Get Authorization header
        const authHeader = req.headers["authorization"];

        // Extract token (Bearer TOKEN)
        const token = authHeader && authHeader.split(" ")[1];

        // If token not provided
        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Access token required"
            });
        }

        // Verify token
        jwt.verify(token, SECRET_KEY, (err, decodedUser) => {

            if (err) {
                return res.status(403).json({
                    success: false,
                    message: "Invalid or expired token"
                });
            }

            // Attach user info to request
            req.user = decodedUser;

            // Continue to next controller
            next();

        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: "Authentication middleware error",
            error: error.message
        });

    }

};

module.exports = authenticateToken;