const { response } = require("express");
const { pool } = require("../config");

const addVehicle = async (req, res) => {
    try {
        const { plat_no, status, driver_name } = req.body;

        const userRole = req.user.role;

        if (userRole !== "Admin") {
            return response.json({
                messagge: "User with this Role is not allowed to add Vehicle"
            })
        }

        if (!plat_no || !status) {
            return res.status(400).json({
                message: "Plate number and status are required"
            });
        }

        const userId = req.user.id;

        const vehicleData = {
            plat_no,
            status,
            driver_name,
            created_by: userId,
            created_at: new Date()
        };



        console.log("Vehicle data to save:", vehicleData);

        res.status(201).json({
            message: "Vehicle added successfully",
            vehicle: vehicleData
        });

    } catch (error) {
        console.error("Error adding vehicle:", error);
        res.status(500).json({
            message: "Internal server error",
            error: error.message
        });
    }
};

const getVehicle = async (req, res) => {

}