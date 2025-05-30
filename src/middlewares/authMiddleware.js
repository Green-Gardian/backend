const jwt = require("jsonwebtoken");
require("dotenv").config();


const verifyToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];

    if (!authHeader) return res.status(401).json({ message: "No token provided" });
    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

        if (decoded.role !== "superadmin") return res.status(403).json({ message: "Access denied" });

        req.user = decoded;
        console.log("Token verified!")
        next();
    }
    catch (error) {
        return res.status(500).json({ message: "Invalid token" })
    }
}

module.exports = { verifyToken };