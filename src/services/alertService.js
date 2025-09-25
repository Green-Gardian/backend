const { pool } = require('../config/db');
const notificationService = require('./notificationService');
const websocketService = require('./websocketService');
const cron = require('node-cron');

class AlertService {
    constructor() {
        this.scheduledJobs = new Map();
        this.initializeScheduledAlerts();
        this.setupCronJobs();
    }

    /**
     * Initialize scheduled alerts on service start
     */
    async initializeScheduledAlerts() {
        try {
            const query = {
                text: `
                    SELECT id, scheduled_for, status 
                    FROM alerts 
                    WHERE scheduled_for > NOW() 
                    AND status = 'pending'
                `
            };
            
            const result = await pool.query(query);
            
            result.rows.forEach(alert => {
                this.scheduleAlert(alert.id, alert.scheduled_for);
            });
            
            console.log(`Initialized ${result.rows.length} scheduled alerts`);
        } catch (error) {
            console.error('Error initializing scheduled alerts:', error);
        }
    }

    /**
     * Setup cron jobs for maintenance tasks
     */
    setupCronJobs() {
        // Clean up expired alerts every hour
        cron.schedule('0 * * * *', async () => {
            try {
                await this.cleanupExpiredAlerts();
            } catch (error) {
                console.error('Error in cleanup cron job:', error);
            }
        });

        // Send WebSocket health check every 5 minutes
        cron.schedule('*/5 * * * *', async () => {
            try {
                const health = websocketService.healthCheck();
                if (health.status === 'healthy') {
                    console.log('WebSocket service is healthy');
                } else {
                    console.warn('WebSocket service health check failed:', health.error);
                }
            } catch (error) {
                console.error('Error in WebSocket health check:', error);
            }
        });
    }

    /**
     * Create a new alert
     */
    async createAlert(alertData) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Validate alert type
            const alertTypeQuery = {
                text: 'SELECT * FROM alert_types WHERE id = $1 AND is_active = TRUE',
                values: [alertData.alertTypeId]
            };
            
            const alertTypeResult = await client.query(alertTypeQuery);
            if (alertTypeResult.rows.length === 0) {
                throw new Error('Invalid alert type');
            }

            // Create alert
            const alertQuery = {
                text: `
                    INSERT INTO alerts 
                    (title, message, alert_type_id, society_id, sender_id, priority, scheduled_for, expires_at) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
                    RETURNING *
                `,
                values: [
                    alertData.title,
                    alertData.message,
                    alertData.alertTypeId,
                    alertData.societyId,
                    alertData.senderId,
                    alertData.priority || 'medium',
                    alertData.scheduledFor || null,
                    alertData.expiresAt || null
                ]
            };
            
            const alertResult = await client.query(alertQuery);
            const alert = alertResult.rows[0];

            // Get recipients based on criteria
            const recipients = await this.getRecipients(alertData.societyId, alertData.recipientCriteria);
            
            // Create recipient records
            if (recipients.length > 0) {
                const recipientValues = recipients.map(userId => [alert.id, userId]);
                const recipientQuery = {
                    text: `
                        INSERT INTO alert_recipients (alert_id, user_id) 
                        VALUES ${recipientValues.map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(', ')}
                    `,
                    values: recipientValues.flat()
                };
                
                await client.query(recipientQuery);
            }

            // Commit the transaction first
            await client.query('COMMIT');
            
            // Now that the alert is committed, we can safely broadcast it
            if (!alertData.scheduledFor) {
                // For immediate alerts, broadcast after commit
                try {
                    await this.broadcastAlert(alert.id);
                } catch (broadcastError) {
                    console.error('Error broadcasting alert after creation:', broadcastError);
                    // Don't fail the alert creation if broadcasting fails
                }
            } else {
                // Schedule the alert for later
                this.scheduleAlert(alert.id, alertData.scheduledFor);
            }

            // Send real-time notification via WebSocket (after commit)
            try {
                const alertWithType = {
                    ...alert,
                    alert_type_name: alertTypeResult.rows[0].name
                };
                websocketService.sendAlertNotification(alertWithType, recipients.map(id => ({ user_id: id })));
            } catch (wsError) {
                console.error('WebSocket notification failed:', wsError);
                // Don't fail the alert creation if WebSocket fails
            }
            
            return {
                success: true,
                alert: alert,
                recipientsCount: recipients.length
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error creating alert:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get recipients based on criteria
     */
    async getRecipients(societyId, criteria = {}) {
        try {
            let query = {
                text: `
                    SELECT u.id 
                    FROM users u 
                    WHERE u.society_id = $1 
                    AND u.is_verified = TRUE 
                    AND u.is_blocked = FALSE
                `,
                values: [societyId]
            };

            // Add role filter if specified
            if (criteria.roles && criteria.roles.length > 0) {
                query.text += ` AND u.role = ANY($2)`;
                query.values.push(criteria.roles);
            }

            // Add specific user filter if specified
            if (criteria.userIds && criteria.userIds.length > 0) {
                query.text += ` AND u.id = ANY($${query.values.length + 1})`;
                query.values.push(criteria.userIds);
            }

            const result = await pool.query(query);
            return result.rows.map(row => row.id);
            
        } catch (error) {
            console.error('Error getting recipients:', error);
            return [];
        }
    }

    /**
     * Schedule an alert for later
     */
    scheduleAlert(alertId, scheduledFor) {
        const date = new Date(scheduledFor);
        const now = new Date();
        
        if (date <= now) {
            console.log(`Alert ${alertId} is already due, sending immediately`);
            this.broadcastAlert(alertId);
            return;
        }

        const delay = date.getTime() - now.getTime();
        
        // Schedule the job
        const timeoutId = setTimeout(async () => {
            await this.broadcastAlert(alertId);
            this.scheduledJobs.delete(alertId);
        }, delay);
        
        this.scheduledJobs.set(alertId, timeoutId);
        console.log(`Alert ${alertId} scheduled for ${date.toISOString()}`);
    }

    /**
     * Broadcast an alert to all recipients
     */
    async broadcastAlert(alertId) {
        try {
            // Get alert details
            const alertQuery = {
                text: `
                    SELECT a.*, at.name as alert_type_name 
                    FROM alerts a 
                    JOIN alert_types at ON a.alert_type_id = at.id 
                    WHERE a.id = $1
                `,
                values: [alertId]
            };
            
            const alertResult = await pool.query(alertQuery);
            if (alertResult.rows.length === 0) {
                throw new Error(`Alert with ID ${alertId} not found`);
            }
            
            const alert = alertResult.rows[0];

            // Get recipients
            const recipientsQuery = {
                text: `
                    SELECT ar.user_id, ar.email_sent, ar.sms_sent, ar.push_sent
                    FROM alert_recipients ar 
                    WHERE ar.alert_id = $1
                `,
                values: [alertId]
            };
            
            const recipientsResult = await pool.query(recipientsQuery);
            const recipients = recipientsResult.rows;

            // Update alert status to 'sent'
            await pool.query({
                text: 'UPDATE alerts SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                values: ['sent', alertId]
            });

            // Send notifications to each recipient
            const notificationPromises = recipients.map(recipient => {
                const alertData = {
                    title: alert.title,
                    message: alert.message,
                    alertTypeId: alert.alert_type_id,
                    alertTypeName: alert.alert_type_name,
                    priority: alert.priority
                };
                
                return notificationService.sendMultiChannelNotification(
                    recipient.user_id, 
                    alertData, 
                    alertId
                );
            });

            const results = await Promise.allSettled(notificationPromises);
            
            // Log results
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            const failureCount = results.length - successCount;
            
            console.log(`Alert ${alertId} broadcast completed: ${successCount} success, ${failureCount} failures`);

            // Send real-time notification via WebSocket
            try {
                websocketService.sendAlertNotification(alert, recipients);
            } catch (wsError) {
                console.error('WebSocket notification failed:', wsError);
            }
            
            return {
                success: true,
                totalRecipients: recipients.length,
                successCount,
                failureCount
            };
            
        } catch (error) {
            console.error('Error broadcasting alert:', error);
            
            // Update alert status to 'failed'
            await pool.query({
                text: 'UPDATE alerts SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                values: ['failed', alertId]
            });
            
            throw error;
        }
    }

    /**
     * Get alerts with filtering and pagination
     */
    async getAlerts(filters = {}, page = 1, limit = 20, offset = null) {
        try {
            let query = {
                text: `
                    SELECT 
                        a.*,
                        at.name as alert_type_name,
                        at.priority as alert_type_priority,
                        s.society_name,
                        u.first_name as sender_first_name,
                        u.last_name as sender_last_name,
                        COUNT(ar.id) as recipient_count
                    FROM alerts a
                    JOIN alert_types at ON a.alert_type_id = at.id
                    JOIN societies s ON a.society_id = s.id
                    LEFT JOIN users u ON a.sender_id = u.id
                    LEFT JOIN alert_recipients ar ON a.id = ar.alert_id
                `,
                values: []
            };

            const whereConditions = [];
            let paramCounter = 1;

            // Add filters
            if (filters.societyId) {
                whereConditions.push(`a.society_id = $${paramCounter}`);
                query.values.push(filters.societyId);
                paramCounter++;
            }

            if (filters.alertTypeId) {
                whereConditions.push(`a.alert_type_id = $${paramCounter}`);
                query.values.push(filters.alertTypeId);
                paramCounter++;
            }

            if (filters.status) {
                whereConditions.push(`a.status = $${paramCounter}`);
                query.values.push(filters.status);
                paramCounter++;
            }

            if (filters.priority) {
                whereConditions.push(`a.priority = $${paramCounter}`);
                query.values.push(filters.priority);
                paramCounter++;
            }

            if (filters.senderId) {
                whereConditions.push(`a.sender_id = $${paramCounter}`);
                query.values.push(filters.senderId);
                paramCounter++;
            }

            if (whereConditions.length > 0) {
                query.text += ' WHERE ' + whereConditions.join(' AND ');
            }

            query.text += ' GROUP BY a.id, at.name, at.priority, s.society_name, u.first_name, u.last_name';
            query.text += ' ORDER BY a.created_at DESC';

            // Add pagination
            const calculatedOffset = offset !== null ? offset : (page - 1) * limit;
            query.text += ` LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
            query.values.push(limit, calculatedOffset);

            const result = await pool.query(query);
            
            // Get total count for pagination
            const countQuery = {
                text: `
                    SELECT COUNT(*) as total 
                    FROM alerts a
                    ${whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : ''}
                `,
                values: query.values.slice(0, -2) // Remove limit and offset
            };
            
            const countResult = await pool.query(countQuery);
            const total = parseInt(countResult.rows[0].total);

            return {
                alerts: result.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            };
            
        } catch (error) {
            console.error('Error getting alerts:', error);
            throw error;
        }
    }

    /**
     * Get alert details with recipients
     */
    async getAlertDetails(alertId) {
        try {
            // Get alert details
            const alertQuery = {
                text: `
                    SELECT 
                        a.*,
                        at.name as alert_type_name,
                        at.description as alert_type_description,
                        s.society_name,
                        u.first_name as sender_first_name,
                        u.last_name as sender_last_name
                    FROM alerts a
                    JOIN alert_types at ON a.alert_type_id = at.id
                    JOIN societies s ON a.society_id = s.id
                    LEFT JOIN users u ON a.sender_id = u.id
                    WHERE a.id = $1
                `,
                values: [alertId]
            };
            
            const alertResult = await pool.query(alertQuery);
            if (alertResult.rows.length === 0) {
                throw new Error('Alert not found');
            }
            
            const alert = alertResult.rows[0];

            // Get recipients with their status
            const recipientsQuery = {
                text: `
                    SELECT 
                        ar.*,
                        u.first_name,
                        u.last_name,
                        u.email,
                        u.phone_number,
                        u.role
                    FROM alert_recipients ar
                    JOIN users u ON ar.user_id = u.id
                    WHERE ar.alert_id = $1
                `,
                values: [alertId]
            };
            
            const recipientsResult = await pool.query(recipientsQuery);

            // Get communication logs
            const logsQuery = {
                text: `
                    SELECT 
                        cl.*,
                        u.first_name,
                        u.last_name
                    FROM communication_logs cl
                    JOIN users u ON cl.user_id = u.id
                    WHERE cl.alert_id = $1
                    ORDER BY cl.sent_at DESC
                `,
                values: [alertId]
            };
            
            const logsResult = await pool.query(logsQuery);

            return {
                alert,
                recipients: recipientsResult.rows,
                communicationLogs: logsResult.rows
            };
            
        } catch (error) {
            console.error('Error getting alert details:', error);
            throw error;
        }
    }

    /**
     * Update alert
     */
    async updateAlert(alertId, updateData) {
        try {
            const allowedFields = ['title', 'message', 'priority', 'scheduled_for', 'expires_at'];
            const updateFields = [];
            const values = [];
            let paramCounter = 1;

            for (const [key, value] of Object.entries(updateData)) {
                if (allowedFields.includes(key) && value !== undefined) {
                    updateFields.push(`${key} = $${paramCounter}`);
                    values.push(value);
                    paramCounter++;
                }
            }

            if (updateFields.length === 0) {
                throw new Error('No valid fields to update');
            }

            updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(alertId);

            const query = {
                text: `UPDATE alerts SET ${updateFields.join(', ')} WHERE id = $${paramCounter}`,
                values
            };

            const result = await pool.query(query);
            
            if (result.rowCount === 0) {
                throw new Error('Alert not found');
            }

            // If scheduled_for changed, reschedule the alert
            if (updateData.scheduled_for !== undefined) {
                // Cancel existing job if any
                if (this.scheduledJobs.has(alertId)) {
                    clearTimeout(this.scheduledJobs.get(alertId));
                    this.scheduledJobs.delete(alertId);
                }
                
                // Schedule new job if scheduled_for is in the future
                if (updateData.scheduled_for && new Date(updateData.scheduled_for) > new Date()) {
                    this.scheduleAlert(alertId, updateData.scheduled_for);
                }
            }

            // Send real-time update notification via WebSocket
            try {
                const alertDetails = await this.getAlertDetails(alertId);
                websocketService.sendToSociety(alertDetails.alert.society_id, 'alert-updated', {
                    id: alertId,
                    ...updateData,
                    timestamp: new Date().toISOString()
                });
            } catch (wsError) {
                console.error('WebSocket update notification failed:', wsError);
            }

            return {
                success: true,
                message: 'Alert updated successfully'
            };
            
        } catch (error) {
            console.error('Error updating alert:', error);
            throw error;
        }
    }

    /**
     * Cancel/delete alert
     */
    async cancelAlert(alertId) {
        try {
            // Cancel scheduled job if any
            if (this.scheduledJobs.has(alertId)) {
                clearTimeout(this.scheduledJobs.get(alertId));
                this.scheduledJobs.delete(alertId);
            }

            // Update alert status
            const result = await pool.query({
                text: 'UPDATE alerts SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                values: ['cancelled', alertId]
            });

            if (result.rowCount === 0) {
                throw new Error('Alert not found');
            }

            // Send real-time cancellation notification via WebSocket
            try {
                const alertDetails = await this.getAlertDetails(alertId);
                websocketService.sendToSociety(alertDetails.alert.society_id, 'alert-cancelled', {
                    id: alertId,
                    timestamp: new Date().toISOString()
                });
            } catch (wsError) {
                console.error('WebSocket cancellation notification failed:', wsError);
            }

            return {
                success: true,
                message: 'Alert cancelled successfully'
            };
            
        } catch (error) {
            console.error('Error cancelling alert:', error);
            throw error;
        }
    }

    /**
     * Get alert statistics
     */
    async getAlertStats(societyId = null) {
        try {
            let query = {
                text: `
                    SELECT 
                        at.name as alert_type,
                        COUNT(*) as total_alerts,
                        COUNT(CASE WHEN a.status = 'sent' THEN 1 END) as sent_alerts,
                        COUNT(CASE WHEN a.status = 'failed' THEN 1 END) as failed_alerts,
                        COUNT(CASE WHEN a.status = 'pending' THEN 1 END) as pending_alerts,
                        COUNT(CASE WHEN a.status = 'cancelled' THEN 1 END) as cancelled_alerts
                    FROM alerts a
                    JOIN alert_types at ON a.alert_type_id = at.id
                `,
                values: []
            };

            if (societyId) {
                query.text += ' WHERE a.society_id = $1';
                query.values.push(societyId);
            }

            query.text += ' GROUP BY at.name ORDER BY total_alerts DESC';

            const result = await pool.query(query);

            // Get overall stats
            const overallQuery = {
                text: `
                    SELECT 
                        COUNT(*) as total_alerts,
                        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_alerts,
                        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_alerts,
                        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_alerts,
                        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_alerts
                    FROM alerts
                    ${societyId ? 'WHERE society_id = $1' : ''}
                `,
                values: societyId ? [societyId] : []
            };

            const overallResult = await pool.query(overallQuery);

            return {
                byType: result.rows,
                overall: overallResult.rows[0]
            };
            
        } catch (error) {
            console.error('Error getting alert stats:', error);
            throw error;
        }
    }

    /**
     * Clean up expired alerts
     */
    async cleanupExpiredAlerts() {
        try {
            const result = await pool.query({
                text: `
                    UPDATE alerts 
                    SET status = 'expired', updated_at = CURRENT_TIMESTAMP 
                    WHERE expires_at < NOW() AND status = 'pending'
                `
            });

            if (result.rowCount > 0) {
                console.log(`Cleaned up ${result.rowCount} expired alerts`);
                
                // Send real-time notification about cleanup
                try {
                    websocketService.broadcastSystemMessage(
                        `Cleaned up ${result.rowCount} expired alerts`,
                        'info',
                        'admins'
                    );
                } catch (wsError) {
                    console.error('WebSocket cleanup notification failed:', wsError);
                }
            }
            
            return result.rowCount;
            
        } catch (error) {
            console.error('Error cleaning up expired alerts:', error);
            return 0;
        }
    }
}

module.exports = new AlertService();
