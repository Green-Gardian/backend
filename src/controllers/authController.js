const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { pool } = require("../config/db")
require("dotenv").config();
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { google } = require("googleapis");

const generateTokens = (user) => {
    try {
        const access_token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_ACCESS_SECRET, {
            expiresIn: process.env.JWT_ACCESS_EXPIRY
        });

        const refresh_token = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, {
            expiresIn: process.env.JWT_REFRESH_EXPIRY
        });

        return { access_token, refresh_token }
    }
    catch (error) {
        console.log(`ERROR: Generating access and refresh token: ${error}`)
    }
}

const addAdminAndStaff = async (req, res) => {
    try {
        const { firstName, lastName, phone, role, email } = req.body;
        if (!firstName || !lastName || !phone || !role || !email) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const username = email.split('@')[0];

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
            return res.status(400).json({ message: 'Phone Number already in user.'})
        }

        let insertQuery = {
            text: `INSERT INTO users (first_name,last_name,username, phone_number , email,role) values ($1,$2,$3,$4,$5,$6) RETURNING *`,
            values: [firstName, lastName, username, phone, email, role]
        };

        const createdUser = await pool.query(insertQuery);
        console.log("Created User:", createdUser.rows[0]);

        const verificationToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

        const verificationQuery = {
            text: `INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES ($1, $2, $3) RETURNING *`,
            values: [createdUser.rows[0].id, verificationToken, expiresAt]
        };

        await pool.query(verificationQuery);

        await sendVerificationEmail(username, email, verificationToken);

        return res.status(201).json({ message: `Staff created. Email sent to verify and set password.`, })
    }
    catch (error) {
        console.error(`Error creating user: ${error.message}`);
        return res.status(500).json({ error: "Server Error" })
    }
}

const signIn = async (req, res) => {
    const { email, password } = req.body;

    try {
        const query = {
            text: `SELECT * FROM users WHERE email = $1`,
            values: [email]
        }

        const queryRes = await pool.query(query);

        if (queryRes.rows.length === 0) {
            return res.status(404).json({ message: "Invalid Email" });
        }

        const user = queryRes.rows[0];

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(404).json({ message: "Invalid Password" });
        }

        const tokens = generateTokens(user);

        await pool.query(`INSERT INTO refresh_tokens (user_id, token, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
        `, [user.id, tokens.refresh_token]);

        return res.status(200).json({ message: "User logged in successfully", ...tokens, username: user.username, is_verified: user.is_verified });
    }
    catch (error) {
        return res.status(500).json({ message: `Unable to sign in` });
    }
}

const signOut = async (req, res) => {
    try {
        const { refresh_token } = req.body;

        if (!refresh_token) {
            return res.status(400).json({ message: "Refresh token is required" });
        }

        await pool.query(`
            DELETE FROM refresh_tokens WHERE token = $1
        `, [refresh_token]);

        return res.status(200).json({ message: "User signed out successfully" });
    }
    catch (error) {
        return res.status(500).json({ message: `Unable to sign out` });
    }
}

const sendVerificationEmail = async (recipientUsername, recipientEmail, verificationToken) => {
    console.log(`Verification Token: ${verificationToken}`);

    const verificationLink = `http://localhost:3001/auth/verify-email?token=${verificationToken}`;

    try {
        // Create transporter with basic authentication
        const transporter = nodemailer.createTransport({
            service: 'gmail', // or your email service
            auth: {
                user: process.env.SENDER_EMAIL,
                pass: process.env.SENDER_PASSWORD // App password for Gmail
            },
        });

        const mailOptions = {
            from: `Green Guardian <${process.env.SENDER_EMAIL}>`,
            to: recipientEmail,
            subject: '🌱 Welcome to Green Guardian - Verify Your Email',
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
        console.log('Email sent successfully:', result.response);
        return result;
    } catch (error) {
        console.error('Error sending email:', error);
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
            console.log(`Password field is required.`)
            return res.status(400).json({ message: `Password field is required.` });
        }

        if (!confirmPassword) {
            console.log(`Confirm Password field is required.`)
            return res.status(400).json({ message: `Confirm Password field is required.` });
        }

        if (password !== confirmPassword) {
            console.log(`Passwords donot match.`)
            return res.status(400).json({ message: `Passwords donot match.` });
        }

        const tokenQuery = await pool.query(`
            SELECT vt.*, u.id, u.is_verified
            FROM email_verification_tokens vt
            JOIN users u ON vt.user_id = u.id
            WHERE vt.token = $1 AND vt.is_used = FALSE AND vt.expires_at > NOW()
            `,
            [token]);



        if (tokenQuery.rows.length === 0) {
            console.log("Expired or invalid token");
            return res.status(400).json({ message: `Expired or invalid token` })
        }

        if (tokenQuery.rows[0].is_verified === "TRUE") {
            console.log(`Email Already verified.`);
            return res.status(400).json({ message: `Email Already verified.` })
        }

        const user = tokenQuery.rows[0];

        const client = await pool.connect();

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const updatePassword = await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING *`,
            [hashedPassword, user.user_id]
        )

        if (updatePassword.rows.length === 0) {
            console.log(`Error updating password.`);
            return res.status.json({ message: `Error updating password.` })
        }

        try {
            await client.query(`BEGIN`);

            await client.query(`UPDATE users SET is_verified = TRUE , updated_at = NOW() WHERE id = $1`,
                [user.user_id]);

            await client.query(`UPDATE email_verification_tokens SET is_used = TRUE WHERE token = $1`,
                [token]);

            await client.query(`COMMIT`)



            return res.status(200).json({ message: `Email successfully Verified and password is set. You can now log in. ` })
        }
        catch (error) {
            await client.query(`ROLLBACK`);
            throw error
        }
        finally {
            await client.release();
        }
    }
    catch (error) {
        console.log(`Email Verification Failed`);
        return res.status(500).json({ message: `Email Verification Failed`, error: error.message })
    }


}

const refreshToken = (req, res) => {
    try {
        const { refresh_token } = req.body;
        if (!refresh_token) return res.status(401).json({ message: 'Refresh token required' });


        const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);

        const access_token = jwt.sign({ id: decoded.id, role: "admin" }, process.env.JWT_ACCESS_SECRET, {
            expiresIn: process.env.JWT_ACCESS_EXPIRY
        });


        return res.status(200).json({ access_token })
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

const listAdmins = async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM users WHERE role = 'admin'`);
        return res.status(200).json({
            admins: result.rows
        });
    } catch (error) {
        console.error("Error fetching admins:", error);
        return res.status(500).json({message: "Internal server error."});
    }
}

module.exports = { refreshToken, signIn, signOut , addAdminandStaff, verifyEmailAndSetPassword, listAdmins };

