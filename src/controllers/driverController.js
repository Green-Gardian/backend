const { pool } = require("../config/db");
const crypto = require("crypto");
const { sendVerificationEmail } = require('../controllers/authController');
require("dotenv").config();

const addDriver = async (req, res) => {
    try {
        const { fullName, role, email, phone, status } = req.body;

        console.log(role)

        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Current role does not have privilege to create driver." })
        }

        const username = email.split('@')[0];
        const firstName = fullName.split(' ')[0];
        const lastName = fullName.split(' ')[1];

        const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

        if (!regex.test(email)) {
            return res.status(400).json({ message: "Invalid email address" });
        }

        const query = {
            text: `SELECT * FROM users WHERE email = $1`,
            values: [email]
        };

        const resultUser = await pool.query(query);

        if (resultUser.rows.length !== 0) {
            return res.status(400).json({ message: "Email already in use." });
        }

        const phoneQuery = {
            text: `SELECT * FROM users WHERE phone_number = $1`,
            values: [phone]
        }

        const User = await pool.query(phoneQuery)

        if (User.rows.length !== 0) {
            return res.status(400).json({ message: 'Phone Number already in user.' })
        }

        let insertQuery = {
            text: `INSERT INTO users (first_name,last_name,username, phone_number , email,role) values ($1,$2,$3,$4,$5,$6) RETURNING *`,
            values: [firstName, lastName, username, phone, email, role]
        };

        const createdUser = await pool.query(insertQuery);
        console.log("Created User:", createdUser.rows[0]);

        const verificationToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const verificationQuery = {
            text: `INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES ($1, $2, $3) RETURNING *`,
            values: [createdUser.rows[0].id, verificationToken, expiresAt]
        };

        await pool.query(verificationQuery);

        await sendVerificationEmail(username, email, verificationToken);

        return res.status(201).json({ message: `Driver created. Email sent to verify and set password.`, })
    }
    catch (error) {
        console.error(`Error creating user: ${error.message}`);
        return res.status(500).json({ error: "Server Error" })
    }
}

const getDrivers = async (req, res) => {
    try {
        const userRole = req.user.role;
        let query;
        let params = [];

        if (userRole === "admin" || userRole === "super_admin") {
            query = `
                SELECT * 
                FROM users WHERE role = 'driver'
            `;
        } else if (userRole === "driver") {
            query = `
                SELECT * 
                FROM users WHERE role = 'driver' AND id = $1
            `;
            params = [req.user.id];
        } else {
            return res.status(403).json({
                message: "Access denied",
            });
        }

        const result = await pool.query(query, params);

        res.status(200).json({
            message: "Drivers retrieved successfully",
            drivers: result.rows,
            count: result.rows.length,
        });
    } catch (error) {
        console.error("Error fetching drivers:", error);
        res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

const updateDriver = async (req, res) => {
    try {
        const { id } = req.params;
        const { fullName, phone, status, email } = req.body;
        const userRole = req.user.role;

        if (!id) {
            return res.status(400).json({
                message: "Driver ID is required",
            });
        }

        if (userRole !== "admin" && userRole !== "super_admin") {
            return res.status(403).json({
                message: "You don't have permission to update drivers",
            });
        }

        const getQuery = `SELECT * FROM users WHERE id = $1 AND role = 'driver'`;
        const result = await pool.query(getQuery, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Driver not found",
            });
        }

        const updateFields = [];
        const updateValues = [];
        let paramCounter = 1;

        if (fullName !== undefined) {
            const nameParts = fullName.trim().split(' ');
            updateFields.push(`first_name = $${paramCounter}`);
            updateValues.push(nameParts[0]);
            paramCounter++;
            if (nameParts.length > 1) {
                updateFields.push(`last_name = $${paramCounter}`);
                updateValues.push(nameParts.slice(1).join(' '));
                paramCounter++;
            }
        }
        if (phone !== undefined) {
            updateFields.push(`phone_number = $${paramCounter}`);
            updateValues.push(phone);
            paramCounter++;
        }
        if (status !== undefined) {
            updateFields.push(`status = $${paramCounter}`);
            updateValues.push(status);
            paramCounter++;
        }
        if (email !== undefined) {
            updateFields.push(`email = $${paramCounter}`);
            updateValues.push(email);
            paramCounter++;
        }

        if (updateFields.length === 0) {
            return res.status(400).json({
                message: "No valid fields provided for update",
            });
        }

        updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
        const updateQuery = `
            UPDATE users
            SET ${updateFields.join(", ")}
            WHERE id = $${paramCounter} AND role = 'driver'
            RETURNING *
        `;
        updateValues.push(id);

        const updateResult = await pool.query(updateQuery, updateValues);
        const updatedDriver = updateResult.rows[0];

        res.status(200).json({
            message: "Driver updated successfully",
            driver: updatedDriver,
        });
    } catch (error) {
        console.error("Error updating driver:", error);
        res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

const deleteDriver = async (req, res) => {
    try {
        const { id } = req.params;
        const userRole = req.user.role;
        console.log("id : ", id);

        if (!id) {
            return res.status(400).json({
                message: "Driver ID is required",
            });
        }

        if (userRole !== "admin" && userRole !== "super_admin") {
            return res.status(403).json({
                message: "You don't have permission to delete drivers",
            });
        }

        const getQuery = `SELECT * FROM users WHERE id = $1 AND role = 'driver'`;
        const result = await pool.query(getQuery, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Driver not found",
            });
        }

        const deleteQuery = `DELETE FROM users WHERE id = $1 AND role = 'driver' RETURNING *`;
        const deleteResult = await pool.query(deleteQuery, [id]);

        res.status(200).json({
            message: "Driver deleted successfully",
            driver: deleteResult.rows[0],
        });
    } catch (error) {
        console.error("Error deleting driver:", error);
        res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

const assignWorkArea = async (req, res) => {
    try {
        const { driverId, workAreaId, societyId } = req.body;
        const userRole = req.user.role;

        if (userRole !== "admin" && userRole !== "super_admin") {
            return res.status(403).json({
                message: "You don't have permission to assign work areas",
            });
        }

        const assignmentData = {
            id: Math.floor(Math.random() * 1000),
            driver_id: driverId,
            work_area_id: workAreaId,
            society_id: societyId,
            assigned_date: new Date().toISOString(),
            status: "active",
            area_name: `Sector ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`,
            area_description: "Residential area with 150 households",
            estimated_bins: Math.floor(Math.random() * 50) + 20
        };

        res.status(201).json({
            message: "Work area assigned successfully",
            assignment: assignmentData,
        });
    } catch (error) {
        console.error("Error assigning work area:", error);
        res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

const getDriverWorkAreas = async (req, res) => {
    try {
        const { driverId } = req.params;
        const userRole = req.user.role;

        if (userRole !== "admin" && userRole !== "super_admin" && 
            (userRole !== "driver" || req.user.id !== parseInt(driverId))) {
            return res.status(403).json({
                message: "Access denied",
            });
        }

        const workAreas = [
            {
                id: 1,
                area_name: "Sector A",
                area_description: "Residential area with 150 households",
                assigned_date: "2024-01-15T08:00:00Z",
                status: "active",
                total_bins: 25,
                estimated_collection_time: "4 hours",
                priority: "medium"
            },
            {
                id: 2,
                area_name: "Sector B",
                area_description: "Commercial area with shops and offices",
                assigned_date: "2024-01-20T08:00:00Z",
                status: "active",
                total_bins: 18,
                estimated_collection_time: "3 hours",
                priority: "high"
            }
        ];

        res.status(200).json({
            message: "Work areas retrieved successfully",
            workAreas: workAreas,
            count: workAreas.length,
        });
    } catch (error) {
        console.error("Error fetching work areas:", error);
        res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

const getCollectionRoutes = async (req, res) => {
    try {
        const { driverId } = req.params;
        const userRole = req.user.role;

        if (userRole !== "admin" && userRole !== "super_admin" && 
            (userRole !== "driver" || req.user.id !== parseInt(driverId))) {
            return res.status(403).json({
                message: "Access denied",
            });
        }

        const routes = [
            {
                id: 1,
                route_name: "Route A-1",
                work_area: "Sector A",
                bins: [
                    {
                        bin_id: "BIN_001",
                        location: { lat: 33.6844, lng: 73.0479 },
                        address: "House #123, Street 5, Sector A",
                        fill_level: 85,
                        status: "needs_collection",
                        priority: "high",
                        last_collected: "2024-01-18T10:30:00Z"
                    },
                    {
                        bin_id: "BIN_002",
                        location: { lat: 33.6845, lng: 73.0480 },
                        address: "House #125, Street 5, Sector A",
                        fill_level: 65,
                        status: "moderate",
                        priority: "medium",
                        last_collected: "2024-01-19T09:15:00Z"
                    }
                ],
                estimated_time: "2 hours",
                distance: "5.2 km",
                status: "pending"
            }
        ];

        res.status(200).json({
            message: "Collection routes retrieved successfully",
            routes: routes,
            total_routes: routes.length,
        });
    } catch (error) {
        console.error("Error fetching collection routes:", error);
        res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

const updateTaskStatus = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { status, notes, completedAt, location } = req.body;
        const userRole = req.user.role;

        if (userRole !== "driver") {
            return res.status(403).json({
                message: "Only drivers can update task status",
            });
        }

        const updatedTask = {
            id: taskId,
            driver_id: req.user.id,
            bin_id: "BIN_001",
            status: status,
            notes: notes || "",
            started_at: "2024-01-20T08:00:00Z",
            completed_at: completedAt || new Date().toISOString(),
            location: location || { lat: 33.6844, lng: 73.0479 },
            collection_weight: Math.floor(Math.random() * 50) + 10,
            updated_at: new Date().toISOString()
        };

        res.status(200).json({
            message: "Task status updated successfully",
            task: updatedTask,
        });
    } catch (error) {
        console.error("Error updating task status:", error);
        res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

const updateDriverLocation = async (req, res) => {
    try {
        const { latitude, longitude, timestamp } = req.body;
        const driverId = req.user.id;
        const userRole = req.user.role;

        if (userRole !== "driver") {
            return res.status(403).json({
                message: "Only drivers can update their location",
            });
        }

        const locationData = {
            driver_id: driverId,
            latitude: latitude,
            longitude: longitude,
            timestamp: timestamp || new Date().toISOString(),
            address: "Street 5, Sector A, Islamabad", 
            status: "active"
        };

        res.status(200).json({
            message: "Location updated successfully",
            location: locationData,
        });
    } catch (error) {
        console.error("Error updating driver location:", error);
        res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

const getDriverPerformance = async (req, res) => {
    try {
        const { driverId } = req.params;
        const { period = '30' } = req.query; 
        const userRole = req.user.role;

        if (userRole !== "admin" && userRole !== "super_admin" && 
            (userRole !== "driver" || req.user.id !== parseInt(driverId))) {
            return res.status(403).json({
                message: "Access denied",
            });
        }

        const performanceData = {
            driver_id: driverId,
            period_days: parseInt(period),
            metrics: {
                total_collections: Math.floor(Math.random() * 100) + 50,
                on_time_collections: Math.floor(Math.random() * 80) + 45,
                average_collection_time: "2.5 hours",
                total_distance_covered: `${Math.floor(Math.random() * 500) + 200} km`,
                fuel_efficiency: `${(Math.random() * 5 + 10).toFixed(1)} km/l`,
                customer_rating: (Math.random() * 2 + 3).toFixed(1),
                complaints: Math.floor(Math.random() * 5),
                commendations: Math.floor(Math.random() * 10) + 2
            },
            weekly_breakdown: [
                { week: "Week 1", collections: 18, rating: 4.2 },
                { week: "Week 2", collections: 20, rating: 4.5 },
                { week: "Week 3", collections: 17, rating: 4.1 },
                { week: "Week 4", collections: 19, rating: 4.3 }
            ]
        };

        res.status(200).json({
            message: "Performance metrics retrieved successfully",
            performance: performanceData,
        });
    } catch (error) {
        console.error("Error fetching performance metrics:", error);
        res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

const getCurrentTasks = async (req, res) => {
    try {
        const driverId = req.user.id;
        const userRole = req.user.role;

        if (userRole !== "driver") {
            return res.status(403).json({
                message: "Only drivers can view their tasks",
            });
        }

        const currentTasks = [
            {
                id: 1,
                bin_id: "BIN_001",
                task_type: "collection",
                priority: "high",
                status: "in_progress",
                location: {
                    lat: 33.6844,
                    lng: 73.0479,
                    address: "House #123, Street 5, Sector A"
                },
                estimated_time: "30 minutes",
                fill_level: 85,
                assigned_at: "2024-01-20T08:00:00Z"
            },
            {
                id: 2,
                bin_id: "BIN_007",
                task_type: "maintenance",
                priority: "medium",
                status: "pending",
                location: {
                    lat: 33.6850,
                    lng: 73.0485,
                    address: "Park Area, Sector A"
                },
                estimated_time: "15 minutes",
                fill_level: 30,
                assigned_at: "2024-01-20T09:00:00Z"
            }
        ];

        res.status(200).json({
            message: "Current tasks retrieved successfully",
            tasks: currentTasks,
            count: currentTasks.length,
        });
    } catch (error) {
        console.error("Error fetching current tasks:", error);
        res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

const getDriverSchedule = async (req, res) => {
    try {
        const { driverId } = req.params;
        const { date } = req.query;
        const userRole = req.user.role;

        if (userRole !== "admin" && userRole !== "super_admin" && 
            (userRole !== "driver" || req.user.id !== parseInt(driverId))) {
            return res.status(403).json({
                message: "Access denied",
            });
        }

        const targetDate = date || new Date().toISOString().split('T')[0];

        const schedule = {
            date: targetDate,
            driver_id: driverId,
            shifts: [
                {
                    id: 1,
                    start_time: "08:00",
                    end_time: "12:00",
                    work_area: "Sector A",
                    estimated_collections: 15,
                    route_distance: "8.5 km",
                    status: "scheduled"
                },
                {
                    id: 2,
                    start_time: "14:00",
                    end_time: "17:00",
                    work_area: "Sector B",
                    estimated_collections: 12,
                    route_distance: "6.2 km",
                    status: "scheduled"
                }
            ],
            total_working_hours: 7,
            break_time: "12:00-14:00"
        };

        res.status(200).json({
            message: "Driver schedule retrieved successfully",
            schedule: schedule,
        });
    } catch (error) {
        console.error("Error fetching driver schedule:", error);
        res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

module.exports = {
    addDriver,
    getDrivers,
    updateDriver,
    deleteDriver,
    assignWorkArea,
    getDriverWorkAreas,
    getCollectionRoutes,
    updateTaskStatus,
    updateDriverLocation,
    getDriverPerformance,
    getCurrentTasks,
    getDriverSchedule
};