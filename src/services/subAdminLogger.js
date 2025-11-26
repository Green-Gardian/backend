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
 * @param {String} filters.search - Search in description, username, email, or IP
 * @param {Date} filters.startDate - Filter logs from this date
 * @param {Date} filters.endDate - Filter logs until this date
 * @param {Number} filters.limit - Limit number of results (default: 100)
 * @param {Number} filters.offset - Offset for pagination (default: 0)
 * @returns {Promise<Object>} Returns { logs, total }
 */
async function getSubAdminLogs({
  subAdminId = null,
  activityType = null,
  search = null,
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

    if (search) {
      whereConditions.push(`(
        sal.activity_description ILIKE $${paramCount} OR
        u.username ILIKE $${paramCount} OR
        u.email ILIKE $${paramCount} OR
        u.first_name ILIKE $${paramCount} OR
        u.last_name ILIKE $${paramCount} OR
        sal.ip_address ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
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

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM sub_admin_activity_logs sal
      LEFT JOIN users u ON sal.sub_admin_id = u.id
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Add limit and offset for the main query
    params.push(limit);
    const limitParam = `$${paramCount}`;
    paramCount++;
    
    params.push(offset);
    const offsetParam = `$${paramCount}`;

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
    return { logs: result.rows, total };

  } catch (error) {
    console.error('Error retrieving sub-admin logs:', error);
    throw error;
  }
}

/**
 * Get activity log statistics (for all sub-admins or a specific one)
 * @param {Number} subAdminId - Optional sub-admin user ID (if null, returns stats for all)
 * @returns {Promise<Object>}
 */
async function getSubAdminStats(subAdminId = null) {
  try {
    const params = [];
    let whereClause = '';

    if (subAdminId) {
      whereClause = 'WHERE sub_admin_id = $1';
      params.push(subAdminId);
    }

    // Get stats by activity type
    const statsQuery = `
      SELECT 
        activity_type,
        COUNT(*) as count
      FROM sub_admin_activity_logs
      ${whereClause}
      GROUP BY activity_type
    `;
    const statsResult = await pool.query(statsQuery, params);

    // Get total activities
    const totalQuery = `
      SELECT COUNT(*) as total
      FROM sub_admin_activity_logs
      ${whereClause}
    `;
    const totalResult = await pool.query(totalQuery, params);

    // Get activities in last 24 hours
    const past24hQuery = `
      SELECT COUNT(*) as past24h
      FROM sub_admin_activity_logs
      ${whereClause ? whereClause + ' AND' : 'WHERE'} created_at >= NOW() - INTERVAL '24 hours'
    `;
    const past24hResult = await pool.query(past24hQuery, params);

    return {
      total: parseInt(totalResult.rows[0].total),
      past24h: parseInt(past24hResult.rows[0].past24h),
      last24Hours: parseInt(past24hResult.rows[0].past24h),
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