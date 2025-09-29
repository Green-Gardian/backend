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
} = require("../controllers/authController");

const {
  verifyToken,
  verifySuperAdmin,
  verifyAdminOrSuperAdmin,
} = require("../middlewares/authMiddleware");

router.post("/signout", verifyToken, signOut);
router.get("/list-admins", verifyToken, verifySuperAdmin, listAdmins);
router.post("/signin", signIn);
router.post(
  "/add-admin-and-staff",
  verifyToken,
  verifyAdminOrSuperAdmin,
  addAdminAndStaff
);

router.post("/refresh-token", verifyToken, refreshToken);
router.post("/verify-email", verifyEmailAndSetPassword);
router.post("/change-password", verifyToken, changePassword);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/profile", verifyToken, getProfileData);
router.put("/update-profile", verifyToken, updateProfile);
router.post("/add-resident", verifyToken, verifyAdminOrSuperAdmin, addResident);
router.get("/get-users-by-society", verifyToken, getUsersBySociety);

// Super Admin Routes
router.post("/verify-otp-reset", verifyOTPAndResetPassword);

// Super Admin Routes
router.get("/users", verifyToken, verifyAdminOrSuperAdmin, getAllUsers);
router.put("/users/:userId", verifyToken, verifyAdminOrSuperAdmin, updateUser);
router.patch("/users/:userId/block", verifyToken, verifyAdminOrSuperAdmin, blockUser);
router.delete("/users/:userId", verifyToken, verifyAdminOrSuperAdmin, deleteUser);
router.get("/system-stats", verifyToken, verifySuperAdmin, getSystemStats);

module.exports = router;
