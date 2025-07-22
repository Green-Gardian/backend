const express = require("express");
const router = express.Router();
const { signIn, addAdminAndStaff, refreshToken, verifyEmailAndSetPassword } = require("../controllers/authController")
const { verifyToken } = require("../middlewares/authMiddleware")

router.post("/signin", signIn);
router.post("/add-admin", verifyToken, addAdminAndStaff);
router.post("/refresh-token", verifyToken, refreshToken);
router.post("/verify-email", verifyEmailAndSetPassword);

module.exports = router;