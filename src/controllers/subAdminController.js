// controllers/subAdminController.js
const { getSubAdminLogs, getSubAdminStats } = require("../services/subAdminLogger");

/**
 * Get activity logs with pagination and filters
 */
const getActivityLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      activityType,
      subAdminId,
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const offset = (pageNum - 1) * limitNum;

    const filters = {
      limit: limitNum,
      offset,
      search: search || null,
      activityType: activityType || null,
      subAdminId: subAdminId || null,
    };

    // If user is not super_admin, only show their own logs
    if (req.user.role !== "super_admin" && req.user.role !== "admin") {
      filters.subAdminId = req.user.id;
    }

    const { logs, total } = await getSubAdminLogs(filters);

    const totalPages = Math.ceil(total / limitNum);

    return res.status(200).json({
      success: true,
      logs,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems: total,
        limit: limitNum,
      },
    });
  } catch (error) {
    console.error("Error fetching activity logs:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch activity logs",
      message: error.message,
    });
  }
};

/**
 * Get activity log statistics
 */
const getActivityLogStats = async (req, res) => {
  try {
    // If user is not super_admin, only show their own stats
    const subAdminId = 
      req.user.role !== "super_admin" && req.user.role !== "admin"
        ? req.user.id
        : null;

    const stats = await getSubAdminStats(subAdminId);

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Error fetching activity log stats:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch activity log stats",
      message: error.message,
    });
  }
};

module.exports = {
  getActivityLogs,
  getActivityLogStats,
};

