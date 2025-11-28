const { pool } = require("../config/db");
const { logSubAdminActivity } = require("../services/subAdminLogger");

const addVehicle = async (req, res) => {
    try {
        const { vehicleId, driverId, status } = req.body;

        const userRole = req.user.role;

        // New flow: Admin assigns an existing vehicle to a driver
        if (vehicleId) {
            if (!driverId || !status) {
                return res.status(400).json({
                    message: "Driver ID and status are required for vehicle assignment",
                });
            }

            // Check if vehicle exists
            const vehicleCheckQuery = `SELECT * FROM vehicle WHERE id = $1`;
            const vehicleCheckResult = await pool.query(vehicleCheckQuery, [vehicleId]);

            if (vehicleCheckResult.rows.length === 0) {
                return res.status(404).json({
                    message: "Vehicle not found",
                });
            }

            const vehicle = vehicleCheckResult.rows[0];

            // Check if vehicle is blocked
            if (vehicle.is_blocked) {
                return res.status(400).json({
                    message: "Cannot assign a blocked vehicle",
                });
            }

            // Check if vehicle is already assigned
            if (vehicle.user_id) {
                return res.status(400).json({
                    message: "Vehicle is already assigned to another driver",
                });
            }

            // Get driver information
            const driverQuery = `
                SELECT id, first_name, last_name, username, is_verified
                FROM users WHERE id = $1
            `;

            const driverResult = await pool.query(driverQuery, [driverId]);

            if (driverResult.rows.length === 0) {
                return res.status(404).json({
                    message: "Driver not found",
                });
            }

            const driver = driverResult.rows[0];

            if (!driver.is_verified) {
                return res.status(400).json({
                    message: "Driver is not verified",
                });
            }

            // Check if driver already has a vehicle assigned
            const driverVehicleCheckQuery = `
                SELECT id FROM vehicle 
                WHERE user_id = $1
            `;
            const driverVehicleCheckResult = await pool.query(driverVehicleCheckQuery, [driverId]);

            if (driverVehicleCheckResult.rows.length > 0) {
                return res.status(400).json({
                    message: "This driver is already assigned to another vehicle",
                });
            }

            // Assign vehicle to driver
            const assignQuery = `
                UPDATE vehicle 
                SET user_id = $1, driver_name = $2, status = $3, updated_at = CURRENT_TIMESTAMP
                WHERE id = $4
                RETURNING *
            `;

            const finalDriverName = `${driver.username}`;
            const result = await pool.query(assignQuery, [
                driverId,
                finalDriverName,
                status,
                vehicleId,
            ]);

            const vehicleData = result.rows[0];

            return res.status(200).json({
                message: "Vehicle assigned to driver successfully",
                vehicle: vehicleData,
            });
        }

        // Legacy flow: Create new vehicle and optionally assign (kept for backward compatibility)
        const { plateNo, driverName } = req.body;

        if (!plateNo || !status) {
            return res.status(400).json({
                message: "Plate number and status are required",
            });
        }

        let userId = null;
        let finalDriverName = null;


        const vehicleCheckQuery = `SELECT * FROM vehicle WHERE plate_no = $1`;

        const vehicleCheckResult = await pool.query(vehicleCheckQuery, [plateNo]);

        if (vehicleCheckResult.rows.length > 0) {
            return res.status(400).json({
                message: "Vehicle with this plate number already exists",
            });
        }

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
        const { plateNo, status, driverId } = req.body;

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
            // Check if the same plate number is assigned to multiple drivers
            const plateCheckQuery = `
                SELECT id, user_id FROM vehicle 
                WHERE plate_no = $1 AND id != $2
            `;
            const plateCheckResult = await pool.query(plateCheckQuery, [plateNo, id]);

            if (plateCheckResult.rows.length > 0) {
                const conflictingVehicle = plateCheckResult.rows[0];
                if (conflictingVehicle.user_id) {
                    return res.status(400).json({
                        message: "This plate number is already assigned to another driver",
                    });
                }
            }

            updateFields.push(`plate_no = $${paramCounter}`);
            updateValues.push(plateNo);
            paramCounter++;
        }

        if (status !== undefined) {
            updateFields.push(`status = $${paramCounter}`);
            updateValues.push(status);
            paramCounter++;
        }

        if (driverId !== undefined) {
            let driverUserId = null;
            let finalDriverName = null;

            if (driverId) {
                // Fetch driver by ID instead of name
                const driverQuery = `
                    SELECT id, first_name, last_name, is_verified
                    FROM users 
                    WHERE id = $1
                `;

                const driverResult = await pool.query(driverQuery, [driverId]);

                if (driverResult.rows.length === 0) {
                    return res.status(404).json({
                        message: "Driver not found in users table",
                    });
                }

                const driver = driverResult.rows[0];

                if (!driver.is_verified) {
                    return res.status(400).json({
                        message: "Driver is not verified",
                    });
                }

                // Check if multiple vehicles are assigned to the same driver
                const driverVehicleCheckQuery = `
                    SELECT id FROM vehicle 
                    WHERE user_id = $1 AND id != $2
                `;
                const driverVehicleCheckResult = await pool.query(driverVehicleCheckQuery, [driverId, id]);

                if (driverVehicleCheckResult.rows.length > 0) {
                    return res.status(400).json({
                        message: "This driver is already assigned to another vehicle",
                    });
                }

                // Check if the current vehicle's plate number is assigned to other drivers
                const currentVehicleQuery = `SELECT plate_no FROM vehicle WHERE id = $1`;
                const currentVehicleResult = await pool.query(currentVehicleQuery, [id]);
                const currentPlateNo = currentVehicleResult.rows[0]?.plate_no;

                if (currentPlateNo) {
                    const plateDriverCheckQuery = `
                        SELECT id FROM vehicle 
                        WHERE plate_no = $1 AND user_id IS NOT NULL AND id != $2
                    `;
                    const plateDriverCheckResult = await pool.query(plateDriverCheckQuery, [currentPlateNo, id]);

                    if (plateDriverCheckResult.rows.length > 0) {
                        return res.status(400).json({
                            message: "This vehicle's plate number is already assigned to another driver",
                        });
                    }
                }

                driverUserId = driver.id;
                finalDriverName = `${driver.first_name} ${driver.last_name}`;
            } else {
                // If driverId is null/empty, remove driver assignment
                driverUserId = null;
                finalDriverName = null;
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

        if (req.user.role === "sub_admin") {
            await logSubAdminActivity({
                subAdmin: req.user.id,
                activityType: "UPDATE_VEHICLE",
                description: `Sub Admin ${req.user.id} updated data of vehicle with id: ${id} ${Date.now()}`,
            });
        }

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

module.exports = {
    addVehicle,
    getVehicles,
    updateVehicle,
};
