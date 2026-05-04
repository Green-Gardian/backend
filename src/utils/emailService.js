const { Resend } = require('resend');
require('dotenv').config();

class EmailService {
    constructor() {
        if (process.env.RESEND_API_KEY) {
            this.resend = new Resend(process.env.RESEND_API_KEY);
            this.fromEmail = process.env.SENDER_EMAIL || 'onboarding@resend.dev';
        } else {
            console.warn('⚠️  RESEND_API_KEY not configured. Email functionality will be disabled.');
        }
    }

    /**
     * Send email using Resend
     */
    async sendEmail({ to, subject, html }) {
        try {
            if (!this.resend) {
                const err = new Error('Resend not configured. Please set RESEND_API_KEY environment variable.');
                err.code = 'EMAIL_CONFIG_MISSING';
                throw err;
            }

            const result = await this.resend.emails.send({
                from: this.fromEmail,
                to: to,
                subject: subject,
                html: html
            });

            console.log(`✅ Email sent successfully to ${to}. Message ID: ${result.id}`);
            return result;
        } catch (error) {
            console.error('❌ Error sending email:', error);
            if (!error.code) error.code = 'EMAIL_SEND_FAILED';
            throw error;
        }
    }

    /**
     * Send verification email
     */
    async sendVerificationEmail(recipientUsername, recipientEmail, verificationToken, verificationEmailHTML) {
        const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
        
        return await this.sendEmail({
            to: recipientEmail,
            subject: '🌱 Welcome to Green Guardian - Verify Your Email',
            html: verificationEmailHTML(recipientUsername, verificationLink)
        });
    }

    /**
     * Send password reset email
     */
    async sendPasswordResetEmail(recipientUsername, recipientEmail, resetToken, resetEmailHTML) {
        const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
        
        return await this.sendEmail({
            to: recipientEmail,
            subject: '🔐 Green Guardian - Password Reset Request',
            html: resetEmailHTML(recipientUsername, resetLink)
        });
    }
}

module.exports = new EmailService();
