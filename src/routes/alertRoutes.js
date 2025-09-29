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

router.get("/types", getAlertTypes);

router.use(verifyToken);

router.post("/", verifyAdminOrSuperAdmin, createAlert);
router.get("/", getAlerts);
router.get("/stats", getAlertStats);

router.get("/preferences", getUserNotificationPreferences);
router.put("/preferences", updateUserNotificationPreferences);

router.post("/push-token", registerPushToken);

router.get("/logs", verifyAdminOrSuperAdmin, getCommunicationLogs);

router.post("/test-notification", verifySuperAdmin, testNotificationService);

router.get("/:alertId", getAlertDetails);
router.put("/:alertId", verifyAdminOrSuperAdmin, updateAlert);
router.delete("/:alertId", verifyAdminOrSuperAdmin, cancelAlert);

module.exports = router;
