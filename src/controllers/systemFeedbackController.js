const { pool } = require("../config/db");
const sentimentService = require("../services/sentimentAnalysisService");

const submitSystemFeedback = async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const societyId = req.user.society_id || null;

        const {
            category,
            feedbackType,
            priority = 'medium',
            title,
            description,
            stepsToReproduce,
            expectedBehavior,
            actualBehavior,
            screenshotUrl,
            deviceInfo = {},
            rating
        } = req.body;

        if (!category || !feedbackType || !title || !description) {
            return res.status(400).json({
                success: false,
                message: "Category, feedback type, title, and description are required"
            });
        }

        if (title.trim().length < 5) {
            return res.status(400).json({
                success: false,
                message: "Title must be at least 5 characters long"
            });
        }

        if (description.trim().length < 10) {
            return res.status(400).json({
                success: false,
                message: "Description must be at least 10 characters long"
            });
        }

        let sentimentData = null;
        try {
            sentimentData = await sentimentService.analyzeFeedback(
                description,
                stepsToReproduce || expectedBehavior || actualBehavior,
                { overall_rating: rating || 3 }
            );
            console.log(sentimentData)
        } catch (error) {
            console.error('Sentiment analysis failed in system feedback:', error);
        }

        const query = `
      INSERT INTO system_feedback (
        user_id, user_role, society_id,
        category, feedback_type, priority,
        title, description,
        steps_to_reproduce, expected_behavior, actual_behavior,
        screenshot_url, device_info, rating,
        sentiment_score, sentiment_label, key_themes, 
        requires_urgent_attention, sentiment_summary, sentiment_analyzed_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20
      ) RETURNING *
    `;

        const values = [
            userId,
            userRole,
            societyId,
            category,
            feedbackType,
            priority,
            title.trim(),
            description.trim(),
            stepsToReproduce?.trim() || null,
            expectedBehavior?.trim() || null,
            actualBehavior?.trim() || null,
            screenshotUrl || null,
            JSON.stringify(deviceInfo),
            rating || null,
            sentimentData?.sentiment_score || null,
            sentimentData?.sentiment_label || null,
            sentimentData?.key_themes ? JSON.stringify(sentimentData.key_themes) : null,
            sentimentData?.requires_urgent_attention || false,
            sentimentData?.summary || null,
            sentimentData ? new Date() : null
        ];

        const result = await pool.query(query, values);

        return res.status(201).json({
            success: true,
            message: "Feedback submitted successfully. Thank you for helping us improve!",
            feedback: result.rows[0],
            sentiment: sentimentData
        });
    } catch (error) {
        console.error("Error submitting system feedback:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to submit feedback",
            error: error.message
        });
    }
};

const getMyFeedback = async (req, res) => {
    try {
        const userId = req.user.id;
        const { status, category, limit = 20, offset = 0 } = req.query;

        let filters = ['user_id = $1'];
        const params = [userId];
        let paramCount = 1;

        if (status) {
            paramCount++;
            filters.push(`status = $${paramCount}`);
            params.push(status);
        }

        if (category) {
            paramCount++;
            filters.push(`category = $${paramCount}`);
            params.push(category);
        }

        const whereClause = filters.join(' AND ');

        const query = `
      SELECT 
        sf.*,
        admin_user.first_name as admin_first_name,
        admin_user.last_name as admin_last_name,
        (SELECT COUNT(*) FROM system_feedback_upvotes WHERE feedback_id = sf.id) as upvote_count
      FROM system_feedback sf
      LEFT JOIN users admin_user ON sf.admin_responded_by = admin_user.id
      WHERE ${whereClause}
      ORDER BY sf.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

        params.push(limit, offset);

        const result = await pool.query(query, params);

        const countQuery = `SELECT COUNT(*) FROM system_feedback WHERE ${whereClause}`;
        const countResult = await pool.query(countQuery, params.slice(0, paramCount));

        return res.status(200).json({
            success: true,
            feedback: result.rows,
            total: parseInt(countResult.rows[0].count, 10),
            pagination: {
                limit: parseInt(limit, 10),
                offset: parseInt(offset, 10)
            }
        });
    } catch (error) {
        console.error("Error getting my feedback:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to get feedback",
            error: error.message
        });
    }
};

const getAllSystemFeedback = async (req, res) => {
    try {
        const {
            status,
            category,
            feedbackType,
            priority,
            sentiment,
            urgent,
            userRole,
            limit = 50,
            offset = 0
        } = req.query;

        let filters = [];
        const params = [];
        let paramCount = 0;

        if (status) {
            paramCount++;
            filters.push(`sf.status = $${paramCount}`);
            params.push(status);
        }

        if (category) {
            paramCount++;
            filters.push(`sf.category = $${paramCount}`);
            params.push(category);
        }

        if (feedbackType) {
            paramCount++;
            filters.push(`sf.feedback_type = $${paramCount}`);
            params.push(feedbackType);
        }

        if (priority) {
            paramCount++;
            filters.push(`sf.priority = $${paramCount}`);
            params.push(priority);
        }

        if (sentiment) {
            paramCount++;
            filters.push(`sf.sentiment_label = $${paramCount}`);
            params.push(sentiment);
        }

        if (urgent === 'true') {
            filters.push('sf.requires_urgent_attention = true');
        }

        if (userRole) {
            paramCount++;
            filters.push(`sf.user_role = $${paramCount}`);
            params.push(userRole);
        }

        const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

        const query = `
      SELECT 
        sf.*,
        u.first_name,
        u.last_name,
        u.email,
        u.phone_number,
        admin_user.first_name as admin_first_name,
        admin_user.last_name as admin_last_name,
        (SELECT COUNT(*) FROM system_feedback_comments WHERE feedback_id = sf.id) as comment_count
      FROM system_feedback sf
      JOIN users u ON sf.user_id = u.id
      LEFT JOIN users admin_user ON sf.admin_responded_by = admin_user.id
      ${whereClause}
      ORDER BY 
        CASE WHEN sf.requires_urgent_attention THEN 0 ELSE 1 END,
        sf.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

        params.push(limit, offset);

        const result = await pool.query(query, params);

        const countQuery = `SELECT COUNT(*) FROM system_feedback sf ${whereClause}`;
        const countResult = await pool.query(countQuery, params.slice(0, paramCount));

        return res.status(200).json({
            success: true,
            feedback: result.rows,
            total: parseInt(countResult.rows[0].count, 10),
            pagination: {
                limit: parseInt(limit, 10),
                offset: parseInt(offset, 10)
            }
        });
    } catch (error) {
        console.error("Error getting all system feedback:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to get feedback",
            error: error.message
        });
    }
};

const getFeedbackById = async (req, res) => {
    try {
        const feedbackId = parseInt(req.params.feedbackId, 10);
        const userId = req.user.id;
        const userRole = req.user.role;

        if (isNaN(feedbackId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid feedback ID"
            });
        }

        const query = `
      SELECT 
        sf.*,
        u.first_name,
        u.last_name,
        u.email,
        admin_user.first_name as admin_first_name,
        admin_user.last_name as admin_last_name
      FROM system_feedback sf
      JOIN users u ON sf.user_id = u.id
      LEFT JOIN users admin_user ON sf.admin_responded_by = admin_user.id
      WHERE sf.id = $1
    `;

        const result = await pool.query(query, [feedbackId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Feedback not found"
            });
        }

        const feedback = result.rows[0];

        // Check authorization
        const isAdmin = ['admin', 'super_admin', 'sub_admin'].includes(userRole);
        const isOwner = feedback.user_id === userId;

        if (!isAdmin && !isOwner) {
            return res.status(403).json({
                success: false,
                message: "Access denied"
            });
        }

        // Get comments if admin
        let comments = [];
        if (isAdmin) {
            const commentsQuery = `
        SELECT 
          c.*,
          u.first_name,
          u.last_name,
          u.role
        FROM system_feedback_comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.feedback_id = $1
        ORDER BY c.created_at ASC
      `;
            const commentsResult = await pool.query(commentsQuery, [feedbackId]);
            comments = commentsResult.rows;
        }

        return res.status(200).json({
            success: true,
            feedback,
            comments
        });
    } catch (error) {
        console.error("Error getting feedback by ID:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to get feedback",
            error: error.message
        });
    }
};

const updateFeedbackStatus = async (req, res) => {
    try {
        const feedbackId = parseInt(req.params.feedbackId, 10);
        const { status, resolutionNotes } = req.body;
        const adminId = req.user.id;

        if (isNaN(feedbackId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid feedback ID"
            });
        }

        if (!status) {
            return res.status(400).json({
                success: false,
                message: "Status is required"
            });
        }

        const validStatuses = ['open', 'acknowledged', 'in_progress', 'resolved', 'closed', 'wont_fix'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            });
        }

        let query;
        let params;

        if (status === 'resolved' || status === 'closed') {
            query = `
        UPDATE system_feedback
        SET status = $1, 
            resolution_notes = $2,
            resolved_by = $3,
            resolved_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING *
      `;
            params = [status, resolutionNotes || null, adminId, feedbackId];
        } else {
            query = `
        UPDATE system_feedback
        SET status = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;
            params = [status, feedbackId];
        }

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Feedback not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Feedback status updated successfully",
            feedback: result.rows[0]
        });
    } catch (error) {
        console.error("Error updating feedback status:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update feedback status",
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
      UPDATE system_feedback
      SET 
        admin_response = $1,
        admin_responded_by = $2,
        admin_responded_at = CURRENT_TIMESTAMP,
        status = CASE WHEN status = 'open' THEN 'acknowledged' ELSE status END,
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

const upvoteFeedback = async (req, res) => {
    try {
        const feedbackId = parseInt(req.params.feedbackId, 10);
        const userId = req.user.id;

        if (isNaN(feedbackId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid feedback ID"
            });
        }

        // Check if already upvoted
        const checkQuery = `
      SELECT id FROM system_feedback_upvotes 
      WHERE feedback_id = $1 AND user_id = $2
    `;
        const checkResult = await pool.query(checkQuery, [feedbackId, userId]);

        if (checkResult.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: "You have already upvoted this feedback"
            });
        }

        // Add upvote
        const insertQuery = `
      INSERT INTO system_feedback_upvotes (feedback_id, user_id)
      VALUES ($1, $2)
      RETURNING *
    `;
        await pool.query(insertQuery, [feedbackId, userId]);

        // Get updated count
        const countQuery = `
      SELECT upvotes FROM system_feedback WHERE id = $1
    `;
        const countResult = await pool.query(countQuery, [feedbackId]);

        return res.status(200).json({
            success: true,
            message: "Feedback upvoted successfully",
            upvotes: countResult.rows[0]?.upvotes || 0
        });
    } catch (error) {
        console.error("Error upvoting feedback:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to upvote feedback",
            error: error.message
        });
    }
};

const removeUpvote = async (req, res) => {
    try {
        const feedbackId = parseInt(req.params.feedbackId, 10);
        const userId = req.user.id;

        if (isNaN(feedbackId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid feedback ID"
            });
        }

        const deleteQuery = `
      DELETE FROM system_feedback_upvotes 
      WHERE feedback_id = $1 AND user_id = $2
      RETURNING *
    `;
        const result = await pool.query(deleteQuery, [feedbackId, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Upvote not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Upvote removed successfully"
        });
    } catch (error) {
        console.error("Error removing upvote:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to remove upvote",
            error: error.message
        });
    }
};

const getFeedbackStats = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        let dateFilter = '';
        const params = [];

        if (startDate && endDate) {
            dateFilter = 'WHERE created_at BETWEEN $1 AND $2';
            params.push(startDate, endDate);
        }

        const query = `
      SELECT 
        COUNT(*) as total_feedback,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved_count,
        SUM(CASE WHEN requires_urgent_attention THEN 1 ELSE 0 END) as urgent_count,
        AVG(sentiment_score) as avg_sentiment_score,
        
        -- By category
        jsonb_object_agg(
          category::text, 
          (SELECT COUNT(*) FROM system_feedback sf2 WHERE sf2.category = sf.category ${dateFilter ? 'AND sf2.created_at BETWEEN $1 AND $2' : ''})
        ) FILTER (WHERE category IS NOT NULL) as by_category,
        
        -- By type
        jsonb_object_agg(
          feedback_type::text,
          (SELECT COUNT(*) FROM system_feedback sf2 WHERE sf2.feedback_type = sf.feedback_type ${dateFilter ? 'AND sf2.created_at BETWEEN $1 AND $2' : ''})
        ) FILTER (WHERE feedback_type IS NOT NULL) as by_type,
        
        -- By role
        jsonb_object_agg(
          user_role,
          (SELECT COUNT(*) FROM system_feedback sf2 WHERE sf2.user_role = sf.user_role ${dateFilter ? 'AND sf2.created_at BETWEEN $1 AND $2' : ''})
        ) FILTER (WHERE user_role IS NOT NULL) as by_role
      FROM system_feedback sf
      ${dateFilter}
    `;

        const result = await pool.query(query, params);

        return res.status(200).json({
            success: true,
            stats: result.rows[0]
        });
    } catch (error) {
        console.error("Error getting feedback stats:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to get feedback statistics",
            error: error.message
        });
    }
};

module.exports = {
    submitSystemFeedback,
    getMyFeedback,
    getAllSystemFeedback,
    getFeedbackById,
    updateFeedbackStatus,
    respondToFeedback,
    upvoteFeedback,
    removeUpvote,
    getFeedbackStats
};
