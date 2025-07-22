const express = require("express");
const router = express.Router();
const { addVehicle, getVehicles, updateVehicle, deleteVehicle } = require("../controllers/vehicleContoller")

router.post("/add-vehicle/", addVehicle);
router.get("/get-vehicles/", getVehicles);
router.put("/update-vehicle/:id/", updateVehicle);
router.delete("/delete-vehicle/:id/", deleteVehicle);

module.exports = router;