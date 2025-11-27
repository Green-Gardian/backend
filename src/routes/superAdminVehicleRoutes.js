const express = require("express");
const router = express.Router();
const {
    addVehicleToInventory,
    getAllVehiclesInventory,
    updateVehicleInventory,
    blockVehicle,
    unblockVehicle,
    getAvailableVehicles,
} = require("../controllers/superAdminVehicleController");
const { verifyToken, verifySuperAdmin, verifyAdminOrSuperAdmin } = require("../middlewares/authMiddleware");

// Super Admin Routes - Vehicle Inventory Management
router.post("/add-to-inventory", verifyToken, verifySuperAdmin, addVehicleToInventory);
router.get("/inventory", verifyToken, verifySuperAdmin, getAllVehiclesInventory);
router.put("/inventory/:id", verifyToken, verifySuperAdmin, updateVehicleInventory);
router.put("/block/:id", verifyToken, verifySuperAdmin, blockVehicle);
router.put("/unblock/:id", verifyToken, verifySuperAdmin, unblockVehicle);
// Available vehicles for assignment (Admin can access)
router.get("/available", verifyToken, verifyAdminOrSuperAdmin, getAvailableVehicles);

module.exports = router;
