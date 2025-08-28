const alertService = require('../services/alertService');
const notificationService = require('../services/notificationService');
const { pool } = require('../config/db');

/**
 * Create a new alert
 */
const createAlert = async (req, res) => {
    try {
        const {
            title,
            message,
            alertTypeId,
            societyId,
            priority,
            scheduledFor,
            expiresAt,
            recipientCriteria
        } = req.body;

        // Validation
        if (!title || !message || !alertTypeId || !societyId) {
            return res.status(400).json({
                success: false,
                message: 'Title, message, alert type, and society are required'
            });
        }

        // Check if user has permission to create alerts for this society
        if (req.user.role !== 'super_admin' && req.user.society_id !== parseInt(societyId)) {
            return res.status(403).json({
                success: false,
                message: 'You can only create alerts for your own society'
            });
        }

        const alertData = {
            title,
            message,
            alertTypeId: parseInt(alertTypeId),
            societyId: parseInt(societyId),
            senderId: req.user.id,
            priority: priority || 'medium',
            scheduledFor: scheduledFor || null,
            expiresAt: expiresAt || null,
            recipientCriteria: recipientCriteria || {}
        };

        const result = await alertService.createAlert(alertData);

        res.status(201).json({
            success: true,
            message: 'Alert created successfully',
            data: result
        });

    } catch (error) {
        console.error('Error creating alert:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create alert',
            error: error.message
        });
    }
};

/**
 * Get all alerts with filtering and pagination
 */
const getAlerts = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            societyId,
            alertTypeId,
            status,
            priority,
            senderId
        } = req.query;

        // Build filters
        const filters = {};
        
        if (societyId) {
            // Super admin can see all societies, others only their own
            if (req.user.role !== 'super_admin') {
                filters.societyId = req.user.society_id;
            } else {
                filters.societyId = parseInt(societyId);
            }
        } else if (req.user.role !== 'super_admin') {
            // Non-super admin users can only see alerts from their society
            filters.societyId = req.user.society_id;
        }

        if (alertTypeId) filters.alertTypeId = parseInt(alertTypeId);
        if (status) filters.status = status;
        if (priority) filters.priority = priority;
        if (senderId) filters.senderId = parseInt(senderId);

        const result = await alertService.getAlerts(filters, parseInt(page), parseInt(limit));

        res.status(200).json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Error getting alerts:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get alerts',
            error: error.message
        });
    }
};

/**
 * Get alert details
 */
const getAlertDetails = async (req, res) => {
    try {
        const { alertId } = req.params;

        const result = await alertService.getAlertDetails(parseInt(alertId));

        // Check if user has permission to view this alert
        if (req.user.role !== 'super_admin' && result.alert.society_id !== req.user.society_id) {
            return res.status(403).json({
                success: false,
                message: 'You can only view alerts from your own society'
            });
        }

        res.status(200).json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Error getting alert details:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get alert details',
            error: error.message
        });
    }
};

/**
 * Update alert
 */
const updateAlert = async (req, res) => {
    try {
        const { alertId } = req.params;
        const updateData = req.body;

        // Get current alert to check permissions
        const currentAlert = await alertService.getAlertDetails(parseInt(alertId));
        
        if (!currentAlert) {
            return res.status(404).json({
                success: false,
                message: 'Alert not found'
            });
        }

        // Check permissions
        if (req.user.role !== 'super_admin' && currentAlert.alert.society_id !== req.user.society_id) {
            return res.status(403).json({
                success: false,
                message: 'You can only update alerts from your own society'
            });
        }

        // Only allow updates if alert is pending or scheduled
        if (!['pending', 'scheduled'].includes(currentAlert.alert.status)) {
            return res.status(400).json({
                success: false,
                message: 'Cannot update alerts that have already been sent or failed'
            });
        }

        const result = await alertService.updateAlert(parseInt(alertId), updateData);

        res.status(200).json({
            success: true,
            message: 'Alert updated successfully',
            data: result
        });

    } catch (error) {
        console.error('Error updating alert:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update alert',
            error: error.message
        });
    }
};

/**
 * Cancel alert
 */
const cancelAlert = async (req, res) => {
    try {
        const { alertId } = req.params;

        // Get current alert to check permissions
        const currentAlert = await alertService.getAlertDetails(parseInt(alertId));
        
        if (!currentAlert) {
            return res.status(404).json({
                success: false,
                message: 'Alert not found'
            });
        }

        // Check permissions
        if (req.user.role !== 'super_admin' && currentAlert.alert.society_id !== req.user.society_id) {
            return res.status(403).json({
                success: false,
                message: 'You can only cancel alerts from your own society'
            });
        }

        // Only allow cancellation if alert is pending or scheduled
        if (!['pending', 'scheduled'].includes(currentAlert.alert.status)) {
            return res.status(400).json({
                success: false,
                message: 'Cannot cancel alerts that have already been sent or failed'
            });
        }

        const result = await alertService.cancelAlert(parseInt(alertId));

        res.status(200).json({
            success: true,
            message: 'Alert cancelled successfully',
            data: result
        });

    } catch (error) {
        console.error('Error cancelling alert:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel alert',
            error: error.message
        });
    }
};

/**
 * Get alert statistics
 */
const getAlertStats = async (req, res) => {
    try {
        const { societyId } = req.query;

        // Check permissions
        if (req.user.role !== 'super_admin') {
            // Non-super admin users can only see stats for their own society
            const stats = await alertService.getAlertStats(req.user.society_id);
            return res.status(200).json({
                success: true,
                data: stats
            });
        }

        // Super admin can see stats for any society or overall
        const stats = await alertService.getAlertStats(societyId ? parseInt(societyId) : null);

        res.status(200).json({
            success: true,
            data: stats
        });

    } catch (error) {
        console.error('Error getting alert stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get alert statistics',
            error: error.message
        });
    }
};

/**
 * Get alert types
 */
const getAlertTypes = async (req, res) => {
    try {
        const query = {
            text: 'SELECT * FROM alert_types WHERE is_active = TRUE ORDER BY name'
        };

        const result = await pool.query(query);

        res.status(200).json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('Error getting alert types:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get alert types',
            error: error.message
        });
    }
};

/**
 * Get user notification preferences
 */
const getUserNotificationPreferences = async (req, res) => {
    try {
        const userId = req.user.id;
        const { alertTypeId } = req.query;

        let query;
        let values;

        if (alertTypeId) {
            query = {
                text: `
                    SELECT unp.*, at.name as alert_type_name, at.description as alert_type_description
                    FROM user_notification_preferences unp
                    JOIN alert_types at ON unp.alert_type_id = at.id
                    WHERE unp.user_id = $1 AND unp.alert_type_id = $2
                `,
                values: [userId, parseInt(alertTypeId)]
            };
        } else {
            query = {
                text: `
                    SELECT unp.*, at.name as alert_type_name, at.description as alert_type_description
                    FROM user_notification_preferences unp
                    JOIN alert_types at ON unp.alert_type_id = at.id
                    WHERE unp.user_id = $1
                    ORDER BY at.name
                `,
                values: [userId]
            };
        }

        const result = await pool.query(query);

        res.status(200).json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('Error getting user notification preferences:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get notification preferences',
            error: error.message
        });
    }
};

/**
 * Update user notification preferences
 */
const updateUserNotificationPreferences = async (req, res) => {
    try {
        const userId = req.user.id;
        const { alertTypeId, emailEnabled, smsEnabled, pushEnabled } = req.body;

        if (!alertTypeId) {
            return res.status(400).json({
                success: false,
                message: 'Alert type ID is required'
            });
        }

        // Check if preferences exist
        const existingQuery = {
            text: 'SELECT * FROM user_notification_preferences WHERE user_id = $1 AND alert_type_id = $2',
            values: [userId, parseInt(alertTypeId)]
        };

        const existingResult = await pool.query(existingQuery);

        if (existingResult.rows.length > 0) {
            // Update existing preferences
            const updateQuery = {
                text: `
                    UPDATE user_notification_preferences 
                    SET email_enabled = $1, sms_enabled = $2, push_enabled = $3, updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = $4 AND alert_type_id = $5
                `,
                values: [
                    emailEnabled !== undefined ? emailEnabled : existingResult.rows[0].email_enabled,
                    smsEnabled !== undefined ? smsEnabled : existingResult.rows[0].sms_enabled,
                    pushEnabled !== undefined ? pushEnabled : existingResult.rows[0].push_enabled,
                    userId,
                    parseInt(alertTypeId)
                ]
            };

            await pool.query(updateQuery);
        } else {
            // Create new preferences
            const insertQuery = {
                text: `
                    INSERT INTO user_notification_preferences 
                    (user_id, alert_type_id, email_enabled, sms_enabled, push_enabled)
                    VALUES ($1, $2, $3, $4, $5)
                `,
                values: [
                    userId,
                    parseInt(alertTypeId),
                    emailEnabled !== undefined ? emailEnabled : true,
                    smsEnabled !== undefined ? smsEnabled : true,
                    pushEnabled !== undefined ? pushEnabled : true
                ]
            };

            await pool.query(insertQuery);
        }

        res.status(200).json({
            success: true,
            message: 'Notification preferences updated successfully'
        });

    } catch (error) {
        console.error('Error updating notification preferences:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update notification preferences',
            error: error.message
        });
    }
};

/**
 * Register push token
 */
const registerPushToken = async (req, res) => {
    try {
        const userId = req.user.id;
        const { token, deviceType = 'web' } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Push token is required'
            });
        }

        // Check if token already exists
        const existingQuery = {
            text: 'SELECT * FROM push_tokens WHERE token = $1',
            values: [token]
        };

        const existingResult = await pool.query(existingQuery);

        if (existingResult.rows.length > 0) {
            // Update existing token
            const updateQuery = {
                text: `
                    UPDATE push_tokens 
                    SET user_id = $1, device_type = $2, updated_at = CURRENT_TIMESTAMP
                    WHERE token = $3
                `,
                values: [userId, deviceType, token]
            };

            await pool.query(updateQuery);
        } else {
            // Create new token
            const insertQuery = {
                text: `
                    INSERT INTO push_tokens (user_id, token, device_type)
                    VALUES ($1, $2, $3)
                `,
                values: [userId, token, deviceType]
            };

            await pool.query(insertQuery);
        }

        res.status(200).json({
            success: true,
            message: 'Push token registered successfully'
        });

    } catch (error) {
        console.error('Error registering push token:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to register push token',
            error: error.message
        });
    }
};

/**
 * Test notification service
 */
const testNotificationService = async (req, res) => {
    try {
        // Only super admin can test notification service
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({
                success: false,
                message: 'Only super admin can test notification service'
            });
        }

        const config = await notificationService.testConfiguration();

        res.status(200).json({
            success: true,
            data: config
        });

    } catch (error) {
        console.error('Error testing notification service:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to test notification service',
            error: error.message
        });
    }
};

/**
 * Get communication logs
 */
const getCommunicationLogs = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            alertId,
            userId,
            channel,
            status
        } = req.query;

        let query = {
            text: `
                SELECT 
                    cl.*,
                    a.title as alert_title,
                    u.first_name,
                    u.last_name,
                    u.email
                FROM communication_logs cl
                JOIN alerts a ON cl.alert_id = a.id
                JOIN users u ON cl.user_id = u.id
            `,
            values: []
        };

        const whereConditions = [];
        let paramCounter = 1;

        // Add filters
        if (alertId) {
            whereConditions.push(`cl.alert_id = $${paramCounter}`);
            query.values.push(parseInt(alertId));
            paramCounter++;
        }

        if (userId) {
            whereConditions.push(`cl.user_id = $${paramCounter}`);
            query.values.push(parseInt(userId));
            paramCounter++;
        }

        if (channel) {
            whereConditions.push(`cl.channel = $${paramCounter}`);
            query.values.push(channel);
            paramCounter++;
        }

        if (status) {
            whereConditions.push(`cl.status = $${paramCounter}`);
            query.values.push(status);
            paramCounter++;
        }

        // Non-super admin users can only see logs from their society
        if (req.user.role !== 'super_admin') {
            whereConditions.push(`a.society_id = $${paramCounter}`);
            query.values.push(req.user.society_id);
            paramCounter++;
        }

        if (whereConditions.length > 0) {
            query.text += ' WHERE ' + whereConditions.join(' AND ');
        }

        query.text += ' ORDER BY cl.sent_at DESC';

        // Add pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);
        query.text += ` LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
        query.values.push(parseInt(limit), offset);

        const result = await pool.query(query);

        // Get total count for pagination
        const countQuery = {
            text: `
                SELECT COUNT(*) as total 
                FROM communication_logs cl
                JOIN alerts a ON cl.alert_id = a.id
                ${whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : ''}
            `,
            values: query.values.slice(0, -2) // Remove limit and offset
        };

        const countResult = await pool.query(countQuery);
        const total = parseInt(countResult.rows[0].total);

        res.status(200).json({
            success: true,
            data: {
                logs: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            }
        });

    } catch (error) {
        console.error('Error getting communication logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get communication logs',
            error: error.message
        });
    }
};

module.exports = {
    createAlert,
    getAlerts,
    getAlertDetails,
    updateAlert,
    cancelAlert,
    getAlertStats,
    getAlertTypes,
    getUserNotificationPreferences,
    updateUserNotificationPreferences,
    registerPushToken,
    testNotificationService,
    getCommunicationLogs
};
