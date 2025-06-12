const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { pool } = require("../config/db")
require("dotenv").config();
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { google } = require("googleapis")

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

const addAdmin = async (req, res) => {
    try {
        const { firstName, lastName, phone, role, email } = req.body;

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

        return res.status(201).json({ message: `Admin created.Email sent to verify and set password.`, })
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

        return res.status(200).json({ message: "User logged in successfully", ...tokens, username: user.username, is_verified: user.is_verified });
    }
    catch (error) {
        return res.status(500).json({ message: `Unable to sign in` });
    }
}

const sendVerificationEmail = async (recipientUsername, recipientEmail, verificationToken) => {
    console.log(`Verification Token: ${verificationToken}`);

    const verificationLink = `http://localhost:3001/auth/verify-email?token=${verificationToken}`;

    const OAuth2 = google.auth.OAuth2;
    const oauth2Client = new OAuth2(
        process.env.OAUTH_CLIENT_ID,
        process.env.OAUTH_CLIENT_SECRET,
        "https://developers.google.com/oauthplayground"
    );

    oauth2Client.setCredentials({
        refresh_token: process.env.OAUTH_REFRESH_TOKEN,
    });

    try {
        const accessToken = await oauth2Client.getAccessToken();
        const token = typeof accessToken === 'string' ? accessToken : accessToken?.token;

        if (!token) {
            throw new Error('Failed to retrieve access token');
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                type: 'OAuth2',
                user: process.env.SENDER_EMAIL,
                clientId: process.env.OAUTH_CLIENT_ID,
                clientSecret: process.env.OAUTH_CLIENT_SECRET,
                refreshToken: process.env.OAUTH_REFRESH_TOKEN,
                accessToken: token,
            },
        });

        const mailOptions = {
            from: `Green Guardian <${process.env.SENDER_EMAIL}>`,
            to: recipientEmail,
            subject: 'Verify Your Email',
            html: `
        <h1>Hello ${recipientUsername},</h1>
        <p>Thank you for signing up with Green Guardian! To complete your registration, please verify your email address.</p>
        <h2>Email Verification</h2>
        <p>Please click the link below to verify your email and set your password:</p>
        <a href="${verificationLink}">Verify Email and set password</a>
      `,
        };

        const result = await transporter.sendMail(mailOptions);
        console.log('Email sent:', result.response);
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

module.exports = { refreshToken, signIn, addAdmin, verifyEmailAndSetPassword };

