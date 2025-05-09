const express = require("express");
const router  = express.Router();
const {signIn,signUp,refreshToken} = require("../controllers/authController")

router.post("/signin",signIn);
router.post("/signup",signUp);
router.post("/refresh-token",refreshToken);

module.exports = router;