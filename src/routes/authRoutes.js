const express = require("express");
const router = express.Router();
const { signIn, listAdmins,  signOut, addAdminAndStaff, refreshToken, verifyEmailAndSetPassword } = require("../controllers/authController")
const { verifyToken } = require("../middlewares/authMiddleware")


const verifySuperAdmin = (req, res, next) => {
    if( req.user.role === 'super_admin') {
        next();
    }   
    else {
        return res.status(403).json({ message: "Forbidden" });
    }
}
router.post("/signout", verifyToken, signOut);
router.get("/list-admins", verifyToken, verifySuperAdmin, listAdmins);
router.post("/sign-in", signIn);
router.post("/add-admin", verifyToken, verifySuperAdmin, addAdminAndStaff);
router.post("/refresh-token", verifyToken, refreshToken);
router.post("/verify-email", verifyEmailAndSetPassword);


module.exports = router;