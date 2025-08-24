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
    resetPassword,
    getAllUsers,
    blockUser,
    deleteUser,
    getSystemStats
} = require("../controllers/authController");
const { verifyToken, verifySuperAdmin, verifyAdminOrSuperAdmin } = require("../middlewares/authMiddleware")

router.post("/signout", verifyToken, signOut);
router.get("/list-admins", verifyToken, verifySuperAdmin, listAdmins);
router.post("/signin", signIn);
router.post("/add-admin-and-staff", verifyToken, verifyAdminOrSuperAdmin, addAdminAndStaff);
router.post("/refresh-token", verifyToken, refreshToken);
router.post("/verify-email", verifyEmailAndSetPassword);
router.post("/change-password", verifyToken, changePassword);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Super Admin Routes
router.get("/users", verifyToken, verifySuperAdmin, getAllUsers);
router.patch("/users/:userId/block", verifyToken, verifySuperAdmin, blockUser);
router.delete("/users/:userId", verifyToken, verifySuperAdmin, deleteUser);
router.get("/system-stats", verifyToken, verifySuperAdmin, getSystemStats);

module.exports = router;