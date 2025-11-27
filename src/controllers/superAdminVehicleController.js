const { pool } = require("../config/db");

// Super Admin: Add a new vehicle to inventory (without assigning to driver)
const addVehicleToInventory = async (req, res) => {
    try {
        const {
            plateNo,
            status,
            vehicleMake,
            vehicleModel,
            vehicleYear,
            color,
            vinNumber,
            engineNumber,
            vehicleType,
            capacity,
            capacityUnit,
            fuelType,
            purchasedDate,
            purchasePrice,
            // Registration & legal
            registrationDate,
            registrationExpiryDate,
            insuranceExpiryDate,
            fitnessCertificateExpiry,
            insuranceProvider,
            insurancePolicyNumber,
            // Operational
            odometerReading,
            lastMaintenanceDate,
            nextMaintenanceDue,
            lastServiceOdometer,
            // Additional
            notes
        } = req.body;

        const superAdminId = req.user.id;

        if (!plateNo || !status) {
            return res.status(400).json({
                message: "Plate number and status are required",
            });
        }

        // Check if vehicle with this plate number already exists
        const vehicleCheckQuery = `SELECT * FROM vehicle WHERE plate_no = $1`;
        const vehicleCheckResult = await pool.query(vehicleCheckQuery, [plateNo]);

        if (vehicleCheckResult.rows.length > 0) {
            return res.status(400).json({
                message: "Vehicle with this plate number already exists",
            });
        }

        // Check if VIN number already exists (if provided)
        if (vinNumber) {
            const vinCheckQuery = `SELECT * FROM vehicle WHERE vin_number = $1`;
            const vinCheckResult = await pool.query(vinCheckQuery, [vinNumber]);

            if (vinCheckResult.rows.length > 0) {
                return res.status(400).json({
                    message: "Vehicle with this VIN number already exists",
                });
            }
        }

        // Insert vehicle without driver assignment
        const insertQuery = `
            INSERT INTO vehicle (
                plate_no, status, user_id, driver_name,
                vehicle_make, vehicle_model, vehicle_year, color, 
                vin_number, engine_number,
                vehicle_type, capacity, capacity_unit, fuel_type,
                purchased_date, purchase_price,
                registration_date, registration_expiry_date, 
                insurance_expiry_date, fitness_certificate_expiry,
                insurance_provider, insurance_policy_number,
                odometer_reading, last_maintenance_date, next_maintenance_due,
                last_service_odometer, notes
            ) 
            VALUES (
                $1, $2, NULL, NULL,
                $3, $4, $5, $6,
                $7, $8,
                $9, $10, $11, $12,
                $13, $14,
                $15, $16, $17, $18,
                $19, $20,
                $21, $22, $23,
                $24, $25
            ) 
            RETURNING *
        `;

        const result = await pool.query(insertQuery, [
            plateNo, status,
            vehicleMake || null, vehicleModel || null, vehicleYear || null, color || null,
            vinNumber || null, engineNumber || null,
            vehicleType || 'truck', capacity || null, capacityUnit || 'cubic_meters', fuelType || 'diesel',
            purchasedDate || null, purchasePrice || null,
            registrationDate || null, registrationExpiryDate || null,
            insuranceExpiryDate || null, fitnessCertificateExpiry || null,
            insuranceProvider || null, insurancePolicyNumber || null,
            odometerReading || 0, lastMaintenanceDate || null, nextMaintenanceDue || null,
            lastServiceOdometer || null, notes || null
        ]);
        const vehicleData = result.rows[0];

        res.status(201).json({
            message: "Vehicle added to inventory successfully",
            vehicle: vehicleData,
        });
    } catch (error) {
        console.error("Error adding vehicle to inventory:", error);
        res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

// Super Admin: Get all vehicles in inventory
const getAllVehiclesInventory = async (req, res) => {
    try {
        const query = `
            SELECT 
                v.*,
                u.first_name,
                u.last_name,
                u.username,
                u.email,
                blocker.first_name as blocked_by_first_name,
                blocker.last_name as blocked_by_last_name
            FROM vehicle v
            LEFT JOIN users u ON v.user_id = u.id
            LEFT JOIN users blocker ON v.blocked_by = blocker.id
            ORDER BY v.id DESC
        `;

        const result = await pool.query(query);

        res.status(200).json({
            message: "Vehicles retrieved successfully",
            vehicles: result.rows,
            count: result.rows.length,
        });
    } catch (error) {
        console.error("Error fetching vehicles inventory:", error);
        res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

// Super Admin: Update vehicle in inventory
const updateVehicleInventory = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        if (!id) {
            return res.status(400).json({
                message: "Vehicle ID is required",
            });
        }

        // Check if vehicle exists
        const getQuery = `SELECT * FROM vehicle WHERE id = $1`;
        const result = await pool.query(getQuery, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Vehicle not found",
            });
        }

        // Field mapping for snake_case conversion
        const fieldMapping = {
            plateNo: 'plate_no',
            status: 'status',
            vehicleMake: 'vehicle_make',
            vehicleModel: 'vehicle_model',
            vehicleYear: 'vehicle_year',
            color: 'color',
            vinNumber: 'vin_number',
            engineNumber: 'engine_number',
            vehicleType: 'vehicle_type',
            capacity: 'capacity',
            capacityUnit: 'capacity_unit',
            fuelType: 'fuel_type',
            purchasedDate: 'purchased_date',
            purchasePrice: 'purchase_price',
            registrationDate: 'registration_date',
            registrationExpiryDate: 'registration_expiry_date',
            insuranceExpiryDate: 'insurance_expiry_date',
            fitnessCertificateExpiry: 'fitness_certificate_expiry',
            insuranceProvider: 'insurance_provider',
            insurancePolicyNumber: 'insurance_policy_number',
            odometerReading: 'odometer_reading',
            lastMaintenanceDate: 'last_maintenance_date',
            nextMaintenanceDue: 'next_maintenance_due',
            lastServiceOdometer: 'last_service_odometer',
            notes: 'notes'
        };

        const updateFields = [];
        const updateValues = [];
        let paramCounter = 1;

        // Check for plate number duplication
        if (updateData.plateNo !== undefined) {
            const plateCheckQuery = `
                SELECT id FROM vehicle 
                WHERE plate_no = $1 AND id != $2
            `;
            const plateCheckResult = await pool.query(plateCheckQuery, [updateData.plateNo, id]);

            if (plateCheckResult.rows.length > 0) {
                return res.status(400).json({
                    message: "This plate number is already assigned to another vehicle",
                });
            }
        }

        // Check for VIN number duplication
        if (updateData.vinNumber !== undefined) {
            const vinCheckQuery = `
                SELECT id FROM vehicle 
                WHERE vin_number = $1 AND id != $2
            `;
            const vinCheckResult = await pool.query(vinCheckQuery, [updateData.vinNumber, id]);

            if (vinCheckResult.rows.length > 0) {
                return res.status(400).json({
                    message: "This VIN number is already assigned to another vehicle",
                });
            }
        }

        // Build dynamic update query
        for (const [camelKey, snakeKey] of Object.entries(fieldMapping)) {
            if (updateData[camelKey] !== undefined) {
                updateFields.push(`${snakeKey} = $${paramCounter}`);
                updateValues.push(updateData[camelKey]);
                paramCounter++;
            }
        }

        if (updateFields.length === 0) {
            return res.status(400).json({
                message: "No valid fields provided for update",
            });
        }

        updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
        updateValues.push(id);

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
        console.error("Error updating vehicle inventory:", error);
        res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

// Super Admin: Block/Expire a vehicle
const blockVehicle = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const superAdminId = req.user.id;

        if (!id) {
            return res.status(400).json({
                message: "Vehicle ID is required",
            });
        }

        if (!reason || reason.trim() === "") {
            return res.status(400).json({
                message: "Blocking reason is required",
            });
        }

        // Check if vehicle exists
        const getQuery = `SELECT * FROM vehicle WHERE id = $1`;
        const result = await pool.query(getQuery, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Vehicle not found",
            });
        }

        const vehicle = result.rows[0];

        if (vehicle.is_blocked) {
            return res.status(400).json({
                message: "Vehicle is already blocked",
            });
        }

        // Block the vehicle
        const blockQuery = `
            UPDATE vehicle 
            SET 
                is_blocked = TRUE,
                blocked_reason = $1,
                blocked_at = CURRENT_TIMESTAMP,
                blocked_by = $2,
                status = 'blocked',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING *
        `;

        const blockResult = await pool.query(blockQuery, [reason, superAdminId, id]);
        const blockedVehicle = blockResult.rows[0];

        res.status(200).json({
            message: "Vehicle blocked successfully",
            vehicle: blockedVehicle,
        });
    } catch (error) {
        console.error("Error blocking vehicle:", error);
        res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

// Super Admin: Unblock a vehicle
const unblockVehicle = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // New status after unblocking

        if (!id) {
            return res.status(400).json({
                message: "Vehicle ID is required",
            });
        }

        if (!status) {
            return res.status(400).json({
                message: "New status is required",
            });
        }

        // Check if vehicle exists
        const getQuery = `SELECT * FROM vehicle WHERE id = $1`;
        const result = await pool.query(getQuery, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Vehicle not found",
            });
        }

        const vehicle = result.rows[0];

        if (!vehicle.is_blocked) {
            return res.status(400).json({
                message: "Vehicle is not blocked",
            });
        }

        // Unblock the vehicle
        const unblockQuery = `
            UPDATE vehicle 
            SET 
                is_blocked = FALSE,
                blocked_reason = NULL,
                blocked_at = NULL,
                blocked_by = NULL,
                status = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
        `;

        const unblockResult = await pool.query(unblockQuery, [status, id]);
        const unblockedVehicle = unblockResult.rows[0];

        res.status(200).json({
            message: "Vehicle unblocked successfully",
            vehicle: unblockedVehicle,
        });
    } catch (error) {
        console.error("Error unblocking vehicle:", error);
        res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

// Get available vehicles for assignment (used by Admin)
const getAvailableVehicles = async (req, res) => {
    try {
        const query = `
            SELECT 
                id,
                plate_no,
                status,
                user_id,
                driver_name
            FROM vehicle
            WHERE (user_id IS NULL OR user_id = 0) 
            AND is_blocked = FALSE
            AND status != 'blocked'
            ORDER BY plate_no ASC
        `;

        const result = await pool.query(query);

        res.status(200).json({
            message: "Available vehicles retrieved successfully",
            vehicles: result.rows,
            count: result.rows.length,
        });
    } catch (error) {
        console.error("Error fetching available vehicles:", error);
        res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

module.exports = {
    addVehicleToInventory,
    getAllVehiclesInventory,
    updateVehicleInventory,
    blockVehicle,
    unblockVehicle,
    getAvailableVehicles,
};
