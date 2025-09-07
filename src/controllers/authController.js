const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { pool } = require("../config/db");
require("dotenv").config();
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { google } = require("googleapis");

const generateTokens = (user) => {
  try {
    const access_token = jwt.sign(
      { id: user.id, role: user.role, username: user.username },
      process.env.JWT_ACCESS_SECRET,
      {
        expiresIn: process.env.JWT_ACCESS_EXPIRY,
      }
    );

    const refresh_token = jwt.sign(
      { id: user.id, username: user.useranme },
      process.env.JWT_REFRESH_SECRET,
      {
        expiresIn: process.env.JWT_REFRESH_EXPIRY,
      }
    );

    return { access_token, refresh_token };
  } catch (error) {
    console.log(`ERROR: Generating access and refresh token: ${error}`);
  }
};

const addAdminAndStaff = async (req, res) => {
  try {
    const { firstName, lastName, phone, role, email, societyId } = req.body;
    if (!firstName || !lastName || !phone || !role || !email) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Validate society_id for non-super_admin roles
    if (role !== "super_admin" && !societyId) {
      return res
        .status(400)
        .json({ message: "Society ID is required for non-super admin roles" });
    }

    const username = email.split("@")[0];

    const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    if (!regex.test(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }

    const query = {
      text: `SELECT * FROM users WHERE email = $1`,
      values: [email],
    };

    const resultUser = await pool.query(query);

    if (resultUser.rows.length !== 0) {
      return res.status(400).json({ message: "Email already in use." });
    }

    const phoneQuery = {
      text: `SELECT * FROM users WHERE phone_number = $1`,
      values: [phone],
    };

    const User = await pool.query(phoneQuery);

    if (User.rows.length !== 0) {
      return res.status(400).json({ message: "Phone Number already in user." });
    }

    let insertQuery;
    if (role === "super_admin") {
      insertQuery = {
        text: `INSERT INTO users (first_name, last_name, username, phone_number, email, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        values: [firstName, lastName, username, phone, email, role],
      };
    } else {
      insertQuery = {
        text: `INSERT INTO users (first_name, last_name, username, phone_number, email, role, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        values: [firstName, lastName, username, phone, email, role, societyId],
      };
    }

    const createdUser = await pool.query(insertQuery);
    console.log("Created User:", createdUser.rows[0]);

    const verificationToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    const verificationQuery = {
      text: `INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES ($1, $2, $3) RETURNING *`,
      values: [createdUser.rows[0].id, verificationToken, expiresAt],
    };

    await pool.query(verificationQuery);

    await sendVerificationEmail(username, email, verificationToken);

    return res
      .status(201)
      .json({
        message: `Staff created. Email sent to verify and set password.`,
      });
  } catch (error) {
    console.error(`Error creating user: ${error.message}`);
    return res.status(500).json({ error: "Server Error" });
  }
};

const signIn = async (req, res) => {
  const { email, password } = req.body;

  try {
    const query = {
      text: `SELECT * FROM users WHERE email = $1`,
      values: [email],
    };

    const queryRes = await pool.query(query);

    if (queryRes.rows.length === 0) {
      return res.status(404).json({ message: "Invalid Email" });
    }

    const user = queryRes.rows[0];

    // Check if user is blocked
    if (user.is_blocked) {
      return res
        .status(403)
        .json({ message: "Account has been blocked. Please contact support." });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(404).json({ message: "Invalid Password" });
    }

    const tokens = generateTokens(user);
    // console.log("Generated tokens:", tokens);

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
        `,
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

    await pool.query(
      `
            DELETE FROM refresh_tokens WHERE token = $1
        `,
      [refresh_token]
    );

    return res.status(200).json({ message: "User signed out successfully" });
  } catch (error) {
    return res.status(500).json({ message: `Unable to sign out` });
  }
};

const sendVerificationEmail = async (
  recipientUsername,
  recipientEmail,
  verificationToken
) => {
  // console.log(`Verification Token: ${verificationToken}`);

  const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SENDER_EMAIL,
        pass: process.env.SENDER_PASSWORD,
      },
    });

    const mailOptions = {
      from: `Green Guardian <${process.env.SENDER_EMAIL}>`,
      to: recipientEmail,
      subject: "🌱 Welcome to Green Guardian - Verify Your Email",
      html: `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Email Verification</title>
                </head>
                <body style="margin: 0; padding: 0; font-family: 'Arial', sans-serif; background-color: #f4f7f5;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
                        
                        <!-- Header -->
                        <div style="background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%); padding: 40px 20px; text-align: center;">
                            <div style="background-color: white; width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                                <span style="font-size: 40px;">🌱</span>
                            </div>
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Green Guardian</h1>
                            <p style="color: #e8f5e8; margin: 10px 0 0 0; font-size: 16px;">Your Environmental Journey Starts Here</p>
                        </div>

                        <!-- Content -->
                        <div style="padding: 40px 30px;">
                            <h2 style="color: #2E7D32; margin-bottom: 20px; font-size: 24px;">Hello ${recipientUsername}! 👋</h2>
                            
                            <p style="color: #555555; line-height: 1.6; font-size: 16px; margin-bottom: 25px;">
                                Welcome to the Green Guardian community! We're excited to have you join us in making our planet a greener, more sustainable place.
                            </p>

                            <div style="background-color: #f8fff9; border-left: 4px solid #4CAF50; padding: 20px; margin: 25px 0; border-radius: 4px;">
                                <h3 style="color: #2E7D32; margin: 0 0 15px 0; font-size: 18px;">📧 Verify Your Email Address</h3>
                                <p style="color: #666666; margin: 0; line-height: 1.5;">
                                    To complete your registration and start your eco-friendly journey, please verify your email address by clicking the button below.
                                </p>
                            </div>

                            <!-- CTA Button -->
                            <div style="text-align: center; margin: 35px 0;">
                                <a href="${verificationLink}" 
                                   style="background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); 
                                          color: #ffffff; 
                                          text-decoration: none; 
                                          padding: 15px 35px; 
                                          border-radius: 50px; 
                                          font-weight: bold; 
                                          font-size: 16px; 
                                          display: inline-block;
                                          box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3);
                                          transition: all 0.3s ease;">
                                    ✨ Verify Email & Set Password
                                </a>
                            </div>

                            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 15px; margin: 30px 0;">
                                <p style="color: #856404; margin: 0; font-size: 14px; text-align: center;">
                                    ⏰ This verification link will expire in 24 hours for security purposes.
                                </p>
                            </div>

                            <div style="border-top: 1px solid #eeeeee; padding-top: 25px; margin-top: 30px;">
                                <p style="color: #888888; font-size: 14px; line-height: 1.5; margin-bottom: 15px;">
                                    If the button doesn't work, copy and paste this link into your browser:
                                </p>
                                <p style="background-color: #f8f9fa; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 13px; color: #666666; margin: 0;">
                                    ${verificationLink}
                                </p>
                            </div>
                        </div>

                        <!-- Footer -->
                        <div style="background-color: #f8fff9; padding: 30px; text-align: center; border-top: 1px solid #e8f5e8;">
                            <div style="margin-bottom: 20px;">
                                <span style="font-size: 24px; margin: 0 5px;">🌍</span>
                                <span style="font-size: 24px; margin: 0 5px;">🌿</span>
                                <span style="font-size: 24px; margin: 0 5px;">♻️</span>
                            </div>
                            
                            <p style="color: #2E7D32; margin: 0 0 10px 0; font-weight: bold; font-size: 16px;">
                                Together, we can make a difference!
                            </p>
                            
                            <p style="color: #666666; font-size: 14px; margin: 0 0 15px 0; line-height: 1.4;">
                                Join thousands of eco-warriors already making positive environmental impact.
                            </p>
                            
                            <p style="color: #888888; font-size: 12px; margin: 0;">
                                This email was sent from Green Guardian. If you didn't create an account with us, please ignore this email.
                            </p>
                            
                            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e8f5e8;">
                                <p style="color: #aaaaaa; font-size: 11px; margin: 0;">
                                    © 2025 Green Guardian. All rights reserved.
                                </p>
                            </div>
                        </div>
                    </div>
                </body>
                </html>
            `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", result.response);
    return result;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

const verifyEmailAndSetPassword = async (req, res) => {
  try {
    const token = req.query.token;
    const { password, confirmPassword } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }

    if (!password) {
      console.log(`Password field is required.`);
      return res.status(400).json({ message: `Password field is required.` });
    }

    if (!confirmPassword) {
      console.log(`Confirm Password field is required.`);
      return res
        .status(400)
        .json({ message: `Confirm Password field is required.` });
    }

    if (password !== confirmPassword) {
      console.log(`Passwords donot match.`);
      return res.status(400).json({ message: `Passwords donot match.` });
    }

    const tokenQuery = await pool.query(
      `
            SELECT vt.*, u.id, u.is_verified
            FROM email_verification_tokens vt
            JOIN users u ON vt.user_id = u.id
            WHERE vt.token = $1 AND vt.is_used = FALSE AND vt.expires_at > NOW()
            `,
      [token]
    );

    if (tokenQuery.rows.length === 0) {
      console.log("Expired or invalid token");
      return res.status(400).json({ message: `Expired or invalid token` });
    }

    if (tokenQuery.rows[0].is_verified === "TRUE") {
      console.log(`Email Already verified.`);
      return res.status(400).json({ message: `Email Already verified.` });
    }

    const user = tokenQuery.rows[0];

    const client = await pool.connect();

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const updatePassword = await pool.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING *`,
      [hashedPassword, user.user_id]
    );

    if (updatePassword.rows.length === 0) {
      console.log(`Error updating password.`);
      return res.status.json({ message: `Error updating password.` });
    }

    try {
      await client.query(`BEGIN`);

      await client.query(
        `UPDATE users SET is_verified = TRUE , updated_at = NOW() WHERE id = $1`,
        [user.user_id]
      );

      await client.query(
        `UPDATE email_verification_tokens SET is_used = TRUE WHERE token = $1`,
        [token]
      );

      await client.query(`COMMIT`);

      return res
        .status(200)
        .json({
          message: `Email successfully Verified and password is set. You can now log in. `,
        });
    } catch (error) {
      await client.query(`ROLLBACK`);
      throw error;
    } finally {
      await client.release();
    }
  } catch (error) {
    console.log(`Email Verification Failed`);
    return res
      .status(500)
      .json({ message: `Email Verification Failed`, error: error.message });
  }
};

const refreshToken = (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token)
      return res.status(401).json({ message: "Refresh token required" });

    const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);

    const access_token = jwt.sign(
      { id: decoded.id, role: "admin" },
      process.env.JWT_ACCESS_SECRET,
      {
        expiresIn: process.env.JWT_ACCESS_EXPIRY,
      }
    );

    return res.status(200).json({ access_token });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const listAdmins = async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM users WHERE role = 'admin'`);
    return res.status(200).json({
      admins: result.rows,
    });
  } catch (error) {
    console.error("Error fetching admins:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// Add these functions to your authController.js

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    const userId = req.user.id; // From token verification middleware

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ message: "New passwords do not match" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters long" });
    }

    // Get user's current password hash
    const userQuery = await pool.query(
      `SELECT password_hash FROM users WHERE id = $1`,
      [userId]
    );

    if (userQuery.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userQuery.rows[0];

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password_hash
    );
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password in database
    await pool.query(
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

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!regex.test(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }

    const userQuery = await pool.query(
      `SELECT id, username, email FROM users WHERE email = $1`,
      [email]
    );

    if (userQuery.rows.length === 0) {
      return res
        .status(200)
        .json({
          message: "If the email exists, a password reset link has been sent",
        });
    }

    const user = userQuery.rows[0];

    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    await pool.query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [
      user.id,
    ]);

    await pool.query(
      `
            INSERT INTO password_reset_tokens (user_id, token, expires_at) 
            VALUES ($1, $2, $3)`,
      [user.id, resetToken, expiresAt]
    );

    await sendPasswordResetEmail(user.username, user.email, resetToken);

    return res
      .status(200)
      .json({
        message: "If the email exists, a password reset link has been sent",
      });
  } catch (error) {
    console.error(`Error in forgot password: ${error.message}`);
    return res.status(500).json({ message: "Server Error" });
  }
};

const resetPassword = async (req, res) => {
  try {
    const token = req.query.token;
    const { newPassword, confirmPassword } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Reset token is required" });
    }

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters long" });
    }

    // Verify token and get user
    const tokenQuery = await pool.query(
      `
            SELECT rt.*, u.id as user_id, u.email
            FROM password_reset_tokens rt
            JOIN users u ON rt.user_id = u.id
            WHERE rt.token = $1 AND rt.is_used = FALSE AND rt.expires_at > NOW()`,
      [token]
    );

    if (tokenQuery.rows.length === 0) {
      return res
        .status(400)
        .json({ message: "Invalid or expired reset token" });
    }

    const resetTokenData = tokenQuery.rows[0];

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Hash new password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update user password
      await client.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [hashedPassword, resetTokenData.user_id]
      );

      // Mark token as used
      await client.query(
        `UPDATE password_reset_tokens SET is_used = TRUE WHERE token = $1`,
        [token]
      );

      await client.query("COMMIT");

      return res.status(200).json({ message: "Password reset successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`Error resetting password: ${error.message}`);
    return res.status(500).json({ message: "Server Error" });
  }
};

const sendPasswordResetEmail = async (
  recipientUsername,
  recipientEmail,
  resetToken
) => {
  console.log(`Password Reset Token: ${resetToken}`);

  const resetLink = `http://localhost:3001/auth/reset-password?token=${resetToken}`;

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SENDER_EMAIL,
        pass: process.env.SENDER_PASSWORD,
      },
    });

    const mailOptions = {
      from: `Green Guardian <${process.env.SENDER_EMAIL}>`,
      to: recipientEmail,
      subject: "🔐 Green Guardian - Password Reset Request",
      html: `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Password Reset</title>
                </head>
                <body style="margin: 0; padding: 0; font-family: 'Arial', sans-serif; background-color: #f4f7f5;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
                        
                        <!-- Header -->
                        <div style="background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%); padding: 40px 20px; text-align: center;">
                            <div style="background-color: white; width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                                <span style="font-size: 40px;">🔐</span>
                            </div>
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Green Guardian</h1>
                            <p style="color: #e8f5e8; margin: 10px 0 0 0; font-size: 16px;">Password Reset Request</p>
                        </div>

                        <!-- Content -->
                        <div style="padding: 40px 30px;">
                            <h2 style="color: #2E7D32; margin-bottom: 20px; font-size: 24px;">Hello ${recipientUsername}! 👋</h2>
                            
                            <p style="color: #555555; line-height: 1.6; font-size: 16px; margin-bottom: 25px;">
                                We received a request to reset your password for your Green Guardian account. If you didn't make this request, you can safely ignore this email.
                            </p>

                            <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin: 25px 0; border-radius: 4px;">
                                <h3 style="color: #856404; margin: 0 0 15px 0; font-size: 18px;">🔒 Reset Your Password</h3>
                                <p style="color: #856404; margin: 0; line-height: 1.5;">
                                    Click the button below to create a new password for your account.
                                </p>
                            </div>

                            <!-- CTA Button -->
                            <div style="text-align: center; margin: 35px 0;">
                                <a href="${resetLink}" 
                                   style="background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); 
                                          color: #ffffff; 
                                          text-decoration: none; 
                                          padding: 15px 35px; 
                                          border-radius: 50px; 
                                          font-weight: bold; 
                                          font-size: 16px; 
                                          display: inline-block;
                                          box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3);
                                          transition: all 0.3s ease;">
                                    🔑 Reset Password
                                </a>
                            </div>

                            <div style="background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 6px; padding: 15px; margin: 30px 0;">
                                <p style="color: #721c24; margin: 0; font-size: 14px; text-align: center;">
                                    ⏰ This reset link will expire in 1 hour for security purposes.
                                </p>
                            </div>

                            <div style="border-top: 1px solid #eeeeee; padding-top: 25px; margin-top: 30px;">
                                <p style="color: #888888; font-size: 14px; line-height: 1.5; margin-bottom: 15px;">
                                    If the button doesn't work, copy and paste this link into your browser:
                                </p>
                                <p style="background-color: #f8f9fa; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 13px; color: #666666; margin: 0;">
                                    ${resetLink}
                                </p>
                            </div>
                        </div>

                        <!-- Footer -->
                        <div style="background-color: #f8fff9; padding: 30px; text-align: center; border-top: 1px solid #e8f5e8;">
                            <div style="margin-bottom: 20px;">
                                <span style="font-size: 24px; margin: 0 5px;">🔐</span>
                                <span style="font-size: 24px; margin: 0 5px;">🌱</span>
                                <span style="font-size: 24px; margin: 0 5px;">🛡️</span>
                            </div>
                            
                            <p style="color: #2E7D32; margin: 0 0 10px 0; font-weight: bold; font-size: 16px;">
                                Your security is important to us!
                            </p>
                            
                            <p style="color: #666666; font-size: 14px; margin: 0 0 15px 0; line-height: 1.4;">
                                If you didn't request this password reset, please contact our support team immediately.
                            </p>
                            
                            <p style="color: #888888; font-size: 12px; margin: 0;">
                                This email was sent from Green Guardian. If you didn't request a password reset, please ignore this email.
                            </p>
                            
                            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e8f5e8;">
                                <p style="color: #aaaaaa; font-size: 11px; margin: 0;">
                                    © 2025 Green Guardian. All rights reserved.
                                </p>
                            </div>
                        </div>
                    </div>
                </body>
                </html>
            `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log("Password reset email sent successfully:", result.response);
    return result;
  } catch (error) {
    console.error("Error sending password reset email:", error);
    throw error;
  }
};

// Super Admin Functions
const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, role, search, societyId } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "";
    let values = [];
    let valueIndex = 1;

    if (role && role !== "all") {
      whereClause += `WHERE u.role = $${valueIndex}`;
      values.push(role);
      valueIndex++;
    }

    if (societyId && societyId !== "all") {
      const societyCondition = `u.society_id = $${valueIndex}`;
      if (whereClause) {
        whereClause += ` AND ${societyCondition}`;
      } else {
        whereClause = `WHERE ${societyCondition}`;
      }
      values.push(societyId);
      valueIndex++;
    }

    if (search) {
      const searchCondition = `(u.first_name ILIKE $${valueIndex} OR u.last_name ILIKE $${valueIndex} OR u.email ILIKE $${valueIndex} OR u.username ILIKE $${valueIndex})`;
      if (whereClause) {
        whereClause += ` AND ${searchCondition}`;
      } else {
        whereClause = `WHERE ${searchCondition}`;
      }
      values.push(`%${search}%`);
      valueIndex++;
    }

    // Get total count
    const countQuery = `
            SELECT COUNT(*) 
            FROM users u 
            LEFT JOIN societies s ON u.society_id = s.id 
            ${whereClause}
        `;
    const countResult = await pool.query(countQuery, values);
    const totalUsers = parseInt(countResult.rows[0].count);

    // Get users with pagination and society information
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
            LIMIT $${valueIndex} OFFSET $${valueIndex + 1}
        `;
    values.push(limit, offset);

    const usersResult = await pool.query(usersQuery, values);

    // Group users by society
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
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalUsers / limit),
        totalUsers,
        limit: parseInt(limit),
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

    // First check if user exists and is not a super_admin
    const userCheck = await pool.query(
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

    // Add is_blocked column if it doesn't exist
    await pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE
        `);

    // Update user blocked status
    const result = await pool.query(
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

    // First check if user exists and is not a super_admin
    const userCheck = await pool.query(
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

    // Delete user (cascade will handle related records)
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);

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
    // Get counts for different user roles
    const userStats = await pool.query(`
            SELECT 
                role,
                COUNT(*) as count,
                COUNT(CASE WHEN is_verified = true THEN 1 END) as verified_count,
                COUNT(CASE WHEN is_blocked = true THEN 1 END) as blocked_count
            FROM users 
            GROUP BY role
        `);

    // Get society count
    const societyCount = await pool.query(
      `SELECT COUNT(*) as count FROM societies`
    );

    // Get recent activity (last 7 days)
    const recentActivity = await pool.query(`
            SELECT 
                COUNT(*) as new_users,
                COUNT(CASE WHEN role = 'admin' THEN 1 END) as new_admins,
                COUNT(CASE WHEN role = 'customer_support' THEN 1 END) as new_staff
            FROM users 
            WHERE created_at >= NOW() - INTERVAL '7 days'
        `);

    // Get users by society
    const usersBySociety = await pool.query(`
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

    // Get users without society
    const usersWithoutSociety = await pool.query(`
            SELECT 
                role,
                COUNT(*) as count
            FROM users 
            WHERE society_id IS NULL
            GROUP BY role
        `);

    // Process users by society data
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
        count: parseInt(row.count),
      });
    });

    return res.status(200).json({
      userStats: userStats.rows,
      societyCount: parseInt(societyCount.rows[0].count),
      recentActivity: recentActivity.rows[0],
      societiesWithUsers: Object.values(societiesWithUsers),
      usersWithoutSociety: usersWithoutSociety.rows,
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
