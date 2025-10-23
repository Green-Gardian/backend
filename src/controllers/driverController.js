// controllers/driverController.js
const { pool } = require("../config/db");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
require("dotenv").config();

/* -------------------------------------------------------
 * Helpers (DRY + validation)
 * ----------------------------------------------------- */

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const isEmailValid = (email) => EMAIL_REGEX.test(String(email || "").trim());

const toInt = (v, fb = null) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fb;
};

const splitName = (fullName = "") => {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  const first = parts[0] || "";
  const last = parts.length > 1 ? parts.slice(1).join(" ") : "";
  return { first, last };
};

const usernameFromEmail = (email) => String(email || "").trim().split("@")[0];

const requireRole = (reqUser, roles = []) => {
  if (!roles.includes(reqUser?.role)) {
    const err = new Error("Access denied");
    err.status = 403;
    throw err;
  }
};

const ensureSelfOrRole = (reqUser, targetUserId, roles = []) => {
  if (roles.includes(reqUser.role)) return;
  if (reqUser.role === "driver" && reqUser.id === toInt(targetUserId)) return;
  const err = new Error("Access denied");
  err.status = 403;
  throw err;
};

const ensureDriverExists = async (id) => {
  const q = await pool.query(`SELECT * FROM users WHERE id = $1 AND role = 'driver'`, [id]);
  if (q.rows.length === 0) {
    const err = new Error("Driver not found");
    err.status = 404;
    throw err;
  }
  return q.rows[0];
};

const ensureUniqueEmailAndPhone = async (email, phone) => {
  if (email) {
    const qe = await pool.query(`SELECT 1 FROM users WHERE email = $1`, [email]);
    if (qe.rows.length) {
      const err = new Error("Email already in use.");
      err.status = 400;
      throw err;
    }
  }
  if (phone) {
    const qp = await pool.query(`SELECT 1 FROM users WHERE phone_number = $1`, [phone]);
    if (qp.rows.length) {
      const err = new Error("Phone number already in use.");
      err.status = 400;
      throw err;
    }
  }
};

const sendVerificationEmail = async (recipientUsername, recipientEmail, verificationToken) => {
  if (!process.env.SENDER_EMAIL || !process.env.SENDER_PASSWORD || !process.env.FRONTEND_URL) {
    const err = new Error("Email configuration missing");
    err.status = 500;
    throw err;
  }

  const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SENDER_EMAIL,
      pass: process.env.SENDER_PASSWORD,
    },
  });

  // Minimal email (reuse your branded HTML if you prefer)
  const html = `
    <h2>Verify your account</h2>
    <p>Hello ${recipientUsername}, please verify your email to set your password.</p>
    <p><a href="${verificationLink}">Verify Email</a></p>
    <p>If the button doesn't work, copy and paste this link into your browser:</p>
    <code>${verificationLink}</code>
  `;

  await transporter.sendMail({
    from: `Green Guardian <${process.env.SENDER_EMAIL}>`,
    to: recipientEmail,
    subject: "Verify your email",
    html,
  });
};

/* -------------------------------------------------------
 * Controllers
 * ----------------------------------------------------- */

// const addDriver = async (req, res) => {
//   try {
//     requireRole(req.user, ["admin", "super_admin"]);

//     const { fullName, email, phone /* status */ } = req.body;

//     if (!fullName || !email || !phone) {
//       return res.status(400).json({ message: "Full name, email, and phone are required" });
//     }
//     if (!isEmailValid(email)) {
//       return res.status(400).json({ message: "Invalid email address" });
//     }

//     await ensureUniqueEmailAndPhone(email, phone);

//     const { first, last } = splitName(fullName);
//     const username = usernameFromEmail(email);

//     // Force role to 'driver' for security (ignore body.role)
//     const insert = await pool.query(
//       `INSERT INTO users (first_name, last_name, username, phone_number, email, role)
//        VALUES ($1, $2, $3, $4, $5, 'driver') RETURNING *`,
//       [first, last, username, phone, email]
//     );
//     const createdUser = insert.rows[0];

//     // Email verification token
//     const verificationToken = crypto.randomBytes(32).toString("hex");
//     const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

//     await pool.query(
//       `INSERT INTO email_verification_tokens (user_id, token, expires_at)
//        VALUES ($1, $2, $3)`,
//       [createdUser.id, verificationToken, expiresAt]
//     );

//     await sendVerificationEmail(username, email, verificationToken);

//     return res.status(201).json({
//       message: "Driver created. Email sent to verify and set password.",
//       driver: {
//         id: createdUser.id,
//         first_name: createdUser.first_name,
//         last_name: createdUser.last_name,
//         email: createdUser.email,
//         phone_number: createdUser.phone_number,
//         role: createdUser.role,
//       },
//     });
//   } catch (error) {
//     const status = error.status || 500;
//     console.error(`Error creating driver: ${error.message}`);
//     return res.status(status).json({ message: error.message });
//   }
// };

const getDrivers = async (req, res) => {
  try {
    const role = req.user.role;

    if (role === "admin" || role === "super_admin") {
      const q = await pool.query(`SELECT * FROM users WHERE role = 'driver'`);
      return res.status(200).json({
        message: "Drivers retrieved successfully",
        drivers: q.rows,
        count: q.rows.length,
      });
    }

    if (role === "driver") {
      const q = await pool.query(`SELECT * FROM users WHERE role = 'driver' AND id = $1`, [req.user.id]);
      return res.status(200).json({
        message: "Drivers retrieved successfully",
        drivers: q.rows,
        count: q.rows.length,
      });
    }

    return res.status(403).json({ message: "Access denied" });
  } catch (error) {
    console.error("Error fetching drivers:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

const updateDriver = async (req, res) => {
  try {
    const id = toInt(req.params.id, null);
    ensureSelfOrRole(req.user, id, ["admin", "super_admin"]);
    if (id === null) return res.status(400).json({ message: "Driver ID is required" });

    await ensureDriverExists(id);

    const { fullName, phone, email } = req.body;
    const fields = [];
    const vals = [];
    let i = 1;

    if (fullName !== undefined) {
      const { first, last } = splitName(fullName);
      fields.push(`first_name = $${i++}`);
      vals.push(first);
      if (last) {
        fields.push(`last_name = $${i++}`);
        vals.push(last);
      }
    }
    if (phone !== undefined) {
      fields.push(`phone_number = $${i++}`);
      vals.push(phone);
    }
    if (email !== undefined) {
      if (!isEmailValid(email)) {
        return res.status(400).json({ message: "Invalid email address" });
      }
      const qe = await pool.query(`SELECT 1 FROM users WHERE email = $1 AND id <> $2`, [email, id]);
      if (qe.rows.length) {
        return res.status(400).json({ message: "Email already in use." });
      }
      fields.push(`email = $${i++}`);
      vals.push(email);
    }

    if (fields.length === 0) {
      return res.status(400).json({ message: "No valid fields provided for update" });
    }

    const sql = `
      UPDATE users
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${i} AND role = 'driver'
      RETURNING *`;
    vals.push(id);

    const upd = await pool.query(sql, vals);
    return res.status(200).json({ message: "Driver updated successfully", driver: upd.rows[0] });
  } catch (error) {
    const status = error.status || 500;
    console.error("Error updating driver:", error);
    return res.status(status).json({ message: error.message });
  }
};

const deleteDriver = async (req, res) => {
  try {
    requireRole(req.user, ["admin", "super_admin"]);

    const id = toInt(req.params.id, null);
    if (id === null) return res.status(400).json({ message: "Driver ID is required" });

    await ensureDriverExists(id);

    const del = await pool.query(
      `DELETE FROM users WHERE id = $1 AND role = 'driver' RETURNING *`,
      [id]
    );

    return res.status(200).json({ message: "Driver deleted successfully", driver: del.rows[0] });
  } catch (error) {
    const status = error.status || 500;
    console.error("Error deleting driver:", error);
    return res.status(status).json({ message: error.message });
  }
};

const assignWorkArea = async (req, res) => {
  try {
    requireRole(req.user, ["admin", "super_admin"]);

    const { driverId, workAreaId, societyId } = req.body;

    const dId = toInt(driverId, null);
    if (dId === null) return res.status(400).json({ message: "driverId is required" });
    await ensureDriverExists(dId);

    // Ensure driver is verified
    const verified = await pool.query(
      `SELECT 1 FROM users WHERE id = $1 AND is_verified = true`,
      [dId]
    );
    if (!verified.rows.length) {
      return res.status(404).json({ message: "Driver not found or not verified" });
    }

    // Stub assignment payload (replace with real persistence when ready)
    const assignmentData = {
      id: Math.floor(Math.random() * 1000000),
      driver_id: dId,
      work_area_id: workAreaId,
      society_id: societyId,
      assigned_date: new Date().toISOString(),
      status: "active",
      area_name: `Sector ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`,
      area_description: "Residential area with 150 households",
      estimated_bins: Math.floor(Math.random() * 50) + 20
    };

    return res.status(201).json({
      message: "Work area assigned successfully",
      assignment: assignmentData,
    });
  } catch (error) {
    const status = error.status || 500;
    console.error("Error assigning work area:", error);
    return res.status(status).json({ message: error.message });
  }
};

const getDriverWorkAreas = async (req, res) => {
  try {
    const driverId = req.user.id;

    if (driverId === null) return res.status(400).json({ message: "Invalid driver id" });

    ensureSelfOrRole(req.user, driverId, ["admin", "super_admin"]);

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

    return res.status(200).json({
      message: "Work areas retrieved successfully",
      workAreas,
      count: workAreas.length,
    });
  } catch (error) {
    const status = error.status || 500;
    console.error("Error fetching work areas:", error);
    return res.status(status).json({ message: error.message });
  }
};

const getCollectionRoutes = async (req, res) => {
  try {
    const driverId = toInt(req.params.driverId, null);
    if (driverId === null) return res.status(400).json({ message: "Invalid driver id" });

    ensureSelfOrRole(req.user, driverId, ["admin", "super_admin"]);

    // Stub data
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

    return res.status(200).json({
      message: "Collection routes retrieved successfully",
      routes,
      total_routes: routes.length,
    });
  } catch (error) {
    const status = error.status || 500;
    console.error("Error fetching collection routes:", error);
    return res.status(status).json({ message: error.message });
  }
};

const updateTaskStatus = async (req, res) => {
  try {
    requireRole(req.user, ["driver"]);

    const taskId = req.params.taskId;
    if (!taskId) return res.status(400).json({ message: "taskId is required" });

    const { status, notes, completedAt, location } = req.body;

    // Stub update
    const updatedTask = {
      id: taskId,
      driver_id: req.user.id,
      bin_id: "BIN_001",
      status,
      notes: notes || "",
      started_at: "2024-01-20T08:00:00Z",
      completed_at: completedAt || new Date().toISOString(),
      location: location || { lat: 33.6844, lng: 73.0479 },
      collection_weight: Math.floor(Math.random() * 50) + 10,
      updated_at: new Date().toISOString()
    };

    return res.status(200).json({
      message: "Task status updated successfully",
      task: updatedTask,
    });
  } catch (error) {
    const status = error.status || 500;
    console.error("Error updating task status:", error);
    return res.status(status).json({ message: error.message });
  }
};

const updateDriverLocation = async (req, res) => {
  try {
    requireRole(req.user, ["driver"]);

    const { latitude, longitude, timestamp } = req.body;
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return res.status(400).json({ message: "latitude and longitude are required as numbers" });
    }

    // Verify driver account is verified
    const driverVerified = await pool.query(
      `SELECT 1 FROM users WHERE id = $1 AND is_verified = true`,
      [req.user.id]
    );
    if (!driverVerified.rows.length) {
      return res.status(404).json({ message: "Driver not verified" });
    }

    // Stub location payload
    const locationData = {
      driver_id: req.user.id,
      latitude,
      longitude,
      timestamp: timestamp || new Date().toISOString(),
      address: "Street 5, Sector A, Islamabad",
      status: "active"
    };

    return res.status(200).json({
      message: "Location updated successfully",
      location: locationData,
    });
  } catch (error) {
    const status = error.status || 500;
    console.error("Error updating driver location:", error);
    return res.status(status).json({ message: error.message });
  }
};

const getDriverPerformance = async (req, res) => {
  try {
    const driverId = toInt(req.params.driverId, null);
    if (driverId === null) return res.status(400).json({ message: "Invalid driver id" });

    ensureSelfOrRole(req.user, driverId, ["admin", "super_admin"]);

    const periodDays = toInt(req.query.period, 30);

    // Stub data
    const performanceData = {
      driver_id: driverId,
      period_days: periodDays,
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

    return res.status(200).json({
      message: "Performance metrics retrieved successfully",
      performance: performanceData,
    });
  } catch (error) {
    const status = error.status || 500;
    console.error("Error fetching performance metrics:", error);
    return res.status(status).json({ message: error.message });
  }
};

const getCurrentTasks = async (req, res) => {
  try {
    requireRole(req.user, ["driver"]);

    // Stub tasks
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

    return res.status(200).json({
      message: "Current tasks retrieved successfully",
      tasks: currentTasks,
      count: currentTasks.length,
    });
  } catch (error) {
    const status = error.status || 500;
    console.error("Error fetching current tasks:", error);
    return res.status(status).json({ message: error.message });
  }
};

const getDriverSchedule = async (req, res) => {
  try {
    const driverId = toInt(req.params.driverId, null);
    if (driverId === null) return res.status(400).json({ message: "Invalid driver id" });

    ensureSelfOrRole(req.user, driverId, ["admin", "super_admin"]);

    const targetDate = req.query.date || new Date().toISOString().split("T")[0];

    // Stub schedule
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

    return res.status(200).json({
      message: "Driver schedule retrieved successfully",
      schedule,
    });
  } catch (error) {
    const status = error.status || 500;
    console.error("Error fetching driver schedule:", error);
    return res.status(status).json({ message: error.message });
  }
};

module.exports = {
//addDriver,
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
