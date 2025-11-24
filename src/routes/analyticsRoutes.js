const Router = require('express').Router();
const { getCustomerAnalytics, getStaffAnalytics, getVehicleAnalytics } = require('../controllers/analyticsController');
const { verifyToken, verifyAdminOrSuperAdmin } = require('../middlewares/authMiddleware');

// All analytics routes require authentication and admin/super_admin role
Router.get('/customers', verifyToken, verifyAdminOrSuperAdmin, getCustomerAnalytics);
Router.get('/staff', verifyToken, verifyAdminOrSuperAdmin, getStaffAnalytics);
Router.get('/vehicles', verifyToken, verifyAdminOrSuperAdmin, getVehicleAnalytics);

module.exports = Router;

