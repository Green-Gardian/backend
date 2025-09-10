// routes/residentServiceRoutes.js
const express = require('express');
const router = express.Router();
const {
    // Service Types
    getServiceTypes,
    
    // Profile Management
    getUserProfile,
    updateUserProfile,
    
    // Address Management
    getUserAddresses,
    addUserAddress,
    updateUserAddress,
    deleteUserAddress,
    
    // Service Requests
    createServiceRequest,
    getUserServiceRequests,
    getServiceRequestById,
    cancelServiceRequest,
    
    // Feedback
    submitFeedback,
    getFeedback,
    
    // Messages
    getRequestMessages,
    sendMessage
} = require('../controllers/residentServiceController');

// // Middleware (assuming you have auth middleware)
// const authenticateToken = require('../middleware/auth'); // Your auth middleware

// // Apply authentication to all routes
// router.use(authenticateToken);


// ===== SERVICE TYPES ROUTES =====
router.get('/service-types', getServiceTypes);

// ===== USER PROFILE ROUTES =====
router.get('/profile', getUserProfile);
router.put('/profile', updateUserProfile);

// ===== USER ADDRESS ROUTES =====
router.get('/addresses', getUserAddresses);
router.post('/addresses', addUserAddress);
router.put('/addresses/:addressId', updateUserAddress);
router.delete('/addresses/:addressId', deleteUserAddress);

// ===== SERVICE REQUEST ROUTES =====

router.post('/service-requests', createServiceRequest);
router.get('/service-requests', getUserServiceRequests);
router.get('/service-requests/:requestId', getServiceRequestById);
router.put('/service-requests/:requestId/cancel', cancelServiceRequest);

// ===== FEEDBACK ROUTES =====

router.post('/service-requests/:requestId/feedback', submitFeedback);
router.get('/service-requests/:requestId/feedback', getFeedback);
router.get('/service-requests/:requestId/messages', getRequestMessages);
router.post('/service-requests/:requestId/messages', sendMessage);

module.exports = router;