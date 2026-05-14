const Mailjet = require('node-mailjet');
require('dotenv').config();

class EmailService {
    constructor() {
        if (process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY) {
            this.client = Mailjet.apiConnect(
                process.env.MAILJET_API_KEY,
                process.env.MAILJET_SECRET_KEY
            );
            this.fromEmail = process.env.SENDER_EMAIL || 'no-reply@greenguardian.qzz.io';
            this.fromName = 'Green Guardian';
            console.log('Mailjet email service initialized');
        } else {
            console.warn('Mailjet API keys not configured.');
            this.client = null;
        }
    }

    async sendEmail({ to, subject, html }) {
        try {
            if (!this.client) {
                const err = new Error('Mailjet not configured.');
                err.code = 'EMAIL_CONFIG_MISSING';
                throw err;
            }

            const result = await this.client.post('send', { version: 'v3.1' }).request({
                Messages: [{
                    From: { Email: this.fromEmail, Name: this.fromName },
                    To: [{ Email: to }],
                    Subject: subject,
                    HTMLPart: html
                }]
            });

            return result;
        } catch (error) {
            console.error('Error sending email:', error);
            if (!error.code) error.code = 'EMAIL_SEND_FAILED';
            throw error;
        }
    }

    async sendVerificationEmail(recipientUsername, recipientEmail, verificationToken, verificationEmailHTML) {
        const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
        return await this.sendEmail({
            to: recipientEmail,
            subject: '🌱 Welcome to Green Guardian - Verify Your Email',
            html: verificationEmailHTML(recipientUsername, verificationLink)
        });
    }

    async sendPasswordResetEmail(recipientUsername, recipientEmail, resetToken, resetEmailHTML) {
        const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
        return await this.sendEmail({
            to: recipientEmail,
            subject: '🔐 Green Guardian - Password Reset Request',
            html: resetEmailHTML(recipientUsername, resetLink)
        });
    }

    async sendPasswordResetOTPEmail(recipientUsername, recipientEmail, otp) {
        const otpEmailHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset OTP</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Arial', sans-serif; background-color: #f4f7f5;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%); padding: 40px 20px; text-align: center;">
            <div style="background-color: white; width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                <span style="font-size: 40px;">🔐</span>
            </div>
            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Green Guardian</h1>
            <p style="color: #e8f5e8; margin: 10px 0 0 0; font-size: 16px;">Password Reset OTP</p>
        </div>

        <!-- Content -->
        <div style="padding: 40px 30px;">
            <h2 style="color: #2E7D32; margin-bottom: 20px; font-size: 24px;">Hello ${recipientUsername}! 👋</h2>
            
            <p style="color: #555555; line-height: 1.6; font-size: 16px; margin-bottom: 25px;">
                We received a request to reset your password for your Green Guardian mobile app. Use the OTP below to proceed with password reset.
            </p>

            <div style="background-color: #f8fff9; border-left: 4px solid #4CAF50; padding: 20px; margin: 25px 0; border-radius: 4px;">
                <h3 style="color: #2E7D32; margin: 0 0 15px 0; font-size: 18px;">🔢 Your Password Reset OTP</h3>
                <p style="color: #666666; margin: 0; line-height: 1.5;">
                    Enter this 6-digit code in your mobile app to reset your password:
                </p>
            </div>

            <!-- OTP Display -->
            <div style="text-align: center; margin: 35px 0;">
                <div style="background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); 
                            color: #ffffff; 
                            padding: 20px 40px; 
                            border-radius: 15px; 
                            font-weight: bold; 
                            font-size: 32px; 
                            display: inline-block;
                            box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3);
                            letter-spacing: 8px;">
                    ${otp}
                </div>
            </div>

            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 15px; margin: 30px 0;">
                <p style="color: #856404; margin: 0; font-size: 14px; text-align: center;">
                    ⏰ This OTP will expire in 10 minutes for security purposes.
                </p>
            </div>

            <div style="background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 6px; padding: 15px; margin: 30px 0;">
                <p style="color: #721c24; margin: 0; font-size: 14px; text-align: center;">
                    🔒 If you didn't request this password reset, please ignore this email and contact support.
                </p>
            </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #f8fff9; padding: 30px; text-align: center; border-top: 1px solid #e8f5e8;">
            <div style="margin-bottom: 20px;">
                <span style="font-size: 24px; margin: 0 5px;">🔐</span>
                <span style="font-size: 24px; margin: 0 5px;">🌱</span>
                <span style="font-size: 24px; margin: 0 5px;">📱</span>
            </div>
            
            <p style="color: #2E7D32; margin: 0 0 10px 0; font-weight: bold; font-size: 16px;">
                Secure Mobile Experience!
            </p>
            
            <p style="color: #666666; font-size: 14px; margin: 0 0 15px 0; line-height: 1.4;">
                This OTP is specifically for your mobile app password reset.
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
        `;

        return await this.sendEmail({
            to: recipientEmail,
            subject: '🔐 Green Guardian - Password Reset OTP',
            html: otpEmailHTML
        });
    }
}

module.exports = new EmailService();