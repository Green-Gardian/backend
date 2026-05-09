const brevo = require('@getbrevo/brevo');
require('dotenv').config();

class EmailService {
    constructor() {
        if (process.env.BREVO_API_KEY) {
            try {
                // Initialize Brevo API client
                const apiInstance = new brevo.TransactionalEmailsApi();
                const apiKey = apiInstance.authentications['apiKey'];
                apiKey.apiKey = process.env.BREVO_API_KEY;

                this.emailApi = apiInstance;
                this.fromEmail = process.env.SENDER_EMAIL || 'no-reply@greenguardian.qzz.io';
                this.fromName = 'Green Guardian';
                console.log('✅ Brevo email service initialized');
            } catch (error) {
                console.error('❌ Error initializing Brevo:', error);
                this.emailApi = null;
            }
        } else {
            console.warn('⚠️  BREVO_API_KEY not configured. Email functionality will be disabled.');
        }
    }

    /**
     * Send email using Brevo
     */
    async sendEmail({ to, subject, html }) {
        try {
            if (!this.emailApi) {
                const err = new Error('Brevo not configured. Please set BREVO_API_KEY environment variable.');
                err.code = 'EMAIL_CONFIG_MISSING';
                throw err;
            }

            const result = await this.emailApi.sendTransacEmail({
                sender: { email: this.fromEmail, name: this.fromName },
                to: [{ email: to }],
                subject: subject,
                htmlContent: html
            });

            console.log(`✅ Email sent successfully to ${to}. Message ID: ${result.messageId}`);
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
