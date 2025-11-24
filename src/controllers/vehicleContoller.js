const { pool } = require("../config/db");

const addVehicle = async (req, res) => {
    try {
        const { plateNo, status, driverName } = req.body;

        const userRole = req.user.role;

        if (!plateNo || !status) {
            return res.status(400).json({
                message: "Plate number and status are required",
            });
        }

        let userId = null;
        let finalDriverName = null;

        if (driverName && driverName.trim() !== "") {
            const driverQuery = `
                SELECT id, first_name, last_name, username, is_verified
                FROM users WHERE username = $1
            `;

            const driverResult = await pool.query(driverQuery, [driverName.trim()]);

            if (driverResult.rows.length === 0) {
                return res.status(404).json({
                    message: "Driver not found in users table",
                });
            }

            if (driverResult.rows.length > 1) {
                return res.status(400).json({
                    message:
                        "Multiple drivers found with that name. Please be more specific.",
                });
            }

            const driver = driverResult.rows[0];

            if (!driver.is_verified) {
                return res.status(400).json({
                    message: "Driver is not verified",
                });
            }

            userId = driver.id;
            finalDriverName = `${driver.username}`;
        }

        const insertQuery = `
            INSERT INTO vehicle (user_id, driver_name, plate_no, status) 
            VALUES ($1, $2, $3, $4) 
            RETURNING *
        `;

        const result = await pool.query(insertQuery, [
            userId,
            finalDriverName,
            plateNo,
            status,
        ]);
        const vehicleData = result.rows[0];

        console.log("Vehicle data saved:", vehicleData);

        res.status(201).json({
            message: "Vehicle added successfully",
            vehicle: vehicleData,
        });
    } catch (error) {
        console.error("Error adding vehicle:", error);
        res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

const getVehicles = async (req, res) => {
    try {
        const userRole = req.user.role;
        let query;
        let params = [];

        if (userRole === "admin" || userRole === "sub_admin" || userRole === "super_admin") {
            query = `
                SELECT * 
                FROM vehicle v 
                ORDER BY v.id DESC
            `;
        } else if (userRole === "driver") {
            query = `
                SELECT * 
                FROM vehicle v 
                ORDER BY v.id DESC
            `;
            // Remove params for driver role since query doesn't use parameters
        } else {
            return res.status(403).json({
                message: "Access denied",
            });
        }

        const result = await pool.query(query, params);

        res.status(200).json({
            message: "Vehicles retrieved successfully",
            vehicles: result.rows,
            count: result.rows.length,
        });
    } catch (error) {
        console.error("Error fetching vehicles:", error);
        res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

const updateVehicle = async (req, res) => {
    try {
        const { id } = req.params;
        const { plateNo, status, driverName } = req.body;

        const userRole = req.user.role;

        if (!id) {
            return res.status(400).json({
                message: "Vehicle ID is required",
            });
        }

        const getQuery = `SELECT * FROM vehicle WHERE id = $1`;
        const result = await pool.query(getQuery, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Vehicle not found",
            });
        }
        
        const updateFields = [];
        const updateValues = [];
        let paramCounter = 1;

        if (plateNo !== undefined) {
            updateFields.push(`plate_no = $${paramCounter}`);
            updateValues.push(plateNo);
            paramCounter++;
        }

        if (status !== undefined) {
            updateFields.push(`status = $${paramCounter}`);
            updateValues.push(status);
            paramCounter++;
        }

        if (driverName !== undefined) {
            let driverUserId = null;
            let finalDriverName = null;

            if (driverName && driverName.trim() !== "") {
                const driverQuery = `
                    SELECT id, first_name, last_name, is_verified
                    FROM users 
                    WHERE CONCAT(first_name, ' ', last_name) = $${paramCounter}
                       OR first_name = $${paramCounter}
                       OR last_name = $${paramCounter}
                       OR LOWER(CONCAT(first_name, ' ', last_name)) = LOWER($${paramCounter})
                       OR LOWER(first_name) = LOWER($${paramCounter})
                       OR LOWER(last_name) = LOWER($${paramCounter})
                `;

                const driverResult = await pool.query(driverQuery, [driverName.trim()]);

                if (driverResult.rows.length === 0) {
                    return res.status(404).json({
                        message: "Driver not found in users table",
                    });
                }

                if (driverResult.rows.length > 1) {
                    return res.status(400).json({
                        message:
                            "Multiple drivers found with that name. Please be more specific.",
                    });
                }

                const driver = driverResult.rows[0];

                if (!driver.is_verified) {
                    return res.status(400).json({
                        message: "Driver is not verified",
                    });
                }
                
                driverUserId = driver.id;
                finalDriverName = `${driver.first_name} ${driver.last_name}`;
            }

            updateFields.push(`user_id = $${paramCounter}`);
            updateValues.push(driverUserId);
            paramCounter++;

            updateFields.push(`driver_name = $${paramCounter}`);
            updateValues.push(finalDriverName);
            paramCounter++;
        }

        updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
        updateValues.push(id);

        if (updateFields.length === 1) {
            return res.status(400).json({
                message: "No valid fields provided for update",
            });
        }

        const updateQuery = `
            UPDATE vehicle 
            SET ${updateFields.join(", ")} 
            WHERE id = $${paramCounter} 
            RETURNING *
        `;

        const updateResult = await pool.query(updateQuery, updateValues);
        const updatedVehicle = updateResult.rows[0];

        res.status(200).json({
            message: "Vehicle updated successfully",
            vehicle: updatedVehicle,
        });
    } catch (error) {
        console.error("Error updating vehicle:", error);
        res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

const deleteVehicle = async (req, res) => {
    try {
        const { id } = req.params;
        const userRole = req.user.role;
        console.log("id : ", id);

        if (!id) {
            return res.status(400).json({
                message: "Vehicle ID is required",
            });
        }

        const getQuery = `SELECT * FROM vehicle WHERE id = $1`;
        const result = await pool.query(getQuery, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Vehicle not found",
            });
        }

        const deleteQuery = `DELETE FROM vehicle WHERE id = $1 RETURNING *`;
        const deleteResult = await pool.query(deleteQuery, [id]);

        res.status(200).json({
            message: "Vehicle deleted successfully",
            vehicle: deleteResult.rows[0],
        });
    } catch (error) {
        console.error("Error deleting vehicle:", error);
        res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

module.exports = {
    addVehicle,
    getVehicles,
    updateVehicle,
    deleteVehicle,
};
