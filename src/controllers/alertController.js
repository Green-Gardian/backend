// controllers/alertsController.js
const alertService = require('../services/alertService');
const notificationService = require('../services/notificationService');
const { pool } = require('../config/db');

/* -------------------------------------------------------
 * Helpers (DRY utils)
 * ----------------------------------------------------- */

/**
 * Parse a positive integer safely. Returns fallback when invalid.
 */
const parsePositiveInt = (value, fallback = null) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/**
 * Normalize boolean-ish inputs (keeps undefined as undefined).
 */
const toBoolOptional = (v) => (v === undefined ? undefined : Boolean(v));

/**
 * Simple page/limit sanitizer with offset calculation.
 */
const getPagination = (pageIn, limitIn, defaults = { page: 1, limit: 20, maxLimit: 200 }) => {
  const page = Math.max(parsePositiveInt(pageIn, defaults.page), 1);
  const rawLimit = parsePositiveInt(limitIn, defaults.limit);
  const limit = Math.min(Math.max(rawLimit || defaults.limit, 1), defaults.maxLimit);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

/**
 * Enforce culture: super_admin can access any society; others only their own.
 * Returns the society id the user is allowed to use (or throws 403).
 */
const ensureSocietyAccess = (reqUser, targetSocietyId) => {
  const id = parsePositiveInt(targetSocietyId, null);
  if (reqUser.role === 'super_admin') return id; // super_admin can pass through null as "any"
  if (id === null || id === reqUser.society_id) return reqUser.society_id;
  const err = new Error('You can only operate within your own society');
  err.status = 403;
  throw err;
};

/**
 * Ensure the requester can access a loaded alert record.
 * Expects object returned from alertService.getAlertDetails()
 * that includes { alert: { society_id, ... } }
 */
const ensureAlertRecordAccess = (reqUser, alertDetails) => {
  if (!alertDetails || !alertDetails.alert) {
    const err = new Error('Alert not found');
    err.status = 404;
    throw err;
  }
  if (reqUser.role === 'super_admin') return;
  if (alertDetails.alert.society_id !== reqUser.society_id) {
    const err = new Error('You can only operate on alerts from your own society');
    err.status = 403;
    throw err;
  }
};

/**
 * Build WHERE clause from parts and values in-order.
 * Returns { text: ' WHERE a=$1 AND b=$2', values: [...] }
 */
const buildWhere = (parts, values) => {
  if (!parts.length) return { text: '', values };
  return { text: ` WHERE ${parts.join(' AND ')}`, values };
};

/* -------------------------------------------------------
 * Controllers
 * ----------------------------------------------------- */

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

    // Permission: resolve/validate society id
    const allowedSocietyId = ensureSocietyAccess(req.user, societyId);

    const alertData = {
      title: String(title),
      message: String(message),
      alertTypeId: parsePositiveInt(alertTypeId),
      societyId: parsePositiveInt(allowedSocietyId),
      senderId: req.user.id,
      priority: priority || 'medium',
      scheduledFor: scheduledFor || null,
      expiresAt: expiresAt || null,
      recipientCriteria: recipientCriteria || {}
    };

    const result = await alertService.createAlert(alertData);

    return res.status(201).json({
      success: true,
      message: 'Alert created successfully',
      data: result
    });
  } catch (error) {
    const status = error.status || 500;
    console.error('Error creating alert:', error);
    return res.status(status).json({
      success: false,
      message: error.status ? error.message : 'Failed to create alert',
      error: !error.status ? error.message : undefined
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

    const { page: pg, limit: lim, offset } = getPagination(page, limit);

    // Permission-aware society filter:
    // - super_admin: can use provided societyId or see all if omitted
    // - others: always pinned to own society
    let resolvedSocietyId = null;
    if (req.user.role === 'super_admin') {
      resolvedSocietyId = societyId ? parsePositiveInt(societyId, null) : null;
    } else {
      resolvedSocietyId = req.user.society_id;
    }

    const filters = {
      societyId: resolvedSocietyId,
      alertTypeId: alertTypeId ? parsePositiveInt(alertTypeId, null) : undefined,
      status: status || undefined,
      priority: priority || undefined,
      senderId: senderId ? parsePositiveInt(senderId, null) : undefined
    };

    const result = await alertService.getAlerts(filters, pg, lim, offset);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting alerts:', error);
    return res.status(500).json({
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
    const id = parsePositiveInt(alertId, null);
    if (id === null) {
      return res.status(400).json({ success: false, message: 'Invalid alert id' });
    }

    const result = await alertService.getAlertDetails(id);

    // Permission check
    ensureAlertRecordAccess(req.user, result);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    const status = error.status || 500;
    console.error('Error getting alert details:', error);
    return res.status(status).json({
      success: false,
      message: error.status ? error.message : 'Failed to get alert details',
      error: !error.status ? error.message : undefined
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

    const id = parsePositiveInt(alertId, null);
    if (id === null) {
      return res.status(400).json({ success: false, message: 'Invalid alert id' });
    }

    // Load current alert and check permissions
    const currentAlert = await alertService.getAlertDetails(id);
    ensureAlertRecordAccess(req.user, currentAlert);

    // Only allow updates if alert is pending or scheduled
    if (!['pending', 'scheduled'].includes(currentAlert.alert.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update alerts that have already been sent or failed'
      });
    }

    const result = await alertService.updateAlert(id, updateData);

    return res.status(200).json({
      success: true,
      message: 'Alert updated successfully',
      data: result
    });
  } catch (error) {
    const status = error.status || 500;
    console.error('Error updating alert:', error);
    return res.status(status).json({
      success: false,
      message: error.status ? error.message : 'Failed to update alert',
      error: !error.status ? error.message : undefined
    });
  }
};

/**
 * Cancel alert
 */
const cancelAlert = async (req, res) => {
  try {
    const { alertId } = req.params;
    const id = parsePositiveInt(alertId, null);
    if (id === null) {
      return res.status(400).json({ success: false, message: 'Invalid alert id' });
    }

    // Load current alert and check permissions
    const currentAlert = await alertService.getAlertDetails(id);
    ensureAlertRecordAccess(req.user, currentAlert);

    // Only allow cancellation if alert is pending or scheduled
    if (!['pending', 'scheduled'].includes(currentAlert.alert.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel alerts that have already been sent or failed'
      });
    }

    const result = await alertService.cancelAlert(id);

    return res.status(200).json({
      success: true,
      message: 'Alert cancelled successfully',
      data: result
    });
  } catch (error) {
    const status = error.status || 500;
    console.error('Error cancelling alert:', error);
    return res.status(status).json({
      success: false,
      message: error.status ? error.message : 'Failed to cancel alert',
      error: !error.status ? error.message : undefined
    });
  }
};

/**
 * Get alert statistics
 */
const getAlertStats = async (req, res) => {
  try {
    const { societyId } = req.query;

    let targetSocietyId = null;
    if (req.user.role === 'super_admin') {
      targetSocietyId = societyId ? parsePositiveInt(societyId, null) : null; // overall if null
    } else {
      targetSocietyId = req.user.society_id;
    }

    const stats = await alertService.getAlertStats(targetSocietyId);

    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting alert stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get alert statistics',
      error: error.message
    });
  }
};

/**
 * Get alert types
 */
const getAlertTypes = async (_req, res) => {
  try {
    const query = {
      text: 'SELECT * FROM alert_types WHERE is_active = TRUE ORDER BY name'
    };

    const result = await pool.query(query);

    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting alert types:', error);
    return res.status(500).json({
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
    const alertTypeId = req.query.alertTypeId ? parsePositiveInt(req.query.alertTypeId, null) : null;

    let query;
    if (alertTypeId) {
      query = {
        text: `
          SELECT unp.*, at.name as alert_type_name, at.description as alert_type_description
          FROM user_notification_preferences unp
          JOIN alert_types at ON unp.alert_type_id = at.id
          WHERE unp.user_id = $1 AND unp.alert_type_id = $2
        `,
        values: [userId, alertTypeId]
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

    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting user notification preferences:', error);
    return res.status(500).json({
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
    const alertTypeId = parsePositiveInt(req.body.alertTypeId, null);
    if (!alertTypeId) {
      return res.status(400).json({
        success: false,
        message: 'Alert type ID is required'
      });
    }

    const emailEnabled = toBoolOptional(req.body.emailEnabled);
    const smsEnabled = toBoolOptional(req.body.smsEnabled);
    const pushEnabled = toBoolOptional(req.body.pushEnabled);

    // Check if preferences exist
    const existingQuery = {
      text: 'SELECT * FROM user_notification_preferences WHERE user_id = $1 AND alert_type_id = $2',
      values: [userId, alertTypeId]
    };

    const existingResult = await pool.query(existingQuery);

    if (existingResult.rows.length > 0) {
      // Update existing preferences
      const current = existingResult.rows[0];
      const updateQuery = {
        text: `
          UPDATE user_notification_preferences 
          SET email_enabled = $1, sms_enabled = $2, push_enabled = $3, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $4 AND alert_type_id = $5
        `,
        values: [
          emailEnabled !== undefined ? emailEnabled : current.email_enabled,
          smsEnabled !== undefined ? smsEnabled : current.sms_enabled,
          pushEnabled !== undefined ? pushEnabled : current.push_enabled,
          userId,
          alertTypeId
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
          alertTypeId,
          emailEnabled !== undefined ? emailEnabled : true,
          smsEnabled !== undefined ? smsEnabled : true,
          pushEnabled !== undefined ? pushEnabled : true
        ]
      };

      await pool.query(insertQuery);
    }

    return res.status(200).json({
      success: true,
      message: 'Notification preferences updated successfully'
    });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    return res.status(500).json({
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

    return res.status(200).json({
      success: true,
      message: 'Push token registered successfully'
    });
  } catch (error) {
    console.error('Error registering push token:', error);
    return res.status(500).json({
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
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only super admin can test notification service'
      });
    }

    const config = await notificationService.testConfiguration();

    return res.status(200).json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Error testing notification service:', error);
    return res.status(500).json({
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

    const { page: pg, limit: lim, offset } = getPagination(page, limit);

    const parts = [];
    const vals = [];
    let i = 1;

    if (alertId) {
      parts.push(`cl.alert_id = $${i++}`);
      vals.push(parsePositiveInt(alertId));
    }
    if (userId) {
      parts.push(`cl.user_id = $${i++}`);
      vals.push(parsePositiveInt(userId));
    }
    if (channel) {
      parts.push(`cl.channel = $${i++}`);
      vals.push(String(channel));
    }
    if (status) {
      parts.push(`cl.status = $${i++}`);
      vals.push(String(status));
    }
    if (req.user.role !== 'super_admin') {
      parts.push(`a.society_id = $${i++}`);
      vals.push(req.user.society_id);
    }

    const where = buildWhere(parts, vals);

    // Data query
    const dataQuery = {
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
        ${where.text}
        ORDER BY cl.sent_at DESC
        LIMIT $${i} OFFSET $${i + 1}
      `,
      values: [...where.values, lim, offset]
    };

    const result = await pool.query(dataQuery);

    // Count query (same where, independent parameter numbering)
    const countQuery = {
      text: `
        SELECT COUNT(*) as total 
        FROM communication_logs cl
        JOIN alerts a ON cl.alert_id = a.id
        ${where.text}
      `,
      values: where.values
    };

    const countResult = await pool.query(countQuery);
    const total = Number.parseInt(countResult.rows[0].total, 10) || 0;

    return res.status(200).json({
      success: true,
      data: {
        logs: result.rows,
        pagination: {
          page: pg,
          limit: lim,
          total,
          totalPages: Math.ceil(total / lim)
        }
      }
    });
  } catch (error) {
    console.error('Error getting communication logs:', error);
    return res.status(500).json({
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
