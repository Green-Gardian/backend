const express = require("express");
const router = express.Router();
const { addVehicle, getVehicles, updateVehicle } = require("../controllers/vehicleContoller")

router.post("/add-vehicle/", addVehicle);
router.get("/get-vehicles/", getVehicles);
router.put("/update-vehicle/:id/", updateVehicle);

module.exports = router;