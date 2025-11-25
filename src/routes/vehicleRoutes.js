const express = require("express");
const router = express.Router();
const { addVehicle, getVehicles, updateVehicle, deleteVehicle } = require("../controllers/vehicleContoller")
const { verifyAdminOrSuperAdmin } = require("../middlewares/authMiddleware")

router.post("/add-vehicle/", verifyAdminOrSuperAdmin, addVehicle);
router.get("/get-vehicles/", getVehicles);
router.put("/update-vehicle/:id/", verifyAdminOrSuperAdmin, updateVehicle);

//REMOVED VEHICLE UPDATE API
// router.delete("/delete-vehicle/:id/", verifyAdminOrSuperAdmin, deleteVehicle);

module.exports = router;