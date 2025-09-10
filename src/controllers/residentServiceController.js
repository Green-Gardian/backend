// controllers/residentServiceController.js
const { request } = require("express");
const { pool } = require("../config/db");

// ===== SERVICE TYPES =====
const getServiceTypes = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM service_types 
            WHERE is_active = true 
            ORDER BY category, name
        `);
        return res.status(200).json({
            success: true,
            serviceTypes: result.rows
        });
    } catch (error) {
        console.error('Get service types error:', error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// ===== USER PROFILE MANAGEMENT =====
const getUserProfile = async (req, res) => {
    const userId = req.user.id; // From auth middleware
    
    try {
        const query = {
            text: `
                SELECT up.*, u.first_name, u.last_name, u.email, u.phone_number 
                FROM user_profiles up
                RIGHT JOIN users u ON u.id = up.user_id
                WHERE u.id = $1
            `,
            values: [userId]
        };
        const result = await pool.query(query);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        
        return res.status(200).json({
            success: true,
            profile: result.rows[0]
        });
    } catch (error) {
        console.error('Get user profile error:', error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

const updateUserProfile = async (req, res) => {
    const userId = req.user.id;
    const { emergencyContactName, emergencyContactPhone, preferredCollectionTime } = req.body;

    try {
        const query = {
            text: `
                INSERT INTO user_profiles (user_id, emergency_contact_name, emergency_contact_phone, preferred_collection_time)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (user_id) 
                DO UPDATE SET 
                    emergency_contact_name = $2,
                    emergency_contact_phone = $3,
                    preferred_collection_time = $4,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *
            `,
            values: [userId, emergencyContactName, emergencyContactPhone, preferredCollectionTime]
        };
        
        const result = await pool.query(query);
        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            profile: result.rows[0]
        });
    } catch (error) {
        console.error('Update user profile error:', error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// ===== USER ADDRESSES =====
const getUserAddresses = async (req, res) => {
    const userId = req.user.id;
    
    try {
        const query = {
            text: `SELECT * FROM user_addresses WHERE user_id = $1 AND is_active = true ORDER BY is_default DESC, created_at ASC`,
            values: [userId]
        };
        const result = await pool.query(query);
        
        return res.status(200).json({
            success: true,
            addresses: result.rows
        });
    } catch (error) {
        console.error('Get user addresses error:', error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

const addUserAddress = async (req, res) => {
    const userId = req.user.id;
    const { addressType, streetAddress, apartmentUnit, area, city, postalCode, landmark, isDefault } = req.body;

    if (!streetAddress || !city) {
        return res.status(400).json({ success: false, message: "Street address and city are required" });
    }

    try {
        // If this is set as default, remove default from other addresses
        if (isDefault) {
            await pool.query({
                text: `UPDATE user_addresses SET is_default = false WHERE user_id = $1`,
                values: [userId]
            });
        }

        const query = {
            text: `
                INSERT INTO user_addresses 
                (user_id, address_type, street_address, apartment_unit, area, city, postal_code, landmark, is_default)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
            `,
            values: [userId, addressType, streetAddress, apartmentUnit, area, city, postalCode, landmark, isDefault]
        };
        
        const result = await pool.query(query);
        return res.status(201).json({
            success: true,
            message: "Address added successfully",
            address: result.rows[0]
        });
    } catch (error) {
        console.error('Add user address error:', error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

const updateUserAddress = async (req, res) => {
    const userId = req.user.id;
    const { addressId } = req.params;
    const { addressType, streetAddress, apartmentUnit, area, city, postalCode, landmark, isDefault } = req.body;

    if (!streetAddress || !city) {
        return res.status(400).json({ success: false, message: "Street address and city are required" });
    }

    try {
        // If this is set as default, remove default from other addresses
        if (isDefault) {
            await pool.query({
                text: `UPDATE user_addresses SET is_default = false WHERE user_id = $1 AND id != $2`,
                values: [userId, addressId]
            });
        }

        const query = {
            text: `
                UPDATE user_addresses SET 
                    address_type = $1, street_address = $2, apartment_unit = $3, 
                    area = $4, city = $5, postal_code = $6, landmark = $7, is_default = $8,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $9 AND user_id = $10
                RETURNING *
            `,
            values: [addressType, streetAddress, apartmentUnit, area, city, postalCode, landmark, isDefault, addressId, userId]
        };
        
        const result = await pool.query(query);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Address not found" });
        }
        
        return res.status(200).json({
            success: true,
            message: "Address updated successfully",
            address: result.rows[0]
        });
    } catch (error) {
        console.error('Update user address error:', error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

const deleteUserAddress = async (req, res) => {
    const userId = req.user.id;
    const { addressId } = req.params;

    try {
        const query = {
            text: `UPDATE user_addresses SET is_active = false WHERE id = $1 AND user_id = $2 RETURNING *`,
            values: [addressId, userId]
        };
        
        const result = await pool.query(query);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Address not found" });
        }
        
        return res.status(200).json({
            success: true,
            message: "Address deleted successfully"
        });
    } catch (error) {
        console.error('Delete user address error:', error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// ===== SERVICE REQUESTS =====
const createServiceRequest = async (req, res) => {
    const userId = req.user.id;
        const { 
            serviceTypeId, addressId, title, description, 
            preferredDate, preferredTimeSlot, specialInstructions,
            estimatedWeight, estimatedBags 
        } = req.body;

    if (!serviceTypeId || !title || !preferredDate) {
        return res.status(400).json({ 
            success: false, 
            message: "Service type, title, and preferred date are required" 
        });
    }

    const request_number = `SR-${Date.now()}-${Math.floor(1000/ 50)}`;

    try {
        const query = {
            text: `
                INSERT INTO service_requests 
                (user_id,service_type_id, address_id, title, description, preferred_date, 
                preferred_time_slot, special_instructions, estimated_weight, estimated_bags,request_number)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,$11)
                RETURNING *
            `,
            values: [userId, serviceTypeId, addressId, title, description, preferredDate, 
                    preferredTimeSlot, specialInstructions, estimatedWeight, estimatedBags,request_number]
        };
        
        const result = await pool.query(query);
        
        // Log status change
        await pool.query({
            text: `
                INSERT INTO service_request_status_history 
                (service_request_id, old_status, new_status, changed_by)
                VALUES ($1, null, 'pending', $2)
            `,
            values: [result.rows[0].id, userId]
        });

        return res.status(201).json({
            success: true,
            message: "Service request created successfully",
            serviceRequest: result.rows[0]
        });
    } catch (error) {
        console.error('Create service request error:', error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

const getUserServiceRequests = async (req, res) => {
    const userId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    try {
        let whereClause = 'WHERE sr.user_id = $1';
        let queryParams = [userId];

        if (status) {
            whereClause += ' AND sr.status = $2';
            queryParams.push(status);
        }

        const query = {
            text: `
                SELECT 
                    sr.*,
                    st.name as service_type_name,
                    st.category as service_category,
                    ua.street_address,
                    ua.city,
                    driver.first_name as driver_first_name,
                    driver.last_name as driver_last_name,
                    driver.phone_number as driver_phone
                FROM service_requests sr
                LEFT JOIN service_types st ON sr.service_type_id = st.id
                LEFT JOIN user_addresses ua ON sr.address_id = ua.id
                LEFT JOIN users driver ON sr.driver_id = driver.id
                ${whereClause}
                ORDER BY sr.created_at DESC
                LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
            `,
            values: [...queryParams, limit, offset]
        };
        
        const result = await pool.query(query);
        
        // Get total count
        const countQuery = {
            text: `SELECT COUNT(*) FROM service_requests sr ${whereClause}`,
            values: queryParams
        };
        const countResult = await pool.query(countQuery);
        
        return res.status(200).json({
            success: true,
            serviceRequests: result.rows,
            pagination: {
                total: parseInt(countResult.rows[0].count),
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(countResult.rows[0].count / limit)
            }
        });
    } catch (error) {
        console.error('Get user service requests error:', error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

const getServiceRequestById = async (req, res) => {
    const userId = req.user.id;
    const { requestId } = req.params;

    try {
        const query = {
            text: `
                SELECT 
                    sr.*,
                    st.name as service_type_name,
                    st.category as service_category,
                    st.base_price,
                    ua.street_address,
                    ua.apartment_unit,
                    ua.area,
                    ua.city,
                    ua.postal_code,
                    ua.landmark,
                    driver.first_name as driver_first_name,
                    driver.last_name as driver_last_name,
                    driver.phone_number as driver_phone,
                    driver.email as driver_email
                FROM service_requests sr
                LEFT JOIN service_types st ON sr.service_type_id = st.id
                LEFT JOIN user_addresses ua ON sr.address_id = ua.id
                LEFT JOIN users driver ON sr.driver_id = driver.id
                WHERE sr.id = $1 AND sr.user_id = $2
            `,
            values: [requestId, userId]
        };
        
        const result = await pool.query(query);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Service request not found" });
        }

        // Get status history
        const historyQuery = {
            text: `
                SELECT 
                    srsh.*,
                    u.first_name,
                    u.last_name
                FROM service_request_status_history srsh
                LEFT JOIN users u ON srsh.changed_by = u.id
                WHERE srsh.service_request_id = $1
                ORDER BY srsh.changed_at ASC
            `,
            values: [requestId]
        };
        const historyResult = await pool.query(historyQuery);

        return res.status(200).json({
            success: true,
            serviceRequest: {
                ...result.rows[0],
                statusHistory: historyResult.rows
            }
        });
    } catch (error) {
        console.error('Get service request by ID error:', error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

const cancelServiceRequest = async (req, res) => {
    const userId = req.user.id;
    const { requestId } = req.params;
    const { reason } = req.body;

    try {
        // Check if request exists and belongs to user
        const checkQuery = {
            text: `SELECT * FROM service_requests WHERE id = $1 AND user_id = $2`,
            values: [requestId, userId]
        };
        const checkResult = await pool.query(checkQuery);
        
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Service request not found" });
        }

        const currentStatus = checkResult.rows[0].status;
        if (!['pending', 'approved', 'assigned'].includes(currentStatus)) {
            return res.status(400).json({ 
                success: false, 
                message: "Cannot cancel request in current status" 
            });
        }

        // Update request status
        const updateQuery = {
            text: `UPDATE service_requests SET status = 'cancelled' WHERE id = $1 RETURNING *`,
            values: [requestId]
        };
        const result = await pool.query(updateQuery);

        // Log status change
        await pool.query({
            text: `
                INSERT INTO service_request_status_history 
                (service_request_id, old_status, new_status, changed_by, reason)
                VALUES ($1, $2, 'cancelled', $3, $4)
            `,
            values: [requestId, currentStatus, userId, reason]
        });

        return res.status(200).json({
            success: true,
            message: "Service request cancelled successfully",
            serviceRequest: result.rows[0]
        });
    } catch (error) {
        console.error('Cancel service request error:', error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// ===== SERVICE FEEDBACK =====
const submitFeedback = async (req, res) => {
    const userId = req.user.id;
    const { requestId } = req.params;
    const { overallRating, timelinessRating, professionalismRating, cleanlinessRating, comments, wouldRecommend, suggestions } = req.body;

    if (!overallRating || overallRating < 1 || overallRating > 5) {
        return res.status(400).json({ success: false, message: "Overall rating is required and must be between 1-5" });
    }

    try {
        // Verify request exists, belongs to user, and is completed
        const checkQuery = {
            text: `
                SELECT sr.*, driver_id 
                FROM service_requests sr 
                WHERE sr.id = $1 AND sr.user_id = $2 AND sr.status = 'completed'
            `,
            values: [requestId, userId]
        };
        const checkResult = await pool.query(checkQuery);
        
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: "Service request not found or not completed" 
            });
        }

        const driverId = checkResult.rows[0].driver_id;

        const query = {
            text: `
                INSERT INTO service_feedback 
                (service_request_id, user_id, driver_id, overall_rating, timeliness_rating, 
                professionalism_rating, cleanliness_rating, comments, would_recommend, suggestions)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (service_request_id) 
                DO UPDATE SET 
                    overall_rating = $4,
                    timeliness_rating = $5,
                    professionalism_rating = $6,
                    cleanliness_rating = $7,
                    comments = $8,
                    would_recommend = $9,
                    suggestions = $10,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *
            `,
            values: [requestId, userId, driverId, overallRating, timelinessRating, 
                    professionalismRating, cleanlinessRating, comments, wouldRecommend, suggestions]
        };
        
        const result = await pool.query(query);

        return res.status(200).json({
            success: true,
            message: "Feedback submitted successfully",
            feedback: result.rows[0]
        });
    } catch (error) {
        console.error('Submit feedback error:', error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

const getFeedback = async (req, res) => {
    const userId = req.user.id;
    const { requestId } = req.params;

    try {
        const query = {
            text: `
                SELECT sf.*, sr.title as request_title
                FROM service_feedback sf
                JOIN service_requests sr ON sf.service_request_id = sr.id
                WHERE sf.service_request_id = $1 AND sf.user_id = $2
            `,
            values: [requestId, userId]
        };
        
        const result = await pool.query(query);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Feedback not found" });
        }

        return res.status(200).json({
            success: true,
            feedback: result.rows[0]
        });
    } catch (error) {
        console.error('Get feedback error:', error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// ===== SERVICE REQUEST MESSAGES =====
const getRequestMessages = async (req, res) => {
    const userId = req.user.id;
    const { requestId } = req.params;

    try {
        // Verify user has access to this request
        const accessQuery = {
            text: `SELECT id FROM service_requests WHERE id = $1 AND user_id = $2`,
            values: [requestId, userId]
        };
        const accessResult = await pool.query(accessQuery);
        
        if (accessResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Service request not found" });
        }

        const query = {
            text: `
                SELECT 
                    srm.*,
                    u.first_name as sender_first_name,
                    u.last_name as sender_last_name,
                    u.role as sender_role
                FROM service_request_messages srm
                JOIN users u ON srm.sender_id = u.id
                WHERE srm.service_request_id = $1
                ORDER BY srm.created_at ASC
            `,
            values: [requestId]
        };
        
        const result = await pool.query(query);

        // Mark messages as read for current user
        await pool.query({
            text: `
                UPDATE service_request_messages 
                SET is_read = true, read_at = CURRENT_TIMESTAMP 
                WHERE service_request_id = $1 AND recipient_id = $2 AND is_read = false
            `,
            values: [requestId, userId]
        });

        return res.status(200).json({
            success: true,
            messages: result.rows
        });
    } catch (error) {
        console.error('Get request messages error:', error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

const sendMessage = async (req, res) => {
    const userId = req.user.id;
    const { requestId } = req.params;
    const { message, recipientId } = req.body;

    if (!message || !message.trim()) {
        return res.status(400).json({ success: false, message: "Message content is required" });
    }

    try {
        // Verify user has access to this request
        const accessQuery = {
            text: `
                SELECT sr.id, sr.driver_id, sr.user_id 
                FROM service_requests sr 
                WHERE sr.id = $1 AND (sr.user_id = $2 OR sr.driver_id = $2)
            `,
            values: [requestId, userId]
        };
        const accessResult = await pool.query(accessQuery);
        
        if (accessResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Service request not found" });
        }

        // Determine recipient if not specified
        let finalRecipientId = recipientId;
        if (!finalRecipientId) {
            const request = accessResult.rows[0];
            finalRecipientId = userId === request.user_id ? request.driver_id : request.user_id;
        }

        const query = {
            text: `
                INSERT INTO service_request_messages 
                (service_request_id, sender_id, recipient_id, message)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `,
            values: [requestId, userId, finalRecipientId, message.trim()]
        };
        
        const result = await pool.query(query);

        return res.status(201).json({
            success: true,
            message: "Message sent successfully",
            messageData: result.rows[0]
        });
    } catch (error) {
        console.error('Send message error:', error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = {
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
};