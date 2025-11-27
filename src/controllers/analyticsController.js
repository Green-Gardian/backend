const { pool } = require("../config/db");

// Customer Analytics
const getCustomerAnalytics = async (req, res) => {
  try {
    const currentUser = req.user;
    let societyFilter = "";
    let queryParams = [];

    // If admin, filter by their society (validate society_id is a number)
    if (currentUser.role === "admin" && currentUser.society_id) {
      const societyId = parseInt(currentUser.society_id);
      if (!isNaN(societyId)) {
        societyFilter = `AND u.society_id = $1`;
        queryParams = [societyId];
      }
    }

    // Total Customers (residents)
    const totalCustomersQuery = `
      SELECT COUNT(*) as count
      FROM users u
      WHERE u.role = 'resident' AND u.is_blocked = FALSE ${societyFilter}
    `;
    const totalCustomersResult = await pool.query(totalCustomersQuery, queryParams);
    const totalCustomers = parseInt(totalCustomersResult.rows[0].count) || 0;

    // Active Customers (verified and not blocked)
    const activeCustomersQuery = `
      SELECT COUNT(*) as count
      FROM users u
      WHERE u.role = 'resident' 
        AND u.is_verified = TRUE 
        AND u.is_blocked = FALSE ${societyFilter}
    `;
    const activeCustomersResult = await pool.query(activeCustomersQuery, queryParams);
    const activeCustomers = parseInt(activeCustomersResult.rows[0].count) || 0;

    // New This Month
    const newThisMonthQuery = `
      SELECT COUNT(*) as count
      FROM users u
      WHERE u.role = 'resident' 
        AND u.is_blocked = FALSE
        AND DATE_TRUNC('month', u.created_at) = DATE_TRUNC('month', CURRENT_DATE) ${societyFilter}
    `;
    const newThisMonthResult = await pool.query(newThisMonthQuery, queryParams);
    const newThisMonth = parseInt(newThisMonthResult.rows[0].count) || 0;

    // Premium Users (for now, we'll use a placeholder - users with service requests)
    const premiumUsersQuery = `
      SELECT COUNT(DISTINCT u.id) as count
      FROM users u
      INNER JOIN service_requests sr ON u.id = sr.user_id
      WHERE u.role = 'resident' 
        AND u.is_blocked = FALSE ${societyFilter}
    `;
    const premiumUsersResult = await pool.query(premiumUsersQuery, queryParams);
    const premiumUsers = parseInt(premiumUsersResult.rows[0].count) || 0;

    // Calculate previous month for comparison
    const previousMonthTotalQuery = `
      SELECT COUNT(*) as count
      FROM users u
      WHERE u.role = 'resident' 
        AND u.is_blocked = FALSE
        AND DATE_TRUNC('month', u.created_at) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') ${societyFilter}
    `;
    const previousMonthTotalResult = await pool.query(previousMonthTotalQuery, queryParams);
    const previousMonthTotal = parseInt(previousMonthTotalResult.rows[0].count) || 0;

    // Calculate percentage changes
    const calculatePercentageChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const totalCustomersChange = calculatePercentageChange(totalCustomers, previousMonthTotal);
    const activeCustomersChange = calculatePercentageChange(activeCustomers, previousMonthTotal);
    const newThisMonthChange = previousMonthTotal > 0
      ? ((newThisMonth - previousMonthTotal) / previousMonthTotal) * 100
      : (newThisMonth > 0 ? 100 : 0);
    const premiumUsersChange = 6.8; // Placeholder

    // Customer Growth Chart Data (Last 6 months)
    const growthChartQuery = `
      SELECT 
        TO_CHAR(DATE_TRUNC('month', created_at), 'Mon') as month,
        COUNT(*) as customers
      FROM users u
      WHERE role = 'resident' 
        AND is_blocked = FALSE
        AND created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '5 months')
        ${societyFilter}
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at)
    `;
    const growthChartResult = await pool.query(growthChartQuery, queryParams);

    // Format chart data
    const growthData = growthChartResult.rows.map(row => ({
      month: row.month,
      customers: parseInt(row.customers) || 0,
    }));

    // Fill in missing months with 0
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonthIndex = new Date().getMonth();
    const last6Months = [];
    for (let i = 5; i >= 0; i--) {
      const monthIndex = (currentMonthIndex - i + 12) % 12;
      const monthName = months[monthIndex];
      const existingData = growthData.find(d => d.month === monthName);
      last6Months.push({
        month: monthName,
        customers: existingData ? existingData.customers : 0,
      });
    }

    return res.status(200).json({
      metrics: {
        totalCustomers: {
          value: totalCustomers,
          change: totalCustomersChange.toFixed(1),
        },
        activeCustomers: {
          value: activeCustomers,
          change: activeCustomersChange.toFixed(1),
        },
        newThisMonth: {
          value: newThisMonth,
          change: newThisMonthChange.toFixed(1),
        },
        premiumUsers: {
          value: premiumUsers,
          change: premiumUsersChange.toFixed(1),
        },
      },
      chartData: last6Months,
    });
  } catch (error) {
    console.error("Error fetching customer analytics:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Staff Analytics
const getStaffAnalytics = async (req, res) => {
  try {
    const currentUser = req.user;
    let societyFilter = "";
    let queryParams = [];

    // If admin, filter by their society (validate society_id is a number)
    if (currentUser.role === "admin" && currentUser.society_id) {
      const societyId = parseInt(currentUser.society_id);
      if (!isNaN(societyId)) {
        societyFilter = `AND u.society_id = $1`;
        queryParams = [societyId];
      }
    }

    // Total Staff (customer_support, admin, driver - excluding super_admin and resident)
    const totalStaffQuery = `
      SELECT COUNT(*) as count
      FROM users u
      WHERE u.role IN ('customer_support', 'admin', 'driver')
        AND u.is_blocked = FALSE ${societyFilter}
    `;
    const totalStaffResult = await pool.query(totalStaffQuery, queryParams);
    const totalStaff = parseInt(totalStaffResult.rows[0].count) || 0;

    // On Duty (verified and not blocked - placeholder logic)
    const onDutyQuery = `
      SELECT COUNT(*) as count
      FROM users u
      WHERE u.role IN ('customer_support', 'admin', 'driver')
        AND u.is_verified = TRUE
        AND u.is_blocked = FALSE ${societyFilter}
    `;
    const onDutyResult = await pool.query(onDutyQuery, queryParams);
    const onDuty = parseInt(onDutyResult.rows[0].count) || 0;

    // On Leave (placeholder - we don't have a leave tracking system yet)
    const onLeave = 1; // Placeholder

    // Drivers
    const driversQuery = `
      SELECT COUNT(*) as count
      FROM users u
      WHERE u.role = 'driver'
        AND u.is_blocked = FALSE ${societyFilter}
    `;
    const driversResult = await pool.query(driversQuery, queryParams);
    const drivers = parseInt(driversResult.rows[0].count) || 0;

    // Calculate percentage changes (placeholder)
    const changePercentage = 6.08;

    // Staff Distribution by Role
    const staffDistributionQuery = `
      SELECT 
        u.role,
        COUNT(*) as count
      FROM users u
      WHERE u.role IN ('customer_support', 'admin', 'driver')
        AND u.is_blocked = FALSE ${societyFilter}
      GROUP BY u.role
    `;
    const staffDistributionResult = await pool.query(staffDistributionQuery, queryParams);

    // Format distribution data
    const roleMapping = {
      driver: "Drivers",
      customer_support: "Support",
      admin: "Management",
    };

    const distributionData = staffDistributionResult.rows.map(row => ({
      name: roleMapping[row.role] || row.role,
      value: parseInt(row.count) || 0,
    }));

    return res.status(200).json({
      metrics: {
        totalStaff: {
          value: totalStaff,
          change: changePercentage.toFixed(2),
        },
        onDuty: {
          value: onDuty,
          change: changePercentage.toFixed(2),
        },
        onLeave: {
          value: onLeave,
          change: changePercentage.toFixed(2),
        },
        drivers: {
          value: drivers,
          change: changePercentage.toFixed(2),
        },
      },
      distributionData: distributionData,
    });
  } catch (error) {
    console.error("Error fetching staff analytics:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Vehicle Analytics
const getVehicleAnalytics = async (req, res) => {
  try {
    const currentUser = req.user;
    let vehicleFilter = "";
    let queryParams = [];

    // Note: Vehicle table doesn't have society_id, so we don't filter by society
    // This matches the behavior of getVehicles endpoint which returns all vehicles for admins

    // Total Vehicles
    const totalVehiclesQuery = `
      SELECT COUNT(*) as count
      FROM vehicle v
      WHERE 1=1 ${vehicleFilter}
    `;
    const totalVehiclesResult = await pool.query(totalVehiclesQuery, queryParams);
    const totalVehicles = parseInt(totalVehiclesResult.rows[0].count) || 0;

    // Operational Vehicles (status = 'active' or 'available')
    const operationalQuery = `
      SELECT COUNT(*) as count
      FROM vehicle v
      WHERE v.status IN ('active', 'available') ${vehicleFilter}
    `;
    const operationalResult = await pool.query(operationalQuery, queryParams);
    const operational = parseInt(operationalResult.rows[0].count) || 0;

    // In Maintenance (status = 'maintenance' or similar)
    const inMaintenanceQuery = `
      SELECT COUNT(*) as count
      FROM vehicle v
      WHERE v.status IN ('maintenance', 'repair', 'inactive') ${vehicleFilter}
    `;
    const inMaintenanceResult = await pool.query(inMaintenanceQuery, queryParams);
    const inMaintenance = parseInt(inMaintenanceResult.rows[0].count) || 0;

    // Average Utilization (based on service requests in last 7 days)
    const utilizationQuery = `
      SELECT 
        COUNT(DISTINCT sr.id) as total_requests,
        COUNT(DISTINCT v.id) as active_vehicles
      FROM vehicle v
      LEFT JOIN service_requests sr ON sr.driver_id = v.user_id
        AND sr.created_at >= CURRENT_DATE - INTERVAL '7 days'
        AND sr.status IN ('completed', 'in_progress')
      WHERE v.status IN ('active', 'available') ${vehicleFilter}
    `;
    const utilizationResult = await pool.query(utilizationQuery, queryParams);

    const totalRequests = parseInt(utilizationResult.rows[0].total_requests) || 0;
    const activeVehicles = parseInt(utilizationResult.rows[0].active_vehicles) || 0;
    const avgUtilization = activeVehicles > 0
      ? Math.round((totalRequests / (activeVehicles * 7)) * 100)
      : 0;
    const avgUtilizationPercent = Math.min(avgUtilization, 100); // Cap at 100%

    // Calculate percentage changes (placeholder)
    const totalVehiclesChange = 4.5;
    const operationalChange = 2.1;
    const inMaintenanceChange = 1.2;
    const avgUtilizationChange = 3.2;

    // Vehicle Utilization Chart Data (Last 7 days)
    const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const utilizationChartQuery = `
      SELECT 
        TO_CHAR(DATE_TRUNC('day', sr.created_at), 'Dy') as day,
        COUNT(DISTINCT sr.id) as requests,
        COUNT(DISTINCT v.id) as vehicles
      FROM vehicle v
      LEFT JOIN service_requests sr ON sr.driver_id = v.user_id
        AND sr.created_at >= CURRENT_DATE - INTERVAL '6 days'
        AND sr.status IN ('completed', 'in_progress')
      WHERE v.status IN ('active', 'available') ${vehicleFilter}
      GROUP BY DATE_TRUNC('day', sr.created_at)
      ORDER BY DATE_TRUNC('day', sr.created_at)
    `;
    const utilizationChartResult = await pool.query(utilizationChartQuery, queryParams);

    // Get last 7 days
    const utilizationData = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dayName = daysOfWeek[date.getDay() === 0 ? 6 : date.getDay() - 1];

      const dayData = utilizationChartResult.rows.find(
        row => row.day === dayName
      );

      const requests = dayData ? parseInt(dayData.requests) || 0 : 0;
      const vehicles = dayData ? parseInt(dayData.vehicles) || 0 : activeVehicles || 1;
      const utilization = vehicles > 0 ? Math.round((requests / vehicles) * 100) : 0;

      utilizationData.push({
        day: dayName,
        utilization: Math.min(utilization, 100), // Cap at 100%
      });
    }

    return res.status(200).json({
      metrics: {
        totalVehicles: {
          value: totalVehicles,
          change: totalVehiclesChange.toFixed(1),
        },
        operational: {
          value: operational,
          change: operationalChange.toFixed(1),
        },
        inMaintenance: {
          value: inMaintenance,
          change: inMaintenanceChange.toFixed(1),
        },
        avgUtilization: {
          value: avgUtilizationPercent,
          change: avgUtilizationChange.toFixed(1),
        },
      },
      chartData: utilizationData,
    });
  } catch (error) {
    console.error("Error fetching vehicle analytics:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  getCustomerAnalytics,
  getStaffAnalytics,
  getVehicleAnalytics,
};

