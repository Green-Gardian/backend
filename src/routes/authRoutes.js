const express = require("express");
const router = express.Router();
const { signIn, addAdmin, refreshToken, verifyEmailAndSetPassword } = require("../controllers/authController")
const { verifyToken } = require("../middlewares/authMiddleware")

router.post("/signin", signIn);
router.post("/add-admin", verifyToken, addAdmin);
router.post("/refresh-token", refreshToken);
router.post("/verify-email", verifyEmailAndSetPassword);

module.exports = router;