const { pool } = require("../config/db");
const sentimentService = require("../services/sentimentAnalysisService");

const getSentimentOverview = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        let dateFilter = '';
        const params = [];

        if (startDate && endDate) {
            dateFilter = 'WHERE sf.created_at BETWEEN $1 AND $2';
            params.push(startDate, endDate);
        }

        const query = `
      SELECT 
        COUNT(*) as total_feedback,
        AVG(sf.sentiment_score) as avg_sentiment_score,
        AVG(sf.overall_rating) as avg_rating,
        
        SUM(CASE WHEN sf.sentiment_label = 'very_positive' THEN 1 ELSE 0 END) as very_positive_count,
        SUM(CASE WHEN sf.sentiment_label = 'positive' THEN 1 ELSE 0 END) as positive_count,
        SUM(CASE WHEN sf.sentiment_label = 'neutral' THEN 1 ELSE 0 END) as neutral_count,
        SUM(CASE WHEN sf.sentiment_label = 'negative' THEN 1 ELSE 0 END) as negative_count,
        SUM(CASE WHEN sf.sentiment_label = 'very_negative' THEN 1 ELSE 0 END) as very_negative_count,
        
        SUM(CASE WHEN sf.requires_urgent_attention = true THEN 1 ELSE 0 END) as urgent_feedback_count
      FROM service_feedback sf
      ${dateFilter}
    `;

        const result = await pool.query(query, params);
        const data = result.rows[0];

        return res.status(200).json({
            success: true,
            overview: {
                total_feedback: parseInt(data.total_feedback, 10),
                avg_sentiment_score: data.avg_sentiment_score ? parseFloat(data.avg_sentiment_score).toFixed(2) : null,
                avg_rating: data.avg_rating ? parseFloat(data.avg_rating).toFixed(2) : null,
                distribution: {
                    very_positive: parseInt(data.very_positive_count, 10),
                    positive: parseInt(data.positive_count, 10),
                    neutral: parseInt(data.neutral_count, 10),
                    negative: parseInt(data.negative_count, 10),
                    very_negative: parseInt(data.very_negative_count, 10),
                },
                urgent_feedback_count: parseInt(data.urgent_feedback_count, 10),
            }
        });
    } catch (error) {
        console.error("Error getting sentiment overview:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to get sentiment overview",
            error: error.message
        });
    }
};

const getDriverSentiment = async (req, res) => {
    try {
        const driverId = parseInt(req.params.driverId, 10);
        const { startDate, endDate } = req.query;

        if (isNaN(driverId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid driver ID"
            });
        }

        const driverQuery = await pool.query(
            'SELECT id, first_name, last_name, email FROM users WHERE id = $1 AND role = $2',
            [driverId, 'driver']
        );

        if (driverQuery.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Driver not found"
            });
        }

        const driver = driverQuery.rows[0];

        const sentimentSummary = await sentimentService.getDriverSentimentSummary(
            driverId,
            startDate,
            endDate
        );

        return res.status(200).json({
            success: true,
            driver: {
                id: driver.id,
                name: `${driver.first_name} ${driver.last_name}`,
                email: driver.email
            },
            sentiment: sentimentSummary
        });
    } catch (error) {
        console.error("Error getting driver sentiment:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to get driver sentiment",
            error: error.message
        });
    }
};

const getDriverRankings = async (req, res) => {
    try {
        const { startDate, endDate, minFeedback = 5 } = req.query;

        let dateFilter = '';
        const params = [minFeedback];

        if (startDate && endDate) {
            dateFilter = 'AND sf.created_at BETWEEN $2 AND $3';
            params.push(startDate, endDate);
        }

        const query = `
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        COUNT(sf.id) as total_feedback,
        AVG(sf.sentiment_score) as avg_sentiment_score,
        AVG(sf.overall_rating) as avg_rating,
        SUM(CASE WHEN sf.sentiment_label IN ('positive', 'very_positive') THEN 1 ELSE 0 END) as positive_feedback,
        SUM(CASE WHEN sf.sentiment_label IN ('negative', 'very_negative') THEN 1 ELSE 0 END) as negative_feedback
      FROM users u
      INNER JOIN service_feedback sf ON u.id = sf.driver_id
      WHERE u.role = 'driver' 
        AND sf.sentiment_score IS NOT NULL
        ${dateFilter}
      GROUP BY u.id, u.first_name, u.last_name, u.email
      HAVING COUNT(sf.id) >= $1
      ORDER BY avg_sentiment_score DESC
    `;

        const result = await pool.query(query, params);

        const rankings = result.rows.map((row, index) => ({
            rank: index + 1,
            driver: {
                id: row.id,
                name: `${row.first_name} ${row.last_name}`,
                email: row.email
            },
            stats: {
                total_feedback: parseInt(row.total_feedback, 10),
                avg_sentiment_score: parseFloat(row.avg_sentiment_score).toFixed(2),
                avg_rating: parseFloat(row.avg_rating).toFixed(2),
                positive_feedback: parseInt(row.positive_feedback, 10),
                negative_feedback: parseInt(row.negative_feedback, 10)
            }
        }));

        return res.status(200).json({
            success: true,
            rankings
        });
    } catch (error) {
        console.error("Error getting driver rankings:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to get driver rankings",
            error: error.message
        });
    }
};

const getSentimentTrends = async (req, res) => {
    try {
        const { groupBy = 'week', limit = 12 } = req.query;

        const trends = await sentimentService.getSentimentTrends(groupBy, parseInt(limit, 10));

        return res.status(200).json({
            success: true,
            trends
        });
    } catch (error) {
        console.error("Error getting sentiment trends:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to get sentiment trends",
            error: error.message
        });
    }
};

const getUrgentFeedback = async (req, res) => {
    try {
        const { limit = 20, offset = 0 } = req.query;

        const query = `
      SELECT 
        sf.*,
        sr.title as request_title,
        sr.request_number,
        u.first_name as resident_first_name,
        u.last_name as resident_last_name,
        u.phone_number as resident_phone,
        d.first_name as driver_first_name,
        d.last_name as driver_last_name
      FROM service_feedback sf
      INNER JOIN service_requests sr ON sf.service_request_id = sr.id
      INNER JOIN users u ON sf.user_id = u.id
      LEFT JOIN users d ON sf.driver_id = d.id
      WHERE sf.requires_urgent_attention = true
        AND (sf.admin_response IS NULL OR sf.admin_response = '')
      ORDER BY sf.created_at DESC
      LIMIT $1 OFFSET $2
    `;

        const result = await pool.query(query, [limit, offset]);

        const countQuery = await pool.query(
            'SELECT COUNT(*) FROM service_feedback WHERE requires_urgent_attention = true AND (admin_response IS NULL OR admin_response = \'\')'
        );

        return res.status(200).json({
            success: true,
            urgent_feedback: result.rows,
            total: parseInt(countQuery.rows[0].count, 10)
        });
    } catch (error) {
        console.error("Error getting urgent feedback:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to get urgent feedback",
            error: error.message
        });
    }
};

const respondToFeedback = async (req, res) => {
    try {
        const feedbackId = parseInt(req.params.feedbackId, 10);
        const { response } = req.body;
        const adminId = req.user.id;

        if (isNaN(feedbackId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid feedback ID"
            });
        }

        if (!response || !response.trim()) {
            return res.status(400).json({
                success: false,
                message: "Response text is required"
            });
        }

        const query = `
      UPDATE service_feedback
      SET 
        admin_response = $1,
        admin_responded_by = $2,
        admin_responded_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;

        const result = await pool.query(query, [response.trim(), adminId, feedbackId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Feedback not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Response submitted successfully",
            feedback: result.rows[0]
        });
    } catch (error) {
        console.error("Error responding to feedback:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to submit response",
            error: error.message
        });
    }
};

const getSentimentByServiceType = async (req, res) => {
    try {
        const query = `
      SELECT 
        st.id,
        st.name,
        st.category,
        COUNT(sf.id) as total_feedback,
        AVG(sf.sentiment_score) as avg_sentiment_score,
        AVG(sf.overall_rating) as avg_rating,
        SUM(CASE WHEN sf.sentiment_label IN ('positive', 'very_positive') THEN 1 ELSE 0 END) as positive_count,
        SUM(CASE WHEN sf.sentiment_label IN ('negative', 'very_negative') THEN 1 ELSE 0 END) as negative_count
      FROM service_types st
      LEFT JOIN service_requests sr ON st.id = sr.service_type_id
      LEFT JOIN service_feedback sf ON sr.id = sf.service_request_id
      WHERE sf.sentiment_score IS NOT NULL
      GROUP BY st.id, st.name, st.category
      ORDER BY avg_sentiment_score DESC
    `;

        const result = await pool.query(query);

        return res.status(200).json({
            success: true,
            service_types: result.rows
        });
    } catch (error) {
        console.error("Error getting sentiment by service type:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to get sentiment by service type",
            error: error.message
        });
    }
};

module.exports = {
    getSentimentOverview,
    getDriverSentiment,
    getDriverRankings,
    getSentimentTrends,
    getUrgentFeedback,
    respondToFeedback,
    getSentimentByServiceType
};
