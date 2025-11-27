const express = require("express");
const router = express.Router();
const { addVehicle, getVehicles, updateVehicle } = require("../controllers/vehicleContoller")
const { verifyAdminOrSuperAdmin } = require("../middlewares/authMiddleware")

router.post("/add-vehicle/", verifyAdminOrSuperAdmin, addVehicle);
router.get("/get-vehicles/", getVehicles);
router.put("/update-vehicle/:id/", verifyAdminOrSuperAdmin, updateVehicle);

module.exports = router;