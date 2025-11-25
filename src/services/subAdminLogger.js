// services/subAdminLogger.js
const { pool } = require("../config/db");

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
    const ipAddress = req ? (req.ip || req.connection?.remoteAddress || null) : null;
    const userAgent = req ? (req.get('user-agent') || null) : null;
    const metadataJson = metadata ? JSON.stringify(metadata) : null;

    const insertQuery = `
      INSERT INTO sub_admin_activity_logs 
        (sub_admin_id, activity_type, activity_description, ip_address, user_agent, metadata) 
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    await pool.query(insertQuery, [
      subAdminId,
      activityType,
      description,
      ipAddress,
      userAgent,
      metadataJson
    ]);

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
    const params = [];
    let paramCount = 1;
    let whereConditions = [];

    // Build WHERE conditions dynamically
    if (subAdminId) {
      whereConditions.push(`sal.sub_admin_id = $${paramCount}`);
      params.push(subAdminId);
      paramCount++;
    }

    if (activityType) {
      whereConditions.push(`sal.activity_type = $${paramCount}`);
      params.push(activityType);
      paramCount++;
    }

    if (startDate) {
      whereConditions.push(`sal.created_at >= $${paramCount}`);
      params.push(startDate);
      paramCount++;
    }

    if (endDate) {
      whereConditions.push(`sal.created_at <= $${paramCount}`);
      params.push(endDate);
      paramCount++;
    }

    // Add limit and offset
    params.push(limit);
    const limitParam = `$${paramCount}`;
    paramCount++;
    
    params.push(offset);
    const offsetParam = `$${paramCount}`;

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    const query = `
      SELECT 
        sal.*,
        u.username,
        u.first_name,
        u.last_name,
        u.email
      FROM sub_admin_activity_logs sal
      LEFT JOIN users u ON sal.sub_admin_id = u.id
      ${whereClause}
      ORDER BY sal.created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const result = await pool.query(query, params);
    return result.rows;

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
    // Get stats by activity type
    const statsQuery = `
      SELECT 
        activity_type,
        COUNT(*) as count
      FROM sub_admin_activity_logs
      WHERE sub_admin_id = $1
      GROUP BY activity_type
    `;
    const statsResult = await pool.query(statsQuery, [subAdminId]);

    // Get total activities
    const totalQuery = `
      SELECT COUNT(*) as total
      FROM sub_admin_activity_logs
      WHERE sub_admin_id = $1
    `;
    const totalResult = await pool.query(totalQuery, [subAdminId]);

    return {
      total: parseInt(totalResult.rows[0].total),
      byType: statsResult.rows.map(row => ({
        activityType: row.activity_type,
        count: parseInt(row.count)
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