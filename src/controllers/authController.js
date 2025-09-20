// controllers/authController.js (cleaned + logical fixes)

const { pool } = require("../config/db");
require("dotenv").config();
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken"); // ✅ added
const { generateTokens } = require("../utils/generateToken");
const { hashPassword, comparePassword } = require("../utils/hashPassword");

/* -------------------------------------------------------
 * Shared constants & helpers
 * ----------------------------------------------------- */

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const isEmailValid = (email) => EMAIL_REGEX.test(String(email || "").trim());
const getUsernameFromEmail = (email) => String(email || "").trim().split("@")[0];

const requireAll = (fields) => {
  for (const [key, val] of Object.entries(fields)) {
    if (val === undefined || val === null || String(val).trim() === "") {
      return { ok: false, key };
    }
  }
  return { ok: true };
};

const runQuery = (text, values = []) => pool.query(text, values);

const getUserByEmail = async (email) => {
  const r = await runQuery(`SELECT * FROM users WHERE email = $1`, [String(email).trim()]);
  return r.rows[0] || null;
};

const getUserByPhone = async (phone) => {
  const r = await runQuery(`SELECT * FROM users WHERE phone_number = $1`, [phone]);
  return r.rows[0] || null;
};

// const insertUserRecord = async ({
//   firstName,
//   lastName,
//   username,
//   phone,
//   email,
//   role,
//   societyId, // optional
// }) => {
//   if (role === "super_admin") {
//     const r = await runQuery(
//       `INSERT INTO users (first_name, last_name, username, phone_number, email, role)
//        VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
//       [firstName.trim(), lastName.trim(), username, phone, String(email).trim(), role]
//     );
//     return r.rows[0];
//   } else {
//     const r = await runQuery(
//       `INSERT INTO users (first_name, last_name, username, phone_number, email, role, society_id)
//        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
//       [firstName.trim(), lastName.trim(), username, phone, String(email).trim(), role, societyId]
//     );
//     return r.rows[0];
//   }
// };

// const ensureAdminInSocietyChat = async (role, userId, societyId) => {
//   if (role !== "admin") return;

//   const chat = await runQuery(`SELECT * FROM chat WHERE society_id = $1`, [societyId]);

//   if (chat.rows.length > 0) {
//     const row = chat.rows[0];
//     const currentParticipants = row.chatparticipants || [];
//     if (!currentParticipants.includes(userId)) {
//       const updatedParticipants = [...currentParticipants, userId];
//       await runQuery(`UPDATE chat SET chatparticipants = $1 WHERE id = $2`, [
//         updatedParticipants,
//         row.id,
//       ]);
//       console.log(`✅ Added admin ${userId} to chat ${row.id}`);
//     }
//   } else {
//     // ✅ fix column casing to unquoted lowercase (postgres default)
//     const newChat = await runQuery(
//       `INSERT INTO chat (society_id, chatparticipants, lastmessage)
//        VALUES ($1, $2, $3) RETURNING *`,
//       [societyId, [userId], null]
//     );
//     console.log("✅ Created new chat for society:", newChat.rows[0]);
//   }
// };

const createRandomToken = () => crypto.randomBytes(32).toString("hex");

// const createEmailVerificationToken = async (userId, token, expiresAt) => {
//   await runQuery(
//     `INSERT INTO email_verification_tokens (user_id, token, expires_at)
//      VALUES ($1, $2, $3)`,
//     [userId, token, expiresAt]
//   );
// };

const deleteExistingResetTokens = async (userId) => {
  await runQuery(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [userId]);
};

const createPasswordResetToken = async (userId, token, expiresAt) => {
  await runQuery(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, token, expiresAt]
  );
};

/* -------------------------------
 * Email: transporter + templates
 * ----------------------------- */

let _transporter;
const getTransporter = () => {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SENDER_EMAIL,
      pass: process.env.SENDER_PASSWORD,
    },
  });
  return _transporter;
};

const verificationEmailHTML = (recipientUsername, verificationLink) => `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Email Verification</title></head>
<body style="margin:0;padding:0;font-family:'Arial',sans-serif;background-color:#f4f7f5;">
<div style="max-width:600px;margin:0 auto;background-color:#ffffff;box-shadow:0 4px 10px rgba(0,0,0,0.1);">
  <div style="background:linear-gradient(135deg,#4CAF50 0%,#2E7D32 100%);padding:40px 20px;text-align:center;">
    <div style="background-color:white;width:80px;height:80px;border-radius:50%;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 15px rgba(0,0,0,0.2);"><span style="font-size:40px;">🌱</span></div>
    <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:bold;">Green Guardian</h1>
    <p style="color:#e8f5e8;margin:10px 0 0 0;font-size:16px;">Your Environmental Journey Starts Here</p>
  </div>
  <div style="padding:40px 30px;">
    <h2 style="color:#2E7D32;margin-bottom:20px;font-size:24px;">Hello ${recipientUsername}! 👋</h2>
    <p style="color:#555;line-height:1.6;font-size:16px;margin-bottom:25px;">Welcome to the Green Guardian community! We're excited to have you join us in making our planet a greener, more sustainable place.</p>
    <div style="background-color:#f8fff9;border-left:4px solid #4CAF50;padding:20px;margin:25px 0;border-radius:4px;">
      <h3 style="color:#2E7D32;margin:0 0 15px 0;font-size:18px;">📧 Verify Your Email Address</h3>
      <p style="color:#666;margin:0;line-height:1.5;">To complete your registration and start your eco-friendly journey, please verify your email address by clicking the button below.</p>
    </div>
    <div style="text-align:center;margin:35px 0;">
      <a href="${verificationLink}" style="background:linear-gradient(135deg,#4CAF50 0%,#45a049 100%);color:#fff;text-decoration:none;padding:15px 35px;border-radius:50px;font-weight:bold;font-size:16px;display:inline-block;box-shadow:0 4px 15px rgba(76,175,80,.3);transition:all .3s ease;">✨ Verify Email & Set Password</a>
    </div>
    <div style="background-color:#fff3cd;border:1px solid #ffeaa7;border-radius:6px;padding:15px;margin:30px 0;">
      <p style="color:#856404;margin:0;font-size:14px;text-align:center;">⏰ This verification link will expire in 24 hours for security purposes.</p>
    </div>
    <div style="border-top:1px solid #eee;padding-top:25px;margin-top:30px;">
      <p style="color:#888;font-size:14px;line-height:1.5;margin-bottom:15px;">If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="background-color:#f8f9fa;padding:10px;border-radius:4px;word-break:break-all;font-size:13px;color:#666;margin:0;">${verificationLink}</p>
    </div>
  </div>
  <div style="background-color:#f8fff9;padding:30px;text-align:center;border-top:1px solid #e8f5e8;">
    <div style="margin-bottom:20px;"><span style="font-size:24px;margin:0 5px;">🌍</span><span style="font-size:24px;margin:0 5px;">🌿</span><span style="font-size:24px;margin:0 5px;">♻️</span></div>
    <p style="color:#2E7D32;margin:0 0 10px 0;font-weight:bold;font-size:16px;">Together, we can make a difference!</p>
    <p style="color:#666;font-size:14px;margin:0 0 15px 0;line-height:1.4;">Join thousands of eco-warriors already making positive environmental impact.</p>
    <p style="color:#888;font-size:12px;margin:0;">This email was sent from Green Guardian. If you didn't create an account with us, please ignore this email.</p>
    <div style="margin-top:20px;padding-top:20px;border-top:1px solid #e8f5e8;"><p style="color:#aaa;font-size:11px;margin:0;">© 2025 Green Guardian. All rights reserved.</p></div>
  </div>
</div>
</body></html>
`;

const resetEmailHTML = (recipientUsername, resetLink) => `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Password Reset</title></head>
<body style="margin:0;padding:0;font-family:'Arial',sans-serif;background-color:#f4f7f5;">
<div style="max-width:600px;margin:0 auto;background-color:#ffffff;box-shadow:0 4px 10px rgba(0,0,0,0.1);">
  <div style="background:linear-gradient(135deg,#4CAF50 0%,#2E7D32 100%);padding:40px 20px;text-align:center;">
    <div style="background-color:white;width:80px;height:80px;border-radius:50%;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 15px rgba(0,0,0,0.2);"><span style="font-size:40px;">🔐</span></div>
    <h1 style="color:#fff;margin:0;font-size:28px;font-weight:bold;">Green Guardian</h1>
    <p style="color:#e8f5e8;margin:10px 0 0 0;font-size:16px;">Password Reset Request</p>
  </div>
  <div style="padding:40px 30px;">
    <h2 style="color:#2E7D32;margin-bottom:20px;font-size:24px;">Hello ${recipientUsername}! 👋</h2>
    <p style="color:#555;line-height:1.6;font-size:16px;margin-bottom:25px;">We received a request to reset your password for your Green Guardian account. If you didn't make this request, you can safely ignore this email.</p>
    <div style="background-color:#fff3cd;border-left:4px solid #ffc107;padding:20px;margin:25px 0;border-radius:4px;">
      <h3 style="color:#856404;margin:0 0 15px 0;font-size:18px;">🔒 Reset Your Password</h3>
      <p style="color:#856404;margin:0;line-height:1.5;">Click the button below to create a new password for your account.</p>
    </div>
    <div style="text-align:center;margin:35px 0;">
      <a href="${resetLink}" style="background:linear-gradient(135deg,#4CAF50 0%,#45a049 100%);color:#fff;text-decoration:none;padding:15px 35px;border-radius:50px;font-weight:bold;font-size:16px;display:inline-block;box-shadow:0 4px 15px rgba(76,175,80,.3);transition:all .3s ease;">🔑 Reset Password</a>
    </div>
    <div style="background-color:#f8d7da;border:1px solid #f5c6cb;border-radius:6px;padding:15px;margin:30px 0;">
      <p style="color:#721c24;margin:0;font-size:14px;text-align:center;">⏰ This reset link will expire in 1 hour for security purposes.</p>
    </div>
    <div style="border-top:1px solid #eee;padding-top:25px;margin-top:30px;">
      <p style="color:#888;font-size:14px;line-height:1.5;margin-bottom:15px;">If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="background-color:#f8f9fa;padding:10px;border-radius:4px;word-break:break-all;font-size:13px;color:#666;margin:0;">${resetLink}</p>
    </div>
  </div>
  <div style="background-color:#f8fff9;padding:30px;text-align:center;border-top:1px solid #e8f5e8;">
    <div style="margin-bottom:20px;"><span style="font-size:24px;margin:0 5px;">🔐</span><span style="font-size:24px;margin:0 5px;">🌱</span><span style="font-size:24px;margin:0 5px;">🛡️</span></div>
    <p style="color:#2E7D32;margin:0 0 10px 0;font-weight:bold;font-size:16px;">Your security is important to us!</p>
    <p style="color:#666;font-size:14px;margin:0 0 15px 0;line-height:1.4;">If you didn't request this password reset, please contact our support team immediately.</p>
    <p style="color:#888;font-size:12px;margin:0;">This email was sent from Green Guardian. If you didn't request a password reset, please ignore this email.</p>
    <div style="margin-top:20px;padding-top:20px;border-top:1px solid #e8f5e8;"><p style="color:#aaa;font-size:11px;margin:0;">© 2025 Green Guardian. All rights reserved.</p></div>
  </div>
</div>
</body></html>
`;

const sendMail = async ({ to, subject, html }) => {
  const transporter = getTransporter();
  const mailOptions = {
    from: `Green Guardian <${process.env.SENDER_EMAIL}>`,
    to,
    subject,
    html,
  };
  const result = await transporter.sendMail(mailOptions);
  console.log("Email sent successfully:", result.response);
  return result;
};

/* ------------------------------------
 * Controllers
 * ---------------------------------- */

const addAdminAndStaff = async (req, res) => {
  const client = await pool.connect();
  try {
    const { firstName, lastName, phone, role, email, societyId } = req.body;

    const need = requireAll({ firstName, lastName, phone, role, email });
    if (!need.ok) return res.status(400).json({ message: "All fields are required" });

    if (role !== "super_admin" && !societyId) {
      return res
        .status(400)
        .json({ message: "Society ID is required for non-super admin roles" });
    }

    if (!isEmailValid(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }

    // App-level duplicate checks (DB unique constraints still recommended)
    const dupEmail = await getUserByEmail(email);
    if (dupEmail) return res.status(400).json({ message: "Email already in use." });
    const dupPhone = await getUserByPhone(phone);
    if (dupPhone) return res.status(400).json({ message: "Phone number already in use." });

    const username = getUsernameFromEmail(email);

    await client.query("BEGIN");

    // Insert user
    const userInsert = await client.query(
      role === "super_admin"
        ? `INSERT INTO users (first_name, last_name, username, phone_number, email, role)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`
        : `INSERT INTO users (first_name, last_name, username, phone_number, email, role, society_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      role === "super_admin"
        ? [firstName.trim(), lastName.trim(), username, phone, String(email).trim(), role]
        : [firstName.trim(), lastName.trim(), username, phone, String(email).trim(), role, societyId]
    );
    const newUser = userInsert.rows[0];

    // Admin gets into society chat
    if (role === "admin") {
      const chat = await client.query(`SELECT * FROM chat WHERE society_id = $1`, [societyId]);
      if (chat.rows.length > 0) {
        const row = chat.rows[0];
        const currentParticipants = row.chatparticipants || [];
        if (!currentParticipants.includes(newUser.id)) {
          const updatedParticipants = [...currentParticipants, newUser.id];
          await client.query(`UPDATE chat SET chatparticipants = $1 WHERE id = $2`, [
            updatedParticipants,
            row.id,
          ]);
        }
      } else {
        // fixed column names
        await client.query(
          `INSERT INTO chat (society_id, chatparticipants, lastmessage)
           VALUES ($1, $2, $3)`,
          [societyId, [newUser.id], null]
        );
      }
    }

    // Email verification token
    const verificationToken = createRandomToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await client.query(
      `INSERT INTO email_verification_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [newUser.id, verificationToken, expiresAt]
    );

    await client.query("COMMIT");

    await sendVerificationEmail(username, String(email).trim(), verificationToken);

    return res.status(201).json({
      message: `Staff created. Email sent to verify and set password.`,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`❌ Error creating user: ${error.message}`);
    return res.status(500).json({ error: "Server Error" });
  } finally {
    client.release();
  }
};

const signIn = async (req, res) => {
  const { email, password } = req.body;

  try {
    const queryRes = await runQuery(`SELECT * FROM users WHERE email = $1`, [String(email).trim()]);
    if (queryRes.rows.length === 0) {
      return res.status(404).json({ message: "Invalid Email" });
    }
    const user = queryRes.rows[0];

    if (user.is_blocked) {
      return res
        .status(403)
        .json({ message: "Account has been blocked. Please contact support." });
    }

    const match = await comparePassword(password, user.password_hash);
    if (!match) {
      return res.status(404).json({ message: "Invalid Password" });
    }

    const tokens = generateTokens(user);

    await runQuery(
      `INSERT INTO refresh_tokens (user_id, token, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP)`,
      [user.id, tokens.refresh_token]
    );

    const response = {
      message: "User logged in successfully",
      ...tokens,
      username: user.username,
      is_verified: user.is_verified,
      role: user.role,
    };
    console.log("Signin response:", response);
    return res.status(200).json(response);
  } catch (error) {
    return res
      .status(500)
      .json({ message: `Unable to sign in`, error: error.message });
  }
};

const signOut = async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ message: "Refresh token is required" });
    }

    await runQuery(`DELETE FROM refresh_tokens WHERE token = $1`, [refresh_token]);

    return res.status(200).json({ message: "User signed out successfully" });
  } catch (error) {
    return res.status(500).json({ message: `Unable to sign out` });
  }
};

const sendVerificationEmail = async (recipientUsername, recipientEmail, verificationToken) => {
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:3001";
  const verificationLink = `${baseUrl.replace(/\/+$/,"")}/verify-email?token=${verificationToken}`;
  try {
    return await sendMail({
      to: recipientEmail,
      subject: "🌱 Welcome to Green Guardian - Verify Your Email",
      html: verificationEmailHTML(recipientUsername, verificationLink),
    });
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

const verifyEmailAndSetPassword = async (req, res) => {
  const client = await pool.connect();
  try {
    const token = req.query.token;
    const { password, confirmPassword } = req.body;

    if (!token) return res.status(400).json({ message: "Token is required" });
    if (!password) return res.status(400).json({ message: `Password field is required.` });
    if (!confirmPassword)
      return res.status(400).json({ message: `Confirm Password field is required.` });
    if (password !== confirmPassword)
      return res.status(400).json({ message: `Passwords donot match.` });

    // Validate token and current verification state
    const tokenQuery = await runQuery(
      `
      SELECT vt.*, u.id as uid, u.is_verified
      FROM email_verification_tokens vt
      JOIN users u ON vt.user_id = u.id
      WHERE vt.token = $1 AND vt.is_used = FALSE AND vt.expires_at > NOW()
      `,
      [token]
    );

    if (tokenQuery.rows.length === 0) {
      return res.status(400).json({ message: `Expired or invalid token` });
    }

    const row = tokenQuery.rows[0];
    if (row.is_verified === true) {
      return res.status(400).json({ message: `Email Already verified.` });
    }

    await client.query("BEGIN");

    const hashedPassword = await hashPassword(password);

    const updatePassword = await client.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id`,
      [hashedPassword, row.user_id]
    );

    if (updatePassword.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(500).json({ message: `Error updating password.` });
    }

    await client.query(
      `UPDATE users SET is_verified = TRUE, updated_at = NOW() WHERE id = $1`,
      [row.user_id]
    );

    await client.query(
      `UPDATE email_verification_tokens SET is_used = TRUE WHERE token = $1`,
      [token]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      message: `Email successfully Verified and password is set. You can now log in. `,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.log(`Email Verification Failed`);
    return res
      .status(500)
      .json({ message: `Email Verification Failed`, error: error.message });
  } finally {
    client.release();
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token)
      return res.status(401).json({ message: "Refresh token required" });

    // ✅ Validate refresh token signature
    const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);

    // ✅ Ensure token exists in DB (not revoked)
    const rtRow = await runQuery(
      `SELECT user_id FROM refresh_tokens WHERE token = $1`,
      [refresh_token]
    );
    if (rtRow.rows.length === 0) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // ✅ Load real user & role
    const userRes = await runQuery(`SELECT id, role FROM users WHERE id = $1`, [decoded.id]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ message: "Invalid user" });
    }
    const user = userRes.rows[0];

    // ✅ Issue access token with real role, not hardcoded
    const access_token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.JWT_ACCESS_EXPIRY }
    );

    return res.status(200).json({ access_token });
  } catch (err) {
    return res.status(401).json({ message: "Invalid refresh token", error: err.message });
  }
};

const listAdmins = async (req, res) => {
  try {
    const result = await runQuery(`SELECT * FROM users WHERE role = 'admin'`);
    return res.status(200).json({ admins: result.rows });
  } catch (error) {
    console.error("Error fetching admins:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    const userId = req.user.id; // From token verification middleware

    const need = requireAll({ currentPassword, newPassword, confirmNewPassword });
    if (!need.ok) return res.status(400).json({ message: "All fields are required" });

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ message: "New passwords do not match" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters long" });
    }

    const userQuery = await runQuery(
      `SELECT password_hash FROM users WHERE id = $1`,
      [userId]
    );
    if (userQuery.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userQuery.rows[0];

    const isCurrentPasswordValid = await comparePassword(
      currentPassword,
      user.password_hash
    );
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    const hashedNewPassword = await hashPassword(newPassword);

    await runQuery(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [hashedNewPassword, userId]
    );

    return res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    console.error(`Error changing password: ${error.message}`);
    return res.status(500).json({ message: "Server Error" });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) return res.status(400).json({ message: "Email is required" });
    if (!isEmailValid(email)) return res.status(400).json({ message: "Invalid email address" });

    const user = await getUserByEmail(email);

    if (!user) {
      return res.status(200).json({
        message: "If the email exists, a password reset link has been sent",
      });
    }

    const resetToken = createRandomToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await deleteExistingResetTokens(user.id);
    await createPasswordResetToken(user.id, resetToken, expiresAt);

    await sendPasswordResetEmail(user.username, user.email, resetToken);

    return res.status(200).json({
      message: "If the email exists, a password reset link has been sent",
    });
  } catch (error) {
    console.error(`Error in forgot password: ${error.message}`);
    return res.status(500).json({ message: "Server Error" });
  }
};

const resetPassword = async (req, res) => {
  const client = await pool.connect();
  try {
    const token = req.query.token;
    const { newPassword, confirmPassword } = req.body;

    if (!token) return res.status(400).json({ message: "Reset token is required" });
    if (!newPassword || !confirmPassword)
      return res.status(400).json({ message: "All fields are required" });
    if (newPassword !== confirmPassword)
      return res.status(400).json({ message: "Passwords do not match" });
    if (newPassword.length < 6)
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters long" });

    const tokenQuery = await runQuery(
      `
      SELECT rt.*, u.id as user_id, u.email
      FROM password_reset_tokens rt
      JOIN users u ON rt.user_id = u.id
      WHERE rt.token = $1 AND rt.is_used = FALSE AND rt.expires_at > NOW()`,
      [token]
    );

    if (tokenQuery.rows.length === 0) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    const resetTokenData = tokenQuery.rows[0];

    await client.query("BEGIN");

    const hashedPassword = await hashPassword(newPassword);

    await client.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [hashedPassword, resetTokenData.user_id]
    );

    await client.query(
      `UPDATE password_reset_tokens SET is_used = TRUE WHERE token = $1`,
      [token]
    );

    await client.query("COMMIT");

    return res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`Error resetting password: ${error.message}`);
    return res.status(500).json({ message: "Server Error" });
  } finally {
    client.release();
  }
};

const sendPasswordResetEmail = async (recipientUsername, recipientEmail, resetToken) => {
  console.log(`Password Reset Token: ${resetToken}`);
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:3001";
  const resetLink = `${baseUrl.replace(/\/+$/,"")}/auth/reset-password?token=${resetToken}`;
  try {
    return await sendMail({
      to: recipientEmail,
      subject: "🔐 Green Guardian - Password Reset Request",
      html: resetEmailHTML(recipientUsername, resetLink),
    });
  } catch (error) {
    console.error("Error sending password reset email:", error);
    throw error;
  }
};

// Super Admin Functions
const getAllUsers = async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page ?? "1", 10) || 1;
    const limit = Number.parseInt(req.query.limit ?? "10", 10) || 10;
    const { role, search, societyId } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "";
    const values = [];
    let idx = 1;

    if (role && role !== "all") {
      whereClause += `WHERE u.role = $${idx++}`;
      values.push(role);
    }

    if (societyId && societyId !== "all") {
      const cond = `u.society_id = $${idx++}`;
      whereClause = whereClause ? `${whereClause} AND ${cond}` : `WHERE ${cond}`;
      values.push(societyId);
    }

    if (search) {
      const cond = `(u.first_name ILIKE $${idx} OR u.last_name ILIKE $${idx} OR u.email ILIKE $${idx} OR u.username ILIKE $${idx})`;
      whereClause = whereClause ? `${whereClause} AND ${cond}` : `WHERE ${cond}`;
      values.push(`%${search}%`);
      idx++;
    }

    const countQuery = `
      SELECT COUNT(*)
      FROM users u
      LEFT JOIN societies s ON u.society_id = s.id
      ${whereClause}
    `;
    const countResult = await runQuery(countQuery, values);
    const totalUsers = Number.parseInt(countResult.rows[0].count, 10);

    const usersQuery = `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.username,
        u.email,
        u.phone_number,
        u.role,
        u.is_verified,
        u.is_blocked,
        u.created_at,
        u.updated_at,
        u.society_id,
        s.society_name,
        s.city,
        s.state
      FROM users u
      LEFT JOIN societies s ON u.society_id = s.id
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    const usersResult = await runQuery(usersQuery, [...values, limit, offset]);

    const usersBySociety = {};
    const usersWithoutSociety = [];

    usersResult.rows.forEach((user) => {
      if (user.society_id) {
        if (!usersBySociety[user.society_id]) {
          usersBySociety[user.society_id] = {
            society: {
              id: user.society_id,
              name: user.society_name,
              city: user.city,
              state: user.state,
            },
            users: [],
          };
        }
        usersBySociety[user.society_id].users.push({
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          username: user.username,
          email: user.email,
          phone_number: user.phone_number,
          role: user.role,
          is_verified: user.is_verified,
          is_blocked: user.is_blocked,
          created_at: user.created_at,
          updated_at: user.updated_at,
        });
      } else {
        usersWithoutSociety.push({
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          username: user.username,
          email: user.email,
          phone_number: user.phone_number,
          role: user.role,
          is_verified: user.is_verified,
          is_blocked: user.is_blocked,
          created_at: user.created_at,
          updated_at: user.updated_at,
        });
      }
    });

    return res.status(200).json({
      users: usersResult.rows,
      usersBySociety,
      usersWithoutSociety,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalUsers / limit),
        totalUsers,
        limit,
      },
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

const blockUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isBlocked } = req.body;

    if (typeof isBlocked !== "boolean") {
      return res
        .status(400)
        .json({ message: "isBlocked must be a boolean value" });
    }

    const userCheck = await runQuery(
      `SELECT id, role FROM users WHERE id = $1`,
      [userId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    if (userCheck.rows[0].role === "super_admin") {
      return res
        .status(403)
        .json({ message: "Cannot block super admin users" });
    }

    // ✅ removed runtime DDL; expect migrations to ensure column exists
    const result = await runQuery(
      `UPDATE users SET is_blocked = $1, updated_at = NOW() WHERE id = $2 RETURNING id, first_name, last_name, email, role, is_blocked`,
      [isBlocked, userId]
    );

    return res.status(200).json({
      message: `User ${isBlocked ? "blocked" : "unblocked"} successfully`,
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Error blocking user:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const userCheck = await runQuery(
      `SELECT id, role FROM users WHERE id = $1`,
      [userId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    if (userCheck.rows[0].role === "super_admin") {
      return res
        .status(403)
        .json({ message: "Cannot delete super admin users" });
    }

    await runQuery(`DELETE FROM users WHERE id = $1`, [userId]);

    return res.status(200).json({
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

const getSystemStats = async (req, res) => {
  try {
    const userStats = await runQuery(`
      SELECT
        role,
        COUNT(*) as count,
        COUNT(CASE WHEN is_verified = true THEN 1 END) as verified_count,
        COUNT(CASE WHEN is_blocked = true THEN 1 END) as blocked_count
      FROM users
      GROUP BY role
    `);

    const societyCount = await runQuery(`SELECT COUNT(*) as count FROM societies`);

    const recentActivity = await runQuery(`
      SELECT
        COUNT(*) as new_users,
        COUNT(CASE WHEN role = 'admin' THEN 1 END) as new_admins,
        COUNT(CASE WHEN role = 'customer_support' THEN 1 END) as new_staff
      FROM users
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `);

    const usersBySociety = await runQuery(`
      SELECT
        s.id,
        s.society_name,
        s.city,
        s.state,
        u.role,
        COUNT(*) as count
      FROM societies s
      LEFT JOIN users u ON s.id = u.society_id
      WHERE u.id IS NOT NULL
      GROUP BY s.id, s.society_name, s.city, s.state, u.role
      ORDER BY s.society_name, u.role
    `);

    const usersWithoutSociety = await runQuery(`
      SELECT
        role,
        COUNT(*) as count
      FROM users
      WHERE society_id IS NULL
      GROUP BY role
    `);

    const societiesWithUsers = {};
    usersBySociety.rows.forEach((row) => {
      if (!societiesWithUsers[row.id]) {
        societiesWithUsers[row.id] = {
          society: {
            id: row.id,
            name: row.society_name,
            city: row.city,
            state: row.state,
          },
          userCounts: [],
        };
      }
      societiesWithUsers[row.id].userCounts.push({
        role: row.role,
        count: Number.parseInt(row.count, 10),
      });
    });

    return res.status(200).json({
      userStats: userStats.rows.map((r) => ({
        role: r.role,
        count: Number.parseInt(r.count, 10),
        verified_count: Number.parseInt(r.verified_count, 10),
        blocked_count: Number.parseInt(r.blocked_count, 10),
      })),
      societyCount: Number.parseInt(societyCount.rows[0].count, 10),
      recentActivity: {
        new_users: Number.parseInt(recentActivity.rows[0].new_users, 10),
        new_admins: Number.parseInt(recentActivity.rows[0].new_admins, 10),
        new_staff: Number.parseInt(recentActivity.rows[0].new_staff, 10),
      },
      societiesWithUsers: Object.values(societiesWithUsers),
      usersWithoutSociety: usersWithoutSociety.rows.map((r) => ({
        role: r.role,
        count: Number.parseInt(r.count, 10),
      })),
    });
  } catch (error) {
    console.error("Error fetching system stats:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

module.exports = {
  refreshToken,
  signIn,
  signOut,
  addAdminAndStaff,
  verifyEmailAndSetPassword,
  listAdmins,
  changePassword,
  forgotPassword,
  resetPassword,
  getAllUsers,
  blockUser,
  deleteUser,
  getSystemStats,
};
