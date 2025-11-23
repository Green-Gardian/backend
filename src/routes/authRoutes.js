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
  getSystemStats,
  getProfileData,
  addResident,
  updateProfile,
  getUsersBySociety,
  verifyOTPAndResetPassword,
  updateUser,
  generateMFASecret,
  enableMFA,
  verifyMFA,
  disableMFA,
  getMFAStatus
} = require("../controllers/authController");

const {
  verifyToken,
  verifySuperAdmin,
  verifyAdminOrSuperAdmin,
  verifyMFASetup,
} = require("../middlewares/authMiddleware");

router.post("/signout", verifyToken, verifyMFASetup, signOut);
router.get("/list-admins", verifyToken, verifySuperAdmin, verifyMFASetup, listAdmins);
router.post("/signin", signIn);
router.post(
  "/add-admin-and-staff",
  verifyToken,
  verifyAdminOrSuperAdmin,
  verifyMFASetup,
  addAdminAndStaff
);

router.post("/refresh-token", verifyToken, refreshToken);
router.post("/verify-email", verifyEmailAndSetPassword);
router.post("/change-password", verifyToken, verifyMFASetup, changePassword);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/profile", verifyToken, verifyMFASetup, getProfileData);
router.put("/update-profile", verifyToken, verifyMFASetup, updateProfile);
router.post("/add-resident", verifyToken, verifyAdminOrSuperAdmin, verifyMFASetup, addResident);
router.get("/get-users-by-society", verifyToken, verifyMFASetup, getUsersBySociety);

// Super Admin Routes
router.post("/verify-otp-reset", verifyOTPAndResetPassword);

// Super Admin Routes
router.get("/users", verifyToken, verifyAdminOrSuperAdmin, verifyMFASetup, getAllUsers);
router.put("/users/:userId", verifyToken, verifyAdminOrSuperAdmin, verifyMFASetup, updateUser);
router.patch("/users/:userId/block", verifyToken, verifyAdminOrSuperAdmin, verifyMFASetup, blockUser);
router.delete("/users/:userId", verifyToken, verifyAdminOrSuperAdmin, verifyMFASetup, deleteUser);
router.get("/system-stats", verifyToken, verifySuperAdmin, verifyMFASetup, getSystemStats);

// MFA Routes - These should NOT require MFA setup (they are used to set up MFA)
router.get("/mfa/status", verifyToken, getMFAStatus);
router.post("/mfa/generate-secret", verifyToken, generateMFASecret);
router.post("/mfa/enable", verifyToken, enableMFA);
router.post("/mfa/verify", verifyMFA);
router.post("/mfa/disable", verifyToken, disableMFA);

module.exports = router;