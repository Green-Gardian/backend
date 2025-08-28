const nodemailer = require('nodemailer');
const { Vonage } = require('@vonage/server-sdk');
const { pool } = require('../config/db');
require('dotenv').config();

class NotificationService {
    constructor() {
        // Initialize email transporter
        this.emailTransporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.SENDER_EMAIL,
                pass: process.env.SENDER_PASSWORD
            }
        });

        // Initialize Vonage client for SMS
        if (process.env.VONAGE_API_KEY && process.env.VONAGE_API_SECRET) {
            this.vonageClient = new Vonage({
                apiKey: process.env.VONAGE_API_KEY,
                apiSecret: process.env.VONAGE_API_SECRET
            });
        }

        // Default from email
        this.fromEmail = process.env.SENDER_EMAIL || 'noreply@greenguardian.com';
    }

    /**
     * Send email notification
     */
    async sendEmail(to, subject, body, alertId = null, userId = null) {
        try {
            const mailOptions = {
                from: this.fromEmail,
                to: to,
                subject: subject,
                html: body
            };

            const result = await this.emailTransporter.sendMail(mailOptions);
            
            // Log successful email
            if (alertId && userId) {
                await this.logCommunication(alertId, userId, 'email', 'success', result.messageId);
            }

            return {
                success: true,
                messageId: result.messageId,
                message: 'Email sent successfully'
            };
        } catch (error) {
            console.error('Email sending failed:', error);
            
            // Log failed email
            if (alertId && userId) {
                await this.logCommunication(alertId, userId, 'email', 'failed', null, error.message);
            }

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send SMS notification
     */
                    async sendSMS(to, message, alertId = null, userId = null) {
                    try {
                        if (!this.vonageClient) {
                            throw new Error('Vonage not configured');
                        }

                        // Ensure phone number is in international format
                        const formattedPhone = to.startsWith('+') ? to : `+${to}`;
                        
                        const result = await this.vonageClient.sms.send({
                            to: formattedPhone,
                            from: process.env.VONAGE_FROM_NUMBER || 'Vonage APIs',
                            text: message
                        });

                        // Log successful SMS
                        if (alertId && userId) {
                            await this.logCommunication(alertId, userId, 'sms', 'success', result.messages[0]['message-id']);
                        }

                        return {
                            success: true,
                            messageId: result.messages[0]['message-id'],
                            message: 'SMS sent successfully'
                        };
                    } catch (error) {
                        console.error('SMS sending failed:', error);
                        
                        // Log failed SMS
                        if (alertId && userId) {
                            await this.logCommunication(alertId, userId, 'sms', 'failed', null, error.message);
                        }

                        return {
                            success: false,
                            error: error.message
                        };
                    }
                }

    /**
     * Send push notification (placeholder for web push implementation)
     */
    async sendPushNotification(userId, title, body, data = {}, alertId = null) {
        try {
            // Get user's push tokens
            const tokens = await this.getUserPushTokens(userId);
            
            if (tokens.length === 0) {
                return {
                    success: false,
                    error: 'No push tokens found for user'
                };
            }

            // For now, we'll just log the push notification
            // In a real implementation, you'd integrate with Firebase Cloud Messaging or similar
            console.log(`Push notification for user ${userId}:`, { title, body, data });

            // Log successful push
            if (alertId) {
                await this.logCommunication(alertId, userId, 'push', 'success', `push_${Date.now()}`);
            }

            return {
                success: true,
                message: 'Push notification queued successfully'
            };
        } catch (error) {
            console.error('Push notification failed:', error);
            
            // Log failed push
            if (alertId) {
                await this.logCommunication(alertId, userId, 'push', 'failed', null, error.message);
            }

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get user's push tokens
     */
    async getUserPushTokens(userId) {
        try {
            const query = {
                text: 'SELECT token FROM push_tokens WHERE user_id = $1 AND is_active = TRUE',
                values: [userId]
            };
            
            const result = await pool.query(query);
            return result.rows.map(row => row.token);
        } catch (error) {
            console.error('Error fetching push tokens:', error);
            return [];
        }
    }

    /**
     * Log communication attempt
     */
    async logCommunication(alertId, userId, channel, status, messageId = null, errorMessage = null) {
        try {
            const query = {
                text: `
                    INSERT INTO communication_logs 
                    (alert_id, user_id, channel, status, message_id, error_message) 
                    VALUES ($1, $2, $3, $4, $5, $6)
                `,
                values: [alertId, userId, channel, status, messageId, errorMessage]
            };
            
            await pool.query(query);
        } catch (error) {
            console.error('Error logging communication:', error);
        }
    }

    /**
     * Update alert recipient status
     */
    async updateRecipientStatus(alertId, userId, channel, sent = true) {
        try {
            const timestamp = new Date();
            let query, values;

            switch (channel) {
                case 'email':
                    query = {
                        text: `
                            UPDATE alert_recipients 
                            SET email_sent = $1, email_sent_at = $2 
                            WHERE alert_id = $3 AND user_id = $4
                        `,
                        values: [sent, timestamp, alertId, userId]
                    };
                    break;
                case 'sms':
                    query = {
                        text: `
                            UPDATE alert_recipients 
                            SET sms_sent = $1, sms_sent_at = $2 
                            WHERE alert_id = $3 AND user_id = $4
                        `,
                        values: [sent, timestamp, alertId, userId]
                    };
                    break;
                case 'push':
                    query = {
                        text: `
                            UPDATE alert_recipients 
                            SET push_sent = $1, push_sent_at = $2 
                            WHERE alert_id = $3 AND user_id = $4
                        `,
                        values: [sent, timestamp, alertId, userId]
                    };
                    break;
                default:
                    throw new Error(`Unknown channel: ${channel}`);
            }

            await pool.query(query);
        } catch (error) {
            console.error('Error updating recipient status:', error);
        }
    }

    /**
     * Send notification through all enabled channels for a user
     */
    async sendMultiChannelNotification(userId, alertData, alertId) {
        try {
            // Get user preferences
            const preferences = await this.getUserNotificationPreferences(userId, alertData.alertTypeId);
            
            // Get user details
            const user = await this.getUserDetails(userId);
            if (!user) {
                throw new Error('User not found');
            }

            const results = {};

            // Send email if enabled
            if (preferences.email_enabled && user.email) {
                results.email = await this.sendEmail(
                    user.email, 
                    alertData.emailSubject || alertData.title, 
                    alertData.emailBody || alertData.message,
                    alertId,
                    userId
                );
                
                if (results.email.success) {
                    await this.updateRecipientStatus(alertId, userId, 'email', true);
                }
            }

            // Send SMS if enabled
            if (preferences.sms_enabled && user.phone_number) {
                results.sms = await this.sendSMS(
                    user.phone_number, 
                    alertData.smsMessage || alertData.message,
                    alertId,
                    userId
                );
                
                if (results.sms.success) {
                    await this.updateRecipientStatus(alertId, userId, 'sms', true);
                }
            }

            // Send push notification if enabled
            if (preferences.push_enabled) {
                results.push = await this.sendPushNotification(
                    userId,
                    alertData.pushTitle || alertData.title,
                    alertData.pushBody || alertData.message,
                    { alertId, type: alertData.alertTypeId },
                    alertId
                );
                
                if (results.push.success) {
                    await this.updateRecipientStatus(alertId, userId, 'push', true);
                }
            }

            return results;
        } catch (error) {
            console.error('Multi-channel notification failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get user notification preferences
     */
    async getUserNotificationPreferences(userId, alertTypeId) {
        try {
            const query = {
                text: `
                    SELECT * FROM user_notification_preferences 
                    WHERE user_id = $1 AND alert_type_id = $2
                `,
                values: [userId, alertTypeId]
            };
            
            const result = await pool.query(query);
            
            if (result.rows.length > 0) {
                return result.rows[0];
            }
            
            // Return default preferences if none set
            return {
                email_enabled: true,
                sms_enabled: true,
                push_enabled: true
            };
        } catch (error) {
            console.error('Error fetching user preferences:', error);
            return {
                email_enabled: true,
                sms_enabled: true,
                push_enabled: true
            };
        }
    }

    /**
     * Get user details
     */
    async getUserDetails(userId) {
        try {
            const query = {
                text: 'SELECT id, email, phone_number, first_name, last_name FROM users WHERE id = $1',
                values: [userId]
            };
            
            const result = await pool.query(query);
            return result.rows[0] || null;
        } catch (error) {
            console.error('Error fetching user details:', error);
            return null;
        }
    }

    /**
     * Test notification service configuration
     */
    async testConfiguration() {
        const results = {
            email: false,
            sms: false,
            push: false
        };

        // Test email
        try {
            if (this.emailTransporter) {
                await this.emailTransporter.verify();
                results.email = true;
            }
        } catch (error) {
            console.error('Email configuration test failed:', error);
        }

                            // Test SMS
                    try {
                        if (this.vonageClient) {
                            results.sms = true;
                        }
                    } catch (error) {
                        console.error('SMS configuration test failed:', error);
                    }

        // Push notifications are always available (web-based)
        results.push = true;

        return results;
    }
}

module.exports = new NotificationService();
