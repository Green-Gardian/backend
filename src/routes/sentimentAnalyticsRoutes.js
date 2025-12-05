const express = require('express');
const router = express.Router();
const {
    getSentimentOverview,
    getDriverSentiment,
    getDriverRankings,
    getSentimentTrends,
    getUrgentFeedback,
    respondToFeedback,
    getSentimentByServiceType
} = require('../controllers/sentimentAnalyticsController');

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

router.get('/overview', requireAdmin, getSentimentOverview);
router.get('/trends', requireAdmin, getSentimentTrends);
router.get('/drivers/rankings', requireAdmin, getDriverRankings);
router.get('/drivers/:driverId', requireAdmin, getDriverSentiment);
router.get('/urgent', requireAdmin, getUrgentFeedback);
router.get('/service-types', requireAdmin, getSentimentByServiceType);
router.post('/feedback/:feedbackId/respond', requireAdmin, respondToFeedback);

module.exports = router;
