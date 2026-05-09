const SibApiV3Sdk = require('sib-api-v3-sdk');
require('dotenv').config();

class EmailService {
    constructor() {
        if (process.env.BREVO_API_KEY) {
            try {
                const defaultClient = SibApiV3Sdk.ApiClient.instance;
                const apiKey = defaultClient.authentications['api-key'];
                apiKey.apiKey = process.env.BREVO_API_KEY;

                this.emailApi = new SibApiV3Sdk.TransactionalEmailsApi();
                this.fromEmail = process.env.SENDER_EMAIL || 'no-reply@greenguardian.qzz.io';
                this.fromName = 'Green Guardian';
                console.log('✅ Brevo email service initialized');
            } catch (error) {
                console.error('❌ Error initializing Brevo:', error);
                this.emailApi = null;
            }
        } else {
            console.warn('⚠️ BREVO_API_KEY not configured.');
        }
    }

    async sendEmail({ to, subject, html }) {
        try {
            if (!this.emailApi) {
                const err = new Error('Brevo not configured. Please set BREVO_API_KEY environment variable.');
                err.code = 'EMAIL_CONFIG_MISSING';
                throw err;
            }

            const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
            sendSmtpEmail.sender = { email: this.fromEmail, name: this.fromName };
            sendSmtpEmail.to = [{ email: to }];
            sendSmtpEmail.subject = subject;
            sendSmtpEmail.htmlContent = html;

            const result = await this.emailApi.sendTransacEmail(sendSmtpEmail);
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