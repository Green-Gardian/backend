// routes/subAdminRoutes.js
const express = require("express");
const router = express.Router();
const { verifyToken, verifyAdminOrSuperAdmin } = require("../middlewares/authMiddleware");
const { getActivityLogs, getActivityLogStats } = require("../controllers/subAdminController");

// Get activity logs with pagination and filters
router.get("/logs", verifyToken, verifyAdminOrSuperAdmin, getActivityLogs);

// Get activity log statistics
router.get("/logs/stats", verifyToken, verifyAdminOrSuperAdmin, getActivityLogStats);

module.exports = router;

