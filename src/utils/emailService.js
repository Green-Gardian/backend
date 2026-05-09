const Mailjet = require('node-mailjet');
require('dotenv').config();

class EmailService {
    constructor() {
            console.log('🔑 MAILJET_API_KEY present:', !!process.env.MAILJET_API_KEY);
    console.log('🔑 MAILJET_SECRET_KEY present:', !!process.env.MAILJET_SECRET_KEY);
    console.log('📧 SENDER_EMAIL:', process.env.SENDER_EMAIL);
    console.log('🌐 FRONTEND_URL:', process.env.FRONTEND_URL);
        if (process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY) {
            this.client = Mailjet.apiConnect(
                process.env.MAILJET_API_KEY,
                process.env.MAILJET_SECRET_KEY
            );
            this.fromEmail = process.env.SENDER_EMAIL || 'no-reply@greenguardian.qzz.io';
            this.fromName = 'Green Guardian';
            console.log('✅ Mailjet email service initialized');
        } else {
            console.warn('⚠️ Mailjet API keys not configured.');
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

            console.log(`✅ Email sent successfully to ${to}`);
            return result;
        } catch (error) {
            console.error('❌ Error sending email:', error);
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
}

module.exports = new EmailService();