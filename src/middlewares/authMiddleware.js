const jwt = require("jsonwebtoken");
require("dotenv").config();


const verifyToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    console.log("Auth header:", authHeader);

    if (!authHeader) return res.status(401).json({ message: "No token provided" });
    const token = authHeader.split(" ")[1];
    console.log("Extracted token:", token ? "Token exists" : "No token");

    try{
        const decoded = jwt.verify(token,process.env.JWT_ACCESS_SECRET);
        console.log("Decoded token:", decoded);

        req.user = decoded;
        console.log("Token verified!")
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

module.exports = { verifyToken, verifySuperAdmin, verifyAdminOrSuperAdmin};