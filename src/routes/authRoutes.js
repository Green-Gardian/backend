const express = require("express");
const router = express.Router();
const { 
    signIn, 
    listAdmins, 
    signOut, 
    addAdminAndStaff, 
    refreshToken, 
    verifyEmailAndSetPassword,
    changePassword,
    forgotPassword,
    resetPassword
} = require("../controllers/authController");
const { verifyToken } = require("../middlewares/authMiddleware")


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

router.post("/signout", verifyToken, signOut);
router.get("/list-admins", verifyToken, verifySuperAdmin, listAdmins);
router.post("/sign-in", signIn);
router.post("/add-admin-and-staff", verifyToken, verifyAdminOrSuperAdmin, addAdminAndStaff);
router.post("/refresh-token", verifyToken, refreshToken);
router.post("/verify-email", verifyEmailAndSetPassword);
router.post("/change-password", verifyToken, changePassword);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);


module.exports = router;