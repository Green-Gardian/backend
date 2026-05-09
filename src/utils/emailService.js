const { MailerSend, EmailParams, Sender, Recipient } = require('mailersend');
require('dotenv').config();

class EmailService {
    constructor() {
        if (process.env.MAILERSEND_API_KEY) {
            try {
                this.mailerSend = new MailerSend({
                    apiKey: process.env.MAILERSEND_API_KEY,
                });
                this.fromEmail = process.env.SENDER_EMAIL || 'no-reply@greenguardian.qzz.io';
                this.fromName = 'Green Guardian';
                console.log('✅ MailerSend email service initialized');
            } catch (error) {
                console.error('❌ Error initializing MailerSend:', error);
                this.mailerSend = null;
            }
        } else {
            console.warn('⚠️ MAILERSEND_API_KEY not configured.');
            this.mailerSend = null;
        }
    }

    async sendEmail({ to, subject, html }) {
        try {
            if (!this.mailerSend) {
                const err = new Error('MailerSend not configured.');
                err.code = 'EMAIL_CONFIG_MISSING';
                throw err;
            }

            const sentFrom = new Sender(this.fromEmail, this.fromName);
            const recipients = [new Recipient(to)];

            const emailParams = new EmailParams()
                .setFrom(sentFrom)
                .setTo(recipients)
                .setSubject(subject)
                .setHtml(html);

            const result = await this.mailerSend.email.send(emailParams);
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