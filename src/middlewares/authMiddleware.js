const jwt = require("jsonwebtoken");
require("dotenv").config();
const { pool } = require("../config/db");


const verifyToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    // console.log("Auth header:", authHeader);

    if (!authHeader) return res.status(401).json({ message: "No token provided" });
    const token = authHeader.split(" ")[1];
    // console.log("Extracted token:", token ? "Token exists" : "No token");

    try{
        const decoded = jwt.verify(token,process.env.JWT_ACCESS_SECRET);
        
        req.user = decoded;
        // console.log("Token verified!")
        next();
    }
    catch (error) {
        console.log("Token verification error:", error.message);
        return res.status(500).json({ message: "Invalid token" })
    }
}

const verifySuperAdmin = (req, res, next) => {
    if( req.user.role === 'super_admin') {
        next();
    }   
    else {
        return res.status(403).json({ message: "Forbidden" });
    }
}

const verifyAdminOrSuperAdmin = (req, res, next) => {
    if (req.user.role === 'super_admin' || req.user.role === 'admin') {
        next();
    }
    else {
        return res.status(403).json({ message: "Forbidden"});
    }
}

// Middleware to check if MFA is set up for admin/super_admin
// This should be used after verifyToken and verifyAdminOrSuperAdmin
const verifyMFASetup = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;

        // Only enforce MFA for admin and super_admin
        if (userRole !== 'admin' && userRole !== 'super_admin') {
            return next();
        }

        // Check MFA setup status
        const userQuery = await pool.query(
            `SELECT id, role, mfa_enabled, mfa_verified, totp_secret FROM users WHERE id = $1`,
            [userId]
        );

        if (userQuery.rows.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        const user = userQuery.rows[0];

        // Check if MFA is properly set up (has secret and is verified)
        const hasMFASetup = user.mfa_enabled && user.totp_secret && user.mfa_verified;

        if (!hasMFASetup) {
            return res.status(403).json({ 
                message: "MFA setup is required. Please complete MFA setup to access this resource.",
                requiresMFASetup: true,
                mfaStatus: {
                    mfaEnabled: user.mfa_enabled || false,
                    hasSecret: !!user.totp_secret,
                    mfaVerified: user.mfa_verified || false
                }
            });
        }

        next();
    } catch (error) {
        console.error("Error verifying MFA setup:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = { verifyToken, verifySuperAdmin, verifyAdminOrSuperAdmin, verifyMFASetup};