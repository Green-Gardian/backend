// services/subAdminLogger.js
const knex = require('../db/knex'); // Adjust path to your knex instance

/**
 * Log sub-admin activity
 * @param {Object} options - Logging options
 * @param {Number|Object} options.subAdmin - Sub-admin user ID or user object
 * @param {String} options.activityType - Type of activity (e.g., 'CREATE_USER', 'UPDATE_DRIVER', 'DELETE_BOOKING')
 * @param {String} options.description - Human-readable description of the activity
 * @param {Object} options.req - Optional Express request object for IP and user agent
 * @param {Object} options.metadata - Optional additional data (e.g., affected resource IDs, old/new values)
 * @returns {Promise<void>}
 */
async function logSubAdminActivity({
  subAdmin,
  activityType,
  description,
  req = null,
  metadata = null
}) {
  try {
    // Extract sub-admin ID
    const subAdminId = typeof subAdmin === 'object' ? subAdmin.id : subAdmin;

    if (!subAdminId) {
      console.error('Sub-admin ID is required for activity logging');
      return;
    }

    // Prepare log data
    const logData = {
      sub_admin_id: subAdminId,
      activity_type: activityType,
      activity_description: description,
      ip_address: req ? (req.ip || req.connection?.remoteAddress || null) : null,
      user_agent: req ? (req.get('user-agent') || null) : null,
      metadata: metadata ? JSON.stringify(metadata) : null
    };

    // Insert log into database
    await knex('sub_admin_activity_logs').insert(logData);

  } catch (error) {
    // Log error but don't throw to prevent breaking the main operation
    console.error('Error logging sub-admin activity:', error);
  }
}

/**
 * Retrieve sub-admin activity logs with filters
 * @param {Object} filters - Query filters
 * @param {Number} filters.subAdminId - Filter by sub-admin ID
 * @param {String} filters.activityType - Filter by activity type
 * @param {Date} filters.startDate - Filter logs from this date
 * @param {Date} filters.endDate - Filter logs until this date
 * @param {Number} filters.limit - Limit number of results (default: 100)
 * @param {Number} filters.offset - Offset for pagination (default: 0)
 * @returns {Promise<Array>}
 */
async function getSubAdminLogs({
  subAdminId = null,
  activityType = null,
  startDate = null,
  endDate = null,
  limit = 100,
  offset = 0
} = {}) {
  try {
    let query = knex('sub_admin_activity_logs')
      .select(
        'sub_admin_activity_logs.*',
        'users.username',
        'users.first_name',
        'users.last_name',
        'users.email'
      )
      .leftJoin('users', 'sub_admin_activity_logs.sub_admin_id', 'users.id')
      .orderBy('sub_admin_activity_logs.created_at', 'desc');

    // Apply filters
    if (subAdminId) {
      query = query.where('sub_admin_activity_logs.sub_admin_id', subAdminId);
    }

    if (activityType) {
      query = query.where('sub_admin_activity_logs.activity_type', activityType);
    }

    if (startDate) {
      query = query.where('sub_admin_activity_logs.created_at', '>=', startDate);
    }

    if (endDate) {
      query = query.where('sub_admin_activity_logs.created_at', '<=', endDate);
    }

    // Apply pagination
    query = query.limit(limit).offset(offset);

    const logs = await query;
    return logs;

  } catch (error) {
    console.error('Error retrieving sub-admin logs:', error);
    throw error;
  }
}

/**
 * Get activity log statistics for a sub-admin
 * @param {Number} subAdminId - Sub-admin user ID
 * @returns {Promise<Object>}
 */
async function getSubAdminStats(subAdminId) {
  try {
    const stats = await knex('sub_admin_activity_logs')
      .where('sub_admin_id', subAdminId)
      .select('activity_type')
      .count('* as count')
      .groupBy('activity_type');

    const totalActivities = await knex('sub_admin_activity_logs')
      .where('sub_admin_id', subAdminId)
      .count('* as total')
      .first();

    return {
      total: parseInt(totalActivities.total),
      byType: stats.map(stat => ({
        activityType: stat.activity_type,
        count: parseInt(stat.count)
      }))
    };

  } catch (error) {
    console.error('Error retrieving sub-admin stats:', error);
    throw error;
  }
}

module.exports = {
  logSubAdminActivity,
  getSubAdminLogs,
  getSubAdminStats
};