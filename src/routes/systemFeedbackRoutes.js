const express = require('express');
const router = express.Router();
const {
    submitSystemFeedback,
    getMyFeedback,
    getAllSystemFeedback,
    getFeedbackById,
    updateFeedbackStatus,
    respondToFeedback,
    upvoteFeedback,
    removeUpvote,
    getFeedbackStats
} = require('../controllers/systemFeedbackController');

const requireAuth = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }
    next();
};

const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }

    const allowedRoles = ['admin', 'super_admin', 'sub_admin'];
    if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Admin privileges required.'
        });
    }

    next();
};

router.post('/', requireAuth, submitSystemFeedback);
router.get('/my-feedback', requireAuth, getMyFeedback);
router.get('/all', requireAdmin, getAllSystemFeedback);
router.get('/stats', requireAdmin, getFeedbackStats);
router.get('/:feedbackId', requireAuth, getFeedbackById);
router.patch('/:feedbackId/status', requireAdmin, updateFeedbackStatus);
router.post('/:feedbackId/respond', requireAdmin, respondToFeedback);
router.post('/:feedbackId/upvote', requireAuth, upvoteFeedback);
router.delete('/:feedbackId/upvote', requireAuth, removeUpvote);

module.exports = router;
