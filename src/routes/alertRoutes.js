const express = require("express");
const router = express.Router();
const {
    createAlert,
    getAlerts,
    getAlertDetails,
    updateAlert,
    cancelAlert,
    getAlertStats,
    getAlertTypes,
    getUserNotificationPreferences,
    updateUserNotificationPreferences,
    registerPushToken,
    testNotificationService,
    getCommunicationLogs
} = require("../controllers/alertController");

const { 
    verifyToken, 
    verifySuperAdmin, 
    verifyAdminOrSuperAdmin 
} = require("../middlewares/authMiddleware");

// Public routes (no authentication required)
router.get("/types", getAlertTypes);

// Protected routes (authentication required)
router.use(verifyToken);

// Alert management routes
router.post("/", verifyAdminOrSuperAdmin, createAlert);
router.get("/", getAlerts);
router.get("/stats", getAlertStats);

// User notification preferences
router.get("/preferences", getUserNotificationPreferences);
router.put("/preferences", updateUserNotificationPreferences);

// Push notification registration
router.post("/push-token", registerPushToken);

// Communication logs (admin and super admin only)
router.get("/logs", verifyAdminOrSuperAdmin, getCommunicationLogs);

// Super admin only routes
router.post("/test-notification", verifySuperAdmin, testNotificationService);

// Parameterized routes (must come last to avoid conflicts)
router.get("/:alertId", getAlertDetails);
router.put("/:alertId", verifyAdminOrSuperAdmin, updateAlert);
router.delete("/:alertId", verifyAdminOrSuperAdmin, cancelAlert);

module.exports = router;
