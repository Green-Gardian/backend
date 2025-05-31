// const { pool } = require("../config/db");
// const nodemailer = require("nodemailer");
// const jwt = require("jsonwebtoken");
// const { google } = require("googleapis");
// const bcrypt = require("bcrypt");
// const OAuth2 = google.auth.OAuth2;
// require("dotenv").config();


// const addAdmin = async (req, res) => {
//     const { username, email, societyName, societyAddress, phoneNumber } = req.body;

//     try {
//         const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
//         if (!emailRegex.test(email)) {
//             return res.status(400).json({ message: "Invalid email address" });
//         }

//         // Check if email already exists
//         const checkEmailQuery = {
//             text: "SELECT id FROM admin WHERE email = $1",
//             values: [email]
//         };

//         const emailCheck = await pool.query(checkEmailQuery);
//         if (emailCheck.rows.length > 0) {
//             return res.status(409).json({ message: "Email already registered" });
//         }

//         const addQuery = {
//             text: "INSERT INTO admin (username, email, society_name, society_address, phone_number) VALUES ($1, $2, $3, $4, $5) RETURNING *",
//             values: [username, email, societyName, societyAddress, phoneNumber]
//         };

//         const queryRes = await pool.query(addQuery);

//         if (queryRes.rows.length === 0) {
//             return res.status(500).json({ message: "Error inserting record" });
//         }

//         const addedRecord = queryRes.rows[0];

//         // Generate token for password setup
//         const token = jwt.sign(
//             { id: addedRecord.id, role: 'admin' },
//             process.env.JWT_ACCESS_SECRET,
//             { expiresIn: process.env.JWT_ACCESS_EXPIRY }
//         );

//         const link = `${process.env.FRONTEND_URL || 'http://localhost:5000'}/user/set-password?token=${token}`;

//         try {
//             // Set up OAuth2 client
//             const OAuth2Client = new OAuth2(
//                 process.env.OAUTH_CLIENT_ID,
//                 process.env.OAUTH_CLIENT_SECRET,
//                 "https://developers.google.com/oauthplayground"
//             );

//             OAuth2Client.setCredentials({
//                 refresh_token: process.env.OAUTH_REFRESH_TOKEN
//             });

//             const accessToken = await OAuth2Client.getAccessToken();

//             // Create transporter with OAuth2
//             const transporter = nodemailer.createTransport({
//                 service: 'gmail',
//                 auth: {
//                     type: "OAuth2",
//                     user: process.env.SENDER_EMAIL,
//                     clientId: process.env.OAUTH_CLIENT_ID,
//                     clientSecret: process.env.OAUTH_CLIENT_SECRET,
//                     refreshToken: process.env.OAUTH_REFRESH_TOKEN,
//                     accessToken: accessToken.token
//                 }
//             });

//             await transporter.sendMail({
//                 from: `GreenGuardian <${process.env.SENDER_EMAIL}>`,
//                 to: email,
//                 subject: "Set your password for GreenGuardian",
//                 html: `
//                 <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
//                     <h2 style="color: #2e7d32;">Welcome to GreenGuardian</h2>
//                     <p>Hello ${username},</p>
//                     <p>You have been added as a society admin in the GreenGuardian system.</p>
//                     <p>Please click the button below to set your password. This link will expire in 15 minutes.</p>
//                     <div style="text-align: center; margin: 25px 0;">
//                         <a href="${link}" style="background-color: #2e7d32; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Set Password</a>
//                     </div>
//                     <p>If you didn't request this, please ignore this email.</p>
//                     <p>Best regards,<br>The GreenGuardian Team</p>
//                 </div>
//                 `
//             });

//             return res.status(201).json({ message: "Admin successfully added. Password setup email sent." });
//         } catch (emailError) {
//             console.error("Error sending email:", emailError);
//             // Admin was added but email failed - return partial success
//             return res.status(201).json({
//                 message: "Admin added successfully but failed to send email",
//                 adminId: addedRecord.id,
//                 error: emailError.message
//             });
//         }
//     } catch (err) {
//         console.error("Error adding admin details:", err);
//         return res.status(500).json({ message: "Error adding admin details", error: err.message });
//     }
// };


// const setPassword = async (req, res) => {
//     try {
//         const token = req.query.token;
//         const { password, confirmPassword } = req.body;

//         if (!token) {
//             return res.status(400).json({ message: "Token is required" });
//         }

        

//         let decoded;
//         try {
//             decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
//         } catch (error) {
//             if (error.name === 'TokenExpiredError') {
//                 return res.status(401).json({ message: "Password setup link has expired" });
//             }
//             return res.status(401).json({ message: "Invalid token" });
//         }

//         if (decoded.role !== "admin") {
//             return res.status(403).json({ message: "Access denied" });
//         }


//         if (password !== confirmPassword) {
//             return res.status(400).json({ message: "Passwords do not match" });
//         }


//         const hashPassword = await bcrypt.hash(password, 10);

//         const query = {
//             text: `UPDATE admin SET password = $1, is_verified = TRUE WHERE id = $2 RETURNING id, username, email`,
//             values: [hashPassword, decoded.id]
//         };

//         const result = await pool.query(query);

//         if (result.rows.length === 0) {
//             return res.status(404).json({ message: "Admin not found" });
//         }

//         return res.status(200).json({ message: "Password successfully set", user: result.rows[0] });
//     } catch (error) {
//         console.error(`Error setting password: ${error}`);
//         return res.status(500).json({ message: "Internal Server Error", error: error.message });
//     }
// };

// module.exports = { addAdmin, setPassword };