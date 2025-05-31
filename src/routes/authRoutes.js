const express = require("express");
const router  = express.Router();
const {signIn,signUp,refreshToken,verifyEmailAndSetPassword} = require("../controllers/authController")

router.post("/signin",signIn);
router.post("/signup",signUp);
router.post("/refresh-token",refreshToken);
router.post("/verify-email",verifyEmailAndSetPassword);

module.exports = router;